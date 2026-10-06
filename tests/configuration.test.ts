import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getConfig, validateConfig, loadConfig, applyConfig } from '../server/config';
import { Store } from '../server/database';
import { Game } from '../server/game';
import { spots, skills } from '../shared/content';
import { world } from '../shared/world';

test('structured configuration validates full content and rejects invalid references and unsafe values', () => {
  assert.deepEqual(validateConfig(getConfig()), getConfig());
  const invalid = (mutate: (c: ReturnType<typeof getConfig>) => void) => { const c = getConfig(); mutate(c); assert.throws(() => validateConfig(c)); };
  invalid(c => { c.monsters[0].drops.itemIds = ['missing-item']; });
  invalid(c => { c.npcs[0].shop = ['missing-item']; });
  invalid(c => { c.spots[0].monsterId = 'missing-monster'; });
  invalid(c => { c.spots.push({ ...c.spots[0] }); });
  invalid(c => { c.npcs[0].x = 50; });
  invalid(c => { c.world.spawn = { x: 0, z: 0 }; });
  invalid(c => { c.items[0].width = 9; });
  invalid(c => { c.monsters[0].name = '<img onerror="alert(1)">'; });
  invalid(c => { c.skills.find(s => s.id === 'war-cry')!.durationMs = undefined; });
  invalid(c => { c.skills[0].classId = 'ARCANIST'; });
});

test('spot create, duplicate, disable and delete persist without reviving removed spots', () => {
  const original = getConfig(), store = new Store(':memory:');
  try {
    const c = getConfig(); c.spots.push({ ...c.spots[0], id: 'custom-farm', enabled: false });
    c.spots.push({ ...c.spots[0], id: 'custom-farm-2' }); c.spots.splice(1, 1);
    store.setSetting('content', validateConfig(c)); loadConfig(store);
    assert.equal(spots.length, c.spots.length); assert.ok(!spots.some(s => s.id === original.spots[1].id));
    const game = new Game(store); assert.ok(![...game.creatures.values()].some(m => m.spotId === 'custom-farm'));
    assert.equal([...game.creatures.values()].filter(m => m.spotId === 'custom-farm-2').length, c.spots[0].count);
    assert.deepEqual(getConfig().spots, c.spots);
  } finally { applyConfig(original); store.close(); }
});

test('legacy overrides load with new defaults while preserving old balance, spot and price changes', () => {
  const original = getConfig(), store = new Store(':memory:');
  try {
    store.setSetting('content', { balance: { ...original.balance, etherDropChance: 0.02 }, monsters: original.monsters.map(({ id, hp, damage, xp, defense, speed, aggroRange, leashRange, attackMs }) => ({ id, hp, damage, xp, defense, speed, aggroRange, leashRange, attackMs })), spots: original.spots.map(({ id, monsterId, x, z, radius, count, respawnMs }) => ({ id, monsterId, x, z, radius, count, respawnMs: respawnMs + 1000 })), items: original.items.map(({ id, price }) => ({ id, price: price + 3 })) });
    loadConfig(store); const loaded = getConfig();
    assert.equal(loaded.version, 2); assert.equal(loaded.balance.etherDropChance, 0.02);
    assert.equal(loaded.items[0].price, original.items[0].price + 3);
    assert.equal(loaded.spots[0].respawnMs, original.spots[0].respawnMs + 1000);
    assert.equal(loaded.skills.length, 12); assert.deepEqual(world.spawn, original.world.spawn);
  } finally { applyConfig(original); store.close(); }
});

test('editing owned item dimensions is rejected before persistence can corrupt bags', () => {
  const store = new Store(':memory:');
  try {
    const account = store.register('config_owner', 'config-owner-password');
    const c = store.createCharacter(account.id, 'Config Owner', 'VANGUARD');
    const edited = getConfig(); edited.items.find(i => i.id === 'hp-potion')!.width = 2;
    assert.throws(() => validateConfig(edited, store), /poseído/);
    assert.deepEqual(store.character(c.id, account.id), c);
  } finally { store.close(); }
});

