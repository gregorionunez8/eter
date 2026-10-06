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
import { skills } from '../../shared/content';

declare global { interface Window { eterDiagnostics: (point?: Point) => ReturnType<Scene['diagnostics']> | undefined } }
type State = { type: string; now: number; self: Character; cooldowns: Record<string, number>; players: { id: string; x: number; z: number }[]; monsters: { id: string; definitionId: string; x: number; z: number; hp: number }[]; loot: { id: string; kind: string; ownerId: string; x: number; z: number; exclusiveUntil: number; item?: { id: string; definitionId: string } }[] };
function observe(page: Page) {
  const observed = { state: undefined as State | undefined, frames: [] as { now: number; x: number; z: number }[], errors: [] as string[] };
  page.on('pageerror', error => observed.errors.push(error.message));
  page.on('websocket', socket => {
    socket.on('framereceived', frame => {
      const value = JSON.parse(String(frame.payload)) as State;
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
  const origin = { x: state.state!.self.x, z: state.state!.self.z };
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
  await expect.poll(() => state.state ? Math.hypot(state.state.self.x - point.x, state.state.self.z - point.z) : Infinity).toBeLessThan(0.6);
}

const nonce = Date.now().toString(36);
async function clickVisibleSprout(page: Page): Promise<string> {
  let hit: { id: string; x: number; y: number } | undefined;
  await expect.poll(async () => {
    hit = await page.locator('.monster-label').filter({ hasText: 'Sproutling' }).evaluateAll(elements => elements.map(el => {
      const rect = el.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      return { id: (el as HTMLElement).dataset.entityId!, x, y, reachable: rect.width > 0 && x > 20 && x < 1200 && y > 150 && y < 650 && document.elementFromPoint(x, y)?.closest('[data-entity-id]') === el };
    }).filter(value => value.reachable).sort((a, b) => Math.hypot(a.x - 720, a.y - 430) - Math.hypot(b.x - 720, b.y - 430))[0]);
    return !!hit;
  }).toBe(true);
  await page.mouse.click(hit!.x, hit!.y); return hit!.id;
}
async function register(page: Page, suffix: string, classId: string, base = ''): Promise<{ username: string; characterId: string }> {
  page.on('pageerror', error => console.log(`Browser ${suffix}: ${error.stack}`));
  page.on('console', message => { if (message.type() === 'error') console.log(`Console ${suffix}: ${message.text()}`); });
  page.on('websocket', socket => { if (socket.url().includes('/ws?')) { console.log(`Socket ${suffix}: connected`); let frames = 0; socket.on('framereceived', frame => { if (frames++ < 2) console.log(`Frame ${suffix}: ${String(frame.payload).slice(0, 100)}`); }); socket.on('socketerror', error => console.log(`Socket ${suffix}: ${error}`)); } });
  const username = `test_${nonce}_${suffix}`;
  await page.goto(`${base}/?diagnostics=1`);
  await page.locator('[name="username"]').fill(username); await page.locator('[name="password"]').fill('browser-secure-password');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.locator('[name="name"]').fill(`H${nonce.slice(-6)}${suffix}`); await page.locator(`[name="classId"][value="${classId}"]`).check();
  await page.getByRole('button', { name: 'Crear personaje', exact: true }).click();
  const card = page.locator('[data-character]').first(); await expect(card).toBeVisible(); const characterId = await card.getAttribute('data-character');
  await card.click(); await expect(page.locator('#character-name')).toContainText(`H${nonce.slice(-6)}`, { timeout: 90000 });
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await expect(page.locator('#viewport canvas')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
  return { username, characterId: characterId! };
}
test('Chrome renders original 3D Aurelia, click walking, UI grids and each class', async ({ browser, page }) => {
  test.setTimeout(300000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const [index, classId] of ['VANGUARD', 'ARCANIST', 'RANGER'].entries()) {
    if (index) { await page.getByRole('button', { name: 'Opciones', exact: true }).click(); await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); }
    await register(page, `class${index}`, classId);
    await expect(page.locator('[data-skill]')).toHaveCount(4);
    await expect(page.locator('#coordinates')).toContainText('Aurelia');
    const before = await page.locator('#coordinates').textContent();
    // Ground ahead of the player, clear of city buildings and central crystal.
    await page.locator('#viewport canvas').click({ position: { x: 720, y: 620 } });
    await expect.poll(() => page.locator('#coordinates').textContent()).not.toBe(before);
    await page.keyboard.press('i'); await expect(page.locator('.inventory-grid')).toBeVisible(); await expect(page.locator('[data-slot]')).toHaveCount(11);
    await page.locator('[data-slot="weapon"]').click(); await expect(page.locator('[data-slot="weapon"] strong')).toHaveText('—');
    const weapon = page.locator('.item').filter({ hasText: classId === 'VANGUARD' ? 'Espada' : classId === 'ARCANIST' ? 'Bastón' : 'Arco' }); await weapon.dblclick();
    await expect(page.locator('[data-slot="weapon"] strong')).not.toHaveText('—');
    const potion = page.locator('.item.hp').first();
    await potion.dragTo(page.locator('.inventory-grid'), { targetPosition: { x: 190, y: 190 } });
    await expect(potion).toHaveCSS('left', '180px');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Loot: ON', exact: true }).click(); await expect(page.getByRole('button', { name: 'Loot: OFF', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/aurelia-${classId.toLowerCase()}.png` });
  }
  expect(errors).toEqual([]);
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
      await b.locator(`[data-character="${playerB.characterId}"]`).click();
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
        equippedSlot = item.item!.definitionId === 'iron-sword' ? 'weapon' : item.item!.definitionId === 'linen-armor' ? 'armor' : 'boots';
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
    await a.locator(`[data-character="${playerA.characterId}"]`).click();
    await expect(a.locator('#viewport canvas')).toHaveAttribute('data-ready', 'true');
    await expect.poll(() => A.state!.self.equipment[equippedSlot!]?.id).toBe(equippedId);
    expect(A.state!.self.equipment[equippedSlot!]).toEqual(saved.equipment);
    expect(A.state!.self.xp).toBe(saved.xp); expect(A.state!.self.level).toBe(saved.level); expect(A.state!.self.crowns).toBe(saved.crowns);
    await a.keyboard.press('i'); await expect(a.locator(`[data-slot="${equippedSlot}"] strong`)).not.toHaveText('—');
    await a.keyboard.press('Escape'); await a.getByRole('button', { name: 'Opciones', exact: true }).click();
    await a.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await a.locator('[name="username"]').fill(playerA.username); await a.locator('[name="password"]').fill('browser-secure-password');
    await a.getByRole('button', { name: 'Entrar', exact: true }).click();
    await a.locator(`[data-character="${playerA.characterId}"]`).click();
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
  await page.locator('[data-stat="vitality"][data-amount="5"]').click(); await expect(page.locator('.points')).toContainText('0 puntos');
  await page.keyboard.press('Escape'); await teleport(12, 7);
  await page.locator('[data-entity-id="npc-lyra"]').click(); await page.locator('[data-buy="hp-potion"]').click(); await expect(page.locator('#crowns')).toContainText('35');
  await page.keyboard.press('Escape'); await teleport(-12, -5);
  await page.locator('[data-entity-id="npc-orin"]').click();
  const inventory = page.locator('.inventory-grid[data-container="inventory"]'), sanctum = page.locator('.inventory-grid[data-container="sanctum"]');
  await inventory.locator('.item').first().dblclick(); await expect(sanctum.locator('.item')).toHaveCount(1);
  await sanctum.locator('.item').first().dblclick(); await expect(sanctum.locator('.item')).toHaveCount(0);
  await page.keyboard.press('Escape'); await teleport(-12, 6);
  await page.locator('[data-entity-id="npc-brom"]').click(); await page.locator('#repair').click(); await expect(page.locator('#notices')).toContainText('reparado');
  await page.goto('/admin'); await expect(page.locator('#config-editor')).toBeVisible();
  const original = await page.locator('#config-editor').inputValue(), config = JSON.parse(original) as { balance: { dayNightCycleDuration: number } }; config.balance.dayNightCycleDuration = 120000;
  await page.locator('#config-editor').fill(JSON.stringify(config, null, 2)); await page.getByRole('button', { name: 'Guardar configuración' }).click(); await expect(page.locator('#error')).toContainText('Guardado');
  // Restore baseline settings for other browser runs. Restart application is tested by integration.
  await page.locator('#config-editor').fill(original); await page.getByRole('button', { name: 'Guardar configuración' }).click();
});

test('production visuals: physical Ether, day/night, twelve skills, projectiles, zoom and obstacle routes', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const folder = mkdtempSync(join(tmpdir(), 'eter-visual-')), database = join(folder, 'visual.sqlite');
  const base = 'http://127.0.0.1:3101';
  // Isolated, disclosed visual fixture: normal loot is still created by combat and picked up manually.
  const config = getConfig(); config.balance.dayNightCycleDuration = 10000; config.balance.etherDropChance = 1;
  for (const monster of config.monsters) { monster.damage = 0; monster.aggroRange = 0; }
  const fixture = new Store(database); fixture.setSetting('content', config); fixture.close();
  let child: ChildProcess | undefined, output = '';
  const observed = observe(page);
  try {
    child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/index.ts', '--production'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '3101', DATABASE_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.zoom)).toBe(14);
    await page.mouse.wheel(0, 10000);
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.zoom)).toBe(34);
    await page.mouse.wheel(0, -667);
    await teleport({ x: 0, z: 10 });
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.daylight), { timeout: 12000, intervals: [100] }).toBeGreaterThan(0.95);
    const day = await page.evaluate(() => window.eterDiagnostics()); await page.screenshot({ path: 'test-results/day.png' });
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.daylight), { timeout: 12000, intervals: [100] }).toBeLessThan(0.05);
    const night = await page.evaluate(() => window.eterDiagnostics()); await page.screenshot({ path: 'test-results/night.png' });
    expect(day!.sun - night!.sun).toBeGreaterThan(2); expect(night!.ambient).toBeGreaterThanOrEqual(1.4); expect(night!.sun).toBeGreaterThanOrEqual(0.7);
    await testInfo.attach('day-night-lighting', { body: JSON.stringify({ day, night }), contentType: 'application/json' });
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
    await expect.poll(() => page.evaluate(() => window.eterDiagnostics()!.zoom)).toBe(14);
    const crystal = await page.evaluate(p => window.eterDiagnostics(p)!.projected!, { x: ether.x, z: ether.z });
    await page.screenshot({ path: 'test-results/ether-without-labels.png', clip: { x: crystal.x - 140, y: crystal.y - 120, width: 280, height: 200 } });
    await page.getByRole('button', { name: 'Loot: OFF', exact: true }).click();
    await clickEntity(page, ether.id); await expect.poll(() => observed.state!.self.ether).toBe(1);
    await page.getByRole('button', { name: 'Personajes', exact: true }).click();
    await page.locator(`[data-character="${player.characterId}"]`).click();
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
    await page.goto('about:blank');
    if (child && child.exitCode === null) { const exited = new Promise<void>(resolve => child!.once('exit', () => resolve())); child.kill(); await exited; }
    rmSync(folder, { recursive: true });
  }
});

test('two rendering Chrome clients remain responsive with ten connected players', async ({ browser }, testInfo) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const A = observe(pages[0]), B = observe(pages[1]);
  const clients: { socket: WebSocket; frames: number; state?: State }[] = [];
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
      const client = { socket, frames: 0, state: undefined as State | undefined };
      socket.on('message', data => { const value = JSON.parse(String(data)) as State; if (value.type === 'state') { client.frames++; client.state = value; } });
      clients.push(client);
      await expect.poll(() => client.frames).toBeGreaterThan(0);
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
    await pages[0].waitForTimeout(6000);
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
    await testInfo.attach('ten-player-performance', { body: JSON.stringify({ results, snapshotRates, elapsed, interpolated }), contentType: 'application/json' });
    await pages[0].screenshot({ path: 'test-results/ten-player-load.png' });
    expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  } finally {
    for (const client of clients) client.socket.close();
    await Promise.all(contexts.map(c => c.close()));
  }
});

test('software rendering starts two clients and reconnects without an empty HUD', async ({}, testInfo) => {
  test.setTimeout(90000);
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
      await pages[1].locator(`[data-character="${playerB.characterId}"]`).click();
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
