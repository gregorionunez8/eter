import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSegment, findPath, inSafeZone, walkable } from '../shared/world';
import { balance, classes, formulas, skills, spots, monsters } from '../shared/content';

test('Aurelia spawn is safe; dangerous regions are outside', () => {
  assert.ok(inSafeZone({ x: 0, z: 10 }));
  assert.ok(walkable({ x: 0, z: 10 }));
  for (const spot of spots) assert.ok(!inSafeZone(spot));
});
test('pathfinding goes around the central crystal without intersecting geometry', () => {
  const start = { x: -8, z: 0 }, destination = { x: 8, z: 0 };
  assert.equal(clearSegment(start, destination), false);
  const path = findPath(start, destination);
  assert.ok(path.length > 2);
  let previous = start;
  for (const point of path) { assert.ok(clearSegment(previous, point)); previous = point; }
  assert.deepEqual(path.at(-1), destination);
});
test('invalid destinations and obstructed destinations are rejected', () => {
  for (const target of [{ x: NaN, z: 1 }, { x: 1000, z: 0 }, { x: 0, z: 0 }]) assert.deepEqual(findPath({ x: 0, z: 10 }, target), []);
});
test('progression and all class skill sets are centrally configured', () => {
  assert.equal(balance.maxLevel, 500);
  assert.equal(balance.pointsPerLevel, 5);
  assert.equal(balance.lootExclusiveMs, 30000);
  assert.ok(balance.etherDropChance < balance.crownsDropChance / 10);
  for (let level = 1; level < 500; level++) assert.ok(formulas.experienceForLevel(level + 1) > formulas.experienceForLevel(level));
  for (const classId of Object.keys(classes)) assert.equal(skills.filter(s => s.classId === classId).length, 4);
  for (const spot of spots) assert.ok(monsters.some(m => m.id === spot.monsterId));
});
