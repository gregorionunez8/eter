import { balance, items, type Slot } from '../shared/content';
import type { Character, ItemInstance } from '../shared/model';

export function definition(item: ItemInstance) { const result = items.find(i => i.id === item.definitionId); if (!result) throw new Error('Objeto desconocido.'); return result; }
export function fits(collection: ItemInstance[], item: ItemInstance, x: number, y: number): boolean {
  const itemDef = definition(item);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + itemDef.width > balance.inventoryWidth || y + itemDef.height > balance.inventoryHeight) return false;
  return !collection.some(other => {
    if (other.id === item.id) return false;
    const otherDef = definition(other);
    return x < other.x + otherDef.width && x + itemDef.width > other.x && y < other.y + otherDef.height && y + itemDef.height > other.y;
  });
}
export function freeCell(collection: ItemInstance[], item: ItemInstance): { x: number; y: number } | undefined {
  for (let y = 0; y < balance.inventoryHeight; y++) for (let x = 0; x < balance.inventoryWidth; x++) if (fits(collection, item, x, y)) return { x, y };
}
export function canEquip(character: Character, item: ItemInstance, slot: Slot): boolean {
  const itemDef = definition(item);
  if (itemDef.slot !== slot && !(itemDef.slot === 'ring1' && slot === 'ring2')) return false;
  return Object.entries(itemDef.requirements ?? {}).every(([stat, required]) => character.stats[stat as keyof typeof character.stats] >= required!);
}
export function effectiveValue(character: Character, item: ItemInstance, field: 'damage' | 'defense'): number {
  const itemDef = definition(item);
  if (item.durability <= 0) return 0;
  const condition = item.durability < (itemDef.durability ?? 1) * balance.lowDurabilityThreshold ? 0.5 : 1;
  const affinity = itemDef.affinity === character.classId ? 1 + (itemDef.affinityBonus ?? 0) : 1;
  return (itemDef[field] ?? 0) * condition * affinity;
}
