import { randomUUID } from 'node:crypto';
import { balance, classes, formulas, items, itemDropTable, monsters, npcs, skills, spots, type SkillDefinition, type Spot, type MonsterDefinition } from '../shared/content';
import type { Character, ItemInstance, Point } from '../shared/model';
import { clearSegment, distance, findPath, inSafeZone, walkable, world } from '../shared/world';
import type { Action } from '../shared/protocol';
import { canEquip, definition, effectiveValue, fits, freeCell } from './inventory';
import type { Store } from './database';

export interface PlayerRuntime {
  character: Character; path: Point[]; targetId?: string; pendingSkill?: string;
  cooldowns: Record<string, number>; attackAt: number; potionAt: number;
  buffs: Record<string, number>; animation: string; animationUntil: number;
  send: (event: unknown) => void;
}
export interface MonsterRuntime extends Point {
  id: string; definitionId: string; spotId: string; home: Point; hp: number;
  targetId?: string; attackAt: number; respawnAt: number; slowUntil: number;
  path: Point[]; nextPathAt: number; animation: string;
}
export interface Loot extends Point {
  id: string; kind: 'crowns' | 'ether' | 'item'; amount: number; item?: ItemInstance;
  ownerId: string; exclusiveUntil: number; expiresAt: number; name: string;
}
export class Game {
  players = new Map<string, PlayerRuntime>();
  creatures = new Map<string, MonsterRuntime>();
  loot = new Map<string, Loot>();
  now: number;
  constructor(readonly store: Store, readonly random: () => number = Math.random, readonly clock: () => number = Date.now) {
    this.now = clock();
    for (const spot of spots) if (spot.enabled !== false) for (let i = 0; i < spot.count; i++) this.spawn(spot);
  }
  spawn(spot: Spot, def?: MonsterDefinition): MonsterRuntime {
    let point: Point = { x: spot.x, z: spot.z };
    for (let i = 0; i < 30; i++) {
      const angle = this.random() * Math.PI * 2, radius = this.random() * spot.radius;
      const candidate = { x: spot.x + Math.cos(angle) * radius, z: spot.z + Math.sin(angle) * radius };
      if (walkable(candidate) && !inSafeZone(candidate)) { point = candidate; break; }
    }
    const monster = def ?? monsters.find(m => m.id === spot.monsterId)!;
    const runtime: MonsterRuntime = { id: randomUUID(), definitionId: monster.id, spotId: spot.id, ...point, home: { ...point }, hp: monster.hp, attackAt: 0, respawnAt: 0, slowUntil: 0, path: [], nextPathAt: 0, animation: 'idle' };
    this.creatures.set(runtime.id, runtime); return runtime;
  }
  connect(character: Character, send: (event: unknown) => void): PlayerRuntime {
    if (this.players.has(character.id)) throw new Error('El personaje ya está conectado.');
    if (!walkable(character) || character.hp <= 0) { Object.assign(character, world.spawn); character.hp = formulas.maxHp(character.stats); }
    const runtime: PlayerRuntime = { character, path: [], cooldowns: {}, buffs: {}, attackAt: 0, potionAt: 0, animation: 'idle', animationUntil: 0, send };
    this.players.set(character.id, runtime); return runtime;
  }
  disconnect(id: string): void { const player = this.players.get(id); if (player) this.store.save(player.character); this.players.delete(id); }
  notify(player: PlayerRuntime, message: string): void { player.send({ type: 'notice', message }); }
  nearNpc(character: Character, npcId: string): void {
    const npc = npcs.find(n => n.id === npcId);
    if (!npc || distance(character, npc) > 4.5) throw new Error('Acercate al NPC.');
  }
  action(id: string, action: Action): void {
    const player = this.players.get(id);
    if (!player) return;
    const c = player.character;
    try {
      switch (action.type) {
        case 'stop': {
          player.path = []; player.targetId = undefined; player.pendingSkill = undefined;
          if (player.animation === 'walk') player.animation = 'idle';
          break;
        }
        case 'move': {
          const path = findPath(c, action);
          if (!path.length) throw new Error('Destino bloqueado.');
          player.path = path; player.targetId = undefined; player.pendingSkill = undefined; break;
        }
        case 'attack': {
          const target = this.creatures.get(action.targetId);
          if (!target || target.hp <= 0 || inSafeZone(c)) throw new Error('Objetivo no válido o zona segura.');
          player.targetId = target.id; player.pendingSkill = undefined; player.path = []; break;
        }
        case 'skill': {
          const skill = skills.find(s => s.id === action.skillId && s.classId === c.classId);
          if (!skill || !c.unlockedSkills.includes(skill.id)) throw new Error('Habilidad no disponible.');
          if (inSafeZone(c)) throw new Error('No podés usar habilidades en la ciudad.');
          if ((player.cooldowns[skill.id] ?? 0) > this.now || c.mana < skill.mana) throw new Error('Habilidad en cooldown o mana insuficiente.');
          if (['single', 'charge', 'cone'].includes(skill.kind)) {
            const target = this.creatures.get(action.targetId ?? player.targetId ?? '');
            if (!target || target.hp <= 0) throw new Error('Seleccioná un enemigo.');
            player.targetId = target.id; player.pendingSkill = skill.id; player.path = [];
          } else this.cast(player, skill, undefined, action.point);
          break;
        }
        case 'pickup': {
          const drop = this.loot.get(action.lootId);
          if (!drop || drop.expiresAt <= this.now) throw new Error('El objeto ya no está en el suelo.');
          if (distance(c, drop) > balance.pickupRange) throw new Error('Acercate al objeto para recogerlo.');
          if (drop.ownerId !== id && drop.exclusiveUntil > this.now) throw new Error('El loot pertenece a otro jugador durante 30 segundos.');
          if (drop.kind === 'item') {
            const cell = freeCell(c.inventory, drop.item!);
            if (!cell) throw new Error('Inventario lleno.');
            c.inventory.push({ ...drop.item!, ...cell }); this.store.save(c);
          } else this.resource(c, drop.kind, drop.amount, 'loot', drop.id);
          this.loot.delete(drop.id); player.send({ type: 'effect', kind: 'pickup', x: drop.x, z: drop.z, sourceId: c.id, lootKind: drop.kind }); break;
        }
        case 'stat': {
          if (c.freePoints < action.amount) throw new Error('Puntos insuficientes.');
          c.stats[action.stat] += action.amount; c.freePoints -= action.amount; this.store.save(c); break;
        }
        case 'inventory-move': {
          if (action.container === 'sanctum') this.nearNpc(c, 'orin');
          const container = c[action.container], item = container.find(i => i.id === action.itemId);
          if (!item || !fits(container, item, action.x, action.y)) throw new Error('El objeto no cabe ahí.');
          item.x = action.x; item.y = action.y; this.store.save(c); break;
        }
        case 'equip': {
          const item = c.inventory.find(i => i.id === action.itemId);
          if (!item || !canEquip(c, item, action.slot)) throw new Error('No se cumplen los requisitos de equipamiento.');
          const old = c.equipment[action.slot];
          const remaining = c.inventory.filter(i => i.id !== item.id);
          const cell = old ? freeCell(remaining, old) : undefined;
          if (old && !cell) throw new Error('No hay lugar para el objeto equipado.');
          c.inventory = remaining;
          if (old) c.inventory.push({ ...old, ...cell! });
          c.equipment[action.slot] = item; this.store.save(c); break;
        }
        case 'unequip': {
          const item = c.equipment[action.slot];
          if (!item) throw new Error('Slot vacío.');
          const cell = freeCell(c.inventory, item);
          if (!cell) throw new Error('Inventario lleno.');
          c.inventory.push({ ...item, ...cell }); delete c.equipment[action.slot]; this.store.save(c); break;
        }
        case 'store': {
          this.nearNpc(c, 'orin');
          const source = action.direction === 'deposit' ? c.inventory : c.sanctum;
          const dest = action.direction === 'deposit' ? c.sanctum : c.inventory;
          const item = source.find(i => i.id === action.itemId);
          if (!item) throw new Error('Objeto inexistente.');
          const cell = freeCell(dest, item);
          if (!cell) throw new Error('No queda espacio.');
          source.splice(source.indexOf(item), 1); dest.push({ ...item, ...cell }); this.store.save(c); break;
        }
        case 'potion': {
          if (player.potionAt > this.now) throw new Error('Esperá antes de beber otra poción.');
          const index = c.inventory.findIndex(i => definition(i).consumable === action.kind);
          if (index < 0) throw new Error('No quedan pociones.');
          c.inventory.splice(index, 1);
          if (action.kind === 'hp') c.hp = Math.min(formulas.maxHp(c.stats), c.hp + balance.potionHp);
          else c.mana = Math.min(formulas.maxMana(c.stats), c.mana + balance.potionMana);
          player.potionAt = this.now + balance.potionCooldownMs; this.store.save(c); break;
        }
        case 'buy': {
          this.nearNpc(c, action.npcId);
          if (!npcs.find(n => n.id === action.npcId)!.shop.includes(action.itemId)) throw new Error('El NPC no vende ese objeto.');
          const def = items.find(i => i.id === action.itemId)!;
          const price = Math.ceil(def.price * balance.npcPriceMultiplier);
          if (c.crowns < price) throw new Error('Crowns insuficientes.');
          const item = this.newItem(def.id), cell = freeCell(c.inventory, item);
          if (!cell) throw new Error('Inventario lleno.');
          c.inventory.push({ ...item, ...cell }); this.resource(c, 'crowns', -price, 'purchase', item.id); break;
        }
        case 'sell': {
          this.nearNpc(c, action.npcId);
          if (!npcs.find(n => n.id === action.npcId)!.shop.length) throw new Error('Este NPC no compra objetos.');
          const index = c.inventory.findIndex(i => i.id === action.itemId);
          if (index < 0) throw new Error('Objeto inexistente.');
          const item = c.inventory[index]; c.inventory.splice(index, 1);
          this.resource(c, 'crowns', Math.floor(definition(item).price * balance.salePriceMultiplier), 'purchase', item.id); break;
        }
        case 'repair': {
          this.nearNpc(c, 'brom');
          const equipment = [...Object.values(c.equipment), ...c.inventory].filter(i => definition(i).durability);
          const cost = Math.ceil(equipment.reduce((sum, item) => sum + Math.max(0, definition(item).durability! - item.durability) * balance.repairCostPerPoint, 0));
          if (c.crowns < cost) throw new Error(`Reparar cuesta ${cost} Crowns.`);
          for (const item of equipment) item.durability = definition(item).durability!;
          this.resource(c, 'crowns', -cost, 'repair', randomUUID()); this.notify(player, `Equipo reparado por ${cost} Crowns.`); break;
        }
        case 'reset': this.nearNpc(c, 'reset-master'); this.reset(c); this.notify(player, 'Renaciste. Distribuí tus puntos de reset.'); break;
        case 'teleport': this.nearNpc(c, 'kael'); Object.assign(c, world.spawn); player.path = []; player.targetId = undefined; this.store.save(c); break;
      }
    } catch (error) { this.notify(player, error instanceof Error ? error.message : 'Acción inválida.'); }
  }
  resource(c: Character, resource: 'crowns' | 'ether', amount: number, reason: 'loot' | 'purchase' | 'repair' | 'admin', referenceId: string): void {
    if (!Number.isSafeInteger(amount) || c[resource] + amount < 0) throw new Error('Transacción inválida.');
    c[resource] += amount;
    this.store.saveWithTransaction(c, { id: randomUUID(), characterId: c.id, resource, amount, reason, referenceId, timestamp: this.now });
  }
  newItem(definitionId: string): ItemInstance {
    const def = items.find(i => i.id === definitionId)!;
    return { id: randomUUID(), definitionId, x: 0, y: 0, durability: def.durability ?? 0, modifiers: { ...def.properties }, upgradeLevel: 0, metadata: {} };
  }
  reset(c: Character): void {
    if (c.level !== balance.maxLevel) throw new Error(`El reset requiere nivel ${balance.maxLevel}.`);
    c.resets++; c.level = 1; c.xp = 0; c.stats = { ...classes[c.classId].stats };
    c.freePoints = c.resets * balance.resetBonusPoints;
    c.hp = formulas.maxHp(c.stats); c.mana = formulas.maxMana(c.stats);
    this.store.save(c);
  }
  grantXp(player: PlayerRuntime, amount: number): void {
    const c = player.character;
    if (c.level >= balance.maxLevel) return;
    c.xp += amount;
    while (c.level < balance.maxLevel && c.xp >= formulas.experienceForLevel(c.level)) {
      c.xp -= formulas.experienceForLevel(c.level); c.level++; c.freePoints += balance.pointsPerLevel;
      c.hp = formulas.maxHp(c.stats); c.mana = formulas.maxMana(c.stats);
      this.notify(player, `Nivel ${c.level}: +${balance.pointsPerLevel} puntos libres.`);
    }
    if (c.level === balance.maxLevel) c.xp = 0;
    this.store.save(c);
  }
  addLoot(player: PlayerRuntime, point: Point, kind: Loot['kind'], amount: number, item?: ItemInstance): Loot {
    // A Point may also be a MonsterRuntime: copy coordinates, never its entity ID or runtime fields.
    const drop: Loot = { id: randomUUID(), x: point.x, z: point.z, kind, amount, item, ownerId: player.character.id, exclusiveUntil: this.now + balance.lootExclusiveMs, expiresAt: this.now + balance.lootLifetimeMs, name: kind === 'item' ? definition(item!).name : `${amount} ${kind === 'ether' ? 'Éter' : 'Crowns'}` };
    this.loot.set(drop.id, drop); return drop;
  }
  kill(player: PlayerRuntime, monster: MonsterRuntime): void {
    const def = monsters.find(m => m.id === monster.definitionId)!;
    const spot = spots.find(s => s.id === monster.spotId);
    monster.hp = 0; monster.respawnAt = this.now + (spot?.respawnMs ?? 20000); monster.targetId = undefined; monster.path = []; monster.animation = 'dead';
    for (const other of this.players.values()) other.send({ type: 'effect', kind: 'death', x: monster.x, z: monster.z, targetId: monster.id });
    this.grantXp(player, def.xp);
    if (this.random() < (def.drops?.crownsChance ?? balance.crownsDropChance)) this.addLoot(player, monster, 'crowns', balance.crownsBaseAmount + def.level * balance.crownsPerMonsterLevel + Math.floor(this.random() * balance.crownsRandomAmount));
    if (this.random() < (def.drops?.etherChance ?? balance.etherDropChance)) this.addLoot(player, { x: monster.x + 0.65, z: monster.z }, 'ether', 1);
    const table = (def.drops?.itemIds ?? itemDropTable).filter(id => items.find(i => i.id === id)?.dropEligible !== false);
    if (table.length && this.random() < (def.drops?.itemChance ?? balance.itemDropChance)) {
      const item = this.newItem(table[Math.floor(this.random() * table.length)]);
      this.addLoot(player, { x: monster.x - 0.65, z: monster.z }, 'item', 1, item);
    }
  }
  die(player: PlayerRuntime): void {
    const c = player.character;
    for (const other of this.players.values()) other.send({ type: 'effect', kind: 'death', x: c.x, z: c.z, targetId: c.id });
    const eligible = Object.entries(c.equipment).filter(([, item]) => !item.deathDropProtected);
    if (eligible.length && this.random() < balance.equippedItemDropChanceOnDeath) {
      const [slot, item] = eligible[Math.floor(this.random() * eligible.length)];
      this.addLoot(player, { x: c.x, z: c.z }, 'item', 1, item);
      delete c.equipment[slot as keyof typeof c.equipment];
    }
    Object.assign(c, world.spawn); c.hp = formulas.maxHp(c.stats); c.mana = formulas.maxMana(c.stats);
    player.path = []; player.targetId = undefined; player.pendingSkill = undefined; player.buffs = {}; player.animation = 'idle';
    this.store.save(c); this.notify(player, 'Reapareciste en Aurelia. Conservaste tu experiencia y recursos.');
  }
  damage(player: PlayerRuntime, monster: MonsterRuntime, multiplier: number, magic = classes[player.character.classId].magic, skillId?: string): void {
    if (monster.hp <= 0 || inSafeZone(player.character)) return;
    const c = player.character, def = monsters.find(m => m.id === monster.definitionId)!;
    const base = magic ? formulas.magicDamage(c.stats) : formulas.physicalDamage(c.stats);
    const equipment = Object.values(c.equipment).reduce((sum, item) => sum + (canEquip(c, item, definition(item).slot!) ? effectiveValue(c, item, 'damage') : 0), 0);
    const buff = (player.buffs['war-cry'] ?? 0) > this.now ? skills.find(s => s.id === 'war-cry')!.multiplier : 1;
    const amount = Math.max(1, Math.round((base + equipment) * multiplier * buff - def.defense));
    monster.hp -= amount; monster.targetId = c.id;
    player.animation = 'attack'; player.animationUntil = this.now + 350;
    for (const other of this.players.values()) other.send({ type: 'effect', kind: magic ? 'magic' : 'hit', x: monster.x, z: monster.z, amount, sourceId: c.id, targetId: monster.id, skillId });
    const weapon = c.equipment.weapon;
    if (weapon) weapon.durability = Math.max(0, weapon.durability - balance.durabilityLossPerAttack);
    if (monster.hp <= 0) this.kill(player, monster);
  }
  cast(player: PlayerRuntime, skill: SkillDefinition, target?: MonsterRuntime, point?: Point): void {
    const c = player.character;
    const origin = { x: c.x, z: c.z };
    if (c.mana < skill.mana || (player.cooldowns[skill.id] ?? 0) > this.now) return;
    if (skill.kind === 'blink') {
      const dest = point ?? { x: c.x, z: c.z + skill.range };
      const length = distance(c, dest), ratio = Math.min(1, skill.range / (length || 1));
      const end = { x: c.x + (dest.x - c.x) * ratio, z: c.z + (dest.z - c.z) * ratio };
      if (!clearSegment(c, end)) { this.notify(player, 'Blink bloqueado por un obstáculo.'); return; }
      Object.assign(c, end); player.path = [];
    } else if (skill.kind === 'charge' && target) {
      const length = distance(c, target), ratio = Math.max(0, (length - 1.8) / length);
      const end = { x: c.x + (target.x - c.x) * ratio, z: c.z + (target.z - c.z) * ratio };
      if (!clearSegment(c, end)) return;
      Object.assign(c, end); this.damage(player, target, skill.multiplier, false, skill.id);
    } else if (skill.kind === 'buff' || skill.kind === 'mobility') player.buffs[skill.id] = this.now + skill.durationMs!;
    else if (skill.kind === 'heal') { c.hp = Math.min(formulas.maxHp(c.stats), c.hp + formulas.maxHp(c.stats) * skill.multiplier); player.buffs[skill.id] = this.now + skill.durationMs!; }
    else if (skill.kind === 'area' || skill.kind === 'cone') {
      const direction = target ? Math.atan2(target.z - c.z, target.x - c.x) : 0;
      for (const monster of this.creatures.values()) {
        if (monster.hp <= 0 || distance(c, monster) > skill.range || !clearSegment(c, monster)) continue;
        const angle = Math.atan2(monster.z - c.z, monster.x - c.x);
        if (skill.kind === 'cone' && Math.cos(angle - direction) < 0.5) continue;
        this.damage(player, monster, skill.multiplier, classes[c.classId].magic, skill.id);
        if (skill.slowMs) monster.slowUntil = this.now + skill.slowMs;
      }
    } else if (target) this.damage(player, target, skill.multiplier, classes[c.classId].magic, skill.id);
    c.mana -= skill.mana; player.cooldowns[skill.id] = this.now + skill.cooldownMs;
    player.pendingSkill = undefined; player.animation = 'skill'; player.animationUntil = this.now + 500;
    for (const other of this.players.values()) other.send({ type: 'effect', kind: skill.kind, x: c.x, z: c.z, sourceId: c.id, targetId: target?.id, skillId: skill.id, fromX: origin.x, fromZ: origin.z }); this.store.save(c);
  }
  stepPath(entity: Point, path: Point[], speed: number, dt: number): boolean {
    let remaining = speed * dt;
    while (path.length && remaining > 0) {
      const next = path[0], length = distance(entity, next);
      if (!clearSegment(entity, next)) { path.length = 0; return false; }
      if (length <= remaining) { entity.x = next.x; entity.z = next.z; path.shift(); remaining -= length; }
      else { entity.x += (next.x - entity.x) / length * remaining; entity.z += (next.z - entity.z) / length * remaining; remaining = 0; }
    }
    return !!path.length;
  }
  tick(dt = balance.tickMs / 1000): void {
    this.now = this.clock();
    for (const player of this.players.values()) {
      const c = player.character;
      c.mana = Math.min(formulas.maxMana(c.stats), c.mana + dt * (inSafeZone(c) ? balance.safeManaRegenPerSecond : balance.combatManaRegenPerSecond));
      if (inSafeZone(c)) c.hp = Math.min(formulas.maxHp(c.stats), c.hp + dt * balance.safeHpRegenPerSecond);
      if ((player.buffs['natures-grace'] ?? 0) > this.now) {
        const grace = skills.find(s => s.id === 'natures-grace')!;
        c.hp = Math.min(formulas.maxHp(c.stats), c.hp + dt * formulas.maxHp(c.stats) * grace.multiplier / (grace.durationMs! / 1000));
      }
      const target = player.targetId ? this.creatures.get(player.targetId) : undefined;
      if (target && target.hp > 0 && !inSafeZone(c)) {
        const skill = player.pendingSkill ? skills.find(s => s.id === player.pendingSkill) : undefined;
        const range = skill?.range ?? classes[c.classId].range;
        if (distance(c, target) > range || !clearSegment(c, target)) {
          if (!player.path.length || distance(player.path.at(-1)!, target) > 2) player.path = findPath(c, target);
        } else {
          player.path = [];
          if (skill) this.cast(player, skill, target);
          else if (player.attackAt <= this.now) {
            if (this.random() < formulas.accuracy(c.stats, monsters.find(m => m.id === target.definitionId)!.level)) this.damage(player, target, 1);
            else { player.animation = 'attack'; player.animationUntil = this.now + 350; for (const other of this.players.values()) other.send({ type: 'effect', kind: 'miss', x: target.x, z: target.z, sourceId: c.id, targetId: target.id }); }
            player.attackAt = this.now + formulas.attackCooldownMs(c.stats);
          }
        }
      } else if (target?.hp === 0) { player.targetId = undefined; player.pendingSkill = undefined; player.path = []; }
      const speed = balance.moveSpeed * ((player.buffs.quickstep ?? 0) > this.now ? skills.find(s => s.id === 'quickstep')!.multiplier : 1);
      const moving = this.stepPath(c, player.path, speed, dt);
      if (player.animationUntil <= this.now) player.animation = moving ? 'walk' : 'idle';
    }
    for (const monster of this.creatures.values()) {
      const def = monsters.find(m => m.id === monster.definitionId)!;
      if (monster.hp <= 0) {
        if (monster.respawnAt <= this.now) { Object.assign(monster, monster.home); monster.hp = def.hp; monster.animation = 'idle'; }
        continue;
      }
      let target = monster.targetId ? this.players.get(monster.targetId) : undefined;
      if (target && (inSafeZone(target.character) || distance(monster.home, target.character) > def.leashRange || distance(monster, target.character) > (def.chaseDistance ?? def.leashRange))) { monster.targetId = undefined; target = undefined; }
      if (!target && def.aggroMode !== 'passive' && def.aggroRange > 0) {
        target = [...this.players.values()].filter(p => !inSafeZone(p.character) && distance(monster, p.character) <= def.aggroRange && distance(monster.home, p.character) <= def.leashRange).sort((a, b) => distance(monster, a.character) - distance(monster, b.character))[0];
        monster.targetId = target?.character.id;
      }
      if (target) {
        if (distance(monster, target.character) <= (def.attackRange ?? 1.9) && clearSegment(monster, target.character)) {
          monster.path = []; monster.animation = 'attack';
          if (monster.attackAt <= this.now) {
            const c = target.character;
            const armor = Object.values(c.equipment).reduce((sum, i) => sum + (canEquip(c, i, definition(i).slot!) ? effectiveValue(c, i, 'defense') : 0), 0);
            const received = Math.max(1, def.damage - formulas.defense(c.stats) - armor);
            c.hp -= received;
            for (const other of this.players.values()) other.send({ type: 'effect', kind: 'received', x: c.x, z: c.z, amount: received, sourceId: monster.id, targetId: c.id });
            for (const item of Object.values(c.equipment)) if (definition(item).defense) item.durability = Math.max(0, item.durability - balance.durabilityLossPerHit);
            monster.attackAt = this.now + def.attackMs;
            if (c.hp <= 0) this.die(target);
          }
        } else {
          if (monster.nextPathAt <= this.now) { monster.path = findPath(monster, target.character); monster.nextPathAt = this.now + 750; }
          monster.animation = this.stepPath(monster, monster.path, def.speed * (monster.slowUntil > this.now ? 0.35 : 1), dt) ? 'walk' : 'idle';
        }
      } else if (distance(monster, monster.home) > 0.5) {
        if (!monster.path.length) monster.path = findPath(monster, monster.home);
        this.stepPath(monster, monster.path, def.speed, dt); monster.hp = Math.min(def.hp, monster.hp + dt * def.hp / balance.monsterReturnHealingSeconds); monster.animation = 'walk';
      } else monster.animation = 'idle';
    }
    for (const drop of this.loot.values()) if (drop.expiresAt <= this.now) this.loot.delete(drop.id);
  }
  snapshot(player: PlayerRuntime): unknown {
    return {
      type: 'state', now: this.now, self: player.character, cooldowns: player.cooldowns, buffs: player.buffs,
      players: [...this.players.values()].map(p => ({ id: p.character.id, name: p.character.name, classId: p.character.classId, x: p.character.x, z: p.character.z, hp: p.character.hp, maxHp: formulas.maxHp(p.character.stats), animation: p.animation, equipment: Object.fromEntries(Object.entries(p.character.equipment).map(([slot, item]) => [slot, item.definitionId])) })),
      monsters: [...this.creatures.values()].map(({ path, nextPathAt, ...m }) => m), loot: [...this.loot.values()],
    };
  }
}
