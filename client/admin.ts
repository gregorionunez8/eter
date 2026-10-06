import type { EditableConfig } from '../server/config';
import { equipmentSlots } from '../shared/content';
import './admin.css';

type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Collection = 'monsters' | 'spots' | 'items' | 'skills' | 'npcs';
interface Player { id: string; name: string; classId: string; level: number; resets: number; crowns: number; ether: number; hp: number; mana: number; x: number; z: number; online: boolean; stats: Record<string, number> }
interface Field { key: string; label: string; min?: number; max?: number; step?: number; help?: string; options?: string[]; optional?: boolean; text?: boolean }
const sections = ['OVERVIEW', 'BALANCE', 'MONSTERS', 'SPOTS', 'ITEMS', 'SKILLS', 'NPCS / SHOPS', 'ECONOMY', 'RESETS', 'WORLD', 'PLAYERS', 'DEVELOPER TOOLS', 'RAW CONFIG'];
const collectionSections: Record<string, Collection> = { MONSTERS: 'monsters', SPOTS: 'spots', ITEMS: 'items', SKILLS: 'skills', 'NPCS / SHOPS': 'npcs' };
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const field = (key: string, label: string, min = 0, max = 1000000, step = 1, help = ''): Field => ({ key, label, min, max, step, help });
const propertyFields: Field[] = [field('additionalDamage', 'Daño adicional', 0, 100000), field('damagePercent', 'Daño % (fracción)', 0, 2, 0.01), field('attackSpeed', 'Velocidad (fracción)', 0, 2, 0.01), field('criticalChance', 'Crítico (fracción)', 0, 1, 0.01), field('lifeOnKill', 'Vida por kill', 0, 100000), field('manaOnKill', 'Mana por kill', 0, 100000), field('monsterDamagePercent', 'Daño a monstruos (fracción)', 0, 2, 0.01), field('luck', 'Suerte', 0, 100), field('classAffinityBonus', 'Afinidad extra (fracción)', 0, 2, 0.01)].map(f => ({ ...f, optional: true }));
const fields: Record<string, Field[]> = {
  BALANCE: [field('maxLevel', 'Nivel máximo', 2, 1000), field('pointsPerLevel', 'Puntos por nivel', 1, 50), field('experienceBase', 'EXP base', 1, 100000, 1, 'EXP necesaria = base × nivel ^ exponente.'), field('experienceExponent', 'Exponente de EXP', 1, 4, 0.01), field('moveSpeed', 'Velocidad del jugador', 2, 12, 0.1), field('lootExclusiveMs', 'Loot exclusivo (ms)', 0, 300000, 1000, '30000 = 30 segundos de propiedad del killer.'), field('equippedItemDropChanceOnDeath', 'Pérdida de equipo al morir', 0, 1, 0.001, '0.005 = 0.5%. Máximo un equipado; respeta protección.')],
  ECONOMY: [field('crownsDropChance', 'Probabilidad Crowns', 0, 1, 0.01), field('etherDropChance', 'Probabilidad Éter', 0, 1, 0.001), field('itemDropChance', 'Probabilidad item', 0, 1, 0.01), field('crownsBaseAmount', 'Crowns base'), field('crownsPerMonsterLevel', 'Crowns por nivel', 0, 10000), field('crownsRandomAmount', 'Variación de Crowns'), field('npcPriceMultiplier', 'Multiplicador de tiendas', 0.1, 10, 0.05), field('salePriceMultiplier', 'Fracción al vender', 0, 1, 0.01), field('repairCostPerPoint', 'Costo por punto de durabilidad', 0, 1000, 0.1), field('potionHp', 'Vida de poción', 1, 100000), field('potionMana', 'Mana de poción', 1, 100000), field('potionCooldownMs', 'Cooldown de pociones (ms)', 250, 30000, 50)],
  RESETS: [field('maxLevel', 'Nivel requerido para reset', 2, 1000), field('resetBonusPoints', 'Puntos permanentes por reset', 0, 10000, 1, 'Acumulativos. Equipo, inventario, Sanctum y monedas se conservan.')],
  monsters: [{ key: 'name', label: 'Nombre', text: true }, field('level', 'Nivel', 1, 1000), field('hp', 'HP', 1), field('damage', 'Daño', 0, 100000), field('defense', 'Defensa', 0, 100000), field('xp', 'EXP', 0), field('speed', 'Velocidad', 0.1, 15, 0.1), { key: 'aggroMode', label: 'Comportamiento', options: ['passive', 'aggressive'], help: 'Los pasivos se defienden al recibir un ataque.' }, field('aggroRange', 'Radio de aggro', 0, 40, 0.1), field('chaseDistance', 'Distancia de persecución', 1, 70, 0.1), field('leashRange', 'Leash desde el spot', 1, 70, 0.1), field('attackRange', 'Rango de ataque', 0.8, 15, 0.1), field('attackMs', 'Intervalo de ataque (ms)', 250, 20000, 50), { ...field('drops.crownsChance', 'Crowns: chance propia', 0, 1, 0.01), optional: true, help: 'Vacío hereda Economía.' }, { ...field('drops.etherChance', 'Éter: chance propia', 0, 1, 0.001), optional: true }, { ...field('drops.itemChance', 'Items: chance propia', 0, 1, 0.01), optional: true }],
  spots: [{ key: 'monsterId', label: 'Monstruo', options: [] }, { key: 'region', label: 'Región', options: ['Greenfields', 'Whisperwood', 'Stonepass', 'Ether Ruins'] }, field('x', 'X', -75, 75, 0.1), field('z', 'Z', -75, 75, 0.1), field('count', 'Cantidad', 1, 20), field('radius', 'Radio', 0, 15, 0.1), field('respawnMs', 'Respawn (ms)', 2000, 300000, 1000)],
  items: [{ key: 'name', label: 'Nombre', text: true }, field('price', 'Precio en Crowns'), field('width', 'Ancho en celdas', 1, 8), field('height', 'Alto en celdas', 1, 8), { key: 'slot', label: 'Slot', options: equipmentSlots, optional: true }, { key: 'affinity', label: 'Afinidad', options: ['VANGUARD', 'ARCANIST', 'RANGER'], optional: true }, { ...field('damage', 'Daño base', 0, 100000, 0.1), optional: true }, { ...field('defense', 'Defensa base', 0, 100000, 0.1), optional: true }, { ...field('durability', 'Durabilidad máxima', 1, 10000), optional: true }, { ...field('affinityBonus', 'Bonus de afinidad', 0, 2, 0.01), optional: true }, ...['strength', 'agility', 'vitality', 'energy'].map((key, i) => ({ ...field(`requirements.${key}`, `Requiere ${['Fuerza', 'Agilidad', 'Vitalidad', 'Energía'][i]}`, 0, 100000), optional: true })), { key: 'quality', label: 'Calidad', options: ['common', 'uncommon', 'rare'] }, { key: 'setId', label: 'Familia de set (ID)', text: true, optional: true, help: 'Agrupa las piezas; no crea un slot ni activa bonus nuevos.' }],
  skills: [{ key: 'name', label: 'Nombre', text: true }, { key: 'classId', label: 'Clase', options: ['VANGUARD', 'ARCANIST', 'RANGER'] }, field('mana', 'Mana', 0, 10000), field('cooldownMs', 'Cooldown (ms)', 250, 300000, 50), field('range', 'Rango / radio AoE', 0, 40, 0.1), field('multiplier', 'Escalado de daño / efecto', 0, 20, 0.05), { ...field('durationMs', 'Duración (ms)', 0, 300000, 100), optional: true }, { ...field('slowMs', 'Slow (ms)', 0, 30000, 100), optional: true }],
  npcs: [{ key: 'name', label: 'Nombre', text: true }, { key: 'role', label: 'Rol visible', text: true }, field('x', 'X', -23, 23, 0.1), field('z', 'Z', -23, 23, 0.1), { key: 'dialogue', label: 'Diálogo', text: true }],
};

