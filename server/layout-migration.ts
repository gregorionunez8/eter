import type { EditableConfig } from './config';

// Only untouched Goal #2 entries follow the new layout. Owner-authored positions,
// density, timers and deleted spots remain authoritative.
const oldNpcPositions: Record<string, [number, number]> = {
  brom: [-12, 4], lyra: [12, 5], orin: [-12, -7], kael: [12, -8], seraph: [0, -13],
  ronan: [-17, 12], elyra: [17, 12], sylwen: [17, -15], 'reset-master': [-17, -15],
};
const oldSpots: Record<string, [number, number, number, number, number]> = {
  'green-1': [8, 38, 6, 5, 12000], 'green-2': [-12, 48, 6, 4, 12000], 'green-3': [20, 58, 7, 5, 14000],
  'wood-1': [-42, 16, 7, 4, 16000], 'wood-2': [-58, 34, 7, 5, 18000],
  'pass-1': [45, -8, 6, 4, 18000], 'pass-2': [60, 12, 7, 5, 20000],
  'ruins-1': [-12, -46, 7, 5, 22000], 'ruins-2': [15, -62, 7, 3, 25000],
};
export function migrateClassicLayout(config: EditableConfig, defaults: EditableConfig): void {
  const originalPositions = config.npcs.map(npc => ({ id: npc.id, x: npc.x, z: npc.z }));
  for (const npc of config.npcs) {
    const previous = oldNpcPositions[npc.id], next = defaults.npcs.find(n => n.id === npc.id);
    if (previous && next && npc.x === previous[0] && npc.z === previous[1]) { npc.x = next.x; npc.z = next.z; }
  }
  // An owner may already use the new market position for another NPC. Preserve
  // that valid layout instead of moving a default NPC onto their custom service.
  if (config.npcs.some(npc => config.npcs.some(other => other.id !== npc.id && Math.hypot(other.x - npc.x, other.z - npc.z) < 1.5))) {
    for (const npc of config.npcs) Object.assign(npc, originalPositions.find(original => original.id === npc.id)!);
  }
  for (const spot of config.spots) {
    const previous = oldSpots[spot.id], next = defaults.spots.find(s => s.id === spot.id);
    if (previous && next && spot.monsterId === next.monsterId && [spot.x, spot.z, spot.radius, spot.count, spot.respawnMs].every((value, i) => value === previous[i])) {
      Object.assign(spot, { x: next.x, z: next.z, radius: next.radius, count: next.count, respawnMs: next.respawnMs });
    }
  }
}
