import { test, expect, chromium, type Page } from '@playwright/test';
import { Store } from '../../server/database';
import type { Character, Point } from '../../shared/model';
import type { Scene } from '../../client/scene';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { getConfig } from '../../server/config';
import { obstacles, walkable, clearSegment, findPath } from '../../shared/world';
import { skills, items } from '../../shared/content';
import { presentation } from '../../client/presentation';

declare global { interface Window { eterDiagnostics: (point?: Point) => ReturnType<Scene['diagnostics']> | undefined } }
type State = { type: string; now: number; self: Character; cooldowns: Record<string, number>; players: { id: string; x: number; z: number }[]; monsters: { id: string; definitionId: string; x: number; z: number; hp: number }[]; loot: { id: string; kind: string; ownerId: string; x: number; z: number; exclusiveUntil: number; item?: { id: string; definitionId: string } }[] };
function observe(page: Page) {
  const observed = { state: undefined as State | undefined, frames: [] as { now: number; x: number; z: number }[], commands: [] as { type: string; x?: number; z?: number }[], notices: [] as string[], errors: [] as string[] };
  let currentSocket: unknown;
  page.on('pageerror', error => observed.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE\.|WebGL/.test(message.text())) observed.errors.push(message.text()); });
  page.on('websocket', socket => {
    currentSocket = socket;
    socket.on('framesent', frame => { try { observed.commands.push(JSON.parse(String(frame.payload))); } catch { /* Ignore non-command frames. */ } });
    socket.on('framereceived', frame => {
      if (currentSocket !== socket) return;
      const value = JSON.parse(String(frame.payload)) as State;
      if (value.type === 'notice') observed.notices.push((value as unknown as { message: string }).message);
      if (value.type === 'state') { observed.state = value; observed.frames.push({ now: value.now, x: value.self.x, z: value.self.z }); }
    });
  });
  return observed;
}
async function clickEntity(page: Page, id: string): Promise<void> {
  const label = page.locator(`[data-entity-id="${id}"]`);
  await expect.poll(() => label.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-entity-id]') === el;
  })).toBe(true);
  await label.click();
}
async function walkTo(page: Page, state: ReturnType<typeof observe>, point: Point): Promise<void> {
  await page.bringToFront();
  const origin = { x: state.state!.self.x, z: state.state!.self.z };
  // A close gameplay camera requires successive real clicks for distant routes.
  // Never zoom out or send a movement command through a test-only hook.
  if (Math.hypot(point.x - origin.x, point.z - origin.z) > 12) {
    const route = findPath(origin, point); expect(route.length).toBeGreaterThan(0);
    let previous = origin, remaining = 8, next = route[0];
    for (const waypoint of route) {
      const length = Math.hypot(waypoint.x - previous.x, waypoint.z - previous.z);
      if (length >= remaining) { next = { x: previous.x + (waypoint.x - previous.x) * remaining / length, z: previous.z + (waypoint.z - previous.z) * remaining / length }; break; }
      remaining -= length; previous = waypoint; next = waypoint;
    }
    await walkTo(page, state, next); await walkTo(page, state, point); return;
  }
  await expect.poll(() => page.evaluate(p => { const d = window.eterDiagnostics(); return d ? Math.hypot(d.focus.x - p.x, d.focus.z - p.z) : Infinity; }, origin)).toBeLessThan(0.1);
  const projected = await page.evaluate(point => {
    // Choose genuinely exposed ground; floating labels and model silhouettes can cover it.
    for (const dx of [0, 0.25, -0.25, 0.5, -0.5]) for (const dz of [0, 0.25, -0.25]) {
      const p = { x: point.x + dx, z: point.z + dz }, d = window.eterDiagnostics(p)!;
      if (d.projected?.visible && d.groundHit?.kind === 'ground' && document.elementFromPoint(d.projected.x, d.projected.y) === document.querySelector('#viewport canvas')) return d.projected;
    }
    return undefined;
  }, point);
  if (!projected) console.log('Covered ground:', JSON.stringify(await page.evaluate(p => { const d = window.eterDiagnostics(p)!; const top = d.projected ? document.elementFromPoint(d.projected.x, d.projected.y) : null; return { point: p, projected: d.projected, hit: d.groundHit, top: top?.outerHTML }; }, point)));
  expect(projected, 'walking requires an exposed canvas point which raycasts to ground').toBeTruthy();
  await page.mouse.click(projected!.x, projected!.y);
  try { await expect.poll(async () => {
    // Keep the active-page transport sampled while checking authoritative
    // WS positions, to distinguish stale observations from failed movement.
    await page.evaluate(() => document.visibilityState);
    return state.state ? Math.hypot(state.state.self.x - point.x, state.state.self.z - point.z) : Infinity;
  }).toBeLessThan(0.6); }
  catch (error) {
    const diagnostics = await page.evaluate(p => { const d = window.eterDiagnostics(p); return d && { renderer: d.renderer, focus: d.focus, projected: d.projected, groundHit: d.groundHit, renderedFrames: d.renderedFrames }; }, point);
    console.log('Walk failure:', JSON.stringify({ origin, point, commands: state.commands.slice(-5), notices: state.notices.slice(-5), frames: state.frames.slice(-15), lastSnapshotAt: state.state?.now, actual: state.state && { x: state.state.self.x, z: state.state.self.z }, diagnostics })); throw error;
  }
}

