import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSegment, findPath, inSafeZone, walkable, obstacles } from '../shared/world';
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

test('every obstacle blocks destinations and representative routes avoid each geometry type', () => {
  for (const obstacle of obstacles) assert.equal(walkable(obstacle), false, obstacle.id);
  for (const id of ['crystal', 'house-0', 'fountain-west', 'npc-brom', 'ruin-pillar-1', 'ruin-wall-2']) {
    const o = obstacles.find(o => o.id === id)!;
    const { start, end } = [
      { start: { x: o.x - o.width / 2 - 1.5, z: o.z }, end: { x: o.x + o.width / 2 + 1.5, z: o.z } },
      { start: { x: o.x, z: o.z - o.depth / 2 - 1.5 }, end: { x: o.x, z: o.z + o.depth / 2 + 1.5 } },
    ].find(r => findPath(r.start, r.end).length > 1)!;
    const path = findPath(start, end); assert.ok(path.length > 1, id);
    assert.equal(clearSegment(start, end), false, id);
    let previous = start;
    for (const point of path) { assert.ok(clearSegment(previous, point), id); previous = point; }
  }
  for (const kind of ['tree', 'rock']) {
    const o = obstacles.find(o => o.kind === kind && findPath({ x: o.x - 3, z: o.z }, { x: o.x + 3, z: o.z }).length > 1)!;
    assert.ok(o, kind);
    const path = findPath({ x: o.x - 3, z: o.z }, { x: o.x + 3, z: o.z });
    let previous = { x: o.x - 3, z: o.z };
    for (const point of path) { assert.ok(clearSegment(previous, point), kind); previous = point; }
  }
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
