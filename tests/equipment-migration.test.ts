import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/database';
import { Game } from '../server/game';
import { equipmentSlots } from '../shared/content';
import { actionSchema } from '../shared/protocol';

test('legacy armor migrates to chest with exact instance preservation and survives repeated reopen', () => {
  const folder = mkdtempSync(join(tmpdir(), 'eter-equipment-')), file = join(folder, 'test.sqlite');
  try {
    let store = new Store(file);
    const account = store.register('migration', 'migration-secure-password');
    const character = store.createCharacter(account.id, 'Migration Hero', 'VANGUARD');
    const item = new Game(store).newItem('linen-armor');
    item.durability = 31; item.modifiers = { luck: 2, additionalDamage: 4 }; item.metadata = { origin: 'goal-1' }; item.deathDropProtected = true;
    const saved = { ...character, equipment: { ...character.equipment, armor: item } };
    store.db.prepare('UPDATE characters SET data=? WHERE id=?').run(JSON.stringify(saved), character.id); store.close();
    for (let i = 0; i < 2; i++) {
      store = new Store(file); const loaded = store.character(character.id, account.id)!;
      assert.deepEqual(loaded.equipment.chest, item); assert.ok(!('armor' in loaded.equipment));
      assert.deepEqual(loaded.inventory, saved.inventory); assert.deepEqual(loaded.sanctum, saved.sanctum);
      assert.equal(store.getSetting('schema.equipment'), 2); store.close();
    }
    assert.equal(equipmentSlots.length, 11); assert.ok(equipmentSlots.includes('chest'));
    assert.equal(actionSchema.safeParse({ type: 'equip', itemId: item.id, slot: 'armor' }).success, false);
    assert.equal(actionSchema.safeParse({ type: 'equip', itemId: item.id, slot: 'chest' }).success, true);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('mixed imported save preserves both distinct chest items instead of overwriting one', () => {
  const store = new Store(':memory:');
  const account = store.register('mixed_save', 'migration-secure-password');
  const c = store.createCharacter(account.id, 'Mixed Hero', 'VANGUARD'), game = new Game(store);
  const chest = game.newItem('steel-armor'), legacy = game.newItem('linen-armor');
  store.db.prepare('UPDATE characters SET data=? WHERE id=?').run(JSON.stringify({ ...c, equipment: { chest, armor: legacy } }), c.id);
  // Invoke the same startup migration against a synthetic imported record.
  (store as unknown as { migrateEquipment(): void }).migrateEquipment();
  const loaded = store.character(c.id, account.id)!;
  assert.deepEqual(loaded.equipment.chest, chest);
  assert.equal(loaded.sanctum.length, 1); assert.equal(loaded.sanctum[0].id, legacy.id);
  assert.ok(!('armor' in loaded.equipment)); store.close();
});