test('existing version-two configs gain new item definitions without losing saved prices or resized items after restart', () => {
  const original = getConfig(), store = new Store(':memory:');
  try {
    const c = getConfig(); c.items = c.items.filter(i => i.id !== 'bronze-helmet'); c.items[0].price += 9;
    store.setSetting('content', c); loadConfig(store);
    assert.ok(getConfig().items.some(i => i.id === 'bronze-helmet'));
    assert.equal(getConfig().items[0].price, original.items[0].price + 9);
    assert.deepEqual(store.getSetting('content'), JSON.parse(JSON.stringify(getConfig())));
    const resized = getConfig(); resized.items.find(i => i.id === 'hp-potion')!.width = 2;
    store.setSetting('content', validateConfig(resized)); loadConfig(store);
    const account = store.register('resized_config', 'resized-config-password');
    const character = store.createCharacter(account.id, 'Resized Hero', 'VANGUARD');
    store.save(character); loadConfig(store);
    assert.equal(getConfig().items.find(i => i.id === 'hp-potion')!.width, 2);
    assert.deepEqual(character.inventory.map(i => i.x), [0, 2, 4, 5]);
    assert.deepEqual(store.character(character.id, account.id), character);
  } finally { applyConfig(original); store.close(); }
});

test('passive monsters retaliate but do not initiate aggro; attack range remains configurable', () => {
  const original = getConfig(), store = new Store(':memory:');
  try {
    const edited = getConfig(); edited.monsters[0].aggroMode = 'passive'; edited.monsters[0].aggroRange = 20;
    edited.monsters[0].attackRange = 3; applyConfig(validateConfig(edited));
    const account = store.register('passive_test', 'passive-test-password');
    const c = store.createCharacter(account.id, 'Passive Hero', 'VANGUARD');
    let now = 1000; const game = new Game(store, () => 0.5, () => now), p = game.connect(c, () => {});
    const monster = [...game.creatures.values()].find(m => m.definitionId === 'sproutling')!;
    c.x = monster.x; c.z = monster.z - 2.6; const hp = c.hp;
    now += 100; game.tick(0.1); assert.equal(monster.targetId, undefined); assert.equal(c.hp, hp);
    game.damage(p, monster, 0.1); now += 100; game.tick(0.1); assert.ok(c.hp < hp);
    assert.equal(skills.length, 12);
  } finally { applyConfig(original); store.close(); }
});

test('pending layout edits cannot corrupt items acquired before the restart applies them', () => {
  const original = getConfig(), store = new Store(':memory:');
  try {
    loadConfig(store);
    const resized = getConfig(); resized.items.find(i => i.id === 'hp-potion')!.width = 2;
    store.setSetting('content', validateConfig(resized, store));
    const account = store.register('pending_layout', 'pending-layout-password');
    const character = store.createCharacter(account.id, 'Pending Hero', 'VANGUARD');
    assert.throws(() => loadConfig(store), /poseído/);
    assert.equal(getConfig().items.find(i => i.id === 'hp-potion')!.width, 1);
    assert.deepEqual(store.character(character.id, account.id), character);
  } finally { applyConfig(original); store.close(); }
});

test('bounded future item properties are copied into new instances and survive persistence', () => {
  const original = getConfig(), store = new Store(':memory:');
  try {
    const c = getConfig(); c.items.find(i => i.id === 'copper-necklace')!.properties = { luck: 3, grantedSkill: 'ether-bolt' };
    applyConfig(validateConfig(c));
    const invalid = getConfig(); invalid.items[0].properties = { criticalChance: 2 }; assert.throws(() => validateConfig(invalid));
    invalid.items[0].properties = { grantedSkill: 'unknown-skill' }; assert.throws(() => validateConfig(invalid));
    const account = store.register('future_props', 'future-properties-password'), character = store.createCharacter(account.id, 'Future Hero', 'VANGUARD');
    const game = new Game(store), item = game.newItem('copper-necklace'); character.inventory.push({ ...item, x: 5, y: 0 }); store.save(character);
    assert.deepEqual(store.character(character.id, account.id)!.inventory.at(-1)!.modifiers, { luck: 3, grantedSkill: 'ether-bolt' });
    assert.equal(character.unlockedSkills.includes('ether-bolt'), false);
  } finally { applyConfig(original); store.close(); }
});