export async function showAdmin(host: HTMLElement, api: Api): Promise<void> {
  let config = await api<EditableConfig>('/api/admin/config');
  let section = 'OVERVIEW', dirty = false, players: Player[] = [];
  const selected: Record<Collection, number> = { monsters: 0, spots: 0, items: 0, skills: 0, npcs: 0 };
  host.innerHTML = `<section class="admin-shell"><aside class="admin-nav"><a class="admin-brand" href="/">ÉTER <small>WORLD CONTROL</small></a><nav>${sections.map(s => `<button data-section="${s}">${s}</button>`).join('')}</nav><a href="/">Volver al juego ↗</a></aside><main class="admin-main"><header class="admin-header"><div><span>ADMINISTRACIÓN</span><h1 id="admin-title">Overview</h1></div><div><span id="draft-state">Configuración cargada</span><button id="save-config">Guardar configuración</button></div></header><p class="admin-restart">Los cambios de contenido se guardan en SQLite y se aplican al reiniciar el servidor. Las herramientas de jugadores actúan de inmediato.</p><p id="error" role="status"></p><section id="admin-content"></section></main></section>`;
  const body = host.querySelector<HTMLElement>('#admin-content')!;
  const status = (message: string, error = false) => { const el = host.querySelector<HTMLElement>('#error')!; el.textContent = message; el.classList.toggle('failure', error); };
  const changed = () => { dirty = true; host.querySelector('#draft-state')!.textContent = 'Cambios sin guardar'; };
  const get = (path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], config);
  const set = (path: string, value: unknown) => {
    const keys = path.split('.'), last = keys.pop()!; let target = config as unknown as Record<string, unknown>;
    for (const key of keys) { target[key] ??= {}; target = target[key] as Record<string, unknown>; }
    if (value === undefined) delete target[last]; else target[last] = value; changed();
  };
  const inputs = (prefix: string, definitions: Field[]) => definitions.map(f => {
    const path = `${prefix}.${f.key}`, value = get(path);
    const options = f.key === 'monsterId' ? config.monsters.map(m => m.id) : f.options;
    return `<label class="admin-field"><span>${escape(f.label)}</span>${options ? `<select data-path="${path}" data-value-type="string">${f.optional ? '<option value="">Sin restricción</option>' : ''}${options.map(o => `<option value="${escape(o)}" ${o === value ? 'selected' : ''}>${escape(o)}</option>`).join('')}</select>` : `<input data-path="${path}" type="${f.text ? 'text' : 'number'}" value="${escape(value)}" ${f.text ? `maxlength="${f.key === 'dialogue' ? 500 : 60}"` : `min="${f.min}" max="${f.max}" step="${f.step}"`} ${f.optional ? '' : 'required'}>`}${f.help ? `<small>${escape(f.help)}</small>` : ''}</label>`;
  }).join('');
  const checkbox = (path: string, label: string) => `<label class="admin-check"><input type="checkbox" data-path="${path}" ${get(path) ? 'checked' : ''}> ${escape(label)}</label>`;
  const checklist = (path: string, label: string, allowInherited = false) => {
    const value = get(path) as string[] | undefined;
    return `<fieldset class="admin-checklist"><legend>${label}</legend>${allowInherited ? `<label><input type="checkbox" data-inherit="${path}" ${value === undefined ? 'checked' : ''}> Heredar tabla global</label>` : ''}${config.items.map(item => `<label><input type="checkbox" data-array="${path}" value="${item.id}" ${value?.includes(item.id) ? 'checked' : ''} ${allowInherited && value === undefined ? 'disabled' : ''}> ${escape(item.name)}</label>`).join('')}</fieldset>`;
  };
  const bindInputs = () => {
    body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-path]').forEach(input => input.addEventListener('input', () => {
      if (!input.checkValidity()) return;
      const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value === '' ? undefined : input instanceof HTMLInputElement && input.type === 'number' ? Number(input.value) : input.value;
      set(input.dataset.path!, value);
    }));
    body.querySelectorAll<HTMLInputElement>('[data-array]').forEach(input => input.addEventListener('change', () => {
      const path = input.dataset.array!; set(path, [...body.querySelectorAll<HTMLInputElement>(`[data-array="${path}"]:checked`)].map(i => i.value));
    }));
    body.querySelectorAll<HTMLInputElement>('[data-inherit]').forEach(input => input.addEventListener('change', () => { set(input.dataset.inherit!, input.checked ? undefined : []); void render(); }));
  };
  const showPlayers = async (developer: boolean) => {
    players = await api<Player[]>('/api/admin/players');
    body.innerHTML = `<div class="admin-section-heading"><div><h2>${developer ? 'Herramientas de desarrollo' : 'Personajes'}</h2><p>Inspección de personajes persistentes. Acciones sobre personajes conectados.</p></div><button id="refresh-players">Actualizar jugadores</button></div><input id="player-search" placeholder="Buscar por nombre o ID" aria-label="Buscar jugadores"><div id="player-table"></div><div id="player-detail"></div>${developer ? `<form id="admin-action" class="admin-fields"><label>Personaje<select id="admin-player">${players.filter(p => p.online).map(p => `<option value="${p.id}">${escape(p.name)} · Lv ${p.level}</option>`).join('')}</select></label><label>Acción<select id="admin-operation"><option value="teleport">Teleport</option><option value="crowns">Añadir / quitar Crowns</option><option value="ether">Añadir / quitar Éter</option><option value="level">Establecer nivel</option><option value="reset">Reset de prueba</option><option value="spawn">Spawn de monstruo</option><option value="heal">Curar</option><option value="mana">Restaurar mana</option></select></label><label>Cantidad<input id="admin-amount" type="number" min="-1000000" max="1000000" step="1" value="100"><small>Negativo resta monedas. Se rechaza saldo insuficiente.</small></label><label>X<input id="admin-x" type="number" min="-78" max="78" value="0" step=".1"></label><label>Z<input id="admin-z" type="number" min="-78" max="78" value="35" step=".1"></label><label>Monstruo<select id="admin-monster">${config.monsters.map(m => `<option value="${m.id}">${escape(m.name)}</option>`).join('')}</select></label><button type="submit" ${players.some(p => p.online) ? '' : 'disabled'}>Ejecutar acción</button><small>Las acciones quedan auditadas. Reset de prueba fuerza el nivel máximo antes de renacer.</small></form>` : ''}`;
    const table = () => {
      const query = (body.querySelector<HTMLInputElement>('#player-search')!.value).toLowerCase();
      body.querySelector('#player-table')!.innerHTML = `<table><thead><tr><th>Personaje</th><th>Clase</th><th>Nivel</th><th>Resets</th><th>Crowns</th><th>Éter</th><th>Estado</th></tr></thead><tbody>${players.filter(p => `${p.name} ${p.id}`.toLowerCase().includes(query)).map(p => `<tr data-player="${p.id}"><td><button>${escape(p.name)}</button></td><td>${p.classId}</td><td>${p.level}</td><td>${p.resets}</td><td>${p.crowns.toLocaleString('es-AR')}</td><td>${p.ether}</td><td>${p.online ? 'Conectado' : 'Offline'}</td></tr>`).join('')}</tbody></table>`;
      body.querySelectorAll<HTMLElement>('[data-player]').forEach(row => row.addEventListener('click', () => {
        const p = players.find(p => p.id === row.dataset.player)!;
        body.querySelector('#player-detail')!.innerHTML = `<article class="admin-inspect"><h3>${escape(p.name)}</h3><code>${p.id}</code><p>HP ${Math.round(p.hp)} · Mana ${Math.round(p.mana)} · (${p.x.toFixed(1)}, ${p.z.toFixed(1)})</p><p>${Object.entries(p.stats).map(([s, value]) => `${s}: ${value}`).join(' · ')}</p></article>`;
        const select = body.querySelector<HTMLSelectElement>('#admin-player'); if (select && p.online) select.value = p.id;
      }));
    };
    table(); body.querySelector('#player-search')!.addEventListener('input', table);
    body.querySelector('#refresh-players')!.addEventListener('click', () => { void showPlayers(developer); });
    body.querySelector('#admin-action')?.addEventListener('submit', async event => {
      event.preventDefault(); const value = (id: string) => (body.querySelector(`#${id}`) as HTMLInputElement).value;
      try { await api('/api/admin/action', 'POST', { characterId: value('admin-player'), operation: value('admin-operation'), amount: Number(value('admin-amount')), x: Number(value('admin-x')), z: Number(value('admin-z')), monsterId: value('admin-monster') }); status('Acción ejecutada y auditada.'); await showPlayers(developer); } catch (error) { status((error as Error).message, true); }
    });
  };
  const render = async () => {
    host.querySelector('#admin-title')!.textContent = section;
    host.querySelectorAll<HTMLElement>('[data-section]').forEach(button => { button.classList.toggle('selected', button.dataset.section === section); button.setAttribute('aria-current', button.dataset.section === section ? 'page' : 'false'); });
    if (section === 'OVERVIEW') {
      const overview = await api<{ players: number; monsters: number; uptime: number; audit: { operation: string; timestamp: number }[] }>('/api/admin/overview');
      body.innerHTML = `<div class="admin-cards">${[['Jugadores conectados', overview.players], ['Monstruos activos', overview.monsters], ['Spots habilitados', config.spots.filter(s => s.enabled).length], ['Contenido', `${config.items.length} items · ${config.skills.length} skills`]].map(([title, value]) => `<article><small>${title}</small><strong>${value}</strong></article>`).join('')}</div><article class="admin-info"><h2>Control del mundo</h2><p>Editá balance y contenido desde las secciones. Los cambios permanecen como borrador al navegar; Guardar valida el documento completo. Reiniciá después para aplicar el contenido coherentemente.</p><p>Servidor activo: ${Math.floor(overview.uptime / 60)} min. Ownership por defecto: ${config.balance.lootExclusiveMs / 1000}s. Probabilidad Éter: ${(config.balance.etherDropChance * 100).toFixed(1)}%.</p></article><h2>Acciones recientes</h2><div class="audit-list">${overview.audit.length ? overview.audit.map(a => `<p><time>${new Date(a.timestamp).toLocaleString()}</time><span>${escape(a.operation)}</span></p>`).join('') : '<p>No hay acciones registradas.</p>'}</div>`; return;
    }
    if (section === 'PLAYERS' || section === 'DEVELOPER TOOLS') { await showPlayers(section === 'DEVELOPER TOOLS'); return; }
    if (section === 'RAW CONFIG') {
      body.innerHTML = '<h2>Configuración avanzada</h2><p>Editor completo para usuarios avanzados. Usa la misma validación que los formularios.</p><textarea id="config-editor" spellcheck="false" aria-label="Configuración del juego"></textarea>';
      body.querySelector<HTMLTextAreaElement>('#config-editor')!.value = JSON.stringify(config, null, 2);
      body.querySelector('#config-editor')!.addEventListener('input', changed); return;
    }
    const collection = collectionSections[section];
    if (collection) {
      const entries = config[collection], index = Math.min(selected[collection], Math.max(0, entries.length - 1)); selected[collection] = index;
      const entry = entries[index];
      body.innerHTML = `<div class="admin-section-heading"><h2>${section}</h2><div>${collection === 'spots' ? '<button id="new-spot">Crear spot</button><button id="duplicate-spot">Duplicar</button><button id="delete-spot">Eliminar</button>' : ''}</div></div><div class="admin-browser"><aside><input id="content-search" placeholder="Buscar contenido" aria-label="Buscar contenido"><div id="content-list">${entries.map((e, i) => `<button data-entry="${i}" class="${i === index ? 'selected' : ''}"><strong>${escape('name' in e ? e.name : e.id)}</strong><small>${e.id}</small></button>`).join('')}</div></aside><article>${entry ? `<h3>${escape('name' in entry ? entry.name : entry.id)}</h3><code>${entry.id}</code><div class="admin-fields">${inputs(`${collection}.${index}`, fields[collection])}</div>${collection === 'spots' ? checkbox(`spots.${index}.enabled`, 'Spot habilitado') + '<p>Coordenadas del mismo mapa. La ciudad segura y los obstáculos no admiten spots.</p>' : collection === 'items' ? checkbox(`items.${index}.dropEligible`, 'Elegible para drops') + '<p>Las propiedades avanzadas y Suerte se preservan en las instancias. No se implementan upgrades en Goal #2.</p>' : collection === 'monsters' ? checklist(`monsters.${index}.drops.itemIds`, 'Tabla de drops', true) : collection === 'npcs' ? checklist(`npcs.${index}.shop`, 'Inventario de tienda') + '<p>Servicios por ID: Brom repara, Orin administra Sanctum, Kael transporta, Seraph informa habilidades y Maestro de Reset renace. El rol visible no cambia estas funciones.</p>' : ''}` : '<p>No hay entradas. Creá un spot para comenzar.</p>'}</article></div>`;
      body.querySelectorAll<HTMLElement>('[data-entry]').forEach(button => button.addEventListener('click', () => { selected[collection] = Number(button.dataset.entry); void render(); }));
      body.querySelector('#content-search')!.addEventListener('input', event => { const query = (event.target as HTMLInputElement).value.toLowerCase(); body.querySelectorAll<HTMLElement>('[data-entry]').forEach(b => { b.hidden = !b.textContent!.toLowerCase().includes(query); }); });
      const uniqueSpotId = () => { let i = 1; while (config.spots.some(s => s.id === `custom-${i}`)) i++; return `custom-${i}`; };
      body.querySelector('#new-spot')?.addEventListener('click', () => { config.spots.push({ id: uniqueSpotId(), monsterId: config.monsters[0].id, region: 'Greenfields', enabled: true, x: 8, z: 38, radius: 5, count: 4, respawnMs: 15000 }); selected.spots = config.spots.length - 1; changed(); void render(); });
      body.querySelector('#duplicate-spot')?.addEventListener('click', () => { if (!entry) return; config.spots.push({ ...config.spots[index], id: uniqueSpotId() }); selected.spots = config.spots.length - 1; changed(); void render(); });
      body.querySelector('#delete-spot')?.addEventListener('click', () => { if (!entry) return; config.spots.splice(index, 1); selected.spots = Math.max(0, index - 1); changed(); void render(); });
      if (collection === 'items' && entry) {
        body.querySelector('.admin-browser article')!.insertAdjacentHTML('beforeend', `<details class="admin-properties"><summary>Propiedades preparadas para sistemas futuros</summary><p>Datos de nuevas instancias. No activan upgrades, Luck, crítico ni bonus adicionales en Goal #2; base y afinidad siguen funcionando.</p><div class="admin-fields">${inputs(`items.${index}.properties`, [...propertyFields, { key: 'grantedSkill', label: 'Skill reservada', options: config.skills.map(s => s.id), optional: true }])}</div></details>`);
      }
      bindInputs(); return;
    }
    body.innerHTML = `<h2>${section}</h2><div class="admin-fields">${section === 'WORLD' ? inputs('balance', [field('dayNightCycleDuration', 'Ciclo día/noche (ms)', 10000, 86400000, 1000)]) + inputs('world.spawn', [field('x', 'Spawn X', -23, 23, 0.1), field('z', 'Spawn Z', -23, 23, 0.1)]) : inputs('balance', fields[section])}</div>`;
    bindInputs();
  };
  host.querySelectorAll<HTMLElement>('[data-section]').forEach(button => button.addEventListener('click', () => {
    if (section === 'RAW CONFIG') { try { config = JSON.parse(body.querySelector<HTMLTextAreaElement>('#config-editor')!.value); } catch { status('JSON inválido. Corregí el documento antes de cambiar de sección.', true); return; } }
    section = button.dataset.section!; void render().catch(error => status(error.message, true));
  }));
  host.querySelector('#save-config')!.addEventListener('click', async () => {
    const invalid = body.querySelector<HTMLInputElement>('input:invalid'); if (invalid) { invalid.reportValidity(); return; }
    try {
      if (section === 'RAW CONFIG') config = JSON.parse(body.querySelector<HTMLTextAreaElement>('#config-editor')!.value);
      const result = await api<{ message: string }>('/api/admin/config', 'PUT', config);
      dirty = false; status(result.message); host.querySelector('#draft-state')!.textContent = 'Guardado · pendiente de reinicio';
    } catch (error) { status((error as Error).message, true); }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  await render();
}