const nonce = Date.now().toString(36);
async function clickVisibleSprout(page: Page, aliveIds?: string[]): Promise<string> {
  let hit: { id: string; x: number; y: number } | undefined;
  await expect.poll(async () => {
    hit = await page.locator('.monster-label').filter({ hasText: 'Sproutling' }).evaluateAll((elements, alive) => elements.filter(el => !alive || alive.includes((el as HTMLElement).dataset.entityId!)).map(el => {
      const rect = el.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      return { id: (el as HTMLElement).dataset.entityId!, x, y, reachable: rect.width > 0 && x > 20 && x < 1200 && y > 150 && y < 650 && document.elementFromPoint(x, y)?.closest('[data-entity-id]') === el };
    }).filter(value => value.reachable).sort((a, b) => Math.hypot(a.x - 720, a.y - 430) - Math.hypot(b.x - 720, b.y - 430))[0], aliveIds);
    return !!hit;
  }).toBe(true);
  await page.mouse.click(hit!.x, hit!.y); return hit!.id;
}
async function register(page: Page, suffix: string, classId: string, base = ''): Promise<{ username: string; characterId: string }> {
  await page.bringToFront();
  page.on('pageerror', error => console.log(`Browser ${suffix}: ${error.stack}`));
  page.on('console', message => { if (message.type() === 'error') console.log(`Console ${suffix}: ${message.text()}`); });
  page.on('websocket', socket => { if (socket.url().includes('/ws?')) { console.log(`Socket ${suffix}: connected`); let frames = 0; socket.on('framereceived', frame => { if (frames++ < 2) console.log(`Frame ${suffix}: ${String(frame.payload).slice(0, 100)}`); }); socket.on('socketerror', error => console.log(`Socket ${suffix}: ${error}`)); } });
  const username = `test_${nonce}_${suffix}`;
  await page.goto(`${base}/?diagnostics=1`);
  if (suffix === 'class0') {
    await page.evaluate(async () => { const art = new Image(); art.src = '/art/aurelia-gameplay.png'; await art.decode(); });
    await page.screenshot({ path: 'test-results/login.png' });
  }
  await page.locator('[name="username"]').fill(username); await page.locator('[name="password"]').fill('browser-secure-password');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.locator('[name="name"]').fill(`H${nonce.slice(-6)}${suffix}`); await page.locator(`[name="classId"][value="${classId}"]`).check();
  await page.getByRole('button', { name: 'Crear personaje', exact: true }).click();
  const card = page.locator('[data-character]').first(); await expect(card).toBeVisible(); const characterId = await card.getAttribute('data-character');
  await card.click();
  if (suffix.startsWith('class')) { await expect(page.locator('#character-preview canvas')).toBeVisible(); await page.waitForTimeout(200); await page.screenshot({ path: `test-results/selection-${classId.toLowerCase()}.png` }); }
  await page.bringToFront();
  await page.locator('#enter-world').click();
  try { await expect(page.locator('#character-name')).toContainText(`H${nonce.slice(-6)}`, { timeout: 90000 }); }
  catch (error) { console.log('Startup diagnostics:', JSON.stringify(await page.evaluate(() => ({ diagnostics: window.eterDiagnostics?.(), notices: document.querySelector('#notices')?.textContent })))); throw error; }
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await expect(page.locator('#viewport canvas')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
  return { username, characterId: characterId! };
}
test('Chrome renders original 3D Aurelia, click walking, UI grids and each class', async ({ browser, page }) => {
  test.setTimeout(300000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE\.|WebGL/.test(message.text())) errors.push(message.text()); });
  for (const [index, classId] of ['VANGUARD', 'ARCANIST', 'RANGER'].entries()) {
    if (index) { await page.getByRole('button', { name: 'Opciones', exact: true }).click(); await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); }
    await register(page, `class${index}`, classId);
    await expect(page.locator('[data-skill]')).toHaveCount(4);
    const composition = await page.evaluate(() => window.eterDiagnostics()!);
    expect(composition.zoom).toBe(presentation.camera.defaultHalfHeight);
    expect(composition.cameraElevationDegrees).toBeGreaterThan(30);
    expect(composition.cameraElevationDegrees).toBeLessThan(38);
    expect(composition.characterScreenHeight).toBeGreaterThan(90);
    await page.screenshot({ path: `test-results/goal-3-camera-${classId.toLowerCase()}.png` });
    if (!index) {
      const hideHud = await page.addStyleTag({ content: '.game > :not(#viewport) { visibility: hidden !important; }' });
      try { await page.locator('#viewport').screenshot({ path: 'test-results/aurelia-gameplay-backdrop.png' }); }
      finally { await hideHud.evaluate(element => element.parentNode?.removeChild(element)); }
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.characterScreenHeight)).toBeGreaterThan(72);
      await page.screenshot({ path: 'test-results/goal-3-camera-1280-default.png' });
      await page.locator('#viewport canvas').hover(); await page.mouse.wheel(0, 10000);
      await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.zoom)).toBe(presentation.camera.maxHalfHeight);
      expect((await page.evaluate(() => window.eterDiagnostics()!)).characterScreenHeight).toBeGreaterThan(60);
      await page.screenshot({ path: 'test-results/goal-3-camera-1280-farthest.png' });
      await page.mouse.wheel(0, -10000);
      await page.mouse.wheel(0, (presentation.camera.defaultHalfHeight - presentation.camera.minHalfHeight) / presentation.camera.wheelSensitivity);
      await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.zoom)).toBeCloseTo(presentation.camera.defaultHalfHeight, 5);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await expect(page.locator('#coordinates')).toContainText('Aurelia');
    const before = await page.locator('#coordinates').textContent();
    // Ground ahead of the player, clear of city buildings and central crystal.
    await page.locator('#viewport canvas').click({ position: { x: 720, y: 620 } });
    await expect.poll(() => page.locator('#coordinates').textContent()).not.toBe(before);
    await page.keyboard.press('i'); await expect(page.locator('.inventory-grid')).toBeVisible(); await expect(page.locator('[data-slot]')).toHaveCount(11);
    await page.locator('[data-slot="weapon"]').hover(); await expect(page.locator('.item-tooltip')).toBeVisible();
    await page.screenshot({ path: `test-results/inventory-equipment-${classId.toLowerCase()}.png` });
    await page.locator('[data-slot="weapon"]').click(); await expect(page.locator('[data-slot="weapon"] strong')).toHaveText('—');
    const weapon = page.locator('.item').filter({ hasText: classId === 'VANGUARD' ? 'Espada' : classId === 'ARCANIST' ? 'Bastón' : 'Arco' }); await weapon.dblclick();
    await expect(page.locator('[data-slot="weapon"] strong')).not.toHaveText('—');
    const potionId = await page.locator('.item.hp').first().getAttribute('data-item');
    const potion = page.locator(`[data-item="${potionId}"]`);
    // Keep an exact instance reference, including if the server refreshes the panel.
    await potion.dragTo(page.locator('.inventory-grid'), { targetPosition: { x: 190, y: 190 } });
    await expect(potion, `drag instance ${potionId} for ${classId}`).toHaveCSS('left', '180px');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Loot: ON', exact: true }).click(); await expect(page.getByRole('button', { name: 'Loot: OFF', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/aurelia-${classId.toLowerCase()}.png` });
  }
  expect(errors).toEqual([]);
});

test('close camera presents normal melee and ranged farming, target status and physical pickups for all classes', async ({ browser }, testInfo) => {
  test.setTimeout(300000);
  for (const classId of ['VANGUARD', 'ARCANIST', 'RANGER']) {
    const context = await browser.newContext(), page = await context.newPage(), observed = observe(page);
    try {
      const player = await register(page, `farm_${classId.toLowerCase()}`, classId);
      await walkTo(page, observed, { x: 0, z: 20 }); await walkTo(page, observed, { x: 0, z: 29 });
      await page.screenshot({ path: `test-results/goal-3-first-spot-${classId.toLowerCase()}.png` });
      const target = await clickVisibleSprout(page, observed.state!.monsters.filter(m => m.hp > 0).map(m => m.id));
      await expect(page.locator('#target-info')).toContainText('Sproutling');
      await page.screenshot({ path: `test-results/goal-3-normal-combat-${classId.toLowerCase()}.png` });
      await expect.poll(() => observed.state!.monsters.find(m => m.id === target)?.hp).toBe(0);
      expect(observed.state!.self.xp).toBeGreaterThan(0);
      const drop = observed.state!.loot.find(d => d.ownerId === player.characterId && d.kind === 'crowns');
      expect(drop).toBeTruthy(); await page.screenshot({ path: `test-results/goal-3-loot-${classId.toLowerCase()}.png` });
      const crowns = observed.state!.self.crowns; await clickEntity(page, drop!.id);
      await expect.poll(() => observed.state!.self.crowns).toBeGreaterThan(crowns);
      expect(observed.errors).toEqual([]);
      await testInfo.attach(`normal-farming-${classId}`, { body: JSON.stringify({ classId, target, level: observed.state!.self.level, crowns: observed.state!.self.crowns, diagnostics: await page.evaluate(() => window.eterDiagnostics()) }), contentType: 'application/json' });
    } finally { await context.close(); }
  }
});

