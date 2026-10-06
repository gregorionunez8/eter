import type { ClassId, Slot, Stats } from './content';

export interface ItemModifiers {
  additionalDamage?: number;
  damagePercent?: number;
  attackSpeed?: number;
  criticalChance?: number;
  lifeOnKill?: number;
  manaOnKill?: number;
  monsterDamagePercent?: number;
  grantedSkill?: string;
  luck?: number;
  classAffinityBonus?: number;
}
export interface ItemInstance {
  id: string; definitionId: string; x: number; y: number;
  durability: number; modifiers: ItemModifiers;
  upgradeLevel: number; metadata: Record<string, string | number>;
  deathDropProtected?: boolean;
}
export interface Character {
  id: string; accountId: string; name: string; classId: ClassId;
  level: number; xp: number; resets: number; stats: Stats; freePoints: number;
  crowns: number; ether: number; sanctum: ItemInstance[];
  unlockedSkills: string[];
  x: number; z: number; hp: number; mana: number;
  inventory: ItemInstance[]; equipment: Partial<Record<Slot, ItemInstance>>;
}
/** Resource ledger supports future trade, upgrades, crafting and combinations. */
export interface ResourceTransaction {
  id: string; characterId: string; resource: 'crowns' | 'ether'; amount: number;
  reason: 'loot' | 'purchase' | 'repair' | 'trade' | 'upgrade' | 'craft' | 'combination' | 'admin';
  referenceId: string; timestamp: number;
}
export interface Point { x: number; z: number }
export interface Obstacle { id: string; x: number; z: number; width: number; depth: number; kind: 'building' | 'wall' | 'tree' | 'rock' | 'npc' | 'crystal' | 'prop' }
