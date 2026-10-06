import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/database';
import { Game } from '../server/game';
import { canEquip, effectiveValue, fits } from '../server/inventory';
import { actionSchema } from '../shared/protocol';
import { balance, classes, formulas, items, npcs, skills, spots } from '../shared/content';
import { world } from '../shared/world';
import { validateConfig, getConfig } from '../server/config';
import type { ClassId } from '../shared/content';

function setup(random = () => 0.5) {
  const store = new Store(':memory:');
  const a = store.register('player_a', 'a-secure-password'), b = store.register('player_b', 'b-secure-password');
  const ca = store.createCharacter(a.id, 'Player A', 'VANGUARD'), cb = store.createCharacter(b.id, 'Player B', 'ARCANIST');
  let now = 100000;
  const game = new Game(store, random, () => now);
  const notices: unknown[] = [];
  const pa = game.connect(ca, e => notices.push(e)), pb = game.connect(cb, e => notices.push(e));
  return { store, game, a, b, ca, cb, pa, pb, notices, advance: (ms: number) => { now += ms; game.tick(ms / 1000); } };
}
test('authentication, session expiration/revocation, classes and account isolation', () => {
  const { store, a, b, ca } = setup();
  assert.equal(store.login('PLAYER_A', 'a-secure-password').id, a.id);
  assert.throws(() => store.login('player_a', 'wrong-password'));
  assert.throws(() => store.register('player_a', 'new-secure-password'));
  assert.throws(() => store.register('bad', 'short'));
  const token = store.session(a); assert.equal(store.accountForSession(token)?.id, a.id);
  store.logout(token); assert.equal(store.accountForSession(token), undefined);
  assert.equal(store.character(ca.id, b.id), undefined);
  for (const [i, classId] of (['VANGUARD', 'ARCANIST', 'RANGER'] as ClassId[]).entries()) {
    const c = store.createCharacter(a.id, `Hero ${i}`, classId);
    assert.equal(c.classId, classId); assert.deepEqual(c.stats, classes[classId].stats); assert.equal(c.unlockedSkills.length, 4);
  }
  const rows = store.db.prepare('SELECT hash,salt FROM accounts').all();
  assert.ok(rows.every(row => row.hash !== 'a-secure-password' && String(row.hash).length === 128 && String(row.salt).length === 32));
  store.close();
});
test('untrusted rewards, invalid coordinates and unknown fields are rejected by the protocol', () => {
  for (const packet of [{ type: 'damage', amount: 99999 }, { type: 'move', x: 0, z: 0, crowns: 999999 }, { type: 'stat', stat: 'strength', amount: -5 }, { type: 'move', x: Infinity, z: 2 }, { type: 'equip', itemId: 'a', slot: 'other' }]) assert.equal(actionSchema.safeParse(packet).success, false);
});
test('stop freezes authoritative movement and cancels pending automatic combat approach', () => {
  const { game, ca, pa, advance, store } = setup(() => 0);
  game.action(ca.id, { type: 'move', x: 0, z: 20 }); advance(500);
  game.action(ca.id, { type: 'stop' }); const stopped = { x: ca.x, z: ca.z }; advance(2000);
  assert.deepEqual({ x: ca.x, z: ca.z }, stopped); assert.equal(pa.animation, 'idle');
  assert.equal(actionSchema.safeParse({ type: 'stop', x: 79, z: 79 }).success, false);
  Object.assign(ca, { x: 8, z: 30 });
  const target = [...game.creatures.values()].find(m => m.definitionId === 'sproutling')!;
  Object.assign(target, { x: 8, z: 38, home: { x: 8, z: 38 } });
  game.action(ca.id, { type: 'skill', skillId: 'heavy-slash', targetId: target.id }); advance(100);
  game.action(ca.id, { type: 'stop' }); const approach = { x: ca.x, z: ca.z }; advance(3000);
  assert.deepEqual({ x: ca.x, z: ca.z }, approach); assert.equal(pa.targetId, undefined); assert.equal(pa.pendingSkill, undefined); assert.equal(target.hp, 45);
  store.close();
});
test('normal combat approaches, kills shared monster, grants XP and produces physical loot', () => {
  const { game, ca, cb, pa, advance, store } = setup(() => 0);
  Object.assign(ca, { x: 8, z: 30 }); Object.assign(cb, { x: 10, z: 30 });
  const monster = [...game.creatures.values()].find(m => m.definitionId === 'sproutling')!;
  Object.assign(monster, { x: 8, z: 35, home: { x: 8, z: 35 } });
  game.action(ca.id, { type: 'attack', targetId: monster.id });
  for (let i = 0; i < 100 && monster.hp > 0; i++) advance(100);
  assert.equal(monster.hp, 0); assert.ok(ca.xp > 0); assert.equal(cb.xp, 0);
  assert.ok(game.loot.size >= 3); assert.equal(ca.crowns, 50); assert.equal(ca.ether, 0);
  for (const drop of game.loot.values()) {
    assert.notEqual(drop.id, monster.id, 'Loot must have its own ID, even when its point is a monster');
    assert.equal('definitionId' in drop, false, 'Monster runtime data must not leak into loot');
    assert.equal('path' in drop, false);
  }
  const repeated = game.addLoot(pa, monster, 'crowns', 1);
  assert.equal(game.loot.size, 4, 'Multiple kills at the same spot must not overwrite an earlier drop');
  assert.notEqual(repeated.id, monster.id);
  assert.equal(game.players.get(ca.id)?.targetId, monster.id);
  const stateA = game.snapshot(pa) as { monsters: unknown[]; loot: unknown[] };
  const stateB = game.snapshot(game.players.get(cb.id)!) as { monsters: unknown[]; loot: unknown[] };
  assert.deepEqual(stateA.monsters, stateB.monsters); assert.deepEqual(stateA.loot, stateB.loot);
  advance(spots.find(s => s.id === monster.spotId)!.respawnMs + 1); assert.ok(monster.hp > 0);
  store.close();
});
test('loot ownership remains exclusive for exactly 30s, then pickup is public and atomic', () => {
  const { game, ca, cb, pa, advance, store } = setup();
  Object.assign(ca, { x: 8, z: 32 }); Object.assign(cb, { x: 8, z: 32 });
  const loot = game.addLoot(pa, ca, 'crowns', 25);
  game.action(cb.id, { type: 'pickup', lootId: loot.id }); assert.equal(cb.crowns, 50); assert.ok(game.loot.has(loot.id));
  advance(29999); game.action(cb.id, { type: 'pickup', lootId: loot.id }); assert.equal(cb.crowns, 50);
  advance(1); game.action(cb.id, { type: 'pickup', lootId: loot.id }); assert.equal(cb.crowns, 75); assert.equal(game.loot.has(loot.id), false);
  game.action(ca.id, { type: 'pickup', lootId: loot.id }); assert.equal(ca.crowns, 50);
  const ether = game.addLoot(pa, ca, 'ether', 1); game.action(ca.id, { type: 'pickup', lootId: ether.id }); assert.equal(ca.ether, 1);
  assert.equal(store.character(ca.id, ca.accountId)?.ether, 1);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM resource_ledger').get()!.count, 2);
  store.close();
});
test('levels award five points and stats are server validated; cap 500 holds', () => {
  const { game, ca, pa, store } = setup();
  game.grantXp(pa, formulas.experienceForLevel(1)); assert.equal(ca.level, 2); assert.equal(ca.freePoints, 5);
  game.action(ca.id, { type: 'stat', stat: 'vitality', amount: 6 }); assert.equal(ca.stats.vitality, 16);
  game.action(ca.id, { type: 'stat', stat: 'vitality', amount: 5 }); assert.equal(ca.stats.vitality, 21); assert.equal(ca.freePoints, 0);
  ca.level = 499; ca.xp = 0; game.grantXp(pa, formulas.experienceForLevel(499) * 10);
  assert.equal(ca.level, 500); assert.equal(ca.xp, 0); store.close();
});
test('different sized inventory objects collide, hybrid stats work and affinity adds real value', () => {
  const { game, ca, cb, store } = setup();
  const sword = game.newItem('iron-sword'); sword.x = 4; sword.y = 0;
  assert.equal(fits(ca.inventory, sword, 0, 0), false); assert.equal(fits(ca.inventory, sword, 4, 0), true);
  assert.equal(fits(ca.inventory, sword, 7, 7), false);
  assert.equal(canEquip(cb, sword, 'weapon'), false);
  cb.stats.strength = 18; assert.equal(canEquip(cb, sword, 'weapon'), true);
  assert.ok(effectiveValue(ca, sword, 'damage') > effectiveValue(cb, sword, 'damage'));
  cb.inventory.push(sword); game.action(cb.id, { type: 'equip', itemId: sword.id, slot: 'weapon' });
  assert.equal(cb.equipment.weapon?.id, sword.id);
  game.action(cb.id, { type: 'unequip', slot: 'weapon' }); assert.equal(cb.equipment.weapon, undefined);
  assert.ok(cb.inventory.some(i => i.id === sword.id));
  sword.durability = 0; assert.equal(effectiveValue(cb, sword, 'damage'), 0); store.close();
});
test('NPC buying, selling, repairs, potions and Sanctum persist and require proximity', () => {
  const { game, ca, store, advance } = setup();
  game.action(ca.id, { type: 'buy', npcId: 'lyra', itemId: 'hp-potion' }); assert.equal(ca.crowns, 50);
  Object.assign(ca, { x: 12, z: 7 }); game.action(ca.id, { type: 'buy', npcId: 'lyra', itemId: 'hp-potion' }); assert.equal(ca.crowns, 35);
  ca.hp = 10; game.action(ca.id, { type: 'potion', kind: 'hp' }); assert.equal(ca.hp, 110);
  game.action(ca.id, { type: 'potion', kind: 'hp' }); assert.equal(ca.hp, 110); advance(1001);
  const weapon = ca.equipment.weapon!; weapon.durability = 90; Object.assign(ca, { x: -12, z: 6 });
  game.action(ca.id, { type: 'repair' }); assert.equal(weapon.durability, 100); assert.equal(ca.crowns, 25);
  Object.assign(ca, { x: -12, z: -5 }); const item = ca.inventory[0];
  game.action(ca.id, { type: 'store', itemId: item.id, direction: 'deposit' }); assert.equal(ca.sanctum.length, 1);
  assert.equal(store.character(ca.id, ca.accountId)?.sanctum[0].id, item.id);
  game.action(ca.id, { type: 'store', itemId: item.id, direction: 'withdraw' }); assert.equal(ca.sanctum.length, 0); assert.ok(ca.inventory.some(i => i.id === item.id));
  Object.assign(ca, { x: 12, z: 7 }); game.action(ca.id, { type: 'sell', npcId: 'lyra', itemId: item.id }); assert.equal(ca.crowns, 29); store.close();
});
test('every class has four usable skills with validated mana and cooldown', () => {
  const { game, ca, pa, store, advance } = setup(() => 0.5);
  for (const classId of ['VANGUARD', 'ARCANIST', 'RANGER'] as ClassId[]) {
    ca.classId = classId; ca.stats = { ...classes[classId].stats, energy: 100 }; ca.unlockedSkills = skills.filter(s => s.classId === classId).map(s => s.id);
    for (const skill of skills.filter(s => s.classId === classId)) {
      Object.assign(ca, { x: 0, z: 30, mana: 600, hp: 50 });
      const monster = [...game.creatures.values()][0]; Object.assign(monster, { x: 0, z: 32, hp: 10000 });
      const beforeMana = ca.mana;
      game.action(ca.id, { type: 'skill', skillId: skill.id, targetId: monster.id, point: { x: 0, z: 36 } });
      game.tick(0); assert.equal(ca.mana, beforeMana - skill.mana, skill.id); assert.ok(pa.cooldowns[skill.id] > game.now);
      const mana = ca.mana; game.action(ca.id, { type: 'skill', skillId: skill.id, targetId: monster.id }); assert.equal(ca.mana, mana);
      advance(skill.cooldownMs + 1);
    }
  }
  store.close();
});
test('aggro attacks outside safe zone; safe city prevents attacks; death conserves resources', () => {
  const { game, ca, pa, store, advance } = setup(() => 0.5);
  const beetle = [...game.creatures.values()].find(m => m.definitionId === 'wild-beetle')!;
  Object.assign(ca, { x: 20, z: 58 }); Object.assign(beetle, { x: 20, z: 59, home: { x: 20, z: 59 } });
  const hp = ca.hp; advance(100); assert.equal(beetle.targetId, ca.id); assert.ok(ca.hp < hp);
  ca.xp = 12; ca.crowns = 99; ca.ether = 3; ca.hp = 1; advance(2000);
  assert.deepEqual({ x: ca.x, z: ca.z }, world.spawn); assert.equal(ca.xp, 12); assert.equal(ca.crowns, 99); assert.equal(ca.ether, 3);
  const safeHp = ca.hp; advance(2000); assert.equal(ca.hp, safeHp);
  Object.assign(beetle, { x: 0, z: 11 }); game.action(ca.id, { type: 'attack', targetId: beetle.id }); assert.equal(pa.targetId, undefined); store.close();
});
test('death can drop at most one equipped item, special items can be excluded', () => {
  const { game, ca, pa, store } = setup(() => 0);
  ca.equipment.chest = game.newItem('linen-armor'); ca.equipment.chest.deathDropProtected = true;
  game.die(pa); assert.equal(Object.keys(ca.equipment).length, 1); assert.ok(ca.equipment.chest);
  assert.equal([...game.loot.values()].filter(d => d.kind === 'item').length, 1); store.close();
});
test('multiple resets restore base stats and preserve equipment, bags, storage and currencies', () => {
  const { game, ca, store } = setup();
  assert.throws(() => game.reset(ca));
  ca.sanctum.push(game.newItem('steel-armor')); ca.crowns = 555; ca.ether = 4;
  const saved = JSON.stringify([ca.inventory, ca.equipment, ca.sanctum, ca.crowns, ca.ether]);
  for (let resets = 1; resets <= 3; resets++) {
    ca.level = 500; ca.stats.strength = 500; game.reset(ca);
    assert.equal(ca.level, 1); assert.equal(ca.resets, resets); assert.deepEqual(ca.stats, classes.VANGUARD.stats);
    assert.equal(ca.freePoints, resets * balance.resetBonusPoints);
    assert.equal(JSON.stringify([ca.inventory, ca.equipment, ca.sanctum, ca.crowns, ca.ether]), saved);
  }
  store.close();
});
test('SQLite survives closing and reopening with independent persistent characters', () => {
  const folder = mkdtempSync(join(tmpdir(), 'eter-test-')), path = join(folder, 'test.sqlite');
  let store = new Store(path); const account = store.register('persisted', 'persisted-password'); const character = store.createCharacter(account.id, 'Persisted Hero', 'RANGER');
  character.level = 7; character.ether = 3; character.crowns = 888; character.equipment.weapon!.durability = 42; store.save(character); store.close();
  store = new Store(path); assert.equal(store.login('persisted', 'persisted-password').id, account.id); assert.deepEqual(store.character(character.id, account.id), character); store.close();
  rmSync(folder, { recursive: true });
});
test('admin configuration validates values and rejects dangerous city spots', () => {
  assert.deepEqual(validateConfig(getConfig()), getConfig());
  const invalid = getConfig(); invalid.balance.etherDropChance = 8; assert.throws(() => validateConfig(invalid));
  const badSpot = getConfig(); badSpot.spots[0].x = 0; badSpot.spots[0].z = 0; assert.throws(() => validateConfig(badSpot));
});
