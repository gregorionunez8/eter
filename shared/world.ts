import { npcs, spots } from './content';
import type { Obstacle, Point } from './model';

export const world = { name: 'Aurelia', halfSize: 80, safeHalfSize: 23, cellSize: 1, playerRadius: 0.45, spawn: { x: 0, z: 10 } };
export const obstacles: Obstacle[] = [
  { id: 'crystal', x: 0, z: 0, width: 5, depth: 5, kind: 'crystal' },
  { id: 'fountain-west', x: -8, z: -5, width: 3.6, depth: 3.6, kind: 'wall' },
  { id: 'fountain-east', x: 8, z: -5, width: 3.6, depth: 3.6, kind: 'wall' },
  { id: 'ruin-pillar-1', x: -23, z: -49, width: 1.8, depth: 1.8, kind: 'wall' },
  { id: 'ruin-pillar-2', x: -23, z: -60, width: 1.8, depth: 1.8, kind: 'wall' },
  { id: 'ruin-pillar-3', x: 28, z: -62, width: 1.8, depth: 1.8, kind: 'wall' },
  { id: 'ruin-pillar-4', x: 28, z: -50, width: 1.8, depth: 1.8, kind: 'wall' },
  { id: 'ruin-wall-1', x: -23, z: -54, width: 1.8, depth: 5, kind: 'wall' },
  { id: 'ruin-wall-2', x: 28, z: -55, width: 1.8, depth: 5, kind: 'wall' },
  ...[
    [-16, 3, 5, 6], [16, 3, 5, 6], [-16, -7, 5, 6], [16, -7, 5, 6],
    [-17, 17, 7, 4], [17, 17, 7, 4], [-17, -20, 7, 4], [17, -20, 7, 4],
  ].map(([x, z, width, depth], i): Obstacle => ({ id: `house-${i}`, x, z, width, depth, kind: 'building' })),
  ...npcs.map((npc): Obstacle => ({ id: `npc-${npc.id}`, x: npc.x, z: npc.z, width: 0.7, depth: 0.7, kind: 'npc' })),
  ...[
    ['forge', -10, 5, 1.2, 1], ['alchemy', 10, 5, 1.2, 1],
    ['weapon-rack', -19.5, 11, 1.2, 0.6], ['arcane-desk', 19.5, 11, 1.2, 0.6], ['bow-rack', 19.5, -15, 1.2, 0.6],
    ['cart-west', -8, 18, 2.6, 1.5], ['cart-east', 8, 18, 2.6, 1.5],
    ['bench-west', -9, -17, 2.5, 0.8], ['bench-east', 9, -17, 2.5, 0.8],
    ['planter-west', -22, 9, 0.8, 3], ['planter-east', 22, 9, 0.8, 3],
    ['planter-northwest', -22, -11, 0.8, 3], ['planter-northeast', 22, -11, 0.8, 3],
    ['farm-fence-south', 17, 25, 5, 0.35], ['farm-fence-east', 21, 29, 0.35, 6],
  ].map(([id, x, z, width, depth]): Obstacle => ({ id: String(id), x: Number(x), z: Number(z), width: Number(width), depth: Number(depth), kind: 'prop' })),
];
// Deterministic scenery keeps client rendering and server collision identical.
for (let i = 0; i < 80; i++) {
  const x = ((i * 37 + 11) % 146) - 73;
  const z = ((i * 61 + 17) % 146) - 73;
  if (Math.abs(x) < 27 && Math.abs(z) < 27) continue;
  if (Math.abs(x) < 5 || Math.abs(z) < 5) continue;
  obstacles.push({ id: `scenery-${i}`, x, z, width: 1.8, depth: 1.8, kind: x > 30 ? 'rock' : 'tree' });
}
// Forest edges surround stable, open farming clearings rather than filling them.
for (let i = 0; i < 70; i++) {
  const x = -29 - ((i * 19.731) % 47), z = 7 + ((i * 31.913) % 65);
  if (spots.some(s => distance(s, { x, z }) < s.radius + 4) || obstacles.some(o => distance(o, { x, z }) < 3)) continue;
  obstacles.push({ id: `woodland-${i}`, x, z, width: 1.6, depth: 1.6, kind: 'tree' });
}
for (const [i, [x, z, width, depth]] of [[74, 6, 5, 8], [74, -9, 5, 9], [73, 26, 6, 7], [37, 25, 5, 7], [39, -26, 6, 5]].entries()) {
  obstacles.push({ id: `ridge-${i}`, x, z, width, depth, kind: 'rock' });
}
export function inSafeZone(point: Point): boolean {
  return Math.abs(point.x) <= world.safeHalfSize && Math.abs(point.z) <= world.safeHalfSize;
}
export function walkable(point: Point): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  if (Math.abs(point.x) >= world.halfSize - 1 || Math.abs(point.z) >= world.halfSize - 1) return false;
  return !obstacles.some(o => Math.abs(point.x - o.x) < o.width / 2 + world.playerRadius && Math.abs(point.z - o.z) < o.depth / 2 + world.playerRadius);
}
export function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.z - b.z); }
export function clearSegment(a: Point, b: Point): boolean {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!walkable({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
  }
  return true;
}
/** A* on a shared occupancy grid. Diagonal corner cutting is forbidden. */
export function findPath(from: Point, to: Point): Point[] {
  if (!walkable(from) || !walkable(to)) return [];
  if (clearSegment(from, to)) return [to];
  const start = { x: Math.round(from.x), z: Math.round(from.z) };
  const end = { x: Math.round(to.x), z: Math.round(to.z) };
  if (!walkable(start) || !walkable(end) || !clearSegment(from, start) || !clearSegment(end, to)) return [];
  const key = (p: Point) => `${p.x},${p.z}`;
  const open = new Map<string, { p: Point; g: number; f: number }>();
  const parents = new Map<string, Point>();
  const scores = new Map<string, number>([[key(start), 0]]);
  const closed = new Set<string>();
  open.set(key(start), { p: start, g: 0, f: distance(start, end) });
  let iterations = 0;
  while (open.size && iterations++ < 16000) {
    let best = open.values().next().value!;
    for (const value of open.values()) if (value.f < best.f) best = value;
    const currentKey = key(best.p);
    open.delete(currentKey);
    if (currentKey === key(end)) {
      const path: Point[] = [to, end];
      let current = best.p;
      while (parents.has(key(current))) { current = parents.get(key(current))!; path.push(current); }
      return path.reverse();
    }
    closed.add(currentKey);
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      if (!dx && !dz) continue;
      const next = { x: best.p.x + dx, z: best.p.z + dz };
      const nextKey = key(next);
      if (closed.has(nextKey) || !clearSegment(best.p, next)) continue;
      const g = best.g + Math.hypot(dx, dz);
      if (g >= (scores.get(nextKey) ?? Infinity)) continue;
      parents.set(nextKey, best.p); scores.set(nextKey, g);
      open.set(nextKey, { p: next, g, f: g + distance(next, end) });
    }
  }
  return [];
}