test('held ground click continues walking with the camera and release finishes precisely at the last destination', async ({ page }) => {
  test.setTimeout(45000);
  const observed = observe(page), destinations: Point[] = [];
  page.on('websocket', socket => socket.on('framesent', frame => { const value = JSON.parse(String(frame.payload)) as Point & { type: string }; if (value.type === 'move') destinations.push({ x: value.x, z: value.z }); }));
  await register(page, 'held', 'VANGUARD');
  const projected = await page.evaluate(() => window.eterDiagnostics({ x: 0, z: 20 })!.projected!);
  await page.mouse.move(projected.x, projected.y); await page.mouse.down();
  await expect.poll(() => observed.state!.self.z, { timeout: 12000 }).toBeGreaterThan(26);
  await page.mouse.up(); const count = destinations.length, last = destinations.at(-1)!;
  expect(count).toBeGreaterThan(5); expect(last.z).toBeGreaterThan(26);
  await expect.poll(() => Math.hypot(observed.state!.self.x - last.x, observed.state!.self.z - last.z)).toBeLessThan(0.6);
  await page.waitForTimeout(300); expect(destinations).toHaveLength(count);
  for (const frame of observed.frames) expect(walkable(frame)).toBe(true);
  expect(observed.errors).toEqual([]);
});

test('two actual Chrome clients share monsters, combat, exclusive loot, public pickup after 30s and persistent progress', async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const contextA = await browser.newContext(), contextB = await browser.newContext();
  const a = await contextA.newPage(), b = await contextB.newPage();
  const A = observe(a), B = observe(b);
  try {
    const playerA = await register(a, 'multi_a', 'VANGUARD');
    const exitStart = A.frames.length;
    // A real ground click leaves Aurelia before admin promotion or any setup helper.
    await walkTo(a, A, { x: 0, z: 26 });
    expect(A.state!.self.z).toBeGreaterThan(23);
    await expect(a.locator('#coordinates')).toContainText('Greenfields');
    const exitFrames = A.frames.slice(exitStart);
    expect(exitFrames.length).toBeGreaterThan(10);
    for (let i = 1; i < exitFrames.length; i++) expect(Math.hypot(exitFrames[i].x - exitFrames[i - 1].x, exitFrames[i].z - exitFrames[i - 1].z)).toBeLessThan(2);
    await testInfo.attach('walk-out-of-aurelia', { body: JSON.stringify(exitFrames), contentType: 'application/json' });
    const startup = Date.now();
    const playerB = await register(b, 'multi_b', 'ARCANIST');
    console.log('Second client ready in', Date.now() - startup, 'ms');
    // Repeated startup/reconnect while A continues rendering on the same server.
    for (let join = 0; join < 2; join++) {
      await b.getByRole('button', { name: 'Personajes', exact: true }).click();
      await expect.poll(() => A.state!.players.length).toBe(1);
      await b.locator(`[data-character="${playerB.characterId}"]`).click(); await b.locator('#enter-world').click();
      await expect(b.locator('#viewport canvas')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
      await expect.poll(() => A.state!.players.length).toBe(2);
    }
    await walkTo(b, B, { x: 2, z: 26 });
    await expect(a.locator(`[data-entity-id="${playerB.characterId}"]`)).toBeVisible();
    await expect(b.locator(`[data-entity-id="${playerA.characterId}"]`)).toBeVisible();
    expect(B.state!.monsters.map(m => m.id).sort()).toEqual(A.state!.monsters.map(m => m.id).sort());
    const store = new Store('data/e2e.sqlite'); store.makeAdmin(playerA.username); store.close();
    async function admin(characterId: string, operation: string, extras: Record<string, unknown> = {}) {
      const response = await contextA.request.post('/api/admin/action', { data: { characterId, operation, ...extras } }); expect(response.ok()).toBeTruthy();
    }
    async function encounter() {
      await admin(playerA.characterId, 'teleport', { x: 0, z: 30 });
      await expect.poll(() => A.state!.self.z).toBe(30);
      const before = new Set(A.state!.monsters.map(m => m.id));
      await admin(playerA.characterId, 'spawn', { monsterId: 'sproutling', x: 0, z: 33 });
      await expect.poll(() => A.state!.monsters.some(m => !before.has(m.id))).toBe(true);
      const selected = await clickVisibleSprout(a);
      await expect.poll(() => A.state!.monsters.find(m => m.id === selected)?.hp).toBe(0);
      await expect.poll(() => B.state!.monsters.find(m => m.id === selected)?.hp).toBe(0);
    }
    let loot: State['loot'][number] | undefined;
    for (let attempt = 0; attempt < 8 && !loot; attempt++) {
      await encounter();
      loot = A.state!.loot.find(d => d.ownerId === playerA.characterId && d.kind === 'crowns');
    }
    expect(loot, 'normal combat creates physical Crowns').toBeTruthy();
    expect(A.state!.self.xp + (A.state!.self.level - 1) * 50).toBeGreaterThan(0);
    await admin(playerB.characterId, 'teleport', { x: loot!.x + 1, z: loot!.z });
    await expect.poll(() => Math.hypot(B.state!.self.x - loot!.x, B.state!.self.z - loot!.z)).toBeLessThan(2);
    const beforeB = B.state!.self.crowns;
    await clickEntity(b, loot!.id);
    await expect(b.locator('#notices')).toContainText('pertenece');
    expect(B.state!.self.crowns).toBe(beforeB);
    expect(A.state!.loot.some(d => d.id === loot!.id)).toBe(true);
    await expect.poll(() => B.state!.now, { timeout: 35000 }).toBeGreaterThanOrEqual(loot!.exclusiveUntil);
    await clickEntity(b, loot!.id);
    await expect.poll(() => B.state!.self.crowns).toBeGreaterThan(beforeB);
    let collectedCrowns = false, equippedId = '', equippedSlot: keyof Character['equipment'] | undefined;
    for (let attempt = 0; attempt < 45 && (!collectedCrowns || !equippedId); attempt++) {
      const drops = A.state!.loot.filter(d => d.ownerId === playerA.characterId);
      const crowns = drops.find(d => d.kind === 'crowns');
      if (crowns && !collectedCrowns) {
        await admin(playerA.characterId, 'teleport', { x: crowns.x + 1, z: crowns.z });
        const before = A.state!.self.crowns;
        await clickEntity(a, crowns.id);
        await expect.poll(() => A.state!.self.crowns).toBeGreaterThan(before); collectedCrowns = true;
      }
      const item = drops.find(d => d.kind === 'item' && ['iron-sword', 'linen-armor', 'leather-boots'].includes(d.item!.definitionId));
      if (item && !equippedId) {
        await admin(playerA.characterId, 'teleport', { x: item.x + 1, z: item.z });
        await clickEntity(a, item.id);
        await expect.poll(() => A.state!.self.inventory.some(i => i.id === item.item!.id)).toBe(true);
        await a.keyboard.press('i'); await a.locator(`[data-item="${item.item!.id}"]`).dblclick();
        equippedSlot = item.item!.definitionId === 'iron-sword' ? 'weapon' : item.item!.definitionId === 'linen-armor' ? 'chest' : 'boots';
        await expect.poll(() => A.state!.self.equipment[equippedSlot!]?.id).toBe(item.item!.id);
        await expect(a.locator(`[data-slot="${equippedSlot}"] strong`)).not.toHaveText('—');
        equippedId = item.item!.id; await a.keyboard.press('Escape');
      }
      if (!collectedCrowns || !equippedId) await encounter();
    }
    expect(collectedCrowns).toBe(true); expect(equippedId).not.toBe('');
    await a.screenshot({ path: 'test-results/multiplayer-final.png' });
    const saved = { xp: A.state!.self.xp, level: A.state!.self.level, crowns: A.state!.self.crowns, equipment: A.state!.self.equipment[equippedSlot!] };
    await a.getByRole('button', { name: 'Personajes', exact: true }).click();
    await expect.poll(() => B.state!.players.length).toBe(1);
    await a.locator(`[data-character="${playerA.characterId}"]`).click(); await a.locator('#enter-world').click();
    await expect(a.locator('#viewport canvas')).toHaveAttribute('data-ready', 'true');
    await expect.poll(() => A.state!.self.equipment[equippedSlot!]?.id).toBe(equippedId);
    expect(A.state!.self.equipment[equippedSlot!]).toEqual(saved.equipment);
    expect(A.state!.self.xp).toBe(saved.xp); expect(A.state!.self.level).toBe(saved.level); expect(A.state!.self.crowns).toBe(saved.crowns);
    await a.keyboard.press('i'); await expect(a.locator(`[data-slot="${equippedSlot}"] strong`)).not.toHaveText('—');
    await a.keyboard.press('Escape'); await a.getByRole('button', { name: 'Opciones', exact: true }).click();
    await a.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await a.locator('[name="username"]').fill(playerA.username); await a.locator('[name="password"]').fill('browser-secure-password');
    await a.getByRole('button', { name: 'Entrar', exact: true }).click();
    await a.locator(`[data-character="${playerA.characterId}"]`).click(); await a.locator('#enter-world').click();
    await expect(a.locator('#viewport canvas')).toHaveAttribute('data-ready', 'true');
    await expect.poll(() => A.state!.self.equipment[equippedSlot!]?.id).toBe(equippedId);
    expect(A.state!.self.xp).toBe(saved.xp); expect(A.state!.self.crowns).toBe(saved.crowns);
    expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
    await testInfo.attach('persistent-progress', { body: JSON.stringify(saved), contentType: 'application/json' });
  } finally { await contextA.close(); await contextB.close(); }
});
test('admin page and privileged commands are protected from ordinary users', async ({ page }) => {
  const response = await page.goto('/admin'); expect(response?.status()).toBe(403);
  await register(page, 'security', 'RANGER');
  expect((await page.request.get('/api/admin/config')).status()).toBe(403);
  expect((await page.request.get('/api/admin/players')).status()).toBe(403);
  expect((await page.request.get('/api/admin/overview')).status()).toBe(403);
  expect((await page.request.post('/api/admin/action', { data: { operation: 'level', amount: 500 } })).status()).toBe(403);
});

