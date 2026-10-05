import { test, expect, type Page } from '@playwright/test';
import { Store } from '../../server/database';

const nonce = Date.now().toString(36);
async function register(page: Page, suffix: string, classId: string): Promise<{ username: string; characterId: string }> {
  page.on('pageerror', error => console.log(`Browser ${suffix}: ${error.stack}`));
  page.on('console', message => { if (message.type() === 'error') console.log(`Console ${suffix}: ${message.text()}`); });
  page.on('websocket', socket => { if (socket.url().includes('/ws?')) { console.log(`Socket ${suffix}: connected`); let frames = 0; socket.on('framereceived', frame => { if (frames++ < 2) console.log(`Frame ${suffix}: ${String(frame.payload).slice(0, 100)}`); }); socket.on('socketerror', error => console.log(`Socket ${suffix}: ${error}`)); } });
  const username = `test_${nonce}_${suffix}`;
  await page.goto('/');
  await page.locator('[name="username"]').fill(username); await page.locator('[name="password"]').fill('browser-secure-password');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.locator('[name="name"]').fill(`H${nonce.slice(-6)}${suffix}`); await page.locator(`[name="classId"][value="${classId}"]`).check();
  await page.getByRole('button', { name: 'Crear personaje', exact: true }).click();
  const card = page.locator('[data-character]').first(); await expect(card).toBeVisible(); const characterId = await card.getAttribute('data-character');
  await card.click(); await expect(page.locator('#character-name')).toContainText(`H${nonce.slice(-6)}`, { timeout: 90000 });
  await expect(page.locator('#viewport canvas')).toBeVisible();
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

test('two actual Chrome clients share monsters, combat, exclusive loot, public pickup after 30s and persistent progress', async ({ browser }) => {
  test.setTimeout(300000);
  const contextA = await browser.newContext(), contextB = await browser.newContext();
  const a = await contextA.newPage(), b = await contextB.newPage();
  type State = { type: string; players: { id: string; x: number; z: number }[]; monsters: { id: string; definitionId: string; x: number; z: number; hp: number }[]; loot: { id: string; kind: string; ownerId: string; x: number; z: number; item?: { definitionId: string } }[] };
  let state: State | undefined;
  a.on('websocket', socket => {
    if (!socket.url().includes('/ws?')) return;
    socket.on('framereceived', frame => { const value = JSON.parse(String(frame.payload)) as State; if (value.type === 'state') state = value; });
  });
  const playerA = await register(a, 'multi_a', 'VANGUARD'), playerB = await register(b, 'multi_b', 'ARCANIST');
  const store = new Store('data/e2e.sqlite'); store.makeAdmin(playerA.username); store.close();
  await a.reload(); await a.locator(`[data-character="${playerA.characterId}"]`).click(); await expect(a.locator('#character-name')).toContainText(`H${nonce.slice(-6)}`);
  const cookies = await contextA.cookies();
  async function admin(characterId: string, operation: string, extras: Record<string, unknown> = {}) {
    const response = await contextA.request.post('/api/admin/action', { data: { characterId, operation, ...extras } }); expect(response.ok()).toBeTruthy();
  }
  // Actual click movement walks out through the southern gate before the combat test.
  for (let i = 0; i < 3; i++) { await a.locator('#viewport canvas').click({ position: { x: 610, y: 680 } }); await a.waitForTimeout(2200); }
  await admin(playerA.characterId, 'teleport', { x: 8, z: 35 }); await admin(playerB.characterId, 'teleport', { x: 10, z: 35 });
  await expect(a.locator('.player-label')).toHaveCount(2); await expect(b.locator('.player-label')).toHaveCount(2);
  const enemyId = await a.locator('.monster-label').first().evaluate(element => {
    // Label ID is supplied below via the read-only snapshot obtained over a separate account.
    return element.textContent;
  }); expect(enemyId).toBeTruthy();
  // Observe A's actual WebSocket frames; only two visual clients participate.
  await expect.poll(() => state?.players.length).toBe(2);
  const monster = state!.monsters.filter(m => m.definitionId === 'sproutling').sort((m, n) => Math.hypot(m.x - 8, m.z - 35) - Math.hypot(n.x - 8, n.z - 35))[0];
  await admin(playerA.characterId, 'teleport', { x: monster.x, z: monster.z - 2 }); await admin(playerB.characterId, 'teleport', { x: monster.x + 1, z: monster.z - 2 });
  // Clicking the actual projected monster executes auto-approach and basic attacks.
  const monsterLabel = a.locator('.monster-label').filter({ hasText: 'Sproutling' });
  let loot: State['loot'][number] | undefined;
  for (let attempt = 0; attempt < 8 && !loot; attempt++) {
    const boxes = await monsterLabel.evaluateAll(elements => elements.map(el => { const rect = el.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height - 8, visible: rect.x > 20 && rect.y > 150 && rect.x < 1200 && rect.y < 650 }; }));
    const visible = boxes.find(box => box.visible); if (!visible) break;
    await monsterLabel.filter({ visible: true }).first().click();
    await a.waitForTimeout(5000);
    loot = state!.loot.find(d => d.ownerId === playerA.characterId && d.kind === 'crowns');
  }
  expect(loot, 'A kills a monster and creates a physical Crowns drop').toBeTruthy();
  await expect(a.locator('#xp-label')).not.toContainText('EXP 0 /');
  await admin(playerB.characterId, 'teleport', { x: loot!.x, z: loot!.z + 0.5 });
  const lootLabelB = b.locator('.loot-label').filter({ hasText: 'Crowns' }).first();
  await lootLabelB.click();
  await expect(b.locator('#notices')).toContainText('pertenece');
  const beforeB = await b.locator('#crowns').textContent(); await b.waitForTimeout(31000);
  await lootLabelB.click();
  await expect.poll(() => b.locator('#crowns').textContent()).not.toBe(beforeB);
  let collectedCrowns = false, equippedDrop = false;
  for (let attempt = 0; attempt < 45 && (!collectedCrowns || !equippedDrop); attempt++) {
    const drops = state!.loot.filter(drop => drop.ownerId === playerA.characterId);
    const crowns = drops.find(drop => drop.kind === 'crowns');
    if (crowns && !collectedCrowns) {
      await admin(playerA.characterId, 'teleport', { x: crowns.x, z: crowns.z + 0.5 });
      await a.locator(`[data-entity-id="${crowns.id}"]`).click();
      await expect.poll(() => state!.loot.some(drop => drop.id === crowns.id)).toBe(false); collectedCrowns = true;
    }
    const item = drops.find(drop => drop.kind === 'item' && ['iron-sword', 'linen-armor', 'leather-boots'].includes(drop.item!.definitionId));
    if (item && !equippedDrop) {
      await admin(playerA.characterId, 'teleport', { x: item.x, z: item.z + 0.5 });
      await a.locator(`[data-entity-id="${item.id}"]`).click(); await expect.poll(() => state!.loot.some(drop => drop.id === item.id)).toBe(false);
      await a.keyboard.press('i');
      const text = item.item!.definitionId === 'iron-sword' ? 'Espada' : item.item!.definitionId === 'linen-armor' ? 'lino' : 'Botas';
      await a.locator('.item').filter({ hasText: text }).first().dblclick();
      const slot = item.item!.definitionId === 'iron-sword' ? 'weapon' : item.item!.definitionId === 'linen-armor' ? 'armor' : 'boots';
      await expect(a.locator(`[data-slot="${slot}"] strong`)).toContainText(text);
      await a.keyboard.press('Escape'); equippedDrop = true;
    }
    if (collectedCrowns && equippedDrop) break;
    const live = state!.monsters.find(monster => monster.definitionId === 'sproutling' && monster.hp > 0)!;
    await admin(playerA.characterId, 'teleport', { x: live.x, z: live.z - 2 });
    await a.locator(`[data-entity-id="${live.id}"]`).click();
    await expect.poll(() => state!.monsters.find(monster => monster.id === live.id)?.hp).toBe(0);
  }
  expect(collectedCrowns).toBeTruthy(); expect(equippedDrop).toBeTruthy();
  await a.screenshot({ path: 'test-results/multiplayer-final.png' });
  const savedXp = await a.locator('#xp-label').textContent(), savedCrowns = await a.locator('#crowns').textContent();
  await a.getByRole('button', { name: 'Personajes', exact: true }).click(); await expect(a.locator('[data-character]')).toBeVisible(); await a.locator(`[data-character="${playerA.characterId}"]`).click(); await expect(a.locator('#xp-label')).toHaveText(savedXp!); await expect(a.locator('#crowns')).toHaveText(savedCrowns!);
  await contextA.close(); await contextB.close();
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
