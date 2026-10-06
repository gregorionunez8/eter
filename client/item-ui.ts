import { classes, items, type ItemDefinition } from '../shared/content';
import type { ItemInstance } from '../shared/model';
import { icon } from './icons';

const stats: Record<string, string> = { strength: 'Fuerza', agility: 'Agilidad', vitality: 'Vitalidad', energy: 'Energía' };
const modifierNames: Record<string, string> = { additionalDamage: 'Daño adicional', damagePercent: 'Daño %', attackSpeed: 'Velocidad de ataque', criticalChance: 'Probabilidad crítica', lifeOnKill: 'Vida al derrotar', manaOnKill: 'Mana al derrotar', monsterDamagePercent: 'Daño a monstruos %', luck: 'Suerte', classAffinityBonus: 'Bonus de afinidad', grantedSkill: 'Habilidad' };
const slotNames: Record<string, string> = { helmet: 'Casco', chest: 'Pechera', pants: 'Pantalón', gloves: 'Guantes', boots: 'Botas', weapon: 'Arma principal', offhand: 'Escudo / secundaria', wings: 'Alas', necklace: 'Collar', ring1: 'Anillo', ring2: 'Anillo' };
function escape(value: unknown): string { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
export function tooltip(def: ItemDefinition, instance?: ItemInstance): string {
  const modifiers = Object.entries(instance?.modifiers ?? def.properties ?? {}).filter(([, v]) => v !== 0 && v !== undefined);
  return `<header>${icon(def.id)}<div><strong>${escape(def.name)}</strong><small>${def.consumable ? 'Consumible' : slotNames[def.slot ?? ''] ?? 'Objeto'} · ${def.width} × ${def.height}${def.quality ? ` · ${def.quality}` : ''}</small></div></header>
    <dl>${def.damage ? `<dt>Daño base</dt><dd>${def.damage}</dd>` : ''}${def.defense ? `<dt>Defensa base</dt><dd>${def.defense}</dd>` : ''}${def.consumable ? `<dt>Restaura</dt><dd>${def.consumable === 'hp' ? 'Vida' : 'Mana'}</dd>` : ''}</dl>
    ${Object.keys(def.requirements ?? {}).length ? `<section><h4>Requisitos</h4>${Object.entries(def.requirements!).map(([key, value]) => `<p>${stats[key]} <b>${value}</b></p>`).join('')}</section>` : ''}
    ${def.durability ? `<section><p>Durabilidad <b>${Math.max(0, instance?.durability ?? def.durability).toFixed(0)} / ${def.durability}</b></p><div class="durability-track"><i style="width:${Math.max(0, Math.min(100, (instance?.durability ?? def.durability) / def.durability * 100))}%"></i></div></section>` : ''}
    ${def.affinity ? `<p class="affinity">Afinidad ${classes[def.affinity].name} · +${Math.round((def.affinityBonus ?? 0) * 100)}%<small>Los requisitos permiten builds híbridas.</small></p>` : ''}
    ${modifiers.length ? `<section class="item-properties"><h4>Propiedades reservadas</h4>${modifiers.map(([key, value]) => `<p>${modifierNames[key] ?? escape(key)} <b>${escape(value)}</b></p>`).join('')}${instance?.modifiers.luck ? '<small>Suerte: propiedad reservada para futuros sistemas; sin fórmula de upgrades en Goal #2.</small>' : ''}<small>Datos preparados para futuros sistemas; sin bonus adicionales activos en Goal #2.</small></section>` : ''}
    <footer>${def.price.toLocaleString('es-AR')} Crowns${instance?.deathDropProtected ? '<small>Protegido de pérdida al morir</small>' : ''}</footer>`;
}
export function itemFor(id: string) { return items.find(i => i.id === id); }
