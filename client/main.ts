import './style.css';
import { balance, classes, equipmentSlots, formulas, items, monsters, npcs, skills, spots, type ClassId, type Slot } from '../shared/content';
import type { Character, ItemInstance, Point } from '../shared/model';
import { distance, world } from '../shared/world';
import type { Action } from '../shared/protocol';
import { Scene, type VisibleEntity, type VisibleLoot } from './scene';

const app = document.querySelector<HTMLElement>('#app')!;
interface Account { id: string; username: string; admin: boolean }
interface Snapshot { type: 'state'; now: number; self: Character; cooldowns: Record<string, number>; buffs: Record<string, number>; players: VisibleEntity[]; monsters: VisibleEntity[]; loot: VisibleLoot[] }
let account: Account | undefined, scene: Scene | undefined, ws: WebSocket | undefined, snapshot: Snapshot | undefined;
let modal = '', npcId = '', selectedSkill = '', pendingPickup: string | undefined, pendingNpc: string | undefined;
let inventorySignature = '', panelSignature = '', muted = localStorage.getItem('eter-muted') !== 'false';
let audio: AudioContext | undefined;
// Opt-in read-only diagnostics used by production acceptance tests and local profiling.
if (new URLSearchParams(location.search).has('diagnostics')) {
  Object.defineProperty(window, 'eterDiagnostics', { value: (point?: Point) => scene?.diagnostics(point) });
}
const slotNames: Record<Slot, string> = { helmet: 'Casco', armor: 'Armadura', pants: 'Pantalón', gloves: 'Guantes', boots: 'Botas', weapon: 'Arma', offhand: 'Escudo / secundaria', wings: 'Alas', necklace: 'Collar', ring1: 'Anillo I', ring2: 'Anillo II' };
const statNames = { strength: 'Fuerza', agility: 'Agilidad', vitality: 'Vitalidad', energy: 'Energía' };
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Error de conexión.');
  return data;
}
function htmlText(value: string): string { const element = document.createElement('span'); element.textContent = value; return element.innerHTML; }
function notice(message: string): void {
  const host = document.querySelector('#notices');
  if (!host) { const error = document.querySelector<HTMLElement>('#error'); if (error) error.textContent = message; return; }
  const element = document.createElement('div'); element.className = 'notice'; element.textContent = message; host.append(element); setTimeout(() => element.remove(), 5500);
}
function sound(kind: string): void {
  if (muted) return;
  try { audio ??= new AudioContext(); void audio.resume(); const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(kind === 'pickup' ? 660 : kind === 'magic' ? 440 : 160, audio.currentTime); oscillator.frequency.exponentialRampToValueAtTime(kind === 'pickup' ? 880 : 80, audio.currentTime + 0.12); gain.gain.setValueAtTime(0.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.16); } catch { /* Audio is optional; gameplay continues. */ }
}
function send(action: Action): void { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(action)); else notice('No hay conexión con el servidor.'); }
function authScreen(): void {
  scene?.destroy(); scene = undefined; snapshot = undefined; ws?.close(); ws = undefined;
  app.innerHTML = `<section class="entry"><div class="entry-art"><div class="entry-crystal">◇</div><span class="eyebrow">UN MUNDO POR DESCUBRIR</span><h1>ÉTER</h1><p>La luz de Aurelia te espera.</p><div class="entry-regions">AURELIA · GREENFIELDS · WHISPERWOOD</div></div><div class="entry-card"><span class="eyebrow">CRÓNICAS DE AURELIA</span><h2>Comienza tu viaje</h2><p>Un reino de piedra, hojas y energía ancestral.</p><form id="auth"><label>Usuario<input name="username" autocomplete="username" required minlength="3" maxlength="24"></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><div class="auth-actions"><button type="submit" name="login">Entrar</button><button type="submit" name="register" class="secondary">Crear cuenta</button></div><p id="error" role="alert"></p><small>Para registrarte, usá al menos 10 caracteres en la contraseña.</small></form><div class="entry-foot">MMORPG 3D · Multiplayer persistente</div></div></section>`;
  document.querySelector<HTMLFormElement>('#auth')!.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement, data = new FormData(form);
    const path = (event as SubmitEvent).submitter?.getAttribute('name') === 'register' ? '/api/register' : '/api/login';
    form.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { const response = await api<{ account: Account }>(path, 'POST', { username: data.get('username'), password: data.get('password') }); account = response.account; await charactersScreen(); }
    catch (error) { notice((error as Error).message); form.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  });
}
async function charactersScreen(): Promise<void> {
  scene?.destroy(); scene = undefined; ws?.close(); ws = undefined; snapshot = undefined;
  const result = await api<{ account: Account; characters: Character[] }>('/api/me'); account = result.account;
  app.innerHTML = `<section class="selection"><header><div><span class="eyebrow">TU HISTORIA COMIENZA AQUÍ</span><h1>ÉTER</h1></div><button id="logout" class="secondary">Cerrar sesión</button></header><div class="selection-columns"><section><h2>Tus personajes</h2><div class="character-list">${result.characters.length ? result.characters.map(c => `<button class="character-card" data-character="${c.id}"><span class="class-emblem">${c.classId === 'VANGUARD' ? '⚔' : c.classId === 'ARCANIST' ? '✧' : '➶'}</span><span><strong>${htmlText(c.name)}</strong><small>${classes[c.classId].name} · Nivel ${c.level} · ${c.resets} resets</small></span><span>Entrar →</span></button>`).join('') : '<p>No tenés personajes todavía. Elegí tu camino.</p>'}</div></section><section class="create-card"><span class="eyebrow">NUEVO PERSONAJE</span><h2>Elegí tu camino</h2><form id="create"><label>Nombre<input name="name" required minlength="3" maxlength="20" autocomplete="off"></label><div class="class-options">${Object.entries(classes).map(([id, c], i) => `<label class="class-choice"><input type="radio" name="classId" value="${id}" ${i === 0 ? 'checked' : ''}><strong>${c.name}</strong><small>${id === 'VANGUARD' ? 'Guerrero · Fuerza y resistencia' : id === 'ARCANIST' ? 'Mago · Dominio del Éter' : 'Arquera · Agilidad y precisión'}</small></label>`).join('')}</div><button type="submit">Crear personaje</button><p id="error" role="alert"></p></form></section></div></section>`;
  document.querySelector('#logout')!.addEventListener('click', () => { void logout(); });
  document.querySelectorAll<HTMLButtonElement>('[data-character]').forEach(button => button.addEventListener('click', () => { void enter(button.dataset.character!); }));
  document.querySelector<HTMLFormElement>('#create')!.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement, data = new FormData(form);
    try { await api('/api/characters', 'POST', { name: data.get('name'), classId: data.get('classId') }); await charactersScreen(); } catch (error) { notice((error as Error).message); }
  });
}
async function logout(): Promise<void> { await api('/api/logout', 'POST'); account = undefined; if (location.pathname === '/admin') location.href = '/'; else authScreen(); }
async function enter(characterId: string): Promise<void> {
  const content = await api<Record<string, unknown>>('/api/content');
  Object.assign(balance, content.balance); Object.assign(classes, content.classes);
  for (const [local, remote] of [[items, content.items], [monsters, content.monsters], [npcs, content.npcs], [skills, content.skills], [spots, content.spots]] as [unknown[], unknown[]][]) local.splice(0, local.length, ...remote);
  modal = ''; npcId = ''; selectedSkill = ''; pendingPickup = undefined; pendingNpc = undefined; inventorySignature = ''; panelSignature = '';
  app.innerHTML = `<section class="game"><div id="viewport"></div><div id="labels"></div><header class="game-header"><div class="brand">ÉTER <span id="location">Aurelia</span></div><div class="top-tools"><button id="names-toggle" class="small">Loot: ON</button><button id="options-button" class="small">Opciones</button><button id="characters-button" class="small">Personajes</button>${account?.admin ? '<a href="/admin" target="_blank" class="admin-link">Admin ↗</a>' : ''}</div></header><aside class="minimap-box"><canvas id="minimap" width="180" height="180"></canvas><div id="coordinates"></div><small>N ↑ · Rueda: zoom</small></aside><div class="guide"><span>CLIC PARA CAMINAR</span>Enemigo: atacar · Objeto: recoger · NPC: conversar</div><aside id="target-info"></aside><div id="notices" role="status"></div><div id="panel" class="panel hidden"></div><footer class="hud"><div class="vitals"><div class="portrait" id="class-icon">⚔</div><div class="vital-bars"><strong id="character-name"></strong><div class="bar hp"><span id="hp-fill"></span><b id="hp-label"></b></div><div class="bar mana"><span id="mana-fill"></span><b id="mana-label"></b></div></div></div><div class="skills" id="skills"></div><div class="hud-right"><div class="wallet"><span id="crowns"></span><span id="ether"></span></div><div class="hud-buttons"><button id="inventory-button">Inventario <kbd>I</kbd></button><button id="stats-button">Stats <kbd>C</kbd></button></div><div class="potions"><button id="hp-potion">Vida <kbd>Q</kbd> <span></span></button><button id="mana-potion">Mana <kbd>W</kbd> <span></span></button></div></div><div class="experience"><span id="xp-fill"></span><b id="xp-label"></b></div></footer></section>`;
  scene = new Scene(document.querySelector('#viewport')!, document.querySelector('#labels')!);
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?characterId=${encodeURIComponent(characterId)}`);
  const connection = ws, activeScene = scene;
  ws.addEventListener('message', event => {
    if (ws !== connection || scene !== activeScene) return;
    const data = JSON.parse(event.data) as Snapshot & { message?: string; kind: string; x: number; z: number; amount?: number; admin: boolean };
    if (data.type === 'state') {
      snapshot = data; updateHud(); scene?.sync(data.players, data.monsters, data.loot, data.self.id, data.now);
      if (pendingPickup) { const drop = data.loot.find(d => d.id === pendingPickup); if (!drop) pendingPickup = undefined; else if (distance(data.self, drop) < balance.pickupRange) { send({ type: 'pickup', lootId: drop.id }); pendingPickup = undefined; } }
      if (pendingNpc) { const npc = npcs.find(n => n.id === pendingNpc)!; if (distance(data.self, npc) < 4.5) { npcId = pendingNpc; pendingNpc = undefined; openPanel('npc'); } }
    } else if ((data as { type: string }).type === 'notice') notice(data.message!);
    else if ((data as { type: string }).type === 'effect') { scene?.effect(data); sound(data.kind); }
  });
  ws.addEventListener('close', () => { if (ws === connection && scene === activeScene) notice('Conexión cerrada. Volvé a Personajes para reconectar.'); });
  ws.addEventListener('error', () => { if (ws === connection) notice('No se pudo conectar al mundo.'); });
  document.querySelector('#characters-button')!.addEventListener('click', () => { void charactersScreen(); });
  document.querySelector('#inventory-button')!.addEventListener('click', () => openPanel('inventory'));
  document.querySelector('#stats-button')!.addEventListener('click', () => openPanel('stats'));
  document.querySelector('#options-button')!.addEventListener('click', () => openPanel('options'));
  document.querySelector('#names-toggle')!.addEventListener('click', () => toggleNames());
  document.querySelector('#hp-potion')!.addEventListener('click', () => send({ type: 'potion', kind: 'hp' }));
  document.querySelector('#mana-potion')!.addEventListener('click', () => send({ type: 'potion', kind: 'mana' }));
  function interact(hit: { kind: string; id?: string; point: Point }): void {
    if (!snapshot) return;
    if (hit.kind === 'monster') { scene!.selected = hit.id; if (selectedSkill) executeSkill(selectedSkill, hit.id); else send({ type: 'attack', targetId: hit.id! }); }
    else if (hit.kind === 'loot') { const drop = snapshot.loot.find(d => d.id === hit.id)!; if (distance(snapshot.self, drop) < balance.pickupRange) send({ type: 'pickup', lootId: drop.id }); else { pendingPickup = drop.id; send({ type: 'move', x: drop.x, z: drop.z }); } }
    else if (hit.kind === 'npc') { const npc = npcs.find(n => n.id === hit.id)!; if (distance(snapshot.self, npc) < 4.5) { npcId = npc.id; openPanel('npc'); } else { pendingNpc = npc.id; send({ type: 'move', x: npc.x, z: npc.z + 2 }); } }
    else if (hit.kind === 'ground') { pendingPickup = undefined; pendingNpc = undefined; if (selectedSkill && skills.find(s => s.id === selectedSkill)?.kind === 'blink') executeSkill(selectedSkill, undefined, hit.point); else { send({ type: 'move', ...hit.point }); scene?.destination(hit.point); } }
  }
  scene.renderer.domElement.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const hit = scene?.pick(event.clientX, event.clientY); if (hit) interact(hit);
  });
  document.querySelector('#labels')!.addEventListener('click', event => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-entity-id]');
    if (!element || !snapshot) return;
    const id = element.dataset.entityId!;
    if (element.classList.contains('loot-label')) { const drop = snapshot.loot.find(d => d.id === id); if (drop) interact({ kind: 'loot', id, point: drop }); }
    else if (element.classList.contains('monster-label')) { const monster = snapshot.monsters.find(m => m.id === id); if (monster) interact({ kind: 'monster', id, point: monster }); }
    else if (element.classList.contains('npc-label')) { const npc = npcs.find(n => `npc-${n.id}` === id); if (npc) interact({ kind: 'npc', id: npc.id, point: npc }); }
  });
}
function toggleNames(): void { if (!scene) return; scene.showLootNames = !scene.showLootNames; document.querySelector('#names-toggle')!.textContent = `Loot: ${scene.showLootNames ? 'ON' : 'OFF'}`; }
function executeSkill(skillId: string, targetId = scene?.selected, point?: Point): void { selectedSkill = skillId; send({ type: 'skill', skillId, targetId, point }); }
function updateHud(): void {
  if (!snapshot) return; const c = snapshot.self, maxHp = formulas.maxHp(c.stats), maxMana = formulas.maxMana(c.stats);
  document.querySelector('#character-name')!.textContent = `${c.name} · ${classes[c.classId].name} · Nivel ${c.level}`;
  document.querySelector('#class-icon')!.textContent = c.classId === 'VANGUARD' ? '⚔' : c.classId === 'ARCANIST' ? '✧' : '➶';
  document.querySelector<HTMLElement>('#hp-fill')!.style.width = `${c.hp / maxHp * 100}%`; document.querySelector('#hp-label')!.textContent = `${Math.ceil(c.hp)} / ${maxHp} HP`;
  document.querySelector<HTMLElement>('#mana-fill')!.style.width = `${c.mana / maxMana * 100}%`; document.querySelector('#mana-label')!.textContent = `${Math.floor(c.mana)} / ${maxMana} Mana`;
  document.querySelector('#crowns')!.textContent = `◉ ${c.crowns} Crowns`; document.querySelector('#ether')!.textContent = `◇ ${c.ether} Éter`;
  const region = Math.abs(c.x) <= 23 && Math.abs(c.z) <= 23 ? 'Aurelia · Zona segura' : c.z > 23 && c.x > -30 && c.x < 35 ? 'Greenfields' : c.x < -23 ? 'Whisperwood' : c.z < -23 ? 'Ether Ruins' : 'Stonepass';
  document.querySelector('#location')!.textContent = region; document.querySelector('#coordinates')!.textContent = `${region.split(' · ')[0]} (${Math.round(c.x)}, ${Math.round(c.z)})`;
  const xp = c.level === balance.maxLevel ? 100 : c.xp / formulas.experienceForLevel(c.level) * 100;
  document.querySelector<HTMLElement>('#xp-fill')!.style.width = `${xp}%`; document.querySelector('#xp-label')!.textContent = `EXP ${c.xp} / ${c.level === balance.maxLevel ? 'MAX' : formulas.experienceForLevel(c.level)} · Reset ${c.resets}`;
  document.querySelector('#hp-potion span')!.textContent = String(c.inventory.filter(i => i.definitionId === 'hp-potion').length); document.querySelector('#mana-potion span')!.textContent = String(c.inventory.filter(i => i.definitionId === 'mana-potion').length);
  const skillHost = document.querySelector('#skills')!;
  if (!skillHost.children.length) {
    skillHost.innerHTML = `<button class="skill normal" title="Ataque normal · clic sobre enemigo"><kbd>0</kbd><span>⚔</span><small>Normal</small></button>${skills.filter(s => s.classId === c.classId).map((s, index) => `<button class="skill" data-skill="${s.id}" title="${s.name} · ${s.mana} mana"><kbd>${index + 1}</kbd><span>${['✦', '◎', '➶', '✧'][index]}</span><small>${s.name}</small><em>${s.mana} MP</em><b class="cooldown"></b></button>`).join('')}`;
    skillHost.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach(button => button.addEventListener('click', () => executeSkill(button.dataset.skill!)));
    skillHost.querySelector('.normal')!.addEventListener('click', () => { selectedSkill = ''; if (scene?.selected) send({ type: 'attack', targetId: scene.selected }); });
  }
  skillHost.querySelectorAll<HTMLElement>('[data-skill]').forEach(button => { const id = button.dataset.skill!, remaining = Math.max(0, (snapshot!.cooldowns[id] ?? 0) - snapshot!.now); button.classList.toggle('active', selectedSkill === id); button.classList.toggle('cooling', remaining > 0); button.querySelector('.cooldown')!.textContent = remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : ''; });
  const target = snapshot.monsters.find(m => m.id === scene?.selected && m.hp > 0), targetHost = document.querySelector('#target-info')!;
  targetHost.textContent = target ? `${monsters.find(m => m.id === target.definitionId)!.name} · HP ${Math.ceil(target.hp)}` : '';
  drawMinimap();
  const signature = JSON.stringify([c.inventory, c.equipment, c.sanctum]);
  const statsSignature = JSON.stringify([c.stats, c.freePoints, c.resets, c.level, c.crowns]);
  if (modal && (signature !== inventorySignature || statsSignature !== panelSignature)) renderPanel();
  inventorySignature = signature; panelSignature = statsSignature;
}
function drawMinimap(): void {
  if (!snapshot) return; const canvas = document.querySelector<HTMLCanvasElement>('#minimap')!, ctx = canvas.getContext('2d')!;
  const project = (value: number) => (value + world.halfSize) / (world.halfSize * 2) * 180;
  ctx.fillStyle = '#567452'; ctx.fillRect(0, 0, 180, 180); ctx.fillStyle = '#687e5c'; ctx.fillRect(0, 65, 65, 75); ctx.fillStyle = '#908d7c'; ctx.fillRect(125, 50, 55, 70); ctx.fillStyle = '#688187'; ctx.fillRect(60, 0, 60, 58);
  ctx.fillStyle = '#ccc5a9'; ctx.fillRect(project(-23), project(-23), 52, 52); ctx.fillStyle = '#bdae8a'; ctx.fillRect(87, 0, 6, 180); ctx.fillRect(0, 87, 180, 6);
  ctx.font = '8px sans-serif'; ctx.fillStyle = '#faf0d0'; ctx.fillText('AURELIA', 70, 87); ctx.fillText('GREENFIELDS', 70, 157); ctx.fillText('WHISPERWOOD', 4, 65); ctx.fillText('STONEPASS', 125, 124); ctx.fillText('RUINS', 74, 20);
  for (const npc of npcs) { ctx.fillStyle = '#f3d58e'; ctx.fillRect(project(npc.x) - 1, project(npc.z) - 1, 3, 3); }
  for (const spot of spots) { ctx.strokeStyle = '#ad6a53'; ctx.beginPath(); ctx.arc(project(spot.x), project(spot.z), Math.max(2, spot.radius), 0, Math.PI * 2); ctx.stroke(); }
  for (const p of snapshot.players) { ctx.fillStyle = p.id === snapshot.self.id ? '#ffffff' : '#89d8ed'; ctx.beginPath(); ctx.arc(project(p.x), project(p.z), p.id === snapshot.self.id ? 3 : 2, 0, Math.PI * 2); ctx.fill(); }
}
function itemTitle(item: ItemInstance): string {
  const def = items.find(d => d.id === item.definitionId)!;
  return `${def.name}\n${def.width}×${def.height}${def.damage ? ` · Daño ${def.damage}` : ''}${def.defense ? ` · Defensa ${def.defense}` : ''}\n${Object.entries(def.requirements ?? {}).map(([stat, value]) => `${statNames[stat as keyof typeof statNames]} ${value}`).join(', ')}${def.affinity ? `\nAfinidad ${classes[def.affinity].name}: +${Math.round((def.affinityBonus ?? 0) * 100)}%` : ''}${def.durability ? `\nDurabilidad ${item.durability.toFixed(1)} / ${def.durability}` : ''}`;
}
function grid(collection: ItemInstance[], container: 'inventory' | 'sanctum'): string {
  return `<div class="inventory-grid" data-container="${container}">${collection.map(item => {
    const def = items.find(d => d.id === item.definitionId)!;
    return `<button draggable="true" class="item ${def.consumable ?? ''}" data-item="${item.id}" data-container="${container}" title="${htmlText(itemTitle(item))}" style="left:${item.x * 36}px;top:${item.y * 36}px;width:${def.width * 36 - 3}px;height:${def.height * 36 - 3}px;border-color:#${def.color.toString(16).padStart(6, '0')}"><span>${def.consumable ? '♜' : def.slot === 'weapon' ? '⚔' : '♢'}</span><small>${htmlText(def.name)}</small>${def.durability ? `<em>${Math.round(item.durability)}%</em>` : ''}</button>`;
  }).join('')}</div>`;
}
function openPanel(kind: string): void { modal = modal === kind && kind !== 'npc' ? '' : kind; renderPanel(); }
function renderPanel(): void {
  const host = document.querySelector<HTMLElement>('#panel'); if (!host || !snapshot) return;
  host.classList.toggle('hidden', !modal); if (!modal) return;
  const c = snapshot.self;
  let title = '', content = '';
  if (modal === 'inventory') {
    title = 'Inventario y equipamiento'; content = `<div class="inventory-layout"><section><h3>Mochila · 8 × 8</h3>${grid(c.inventory, 'inventory')}<small>Arrastrá para ordenar o equipar. Doble clic para equipar.</small></section><section><h3>Equipamiento</h3><div class="equipment">${equipmentSlots.map(slot => { const item = c.equipment[slot]; return `<button data-slot="${slot}" title="${item ? htmlText(itemTitle(item)) : slotNames[slot]}"><small>${slotNames[slot]}</small><strong>${item ? htmlText(items.find(i => i.id === item.definitionId)!.name) : '—'}</strong>${item ? `<em>${Math.floor(item.durability)} dur.</em>` : ''}</button>`; }).join('')}</div><small>Clic en slot ocupado: desequipar.</small></section></div>`;
  } else if (modal === 'stats') {
    title = 'Tu personaje'; content = `<p>${htmlText(c.name)} · ${classes[c.classId].name} · Nivel ${c.level}</p><p class="points">${c.freePoints} puntos disponibles · ${c.resets} resets</p><div class="stats-list">${Object.entries(statNames).map(([stat, name]) => `<div><span>${name}</span><strong>${c.stats[stat as keyof typeof c.stats]}</strong><button data-stat="${stat}" ${c.freePoints < 1 ? 'disabled' : ''}>+1</button><button data-stat="${stat}" data-amount="5" ${c.freePoints < 5 ? 'disabled' : ''}>+5</button></div>`).join('')}</div><p>Daño físico ${formulas.physicalDamage(c.stats).toFixed(1)} · Daño mágico ${formulas.magicDamage(c.stats).toFixed(1)}<br>Defensa ${formulas.defense(c.stats).toFixed(1)} · Ataque cada ${(formulas.attackCooldownMs(c.stats) / 1000).toFixed(2)}s</p><small>Los requisitos dependen de tus stats. La afinidad aporta un bonus sin bloquear builds híbridas.</small>`;
  } else if (modal === 'npc') {
    const npc = npcs.find(n => n.id === npcId)!; title = `${npc.name} · ${npc.role}`;
    content = `<p>${npc.dialogue}</p>`;
    if (npc.shop.length) content += `<div class="shop">${npc.shop.map(id => { const def = items.find(i => i.id === id)!; return `<div><span>${def.name}<small>${def.width}×${def.height}${def.requirements ? ' · ' + Object.entries(def.requirements).map(([s, v]) => `${statNames[s as keyof typeof statNames]} ${v}`).join(', ') : ''}</small></span><button data-buy="${id}" ${c.crowns < def.price ? 'disabled' : ''}>${def.price} ◉</button></div>`; }).join('')}</div><h3>Vender objetos</h3><div class="sell-list">${c.inventory.map(i => `<button data-sell="${i.id}">${items.find(d => d.id === i.definitionId)!.name} · ${Math.floor(items.find(d => d.id === i.definitionId)!.price * 0.3)} ◉</button>`).join('')}</div>`;
    if (npc.id === 'brom') content += '<button id="repair">Reparar todo el equipo</button>';
    if (npc.id === 'orin') content += `<div class="inventory-layout"><section><h3>Inventario</h3>${grid(c.inventory, 'inventory')}</section><section><h3>Sanctum</h3>${grid(c.sanctum, 'sanctum')}</section></div><small>Doble clic para depositar o retirar. Arrastrá dentro de cada cuadrícula para ordenar.</small>`;
    if (npc.id === 'kael') content += '<button id="teleport">Volver al centro de Aurelia</button><p>Otros destinos se habilitarán en el futuro.</p>';
    if (npc.id === 'seraph') content += `<ul>${skills.filter(s => s.classId === c.classId).map(s => `<li>${s.name} · ${s.mana} MP · ${s.cooldownMs / 1000}s · disponible</li>`).join('')}</ul>`;
    if (npc.id === 'reset-master') content += `<p>Requiere nivel ${balance.maxLevel}. Conservás inventario, equipo, Sanctum y recursos. Cada reset otorga ${balance.resetBonusPoints} puntos permanentes.</p><button id="reset" ${c.level !== balance.maxLevel ? 'disabled' : ''}>Realizar reset</button>`;
  } else if (modal === 'options') {
    title = 'Opciones'; content = `<label class="option"><input id="option-names" type="checkbox" ${scene?.showLootNames ? 'checked' : ''}> Mostrar nombres de objetos en el suelo</label><label class="option"><input id="option-audio" type="checkbox" ${!muted ? 'checked' : ''}> Sonidos originales sintetizados</label>${account?.admin ? `<label class="option"><input id="option-ids" type="checkbox" ${scene?.showIds ? 'checked' : ''}> Mostrar IDs de entidades</label>` : ''}<p>Movimiento: clic izquierdo<br>Skills: 1–4 · Ataque normal: 0<br>Pociones: Q / W · Inventario: I · Stats: C<br>Zoom: rueda · Cerrar panel: Esc</p><button id="logout">Cerrar sesión</button>`;
  }
  host.innerHTML = `<header><h2>${title}</h2><button id="panel-close" class="secondary">✕</button></header>${content}`;
  host.querySelector('#panel-close')!.addEventListener('click', () => { modal = ''; renderPanel(); });
  host.querySelectorAll<HTMLElement>('[data-stat]').forEach(button => button.addEventListener('click', () => send({ type: 'stat', stat: button.dataset.stat as keyof typeof statNames, amount: Number(button.dataset.amount ?? 1) })));
  host.querySelectorAll<HTMLElement>('[data-buy]').forEach(button => button.addEventListener('click', () => send({ type: 'buy', npcId, itemId: button.dataset.buy! })));
  host.querySelectorAll<HTMLElement>('[data-sell]').forEach(button => button.addEventListener('click', () => send({ type: 'sell', npcId, itemId: button.dataset.sell! })));
  host.querySelector('#repair')?.addEventListener('click', () => send({ type: 'repair' })); host.querySelector('#reset')?.addEventListener('click', () => send({ type: 'reset' })); host.querySelector('#teleport')?.addEventListener('click', () => send({ type: 'teleport', destination: 'Aurelia' }));
  host.querySelector('#logout')?.addEventListener('click', () => { void logout(); });
  host.querySelector('#option-names')?.addEventListener('change', () => toggleNames());
  host.querySelector('#option-audio')?.addEventListener('change', event => { muted = !(event.target as HTMLInputElement).checked; localStorage.setItem('eter-muted', String(muted)); });
  host.querySelector('#option-ids')?.addEventListener('change', event => { scene!.showIds = (event.target as HTMLInputElement).checked; });
  host.querySelectorAll<HTMLElement>('[data-item]').forEach(button => {
    button.addEventListener('dragstart', event => { (event as DragEvent).dataTransfer!.setData('text/plain', JSON.stringify({ itemId: button.dataset.item, container: button.dataset.container })); });
    button.addEventListener('dblclick', () => {
      const itemId = button.dataset.item!, container = button.dataset.container!;
      if (modal === 'npc' && npcId === 'orin') send({ type: 'store', itemId, direction: container === 'inventory' ? 'deposit' : 'withdraw' });
      else { const item = c.inventory.find(i => i.id === itemId)!; const def = items.find(d => d.id === item.definitionId)!; if (def.consumable) send({ type: 'potion', kind: def.consumable }); else if (def.slot) send({ type: 'equip', itemId, slot: def.slot }); }
    });
  });
  host.querySelectorAll<HTMLElement>('.inventory-grid').forEach(element => {
    element.addEventListener('dragover', event => event.preventDefault());
    element.addEventListener('drop', event => {
      event.preventDefault(); const drag = event as DragEvent; const data = JSON.parse(drag.dataTransfer!.getData('text/plain')) as { itemId: string; container: string }; const container = element.dataset.container as 'inventory' | 'sanctum';
      if (container !== data.container) { send({ type: 'store', itemId: data.itemId, direction: container === 'sanctum' ? 'deposit' : 'withdraw' }); return; }
      const rect = element.getBoundingClientRect(); send({ type: 'inventory-move', itemId: data.itemId, container, x: Math.floor((drag.clientX - rect.left) / 36), y: Math.floor((drag.clientY - rect.top) / 36) });
    });
  });
  host.querySelectorAll<HTMLElement>('[data-slot]').forEach(button => {
    button.addEventListener('click', () => send({ type: 'unequip', slot: button.dataset.slot as Slot })); button.addEventListener('dragover', event => event.preventDefault());
    button.addEventListener('drop', event => { event.preventDefault(); const data = JSON.parse((event as DragEvent).dataTransfer!.getData('text/plain')) as { itemId: string }; send({ type: 'equip', itemId: data.itemId, slot: button.dataset.slot as Slot }); });
  });
}
window.addEventListener('keydown', event => {
  if (!snapshot || !scene || (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
  const key = event.key.toLowerCase();
  if (key === 'i') openPanel('inventory'); else if (key === 'c') openPanel('stats'); else if (key === 'escape') { modal = ''; selectedSkill = ''; renderPanel(); }
  else if (key === 'q' || key === 'w') send({ type: 'potion', kind: key === 'q' ? 'hp' : 'mana' });
  else if (key === '0') { selectedSkill = ''; if (scene.selected) send({ type: 'attack', targetId: scene.selected }); }
  else if (['1', '2', '3', '4'].includes(key)) executeSkill(skills.filter(s => s.classId === snapshot!.self.classId)[Number(key) - 1].id);
});
async function adminScreen(): Promise<void> {
  const config = await api<unknown>('/api/admin/config'), me = await api<{ account: Account }>('/api/me'); account = me.account;
  app.innerHTML = `<section class="admin-page"><header><h1>Éter · Administración</h1><a href="/">Volver al juego</a></header><p>La configuración se valida y persiste en SQLite. Guardá y reiniciá el servidor para aplicar cambios de spots y balance de forma segura.</p><form id="admin-config"><textarea id="config-editor" spellcheck="false" aria-label="Configuración del juego"></textarea><button>Guardar configuración</button></form><section><h2>Herramientas de desarrollo</h2><button id="refresh-players">Actualizar jugadores</button><form id="admin-action"><label>Personaje<select id="admin-player"></select></label><label>Acción<select id="admin-operation"><option value="teleport">Teleport</option><option value="crowns">Añadir Crowns</option><option value="ether">Añadir Éter</option><option value="level">Establecer nivel</option><option value="reset">Reset de prueba</option><option value="spawn">Spawn de monstruo</option></select></label><label>Cantidad / nivel<input id="admin-amount" type="number" value="100"></label><label>X<input id="admin-x" type="number" value="0"></label><label>Z<input id="admin-z" type="number" value="35"></label><label>Monstruo<select id="admin-monster">${monsters.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select></label><button>Ejecutar</button></form></section><p id="error" role="status"></p></section>`;
  document.querySelector<HTMLTextAreaElement>('#config-editor')!.value = JSON.stringify(config, null, 2);
  async function refresh(): Promise<void> { const players = await api<{ id: string; name: string; level: number }[]>('/api/admin/players'); document.querySelector('#admin-player')!.innerHTML = players.map(p => `<option value="${p.id}">${htmlText(p.name)} · ${p.level} [${p.id.slice(0, 8)}]</option>`).join(''); }
  await refresh(); document.querySelector('#refresh-players')!.addEventListener('click', () => { void refresh(); });
  document.querySelector<HTMLFormElement>('#admin-config')!.addEventListener('submit', async event => { event.preventDefault(); try { const result = await api<{ message: string }>('/api/admin/config', 'PUT', JSON.parse(document.querySelector<HTMLTextAreaElement>('#config-editor')!.value)); notice(result.message); } catch (error) { notice((error as Error).message); } });
  document.querySelector<HTMLFormElement>('#admin-action')!.addEventListener('submit', async event => { event.preventDefault(); const value = (id: string) => (document.querySelector(`#admin-${id}`) as HTMLInputElement | HTMLSelectElement).value; try { await api('/api/admin/action', 'POST', { characterId: value('player'), operation: value('operation'), amount: Number(value('amount')), x: Number(value('x')), z: Number(value('z')), monsterId: value('monster') }); notice('Acción aplicada.'); } catch (error) { notice((error as Error).message); } });
}
async function boot(): Promise<void> {
  try { if (location.pathname === '/admin') await adminScreen(); else await charactersScreen(); }
  catch { authScreen(); }
}
void boot();
