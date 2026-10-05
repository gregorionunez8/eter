import { z } from 'zod';
import { equipmentSlots } from './content';
export const pointSchema = z.object({ x: z.number().finite().min(-79).max(79), z: z.number().finite().min(-79).max(79) }).strict();
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), ...pointSchema.shape }).strict(),
  z.object({ type: z.literal('attack'), targetId: z.string().max(80) }).strict(),
  z.object({ type: z.literal('skill'), skillId: z.string().max(40), targetId: z.string().max(80).optional(), point: pointSchema.optional() }).strict(),
  z.object({ type: z.literal('pickup'), lootId: z.string().max(80) }).strict(),
  z.object({ type: z.literal('stat'), stat: z.enum(['strength', 'agility', 'vitality', 'energy']), amount: z.number().int().min(1).max(10000) }).strict(),
  z.object({ type: z.literal('equip'), itemId: z.string().max(80), slot: z.enum(equipmentSlots as [typeof equipmentSlots[number], ...typeof equipmentSlots[number][]]) }).strict(),
  z.object({ type: z.literal('unequip'), slot: z.enum(equipmentSlots as [typeof equipmentSlots[number], ...typeof equipmentSlots[number][]]) }).strict(),
  z.object({ type: z.literal('inventory-move'), itemId: z.string().max(80), x: z.number().int().min(0).max(7), y: z.number().int().min(0).max(7), container: z.enum(['inventory', 'sanctum']) }).strict(),
  z.object({ type: z.literal('store'), itemId: z.string().max(80), direction: z.enum(['deposit', 'withdraw']) }).strict(),
  z.object({ type: z.literal('potion'), kind: z.enum(['hp', 'mana']) }).strict(),
  z.object({ type: z.literal('buy'), npcId: z.string().max(40), itemId: z.string().max(40) }).strict(),
  z.object({ type: z.literal('sell'), npcId: z.string().max(40), itemId: z.string().max(80) }).strict(),
  z.object({ type: z.literal('repair') }).strict(),
  z.object({ type: z.literal('reset') }).strict(),
  z.object({ type: z.literal('teleport'), destination: z.literal('Aurelia') }).strict(),
]);
export type Action = z.infer<typeof actionSchema>;