test('NPC shops, potions, manual stats, Sanctum, repair and the admin editor work through the UI', async ({ page }) => {
  test.setTimeout(240000);
  const player = await register(page, 'services', 'VANGUARD');
  const store = new Store('data/e2e.sqlite'); store.makeAdmin(player.username); store.close();
  async function teleport(x: number, z: number) {
    const response = await page.request.post('/api/admin/action', { data: { characterId: player.characterId, operation: 'teleport', x, z } }); expect(response.ok()).toBeTruthy();
    await expect(page.locator('#coordinates')).toContainText(`(${x}, ${z})`);
  }
  await page.keyboard.press('q'); await expect(page.locator('#hp-potion span')).toHaveText('1');
  await page.waitForTimeout(1100);
  await page.keyboard.press('w'); await expect(page.locator('#mana-potion span')).toHaveText('1');
  expect((await page.request.post('/api/admin/action', { data: { characterId: player.characterId, operation: 'level', amount: 2 } })).ok()).toBeTruthy();
  await page.keyboard.press('c'); await expect(page.locator('.points')).toContainText('5 puntos');
  await page.screenshot({ path: 'test-results/character-sheet.png' });
  await page.locator('[data-stat="vitality"][data-amount="5"]').click(); await expect(page.locator('.points')).toContainText('0 puntos');
  await page.keyboard.press('Escape'); await teleport(12, 7);
  await page.locator('[data-entity-id="npc-lyra"]').click(); await page.locator('[data-buy="hp-potion"]').click(); await expect(page.locator('#crowns')).toContainText('35');
  await page.screenshot({ path: 'test-results/npc-shop.png' });
  await page.keyboard.press('Escape'); await teleport(-12, -5);
  await page.locator('[data-entity-id="npc-orin"]').click();
  const inventory = page.locator('.inventory-grid[data-container="inventory"]'), sanctum = page.locator('.inventory-grid[data-container="sanctum"]');
  await inventory.locator('.item').first().dblclick(); await expect(sanctum.locator('.item')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/sanctum.png' });
  await sanctum.locator('.item').first().dblclick(); await expect(sanctum.locator('.item')).toHaveCount(0);
  await page.keyboard.press('Escape'); await teleport(-12, 6);
  await page.locator('[data-entity-id="npc-brom"]').click(); await page.locator('#repair').click(); await expect(page.locator('#notices')).toContainText('reparado');
  // Equipment presentation fixture; purchases and equipping still use authoritative commands.
  expect((await page.request.post('/api/admin/action', { data: { characterId: player.characterId, operation: 'crowns', amount: 2000 } })).ok()).toBe(true);
  expect((await page.request.post('/api/admin/action', { data: { characterId: player.characterId, operation: 'level', amount: 19 } })).ok()).toBe(true);
  await page.keyboard.press('Escape'); await page.keyboard.press('c');
  for (let i = 0; i < 17; i++) { await page.locator('[data-stat="strength"][data-amount="5"]').click(); await expect(page.locator('.points')).toContainText(`${(16 - i) * 5} puntos`); }
  await page.keyboard.press('Escape'); await page.locator('[data-entity-id="npc-brom"]').click();
  let gearCrowns = 2035;
  for (const [id, price] of [['steel-armor', 900], ['bronze-helmet', 90], ['wooden-shield', 120]] as const) { await page.locator(`[data-buy="${id}"]`).click(); gearCrowns -= price; await expect(page.locator('#crowns')).toContainText(String(gearCrowns)); }
  await page.keyboard.press('Escape'); await page.keyboard.press('i');
  for (const [name, slot] of [['Pechera de acero', 'chest'], ['Casco de bronce', 'helmet'], ['Escudo de roble', 'offhand']]) {
    await page.locator('.item').filter({ hasText: name }).dblclick(); await expect(page.locator(`[data-slot="${slot}"] strong`)).toHaveText(name);
  }
  await page.screenshot({ path: 'test-results/equipment-armored.png' }); await page.keyboard.press('Escape');
  await teleport(0, 10); await page.waitForTimeout(400); await page.screenshot({ path: 'test-results/vanguard-armored.png' });
  await page.goto('/admin'); await page.locator('[data-section="RAW CONFIG"]').click(); await expect(page.locator('#config-editor')).toBeVisible();
  const original = await page.locator('#config-editor').inputValue(), config = JSON.parse(original) as { balance: { dayNightCycleDuration: number } }; config.balance.dayNightCycleDuration = 120000;
  await page.locator('#config-editor').fill(JSON.stringify(config, null, 2)); await page.getByRole('button', { name: 'Guardar configuración' }).click(); await expect(page.locator('#error')).toContainText('Guardado');
  // Restore baseline settings for other browser runs. Restart application is tested by integration.
  await page.locator('#config-editor').fill(original); await page.getByRole('button', { name: 'Guardar configuración' }).click();
});

test('structured admin forms persist content, reject invalid config, manage spots and audit signed resources', async ({ page, context }) => {
  test.setTimeout(120000);
  const player = await register(page, 'forms', 'VANGUARD');
  const store = new Store('data/e2e.sqlite'); expect(store.makeAdmin(player.username)).toBe(true); store.close();
  const original = await (await page.request.get('/api/admin/config')).json();
  const control = await context.newPage(); control.on('dialog', dialog => dialog.accept());
  try {
    await control.goto('/admin'); await expect(control.locator('[data-section]')).toHaveCount(13);
    await expect(control.locator('textarea')).toHaveCount(0);
    await control.locator('[data-section="BALANCE"]').click();
    await control.locator('[data-path="balance.experienceBase"]').fill(String(original.balance.experienceBase + 1));
    await control.locator('[data-section="MONSTERS"]').click();
    await control.locator('[data-path="monsters.0.hp"]').fill(String(original.monsters[0].hp + 1));
    await control.screenshot({ path: 'test-results/admin-monsters.png' });
    await control.locator('[data-section="ITEMS"]').click();
    const necklaceIndex = original.items.findIndex((item: { id: string }) => item.id === 'copper-necklace');
    await control.locator(`[data-entry="${necklaceIndex}"]`).click(); await control.locator('.admin-properties summary').click();
    await control.locator(`[data-path="items.${necklaceIndex}.properties.luck"]`).fill('3');
    await control.locator('[data-section="SPOTS"]').click();
    await control.locator('#new-spot').click(); await control.locator('#duplicate-spot').click(); await control.locator('#delete-spot').click();
    await control.locator('[data-path^="spots."][type="checkbox"]').uncheck();
    await control.screenshot({ path: 'test-results/admin-spots.png' });
    await control.locator('#save-config').click(); await expect(control.locator('#error')).toContainText('Guardado');
    const saved = await (await page.request.get('/api/admin/config')).json();
    expect(saved.balance.experienceBase).toBe(original.balance.experienceBase + 1); expect(saved.monsters[0].hp).toBe(original.monsters[0].hp + 1);
    expect(saved.items[necklaceIndex].properties.luck).toBe(3);
    expect(saved.spots).toHaveLength(original.spots.length + 1); expect(saved.spots.at(-1).enabled).toBe(false);
    await control.reload(); await control.locator('[data-section="BALANCE"]').click();
    await expect(control.locator('[data-path="balance.experienceBase"]')).toHaveValue(String(saved.balance.experienceBase));
    const invalid = structuredClone(saved); invalid.monsters[0].hp = 0;
    expect((await page.request.put('/api/admin/config', { data: invalid })).status()).toBe(400);
    expect(await (await page.request.get('/api/admin/config')).json()).toEqual(saved);
    for (const section of ['ITEMS', 'SKILLS', 'NPCS / SHOPS', 'ECONOMY', 'RESETS', 'WORLD']) {
      await control.locator(`[data-section="${section}"]`).click(); await expect(control.locator('[data-path]').first()).toBeVisible(); await expect(control.locator('textarea')).toHaveCount(0);
    }
    await control.locator('[data-section="PLAYERS"]').click(); await control.locator('#player-search').fill(`H${nonce.slice(-6)}forms`);
    await expect(control.locator('[data-player]')).toHaveCount(1);
    const crownsBefore = await page.locator('#crowns').textContent();
    await control.locator('[data-section="DEVELOPER TOOLS"]').click(); await control.locator('#admin-player').selectOption(player.characterId);
    await control.locator('#admin-operation').selectOption('crowns'); await control.locator('#admin-amount').fill('25'); await control.locator('#admin-action button[type="submit"]').click();
    await expect(page.locator('#crowns')).toContainText('75');
    await control.locator('#admin-operation').selectOption('crowns'); await control.locator('#admin-amount').fill('-25'); await control.locator('#admin-action button[type="submit"]').click();
    await expect(page.locator('#crowns')).toHaveText(crownsBefore!);
    expect((await page.request.post('/api/admin/action', { data: { characterId: player.characterId, operation: 'crowns', amount: -1000000 } })).status()).toBe(400);
    const overview = await (await page.request.get('/api/admin/overview')).json(); expect(overview.audit.filter((entry: { operation: string; character_id: string }) => entry.operation === 'crowns' && entry.character_id === player.characterId)).toHaveLength(2);
    await control.screenshot({ path: 'test-results/admin-player-tools.png' });
  } finally { expect((await page.request.put('/api/admin/config', { data: original })).ok()).toBe(true); await control.close(); }
});

test('production visuals: physical Ether, day/night, twelve skills, projectiles, zoom and obstacle routes', async ({ page }, testInfo) => {
  test.setTimeout(360000);
  const folder = mkdtempSync(join(tmpdir(), 'eter-visual-')), database = join(folder, 'visual.sqlite');
  const base = 'http://127.0.0.1:3101';
  // Isolated, disclosed visual fixture: normal loot is still created by combat and picked up manually.
  const config = getConfig(); config.balance.dayNightCycleDuration = 10000; config.balance.etherDropChance = 1;
  for (const monster of config.monsters) { monster.damage = 0; monster.aggroRange = 0; }
  const fixture = new Store(database); fixture.setSetting('content', config); fixture.close();
  let child: ChildProcess | undefined, output = '';
  const observed = observe(page);
  try {
    child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--production'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '3101', DATABASE_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.stdout?.on('data', data => { output += String(data); }); child.stderr?.on('data', data => { output += String(data); });
    await expect.poll(async () => { try { return (await page.request.get(`${base}/api/health`)).ok(); } catch { return false; } }, { timeout: 20000 }).toBe(true);
    let player = await register(page, 'visual0', 'VANGUARD', base);
    const store = new Store(database); store.makeAdmin(player.username); store.close();
    async function admin(operation: string, extras: Record<string, unknown> = {}) {
      const response = await page.request.post(`${base}/api/admin/action`, { data: { characterId: player.characterId, operation, ...extras } }); expect(response.ok(), await response.text()).toBe(true);
    }
    async function teleport(point: Point) {
      await admin('teleport', { ...point });
      await expect.poll(() => Math.hypot(observed.state!.self.x - point.x, observed.state!.self.z - point.z)).toBeLessThan(0.01);
      await expect.poll(() => page.evaluate(p => { const d = window.eterDiagnostics()!; return Math.hypot(d.focus.x - p.x, d.focus.z - p.z); }, point)).toBeLessThan(0.05);
    }
    const routes = ['crystal', 'house-0', 'fountain-west', 'npc-brom', 'ruin-pillar-1', 'ruin-wall-2'].map(id => obstacles.find(o => o.id === id)!);
    for (const kind of ['tree', 'rock']) routes.push(obstacles.find(o => o.kind === kind && findPath({ x: o.x - o.width / 2 - 1.5, z: o.z }, { x: o.x + o.width / 2 + 1.5, z: o.z }).length > 1)!);
    for (const obstacle of routes) {
      const route = [
        { start: { x: obstacle.x - obstacle.width / 2 - 1.5, z: obstacle.z }, end: { x: obstacle.x + obstacle.width / 2 + 1.5, z: obstacle.z }, axis: 'x' },
        { start: { x: obstacle.x, z: obstacle.z - obstacle.depth / 2 - 1.5 }, end: { x: obstacle.x, z: obstacle.z + obstacle.depth / 2 + 1.5 }, axis: 'z' },
      ].find(r => findPath(r.start, r.end).length > 1)!;
      expect(route, obstacle.id).toBeTruthy();
      const { start, end } = route;
      expect(clearSegment(start, end)).toBe(false);
      await teleport(start);
      const first = observed.frames.length;
      await walkTo(page, observed, end);
      const frames = observed.frames.slice(first);
      expect(frames.length).toBeGreaterThan(2);
      for (const position of frames) expect(walkable(position), obstacle.id).toBe(true);
      expect(frames.some(p => route.axis === 'x' ? Math.abs(p.z - obstacle.z) > obstacle.depth / 2 + 0.4 : Math.abs(p.x - obstacle.x) > obstacle.width / 2 + 0.4), obstacle.id).toBe(true);
      await testInfo.attach(`route-${obstacle.id}`, { body: JSON.stringify(frames), contentType: 'application/json' });
      if (obstacle.id.startsWith('ruin-wall')) await page.screenshot({ path: 'test-results/ether-ruins.png' });
    }
    await teleport({ x: -4, z: 0 });
    const blocked = await page.evaluate(() => window.eterDiagnostics({ x: 0, z: 0 })!.projected!);
    await page.mouse.click(blocked.x, blocked.y);
    await expect(page.locator('#notices')).toContainText('bloqueado');
    expect(observed.state!.self.x).toBe(-4);
    await page.locator('#viewport canvas').hover(); await page.mouse.wheel(0, -10000);
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.zoom)).toBe(presentation.camera.minHalfHeight);
    await page.mouse.wheel(0, 10000);
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.zoom)).toBe(presentation.camera.maxHalfHeight);
    expect((await page.evaluate(() => window.eterDiagnostics()!)).characterScreenHeight).toBeGreaterThan(75);
    await page.mouse.wheel(0, (presentation.camera.defaultHalfHeight - presentation.camera.maxHalfHeight) / presentation.camera.wheelSensitivity);
    await teleport({ x: 12, z: -7 });
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.fadedBuildings)).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/goal-3-building-occlusion.png' });
    await teleport({ x: 0, z: 10 });
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.daylight), { timeout: 12000, intervals: [100] }).toBeGreaterThan(0.95);
    const day = await page.evaluate(() => window.eterDiagnostics()); await page.screenshot({ path: 'test-results/day.png' });
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.daylight), { timeout: 12000, intervals: [100] }).toBeLessThan(0.05);
    const night = await page.evaluate(() => window.eterDiagnostics()); await page.screenshot({ path: 'test-results/night.png' });
    expect(day!.sun - night!.sun).toBeGreaterThan(2); expect(night!.ambient).toBeGreaterThanOrEqual(1.4); expect(night!.sun).toBeGreaterThanOrEqual(0.7);
    await testInfo.attach('day-night-lighting', { body: JSON.stringify({ day, night }), contentType: 'application/json' });
    for (const region of [
      { name: 'greenfields', x: 0, z: 32, monsters: ['sproutling', 'wild-beetle'] },
      { name: 'whisperwood', x: -46, z: 22, monsters: ['forest-wolf', 'thornling', 'rogue'] },
      { name: 'stonepass', x: 48, z: 8, monsters: ['stone-beetle', 'orc-scout', 'stone-golem'] },
      { name: 'ether-ruins', x: 0, z: -51, monsters: ['stone-golem'] },
    ]) {
      const point = [{ x: region.x, z: region.z }, { x: region.x + 1, z: region.z }, { x: region.x - 1, z: region.z }].find(walkable)!;
      await teleport(point);
      for (const [index, monsterId] of region.monsters.entries()) {
        const position = [{ x: point.x - 3 + index * 3, z: point.z - 3 }, { x: point.x - 3 + index * 3, z: point.z - 4 }].find(walkable)!;
        await admin('spawn', { monsterId, ...position });
      }
      await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.daylight), { timeout: 12000, intervals: [100] }).toBeGreaterThan(0.8);
      await page.screenshot({ path: `test-results/region-${region.name}.png` });
    }
    await teleport({ x: 0, z: 30 });
    const before = new Set(observed.state!.monsters.map(m => m.id));
    await admin('spawn', { monsterId: 'sproutling', x: 0, z: 33 });
    await expect.poll(() => observed.state!.monsters.some(m => !before.has(m.id))).toBe(true);
    const target = observed.state!.monsters.find(m => !before.has(m.id))!;
    await clickEntity(page, target.id);
    await expect.poll(() => observed.state!.monsters.find(m => m.id === target.id)?.hp).toBe(0);
    await expect.poll(() => observed.state!.loot.some(d => d.kind === 'ether')).toBe(true);
    const ether = observed.state!.loot.find(d => d.kind === 'ether')!;
    await expect(page.locator(`[data-entity-id="${ether.id}"]`)).toBeVisible();
    const drop = await page.evaluate(id => window.eterDiagnostics()!.drops.find(d => d.id === id), ether.id);
    expect(drop!.meshes.some(m => m.geometry === 'OctahedronGeometry' && m.emissive !== 0)).toBe(true);
    expect(drop!.meshes.some(m => m.type === 'Points')).toBe(true);
    const lootIds = observed.state!.loot.map(d => d.id);
    for (const id of lootIds) {
      await expect.poll(() => page.locator(`[data-entity-id="${id}"]`).evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-entity-id]') === el; })).toBe(true);
    }
    await page.screenshot({ path: 'test-results/ether-drop.png' });
    await page.getByRole('button', { name: 'Loot: ON', exact: true }).click();
    await expect(page.locator(`[data-entity-id="${ether.id}"]`)).toBeHidden();
    expect((await page.evaluate(() => window.eterDiagnostics()!.drops)).some(d => d.id === ether.id)).toBe(true);
    await teleport({ x: -3, z: 31 });
    await page.locator('#viewport canvas').hover(); await page.mouse.wheel(0, -10000);
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.zoom)).toBe(presentation.camera.minHalfHeight);
    const crystal = await page.evaluate(p => window.eterDiagnostics(p)!.projected!, { x: ether.x, z: ether.z });
    await page.screenshot({ path: 'test-results/ether-without-labels.png', clip: { x: crystal.x - 140, y: crystal.y - 120, width: 280, height: 200 } });
    await page.getByRole('button', { name: 'Loot: OFF', exact: true }).click();
    await clickEntity(page, ether.id); await expect.poll(() => observed.state!.self.ether).toBe(1);
    await page.getByRole('button', { name: 'Personajes', exact: true }).click();
    await page.locator(`[data-character="${player.characterId}"]`).click(); await page.locator('#enter-world').click();
    await expect(page.locator('#ether')).toContainText('1 Éter');
    for (const [index, classId] of ['VANGUARD', 'ARCANIST', 'RANGER'].entries()) {
      if (index) {
        await page.getByRole('button', { name: 'Opciones', exact: true }).click(); await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
        player = await register(page, `visual${index}`, classId, base);
        const store = new Store(database); store.makeAdmin(player.username); store.close();
      }
      await teleport({ x: 0, z: 30 });
      const ids = new Set(observed.state!.monsters.map(m => m.id));
      await admin('spawn', { monsterId: 'stone-golem', x: 0, z: 34 });
      await expect.poll(() => observed.state!.monsters.some(m => !ids.has(m.id))).toBe(true);
      const enemy = observed.state!.monsters.find(m => !ids.has(m.id))!;
      await clickEntity(page, enemy.id);
      for (const [slot, skill] of skills.filter(s => s.classId === classId).entries()) {
        const count = await page.evaluate(kind => window.eterDiagnostics()!.presentedVisuals[kind] ?? 0, skill.kind);
        await page.keyboard.press(String(slot + 1));
        await expect.poll(() => observed.state!.cooldowns[skill.id] ?? 0).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate(kind => window.eterDiagnostics()!.presentedVisuals[kind] ?? 0, skill.kind)).toBeGreaterThan(count);
        if (skill.kind === 'blink') await expect.poll(() => observed.state!.self.z).toBeGreaterThan(34);
      }
      if (classId !== 'VANGUARD') {
        const kind = classId === 'RANGER' ? 'arrow-projectile' : 'magic-projectile';
        await expect.poll(() => page.evaluate(k => window.eterDiagnostics()!.presentedVisuals[k] ?? 0, kind)).toBeGreaterThan(0);
      }
      await page.screenshot({ path: `test-results/skills-${classId.toLowerCase()}.png` });
      await testInfo.attach(`visuals-${classId}`, { body: JSON.stringify(await page.evaluate(() => window.eterDiagnostics())), contentType: 'application/json' });
    }
    expect(observed.errors).toEqual([]);
    expect(output).not.toContain('uncaughtException');
  } finally {
    await testInfo.attach('visual-server-output', { body: JSON.stringify({ output, exitCode: child?.exitCode, signalCode: child?.signalCode }), contentType: 'application/json' });
    await page.goto('about:blank').catch(() => {});
    if (child && child.exitCode === null) { const exited = new Promise<void>(resolve => child!.once('exit', () => resolve())); child.kill(); await exited; }
    rmSync(folder, { recursive: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('two rendering Chrome clients remain responsive with ten connected players', async ({ browser }, testInfo) => {
  // Total includes two full registrations/model loads on the current Radeon R5.
  // Frame-time, snapshot-rate and per-connection gates below remain unchanged.
  test.setTimeout(240000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const A = observe(pages[0]), B = observe(pages[1]);
  const clients: { socket: WebSocket; frames: number; state?: State; error?: string }[] = [];
  try {
    await register(pages[0], 'perf_a', 'VANGUARD'); await register(pages[1], 'perf_b', 'RANGER');
    const base = 'http://127.0.0.1:3100';
    for (let i = 0; i < 8; i++) {
      const response = await fetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `load_${nonce}_${i}`, password: 'load-secure-password' }) });
      expect(response.ok).toBe(true);
      const cookie = response.headers.get('set-cookie')!.split(';')[0];
      const creation = await fetch(`${base}/api/characters`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `L${nonce.slice(-6)}${i}`, classId: 'VANGUARD' }) });
      expect(creation.ok).toBe(true);
      const { character } = await creation.json() as { character: Character };
      const socket = new WebSocket(`ws://127.0.0.1:3100/ws?characterId=${character.id}`, { headers: { Cookie: cookie } });
      const client = { socket, frames: 0, state: undefined as State | undefined, error: undefined as string | undefined };
      socket.on('error', error => { client.error = error.message; });
      socket.on('message', data => { const value = JSON.parse(String(data)) as State; if (value.type === 'state') { client.frames++; client.state = value; } });
      clients.push(client);
      await expect.poll(() => client.error ?? (client.frames > 0 ? 'ready' : `waiting (${socket.readyState})`)).toBe('ready');
      socket.send(JSON.stringify({ type: 'move', x: i - 4, z: 30 }));
    }
    await expect.poll(() => A.state!.players.length).toBe(10); await expect.poll(() => B.state!.players.length).toBe(10);
    await Promise.all([walkTo(pages[0], A, { x: 0, z: 20 }), walkTo(pages[1], B, { x: 2, z: 20 })]);
    const counts = clients.map(c => c.frames), started = Date.now();
    let interpolated = false;
    await Promise.all([walkTo(pages[0], A, { x: 0, z: 12 }), walkTo(pages[1], B, { x: 2, z: 12 }), (async () => {
      for (let sample = 0; sample < 20; sample++) {
        const actor = await pages[0].evaluate(id => window.eterDiagnostics()!.actors.find(a => a.id === id), A.state!.self.id);
        if (actor && Math.hypot(actor.x - A.state!.self.x, actor.z - A.state!.self.z) > 0.02 && Math.hypot(actor.x - A.state!.self.x, actor.z - A.state!.self.z) < 2) interpolated = true;
        await pages[0].waitForTimeout(100);
      }
    })()]);
    const memoryBefore = await pages[0].evaluate(() => window.eterDiagnostics()!.memory);
    await pages[0].waitForTimeout(6000);
    const memoryAfter = await pages[0].evaluate(() => window.eterDiagnostics()!.memory);
    expect(memoryAfter.geometries).toBeLessThanOrEqual(memoryBefore.geometries + 10);
    expect(memoryAfter.textures).toBeLessThanOrEqual(memoryBefore.textures + 3);
    expect(interpolated, 'rendered movement follows authoritative positions with interpolation').toBe(true);
    const elapsed = (Date.now() - started) / 1000;
    const snapshotRates = clients.map((c, i) => (c.frames - counts[i]) / elapsed);
    for (const rate of snapshotRates) expect(rate).toBeGreaterThan(7);
    const diagnostics = await Promise.all(pages.map(p => p.evaluate(() => window.eterDiagnostics()!)));
    const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
    const results = diagnostics.map(d => ({ renderer: d.renderer, shadows: d.shadows, frames: d.renderedFrames, medianFrameMs: percentile(d.frameTimes, 0.5), p95FrameMs: percentile(d.frameTimes, 0.95), medianRenderMs: percentile(d.renderTimes, 0.5), drawCalls: d.drawCalls, triangles: d.triangles }));
    for (const result of results) {
      expect(result.frames).toBeGreaterThan(100);
      expect(result.medianFrameMs).toBeLessThan(100); expect(result.p95FrameMs).toBeLessThan(200);
      expect(result.drawCalls).toBeLessThan(500);
    }
    console.log('Ten-player performance:', JSON.stringify({ results, snapshotRates }));
    await testInfo.attach('ten-player-performance', { body: JSON.stringify({ results, snapshotRates, elapsed, interpolated, memoryBefore, memoryAfter }), contentType: 'application/json' });
    await pages[0].screenshot({ path: 'test-results/ten-player-load.png' });
    expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  } finally {
    for (const client of clients) client.socket.close();
    await Promise.all(contexts.map(c => c.close()));
  }
});

