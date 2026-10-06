import { balance, classes, formulas, items } from '../shared/content';
import type { Character } from '../shared/model';
import { icon } from './icons';

export function characterSheet(c: Character): string {
  const statNames = { strength: 'Fuerza', agility: 'Agilidad', vitality: 'Vitalidad', energy: 'Energía' };
  const escapedName = c.name.replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch]!);
  const gear = (field: 'damage' | 'defense') => Object.values(c.equipment).reduce((sum, item) => {
    const def = items.find(i => i.id === item.definitionId)!;
    if (item.durability <= 0 || Object.entries(def.requirements ?? {}).some(([key, value]) => c.stats[key as keyof typeof c.stats] < value!)) return sum;
    const condition = item.durability < (def.durability ?? 1) * balance.lowDurabilityThreshold ? 0.5 : 1;
    return sum + (def[field] ?? 0) * condition * (def.affinity === c.classId ? 1 + (def.affinityBonus ?? 0) : 1);
  }, 0);
  const derived = [
    ['Daño físico', (formulas.physicalDamage(c.stats) + gear('damage')).toFixed(1)],
    ['Daño mágico', (formulas.magicDamage(c.stats) + gear('damage')).toFixed(1)],
    ['Defensa', (formulas.defense(c.stats) + gear('defense')).toFixed(1)],
    ['Velocidad de ataque', `${(1000 / formulas.attackCooldownMs(c.stats)).toFixed(2)} / s`],
    ['Vida máxima', formulas.maxHp(c.stats)], ['Mana máximo', formulas.maxMana(c.stats)],
  ];
  return `<div class="sheet-identity">${icon(c.classId)}<div><h3>${escapedName}</h3><p>${classes[c.classId].name} · Nivel ${c.level}</p><small>${c.resets} renacimientos</small></div></div>
    <p class="points">${c.freePoints} puntos disponibles · ${c.resets} resets</p>
    <div class="stats-list">${Object.entries(statNames).map(([key, label]) => `<div><span>${label}</span><strong>${c.stats[key as keyof typeof c.stats]}</strong><button data-stat="${key}" ${c.freePoints < 1 ? 'disabled' : ''}>+1</button><button data-stat="${key}" data-amount="5" ${c.freePoints < 5 ? 'disabled' : ''}>+5</button></div>`).join('')}</div>
    <h3>Capacidad de combate</h3><dl class="derived-stats">${derived.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <small>Valores con equipo válido y durabilidad actual; antes de buffs, habilidades y defensa del objetivo. La afinidad mejora el equipo sin bloquear builds híbridas.</small>`;
}
