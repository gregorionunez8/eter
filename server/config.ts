import { z } from 'zod';
import { balance, monsters, spots, items } from '../shared/content';
import type { Store } from './database';

const numeric = z.number().finite();
const configurationSchema = z.object({
  balance: z.object({
    crownsDropChance: numeric.min(0).max(1), etherDropChance: numeric.min(0).max(1),
    dayNightCycleDuration: numeric.min(10000).max(86400000),
    equippedItemDropChanceOnDeath: numeric.min(0).max(1),
    resetBonusPoints: numeric.int().min(0).max(10000),
    experienceBase: numeric.min(1).max(100000), experienceExponent: numeric.min(1).max(4),
  }).strict(),
  monsters: z.array(z.object({ id: z.string(), hp: numeric.int().min(1).max(1000000), damage: numeric.min(0).max(100000), xp: numeric.int().min(0).max(1000000), defense: numeric.min(0).max(100000), speed: numeric.min(0.1).max(15), aggroRange: numeric.min(0).max(40), leashRange: numeric.min(1).max(70), attackMs: numeric.min(250).max(20000) }).strict()).max(50),
  spots: z.array(z.object({ id: z.string(), monsterId: z.string(), x: numeric.min(-75).max(75), z: numeric.min(-75).max(75), radius: numeric.min(0).max(15), count: numeric.int().min(1).max(20), respawnMs: numeric.int().min(2000).max(300000) }).strict()).max(50),
  items: z.array(z.object({ id: z.string(), price: numeric.int().min(0).max(1000000) }).strict()).max(100),
}).strict();
export type EditableConfig = z.infer<typeof configurationSchema>;
export function getConfig(): EditableConfig {
  return {
    balance: { crownsDropChance: balance.crownsDropChance, etherDropChance: balance.etherDropChance, dayNightCycleDuration: balance.dayNightCycleDuration, equippedItemDropChanceOnDeath: balance.equippedItemDropChanceOnDeath, resetBonusPoints: balance.resetBonusPoints, experienceBase: balance.experienceBase, experienceExponent: balance.experienceExponent },
    monsters: monsters.map(({ id, hp, damage, xp, defense, speed, aggroRange, leashRange, attackMs }) => ({ id, hp, damage, xp, defense, speed, aggroRange, leashRange, attackMs })),
    spots: spots.map(s => ({ ...s })), items: items.map(({ id, price }) => ({ id, price })),
  };
}
export function validateConfig(input: unknown): EditableConfig {
  const config = configurationSchema.parse(input);
  for (const entry of config.monsters) if (!monsters.some(m => m.id === entry.id)) throw new Error(`Monstruo desconocido: ${entry.id}`);
  for (const entry of config.items) if (!items.some(m => m.id === entry.id)) throw new Error(`Item desconocido: ${entry.id}`);
  for (const spot of config.spots) {
    if (!spots.some(s => s.id === spot.id) || !monsters.some(m => m.id === spot.monsterId)) throw new Error('Spot o monsterId desconocido.');
    if (Math.abs(spot.x) <= 23 + spot.radius && Math.abs(spot.z) <= 23 + spot.radius) throw new Error('No se permiten spots sobre la ciudad segura.');
  }
  for (const collection of [config.monsters, config.items, config.spots]) if (new Set(collection.map(v => v.id)).size !== collection.length) throw new Error('IDs duplicados.');
  return config;
}
export function applyConfig(config: EditableConfig): void {
  Object.assign(balance, config.balance);
  for (const entry of config.monsters) Object.assign(monsters.find(m => m.id === entry.id)!, entry);
  for (const entry of config.spots) Object.assign(spots.find(m => m.id === entry.id)!, entry);
  for (const entry of config.items) Object.assign(items.find(m => m.id === entry.id)!, entry);
}
export function loadConfig(store: Store): void { const config = store.getSetting<unknown>('content'); if (config) applyConfig(validateConfig(config)); }
