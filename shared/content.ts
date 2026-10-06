/** Single source of truth for content, formulas and provisional balance. */
import type { ItemModifiers } from './model';
export type ClassId = 'VANGUARD' | 'ARCANIST' | 'RANGER';
export type Stat = 'strength' | 'agility' | 'vitality' | 'energy';
export type Stats = Record<Stat, number>;
export type Slot = 'helmet' | 'chest' | 'pants' | 'gloves' | 'boots' | 'weapon' | 'offhand' | 'wings' | 'necklace' | 'ring1' | 'ring2';
export const balance = {
  maxLevel: 500, pointsPerLevel: 5, resetBonusPoints: 300,
  lootExclusiveMs: 30_000, lootLifetimeMs: 180_000,
  tickMs: 50, snapshotMs: 100, saveMs: 5000,
  moveSpeed: 5, pickupRange: 2.5,
  experienceBase: 50, experienceExponent: 1.65,
  inventoryWidth: 8, inventoryHeight: 8,
  crownsDropChance: 0.9, etherDropChance: 0.035,
  equippedItemDropChanceOnDeath: 0.005,
  dayNightCycleDuration: 600_000,
  durabilityLossPerAttack: 0.04, durabilityLossPerHit: 0.03,
  lowDurabilityThreshold: 0.15, repairCostPerPoint: 1,
  potionHp: 100, potionMana: 100, potionCooldownMs: 1000,
  itemDropChance: 0.3, crownsBaseAmount: 5, crownsPerMonsterLevel: 3, crownsRandomAmount: 8,
  salePriceMultiplier: 0.3, npcPriceMultiplier: 1,
  combatManaRegenPerSecond: 2, safeManaRegenPerSecond: 8, safeHpRegenPerSecond: 10,
  monsterReturnHealingSeconds: 4,
};
export const itemDropTable = ['hp-potion', 'mana-potion', 'iron-sword', 'ether-staff', 'ash-bow', 'linen-armor', 'leather-boots'];
export const classes: Record<ClassId, { name: string; gender: 'male' | 'female'; color: number; stats: Stats; range: number; magic: boolean }> = {
  VANGUARD: { name: 'Vanguard', gender: 'male', color: 0xb77c3f, stats: { strength: 18, agility: 10, vitality: 16, energy: 6 }, range: 2.4, magic: false },
  ARCANIST: { name: 'Arcanist', gender: 'male', color: 0x668bcc, stats: { strength: 6, agility: 10, vitality: 10, energy: 24 }, range: 11, magic: true },
  RANGER: { name: 'Ranger', gender: 'female', color: 0x548e66, stats: { strength: 10, agility: 20, vitality: 12, energy: 8 }, range: 12, magic: false },
};
export const formulas = {
  experienceForLevel: (level: number) => Math.floor(balance.experienceBase * level ** balance.experienceExponent),
  maxHp: (stats: Stats) => 60 + stats.vitality * 8,
  maxMana: (stats: Stats) => 20 + stats.energy * 6,
  physicalDamage: (stats: Stats) => 6 + stats.strength * 1.5 + stats.agility * 0.3,
  magicDamage: (stats: Stats) => 6 + stats.energy * 1.8,
  defense: (stats: Stats) => stats.vitality * 0.25 + stats.agility * 0.3,
  attackCooldownMs: (stats: Stats) => Math.max(250, 1100 / (1 + stats.agility / 100)),
  accuracy: (stats: Stats, enemyLevel: number) => Math.min(0.98, Math.max(0.65, 0.85 + stats.agility * 0.002 - enemyLevel * 0.003)),
};
export type SkillKind = 'single' | 'area' | 'charge' | 'buff' | 'blink' | 'cone' | 'mobility' | 'heal';
export interface SkillDefinition { id: string; name: string; classId: ClassId; kind: SkillKind; mana: number; cooldownMs: number; range: number; multiplier: number; durationMs?: number; slowMs?: number }
export const skills: SkillDefinition[] = [
  { id: 'heavy-slash', name: 'Heavy Slash', classId: 'VANGUARD', kind: 'single', mana: 8, cooldownMs: 2500, range: 2.8, multiplier: 2.2 },
  { id: 'whirlwind', name: 'Whirlwind', classId: 'VANGUARD', kind: 'area', mana: 15, cooldownMs: 6500, range: 4, multiplier: 1.6 },
  { id: 'charge', name: 'Charge', classId: 'VANGUARD', kind: 'charge', mana: 12, cooldownMs: 7000, range: 12, multiplier: 1.7 },
  { id: 'war-cry', name: 'War Cry', classId: 'VANGUARD', kind: 'buff', mana: 18, cooldownMs: 18000, range: 0, multiplier: 1.3, durationMs: 8000 },
  { id: 'ether-bolt', name: 'Ether Bolt', classId: 'ARCANIST', kind: 'single', mana: 8, cooldownMs: 1800, range: 13, multiplier: 1.8 },
  { id: 'frost-nova', name: 'Frost Nova', classId: 'ARCANIST', kind: 'area', mana: 18, cooldownMs: 7000, range: 5, multiplier: 1.4, slowMs: 3500 },
  { id: 'arc-surge', name: 'Arc Surge', classId: 'ARCANIST', kind: 'single', mana: 25, cooldownMs: 8000, range: 14, multiplier: 3 },
  { id: 'blink', name: 'Blink', classId: 'ARCANIST', kind: 'blink', mana: 14, cooldownMs: 6000, range: 7, multiplier: 0 },
  { id: 'piercing-arrow', name: 'Piercing Arrow', classId: 'RANGER', kind: 'single', mana: 8, cooldownMs: 2500, range: 15, multiplier: 2.2 },
  { id: 'multi-shot', name: 'Multi Shot', classId: 'RANGER', kind: 'cone', mana: 18, cooldownMs: 6500, range: 12, multiplier: 1.5 },
  { id: 'quickstep', name: 'Quickstep', classId: 'RANGER', kind: 'mobility', mana: 12, cooldownMs: 12000, range: 0, multiplier: 1.6, durationMs: 5000 },
  { id: 'natures-grace', name: "Nature's Grace", classId: 'RANGER', kind: 'heal', mana: 20, cooldownMs: 15000, range: 0, multiplier: 0.3, durationMs: 6000 },
];
export interface MonsterDefinition {
  id: string; name: string; level: number; hp: number; damage: number; defense: number; xp: number; speed: number; aggroRange: number; leashRange: number; attackMs: number; color: number;
  drops?: { crownsChance?: number; etherChance?: number; itemChance?: number; itemIds?: string[] };
  aggroMode?: 'passive' | 'aggressive'; attackRange?: number; chaseDistance?: number;
}
export const monsters: MonsterDefinition[] = [
  { id: 'sproutling', name: 'Sproutling', level: 1, hp: 45, damage: 5, defense: 0, xp: 25, speed: 2, aggroRange: 0, leashRange: 14, attackMs: 1600, color: 0x83ad57 },
  { id: 'wild-beetle', name: 'Wild Beetle', level: 3, hp: 85, damage: 9, defense: 2, xp: 45, speed: 2.2, aggroRange: 5, leashRange: 16, attackMs: 1500, color: 0xa89153 },
  { id: 'forest-wolf', name: 'Forest Wolf', level: 6, hp: 160, damage: 15, defense: 4, xp: 85, speed: 4, aggroRange: 8, leashRange: 20, attackMs: 1100, color: 0x8b929d },
  { id: 'thornling', name: 'Thornling', level: 10, hp: 240, damage: 22, defense: 6, xp: 150, speed: 2.5, aggroRange: 7, leashRange: 18, attackMs: 1500, color: 0x5c7f5d },
  { id: 'rogue', name: 'Rogue', level: 14, hp: 350, damage: 30, defense: 10, xp: 240, speed: 3.5, aggroRange: 9, leashRange: 22, attackMs: 1200, color: 0x956e5e },
  { id: 'stone-beetle', name: 'Stone Beetle', level: 18, hp: 500, damage: 38, defense: 16, xp: 350, speed: 2, aggroRange: 7, leashRange: 18, attackMs: 1800, color: 0x88918c },
  { id: 'orc-scout', name: 'Orc Scout', level: 24, hp: 750, damage: 52, defense: 20, xp: 600, speed: 3, aggroRange: 10, leashRange: 24, attackMs: 1400, color: 0x75816a },
  { id: 'stone-golem', name: 'Stone Golem', level: 32, hp: 1200, damage: 75, defense: 30, xp: 1000, speed: 1.8, aggroRange: 10, leashRange: 22, attackMs: 2200, color: 0x879ea5 },
];
export interface Spot { id: string; monsterId: string; x: number; z: number; radius: number; count: number; respawnMs: number; enabled?: boolean; region?: 'Greenfields' | 'Whisperwood' | 'Stonepass' | 'Ether Ruins' }
export const spots: Spot[] = [
  { id: 'green-1', monsterId: 'sproutling', x: 6, z: 32, radius: 4, count: 6, respawnMs: 10000 },
  { id: 'green-2', monsterId: 'sproutling', x: -9, z: 40, radius: 4.5, count: 5, respawnMs: 11000 },
  { id: 'green-3', monsterId: 'wild-beetle', x: 16, z: 46, radius: 5, count: 5, respawnMs: 13000 },
  { id: 'wood-1', monsterId: 'forest-wolf', x: -36, z: 14, radius: 5, count: 5, respawnMs: 14000 },
  { id: 'wood-2', monsterId: 'thornling', x: -48, z: 28, radius: 5, count: 5, respawnMs: 16000 },
  { id: 'pass-1', monsterId: 'rogue', x: 36, z: -8, radius: 4.5, count: 5, respawnMs: 16000 },
  { id: 'pass-2', monsterId: 'stone-beetle', x: 49, z: 10, radius: 5, count: 5, respawnMs: 18000 },
  { id: 'ruins-1', monsterId: 'orc-scout', x: -9, z: -36, radius: 5, count: 5, respawnMs: 18000 },
  { id: 'ruins-2', monsterId: 'stone-golem', x: 12, z: -49, radius: 5, count: 4, respawnMs: 22000 },
];
export interface ItemDefinition { id: string; name: string; width: number; height: number; slot?: Slot; requirements?: Partial<Stats>; affinity?: ClassId; damage?: number; defense?: number; affinityBonus?: number; price: number; durability?: number; consumable?: 'hp' | 'mana'; color: number; quality?: 'common' | 'uncommon' | 'rare'; setId?: string; dropEligible?: boolean; properties?: ItemModifiers }
export const items: ItemDefinition[] = [
  { id: 'hp-potion', name: 'Poción de vida', width: 1, height: 1, price: 15, consumable: 'hp', color: 0xc95555 },
  { id: 'mana-potion', name: 'Poción de mana', width: 1, height: 1, price: 15, consumable: 'mana', color: 0x5c87d9 },
  { id: 'iron-sword', name: 'Espada de hierro', width: 1, height: 3, slot: 'weapon', requirements: { strength: 18 }, affinity: 'VANGUARD', damage: 12, affinityBonus: 0.2, price: 100, durability: 100, color: 0xb4bdc5 },
  { id: 'ether-staff', name: 'Bastón de Éter', width: 1, height: 3, slot: 'weapon', requirements: { energy: 20 }, affinity: 'ARCANIST', damage: 14, affinityBonus: 0.2, price: 100, durability: 100, color: 0x80b9ce },
  { id: 'ash-bow', name: 'Arco de fresno', width: 2, height: 3, slot: 'weapon', requirements: { agility: 18 }, affinity: 'RANGER', damage: 12, affinityBonus: 0.2, price: 100, durability: 100, color: 0xb18b54 },
  { id: 'steel-armor', name: 'Pechera de acero', width: 2, height: 3, slot: 'chest', requirements: { strength: 100 }, affinity: 'VANGUARD', defense: 35, affinityBonus: 0.25, price: 900, durability: 150, color: 0x98aab5 },
  { id: 'linen-armor', name: 'Pechera de lino', width: 2, height: 3, slot: 'chest', defense: 5, price: 80, durability: 80, color: 0xddd1b2 },
  { id: 'leather-boots', name: 'Botas de cuero', width: 2, height: 2, slot: 'boots', defense: 3, price: 50, durability: 80, color: 0x907250 },
  { id: 'bronze-helmet', name: 'Casco de bronce', width: 2, height: 2, slot: 'helmet', requirements: { strength: 20 }, defense: 4, price: 90, durability: 90, color: 0xb39765, setId: 'aurelia-guard' },
  { id: 'leather-pants', name: 'Pantalón de cuero', width: 2, height: 2, slot: 'pants', defense: 3, price: 70, durability: 80, color: 0x806545, setId: 'trail-leather' },
  { id: 'leather-gloves', name: 'Guantes de cuero', width: 1, height: 1, slot: 'gloves', defense: 2, price: 45, durability: 65, color: 0x947750, setId: 'trail-leather' },
  { id: 'wooden-shield', name: 'Escudo de roble', width: 2, height: 3, slot: 'offhand', requirements: { strength: 18 }, defense: 6, price: 120, durability: 100, color: 0x8c7955 },
  { id: 'copper-necklace', name: 'Collar de cobre', width: 1, height: 1, slot: 'necklace', defense: 1, price: 65, durability: 100, color: 0xb09b76 },
  { id: 'copper-ring', name: 'Anillo de cobre', width: 1, height: 1, slot: 'ring1', defense: 1, price: 60, durability: 100, color: 0xbfa679 },
];
export const equipmentSlots: Slot[] = ['helmet', 'chest', 'pants', 'gloves', 'boots', 'weapon', 'offhand', 'wings', 'necklace', 'ring1', 'ring2'];
export interface NpcDefinition { id: string; name: string; role: string; x: number; z: number; dialogue: string; shop: string[] }
export const npcs: NpcDefinition[] = [
  { id: 'brom', name: 'Brom', role: 'Herrero', x: -8, z: 4, dialogue: 'Una hoja bien cuidada vale por dos. ¿Reparamos tu equipo?', shop: ['iron-sword', 'steel-armor', 'leather-boots', 'bronze-helmet', 'wooden-shield'] },
  { id: 'lyra', name: 'Lyra', role: 'Alquimista', x: 8, z: 5, dialogue: 'Un poco de luz embotellada para el camino.', shop: ['hp-potion', 'mana-potion'] },
  { id: 'orin', name: 'Orin', role: 'Sanctum', x: -8, z: -10, dialogue: 'Tu Sanctum guarda lo que aún no necesitás llevar.', shop: [] },
  { id: 'kael', name: 'Kael', role: 'Portales', x: 8, z: -10, dialogue: 'La red de Éter siempre te traerá de vuelta a Aurelia.', shop: [] },
  { id: 'seraph', name: 'Seraph', role: 'Maestro de habilidades', x: 0, z: -9, dialogue: 'Cuatro disciplinas acompañan tu clase. Practicá y encontrá tu ritmo.', shop: [] },
  { id: 'ronan', name: 'Ronan', role: 'Armas de Vanguard', x: -12, z: 12, dialogue: 'Firmeza en los pies, valor en el corazón.', shop: ['iron-sword', 'linen-armor', 'wooden-shield', 'leather-pants'] },
  { id: 'elyra', name: 'Elyra', role: 'Equipo de Arcanist', x: 12, z: 12, dialogue: 'El Éter responde a quien sabe escuchar.', shop: ['ether-staff', 'linen-armor', 'copper-necklace', 'copper-ring'] },
  { id: 'sylwen', name: 'Sylwen', role: 'Equipo de Ranger', x: 12, z: -15, dialogue: 'Seguí el viento, pero elegí tu propio rumbo.', shop: ['ash-bow', 'leather-boots', 'leather-pants', 'leather-gloves'] },
  { id: 'reset-master', name: 'Maestro de Reset', role: 'Renacimiento', x: -12, z: -15, dialogue: 'Al nivel 500 comienza una nueva vuelta del camino.', shop: [] },
];