test('software rendering starts two clients and reconnects without an empty HUD', async ({}, testInfo) => {
  // Two CPU-rendered worlds and four scene rebuilds need a larger total budget;
  // individual connection/readiness assertions retain their existing deadlines.
  test.setTimeout(420000);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  try {
    const contexts = await Promise.all([browser.newContext({ viewport: { width: 1440, height: 900 } }), browser.newContext({ viewport: { width: 1440, height: 900 } })]);
    const pages = await Promise.all(contexts.map(c => c.newPage()));
    const A = observe(pages[0]), B = observe(pages[1]);
    await register(pages[0], 'soft_a', 'VANGUARD');
    const started = Date.now(), playerB = await register(pages[1], 'soft_b', 'ARCANIST');
    const startupMs = Date.now() - started;
    for (let join = 0; join < 2; join++) {
      await pages[1].getByRole('button', { name: 'Personajes', exact: true }).click();
      await expect.poll(() => A.state!.players.length).toBe(1);
      await pages[1].locator(`[data-character="${playerB.characterId}"]`).click(); await pages[1].locator('#enter-world').click();
      await expect(pages[1].locator('#viewport canvas')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
      await expect(pages[1].locator('#character-name')).not.toBeEmpty();
      await expect.poll(() => A.state!.players.length).toBe(2);
    }
    await expect.poll(() => pages[1].evaluate(() => window.eterDiagnostics()!.renderedFrames)).toBeGreaterThan(30);
    const diagnostics = await Promise.all(pages.map(p => p.evaluate(() => window.eterDiagnostics()!)));
    for (const d of diagnostics) { expect(d.renderer).toMatch(/swiftshader/i); expect(d.shadows).toBe(false); }
    expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
    console.log('Software second client startup:', startupMs, 'ms');
    await testInfo.attach('software-startup', { body: JSON.stringify({ startupMs, diagnostics }), contentType: 'application/json' });
  } finally { await browser.close(); }
});

test('level-one grinding loop reaches gear, city services and Sanctum without admin helpers', async ({ page }, testInfo) => {
  test.setTimeout(300000);
  const observed = observe(page), player = await register(page, 'beginner', 'VANGUARD');
  const started = Date.now();
  await walkTo(page, observed, { x: 0, z: 20 }); await walkTo(page, observed, { x: 0, z: 29 });
  expect(observed.state!.self.level).toBe(1);
  await page.keyboard.press('4');
  await expect.poll(() => observed.state!.cooldowns['war-cry'] ?? 0).toBeGreaterThan(0);
  await expect(page.locator('.skill.normal')).toHaveClass(/active/);
  let kills = 0, pickedCrowns = false;
  let gear: Character['inventory'][number] | undefined;
  while ((!gear || observed.state!.self.level < 2) && Date.now() - started < 180000) {
    await expect.poll(() => observed.state!.monsters.some(m => m.definitionId === 'sproutling' && m.hp > 0 && Math.hypot(m.x - observed.state!.self.x, m.z - observed.state!.self.z) < 18)).toBe(true);
    const target = await clickVisibleSprout(page, observed.state!.monsters.filter(m => m.hp > 0).map(m => m.id));
    await expect.poll(() => observed.state!.monsters.find(m => m.id === target)?.hp).toBe(0); kills++;
    for (const drop of observed.state!.loot.filter(d => d.ownerId === player.characterId)) {
      const before = observed.state!.self.crowns;
      await clickEntity(page, drop.id);
      await expect.poll(() => observed.state!.loot.some(d => d.id === drop.id)).toBe(false);
      if (drop.kind === 'crowns') { expect(observed.state!.self.crowns).toBeGreaterThan(before); pickedCrowns = true; }
    }
    gear = observed.state!.self.inventory.find(item => {
      const def = items.find(d => d.id === item.definitionId)!;
      const needed = Object.entries(def.requirements ?? {}).reduce((sum, [stat, required]) => sum + Math.max(0, required - observed.state!.self.stats[stat as keyof Character['stats']]), 0);
      // A natural drop may require earned stat points, including a hybrid weapon.
      // Reserve five points for the Vitality step exercised below.
      return !!def.slot && needed <= observed.state!.self.freePoints - 5;
    });
  }
  expect(kills).toBeGreaterThanOrEqual(2); expect(pickedCrowns).toBe(true); expect(gear).toBeTruthy();
  await page.keyboard.press('c');
  const vitality = observed.state!.self.stats.vitality;
  await page.locator('[data-stat="vitality"][data-amount="5"]').click();
  await expect.poll(() => observed.state!.self.stats.vitality).toBe(vitality + 5);
  for (const [stat, required] of Object.entries(items.find(d => d.id === gear!.definitionId)!.requirements ?? {})) {
    while (observed.state!.self.stats[stat as keyof Character['stats']] < required) {
      const before = observed.state!.self.stats[stat as keyof Character['stats']], amount = required - before >= 5 ? 5 : 1;
      await page.locator(amount === 5 ? `[data-stat="${stat}"][data-amount="5"]` : `[data-stat="${stat}"]:not([data-amount])`).click();
      await expect.poll(() => observed.state!.self.stats[stat as keyof Character['stats']]).toBe(before + amount);
    }
  }
  await page.keyboard.press('Escape'); await page.keyboard.press('i');
  await page.locator(`[data-item="${gear!.id}"]`).dblclick();
  const slot = items.find(d => d.id === gear!.definitionId)!.slot!;
  await expect.poll(() => observed.state!.self.equipment[slot]?.id).toBe(gear!.id);
  await page.keyboard.press('Escape'); await page.screenshot({ path: 'test-results/beginner-farming.png' });
  await walkTo(page, observed, { x: 0, z: 30 }); await walkTo(page, observed, { x: 0, z: 20 }); await walkTo(page, observed, { x: 0, z: 10 });
  await clickEntity(page, 'npc-lyra'); await expect(page.locator('[data-buy="hp-potion"]')).toBeVisible();
  const crowns = observed.state!.self.crowns;
  await page.locator('[data-buy="hp-potion"]').click(); await expect.poll(() => observed.state!.self.crowns).toBe(crowns - 15);
  await page.keyboard.press('Escape'); await walkTo(page, observed, { x: 0, z: 10 });
  await clickEntity(page, 'npc-brom'); await expect(page.locator('#repair')).toBeVisible();
  await page.locator('#repair').click(); await expect(page.locator('#notices')).toContainText('reparado');
  await page.keyboard.press('Escape');
  // The close camera requires walking north to bring Sanctum into view.
  await walkTo(page, observed, { x: -5, z: -9 }); await clickEntity(page, 'npc-orin');
  const bag = page.locator('.inventory-grid[data-container="inventory"]'), vault = page.locator('.inventory-grid[data-container="sanctum"]');
  await expect(bag).toBeVisible(); const storedId = await bag.locator('.item').first().getAttribute('data-item');
  await bag.locator('.item').first().dblclick(); await expect(vault.locator(`[data-item="${storedId}"]`)).toBeVisible();
  await page.screenshot({ path: 'test-results/beginner-sanctum.png' });
  await vault.locator(`[data-item="${storedId}"]`).dblclick(); await expect(bag.locator(`[data-item="${storedId}"]`)).toBeVisible();
  expect(observed.errors).toEqual([]);
  await testInfo.attach('natural-beginner-loop', { body: JSON.stringify({ kills, elapsedMs: Date.now() - started, level: observed.state!.self.level, equipped: gear!.definitionId, crowns: observed.state!.self.crowns, adminHelpers: false }), contentType: 'application/json' });
});
