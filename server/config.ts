import { z } from 'zod';
import { balance, monsters, spots, items, skills, npcs, equipmentSlots } from '../shared/content';
import { obstacles, walkable, inSafeZone, world } from '../shared/world';
import type { Store } from './database';

const numeric = z.number().finite(), chance = numeric.min(0).max(1);
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), name = z.string().trim().min(1).max(60).refine(v => !/[<>]/.test(v), 'HTML no permitido.');
const coordinate = numeric.min(-75).max(75), classId = z.enum(['VANGUARD', 'ARCANIST', 'RANGER']);
const stats = z.object({ strength: numeric.int().min(0).max(100000).optional(), agility: numeric.int().min(0).max(100000).optional(), vitality: numeric.int().min(0).max(100000).optional(), energy: numeric.int().min(0).max(100000).optional() }).strict();
const properties = z.object({ additionalDamage: numeric.min(0).max(100000).optional(), damagePercent: numeric.min(0).max(2).optional(), attackSpeed: numeric.min(0).max(2).optional(), criticalChance: chance.optional(), lifeOnKill: numeric.min(0).max(100000).optional(), manaOnKill: numeric.min(0).max(100000).optional(), monsterDamagePercent: numeric.min(0).max(2).optional(), luck: numeric.min(0).max(100).optional(), classAffinityBonus: numeric.min(0).max(2).optional(), grantedSkill: id.optional() }).strict();
const configurationSchema = z.object({
  version: z.literal(2),
  balance: z.object({
    maxLevel: numeric.int().min(2).max(1000), pointsPerLevel: numeric.int().min(1).max(50),
    crownsDropChance: chance, etherDropChance: chance, itemDropChance: chance,
    dayNightCycleDuration: numeric.int().min(10000).max(86400000),
    equippedItemDropChanceOnDeath: chance, lootExclusiveMs: numeric.int().min(0).max(300000),
    resetBonusPoints: numeric.int().min(0).max(10000), experienceBase: numeric.min(1).max(100000), experienceExponent: numeric.min(1).max(4),
    moveSpeed: numeric.min(2).max(12), repairCostPerPoint: numeric.min(0).max(1000), npcPriceMultiplier: numeric.min(0.1).max(10), salePriceMultiplier: chance,
    crownsBaseAmount: numeric.int().min(0).max(100000), crownsPerMonsterLevel: numeric.int().min(0).max(10000), crownsRandomAmount: numeric.int().min(0).max(100000),
    potionHp: numeric.int().min(1).max(100000), potionMana: numeric.int().min(1).max(100000), potionCooldownMs: numeric.int().min(250).max(30000),
  }).strict(),
  monsters: z.array(z.object({
    id, name, level: numeric.int().min(1).max(1000), hp: numeric.int().min(1).max(1000000), damage: numeric.min(0).max(100000), xp: numeric.int().min(0).max(1000000), defense: numeric.min(0).max(100000),
    speed: numeric.min(0.1).max(15), aggroMode: z.enum(['passive', 'aggressive']), aggroRange: numeric.min(0).max(40), chaseDistance: numeric.min(1).max(70), leashRange: numeric.min(1).max(70), attackRange: numeric.min(0.8).max(15), attackMs: numeric.int().min(250).max(20000),
    drops: z.object({ crownsChance: chance.optional(), etherChance: chance.optional(), itemChance: chance.optional(), itemIds: z.array(id).max(100).optional() }).strict(),
  }).strict()).min(1).max(50),
  spots: z.array(z.object({ id, monsterId: id, region: z.enum(['Greenfields', 'Whisperwood', 'Stonepass', 'Ether Ruins']), enabled: z.boolean(), x: coordinate, z: coordinate, radius: numeric.min(0).max(15), count: numeric.int().min(1).max(20), respawnMs: numeric.int().min(2000).max(300000) }).strict()).max(50),
  items: z.array(z.object({ id, name, price: numeric.int().min(0).max(1000000), width: numeric.int().min(1).max(8), height: numeric.int().min(1).max(8),
    slot: z.enum(equipmentSlots as [typeof equipmentSlots[number], ...typeof equipmentSlots[number][]]).optional(), requirements: stats, affinity: classId.optional(),
    damage: numeric.min(0).max(100000).optional(), defense: numeric.min(0).max(100000).optional(), affinityBonus: numeric.min(0).max(2).optional(), durability: numeric.int().min(1).max(10000).optional(),
    quality: z.enum(['common', 'uncommon', 'rare']), setId: id.optional(), dropEligible: z.boolean(), properties: properties.optional(),
  }).strict()).min(1).max(100),
  skills: z.array(z.object({ id, name, classId, mana: numeric.int().min(0).max(10000), cooldownMs: numeric.int().min(250).max(300000), range: numeric.min(0).max(40), multiplier: numeric.min(0).max(20), durationMs: numeric.int().min(0).max(300000).optional(), slowMs: numeric.int().min(0).max(30000).optional() }).strict()).length(12),
  npcs: z.array(z.object({ id, name, role: name, x: coordinate, z: coordinate, dialogue: z.string().max(500).refine(v => !/[<>]/.test(v), 'HTML no permitido.'), shop: z.array(id).max(100) }).strict()).max(30),
  world: z.object({ spawn: z.object({ x: coordinate, z: coordinate }).strict() }).strict(),
}).strict();
export type EditableConfig = z.infer<typeof configurationSchema>;
type ItemLayout = { id: string; width: number; height: number; slot?: string };
function validateOwnedLayouts(config: EditableConfig, store: Store, previous: ItemLayout[]): void {
  const changed = new Set(config.items.filter(entry => { const old = previous.find(i => i.id === entry.id); return old && (entry.width !== old.width || entry.height !== old.height || entry.slot !== old.slot); }).map(i => i.id));
  if (changed.size) for (const row of store.db.prepare('SELECT data FROM characters').all()) {
    const c = JSON.parse(String(row.data)) as import('../shared/model').Character;
    if ([...c.inventory, ...c.sanctum, ...Object.values(c.equipment)].some(i => changed.has(i.definitionId))) throw new Error('No se puede cambiar tamaño/slot de un item ya poseído; preservá la compatibilidad de inventarios.');
  }
}
const editableBalance = ['maxLevel', 'pointsPerLevel', 'crownsDropChance', 'etherDropChance', 'itemDropChance', 'dayNightCycleDuration', 'equippedItemDropChanceOnDeath', 'lootExclusiveMs', 'resetBonusPoints', 'experienceBase', 'experienceExponent', 'moveSpeed', 'repairCostPerPoint', 'npcPriceMultiplier', 'salePriceMultiplier', 'crownsBaseAmount', 'crownsPerMonsterLevel', 'crownsRandomAmount', 'potionHp', 'potionMana', 'potionCooldownMs'] as const;
const region = (s: { x: number; z: number }): EditableConfig['spots'][number]['region'] => s.z < -23 ? 'Ether Ruins' : s.x < -23 ? 'Whisperwood' : s.x > 35 ? 'Stonepass' : 'Greenfields';
export function getConfig(): EditableConfig {
  return {
    version: 2, balance: Object.fromEntries(editableBalance.map(key => [key, balance[key]])) as EditableConfig['balance'],
    monsters: monsters.map(({ id, name, level, hp, damage, xp, defense, speed, aggroRange, leashRange, attackMs, aggroMode, chaseDistance, attackRange, drops }) => ({ id, name, level, hp, damage, xp, defense, speed, aggroRange, leashRange, attackMs, aggroMode: aggroMode ?? (aggroRange > 0 ? 'aggressive' : 'passive'), chaseDistance: chaseDistance ?? leashRange, attackRange: attackRange ?? 1.9, drops: drops ?? {} })),
    spots: spots.map(s => ({ ...s, enabled: s.enabled ?? true, region: s.region ?? region(s) })),
    items: items.map(({ id, name, price, width, height, slot, requirements, affinity, damage, defense, affinityBonus, durability, quality, setId, dropEligible, properties }) => ({ id, name, price, width, height, slot, requirements: requirements ?? {}, affinity, damage, defense, affinityBonus, durability, quality: quality ?? 'common', setId, dropEligible: dropEligible ?? true, properties: properties ?? {} })),
    skills: skills.map(({ id, name, classId, mana, cooldownMs, range, multiplier, durationMs, slowMs }) => ({ id, name, classId, mana, cooldownMs, range, multiplier, durationMs, slowMs })),
    npcs: npcs.map(n => ({ ...n, shop: [...n.shop] })), world: { spawn: { ...world.spawn } },
  };
}
export function validateConfig(input: unknown, store?: Store): EditableConfig {
  const config = configurationSchema.parse(input);
  for (const [collection, originals] of [[config.monsters, monsters], [config.items, items], [config.skills, skills], [config.npcs, npcs]] as [{ id: string }[], { id: string }[]][]) {
    if (collection.length !== originals.length || collection.some(v => !originals.some(o => o.id === v.id))) throw new Error('No se pueden eliminar ni reemplazar IDs de contenido persistente.');
  }
  for (const collection of [config.monsters, config.items, config.spots, config.skills, config.npcs]) if (new Set(collection.map(v => v.id)).size !== collection.length) throw new Error('IDs duplicados.');
  const proposedItems = new Map(config.items.map(i => [i.id, i]));
  const occupied = new Set<string>();
  for (const itemId of ['hp-potion', 'hp-potion', 'mana-potion', 'mana-potion']) {
    const item = proposedItems.get(itemId)!; let placed = false;
    for (let y = 0; y <= balance.inventoryHeight - item.height && !placed; y++) for (let x = 0; x <= balance.inventoryWidth - item.width && !placed; x++) {
      const cells: string[] = [];
      for (let dy = 0; dy < item.height; dy++) for (let dx = 0; dx < item.width; dx++) cells.push(`${x + dx},${y + dy}`);
      if (cells.every(cell => !occupied.has(cell))) { cells.forEach(cell => occupied.add(cell)); placed = true; }
    }
    if (!placed) throw new Error('Los consumibles iniciales deben caber en la mochila de un nuevo personaje.');
  }
  for (const classId of ['VANGUARD', 'ARCANIST', 'RANGER']) if (config.skills.filter(s => s.classId === classId).length !== 4) throw new Error('Cada clase debe conservar cuatro habilidades.');
  for (const skill of config.skills) {
    const original = skills.find(s => s.id === skill.id)!;
    if (original.durationMs && !skill.durationMs) throw new Error('Esta habilidad necesita una duración positiva.');
  }
  for (const m of config.monsters) if (m.drops.itemIds?.some(id => !proposedItems.has(id))) throw new Error('Drop table contiene un item desconocido.');
  for (const item of config.items) if (item.properties?.grantedSkill && !config.skills.some(s => s.id === item.properties!.grantedSkill)) throw new Error('La propiedad skill referencia una habilidad desconocida.');
  for (const n of config.npcs) {
    if (n.shop.some(id => !proposedItems.has(id))) throw new Error('Tienda contiene un item desconocido.');
    if (!inSafeZone(n) || obstacles.some(o => o.kind !== 'npc' && Math.abs(n.x - o.x) < o.width / 2 + world.playerRadius && Math.abs(n.z - o.z) < o.depth / 2 + world.playerRadius)) throw new Error('NPC debe estar en Aurelia y fuera de obstáculos.');
    if (config.npcs.some(other => other.id !== n.id && Math.hypot(other.x - n.x, other.z - n.z) < 1.5)) throw new Error('NPCs demasiado próximos.');
  }
  for (const spot of config.spots) {
    if (!config.monsters.some(m => m.id === spot.monsterId)) throw new Error('monsterId desconocido.');
    if (Math.abs(spot.x) <= world.safeHalfSize + spot.radius && Math.abs(spot.z) <= world.safeHalfSize + spot.radius) throw new Error('No se permiten spots sobre la ciudad segura.');
    if (Math.abs(spot.x) + spot.radius >= 79 || Math.abs(spot.z) + spot.radius >= 79 || !walkable(spot)) throw new Error('Spot fuera del mundo o sobre un obstáculo.');
  }
  if (!inSafeZone(config.world.spawn) || !walkable(config.world.spawn) || config.npcs.some(n => Math.hypot(n.x - config.world.spawn.x, n.z - config.world.spawn.z) < 1.5)) throw new Error('Spawn debe ser caminable dentro de Aurelia.');
  if (store) validateOwnedLayouts(config, store, items);
  return config;
}
export function applyConfig(config: EditableConfig): void {
  Object.assign(balance, config.balance); Object.assign(world.spawn, config.world.spawn);
  for (const [entries, collection] of [[config.monsters, monsters], [config.items, items], [config.skills, skills], [config.npcs, npcs]] as [{ id: string }[], { id: string }[]][]) for (const entry of entries) Object.assign(collection.find(m => m.id === entry.id)!, entry);
  spots.splice(0, spots.length, ...config.spots);
  for (const npc of npcs) Object.assign(obstacles.find(o => o.id === `npc-${npc.id}`)!, { x: npc.x, z: npc.z });
}
export function loadConfig(store: Store): void {
  const layout = (config: EditableConfig): ItemLayout[] => config.items.map(({ id, width, height, slot }) => ({ id, width, height, slot }));
  const stored = store.getSetting<unknown>('content');
  if (!stored) {
    const defaults = getConfig(); validateOwnedLayouts(defaults, store, store.getSetting<ItemLayout[]>('content.appliedLayouts') ?? items);
    store.setSetting('content.appliedLayouts', layout(defaults)); return;
  }
  const legacy = stored as Record<string, unknown>;
  if (legacy.version !== undefined && legacy.version !== 2) throw new Error('Versión de configuración desconocida.');
  const defaults = getConfig();
  // New code-defined content receives defaults without discarding existing owner overrides.
  for (const key of ['monsters', 'items', 'skills', 'npcs'] as const) {
    const entries = legacy[key]; if (entries === undefined && legacy.version === undefined) continue;
    if (!Array.isArray(entries)) throw new Error('Configuración persistida inválida.');
    for (const entry of entries) { const target = defaults[key].find(e => e.id === entry.id); if (!target) throw new Error('ID persistido desconocido.'); Object.assign(target, entry); }
  }
  if (!Array.isArray(legacy.spots)) throw new Error('Spots persistidos inválidos.');
  if (legacy.version === undefined) {
    for (const entry of legacy.spots) { const target = defaults.spots.find(s => s.id === entry.id); if (!target) throw new Error('ID legacy desconocido.'); Object.assign(target, entry); }
  } else defaults.spots = legacy.spots as EditableConfig['spots'];
  Object.assign(defaults.balance, legacy.balance);
  if (legacy.world) Object.assign(defaults.world.spawn, (legacy.world as EditableConfig['world']).spawn);
  const upgraded = validateConfig(defaults);
  // Compare against the last applied layout, so resized items survive reopening while
  // items acquired under old layouts after a pending save cannot be silently corrupted.
  validateOwnedLayouts(upgraded, store, store.getSetting<ItemLayout[]>('content.appliedLayouts') ?? items);
  applyConfig(upgraded); store.setSetting('content.appliedLayouts', layout(upgraded));
  if (JSON.stringify(upgraded) !== JSON.stringify(stored)) store.setSetting('content', upgraded);
}
