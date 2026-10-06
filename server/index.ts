import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { createServer as createViteServer } from 'vite';
import { Store } from './database';
import { Game } from './game';
import { actionSchema } from '../shared/protocol';
import { balance, classes, formulas, items, monsters, npcs, skills, spots } from '../shared/content';
import { obstacles, world, walkable } from '../shared/world';
import { getConfig, validateConfig, loadConfig } from './config';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
const store = new Store(process.env.DATABASE_PATH ?? resolve(root, 'data/eter.sqlite'));
loadConfig(store);
const game = new Game(store);
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const vite = production ? undefined : await createViteServer({ root, server: { middlewareMode: true, hmr: { port: port + 1 } }, appType: 'spa' });
const sockets = new Map<string, WebSocket>();
const authLimits = new Map<string, { attempts: number; until: number }>();
function token(req: IncomingMessage): string { return /(?:^|;\s*)eter_session=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')?.[1] ?? ''; }
function json(res: ServerResponse, status: number, body: unknown): void { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req: IncomingMessage): Promise<unknown> {
  let bytes = 0, data = '';
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 128000) throw new Error('Solicitud demasiado grande.'); data += chunk.toString(); }
  return JSON.parse(data || '{}');
}
function cookie(value: string, clear = false): string { return `eter_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 604800}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`; }
function originAllowed(req: IncomingMessage): boolean {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
const credentials = z.object({ username: z.string().min(3).max(24), password: z.string().min(1).max(128) }).strict();
const server = createServer({ keepAliveTimeout: 60000 }, async (req, res) => {
  const path = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.method !== 'GET' && !originAllowed(req)) { json(res, 403, { error: 'Origen no permitido.' }); return; }
  try {
    if (path === '/api/health') { json(res, 200, { ok: true, players: game.players.size }); return; }
    if (path === '/api/register' || path === '/api/login') {
      if (req.method !== 'POST') { json(res, 405, { error: 'Método no permitido.' }); return; }
      const address = req.socket.remoteAddress ?? 'unknown', now = Date.now();
      let limit = authLimits.get(address);
      if (!limit || limit.until < now) { limit = { attempts: 0, until: now + 60000 }; authLimits.set(address, limit); }
      if (++limit.attempts > 30) { json(res, 429, { error: 'Demasiados intentos. Esperá un minuto.' }); return; }
      const input = credentials.parse(await body(req));
      const account = path.endsWith('register') ? store.register(input.username, input.password) : store.login(input.username, input.password);
      res.setHeader('Set-Cookie', cookie(store.session(account))); json(res, 200, { account }); return;
    }
    const account = store.accountForSession(token(req));
    if (path.startsWith('/api/') && !account) { json(res, 401, { error: 'Iniciá sesión.' }); return; }
    if (path === '/api/logout' && req.method === 'POST') {
      store.logout(token(req));
      for (const player of game.players.values()) if (player.character.accountId === account!.id) sockets.get(player.character.id)?.close(1000, 'Logout');
      res.setHeader('Set-Cookie', cookie('', true)); json(res, 200, { ok: true }); return;
    }
    if (path === '/api/me') { json(res, 200, { account, characters: store.characters(account!.id) }); return; }
    if (path === '/api/characters' && req.method === 'POST') {
      const input = z.object({ name: z.string().min(3).max(20), classId: z.enum(['VANGUARD', 'ARCANIST', 'RANGER']) }).strict().parse(await body(req));
      json(res, 201, { character: store.createCharacter(account!.id, input.name, input.classId) }); return;
    }
    if (path === '/api/content') { json(res, 200, { balance, classes, items, monsters, npcs, skills, spots, world, obstacles }); return; }
    if (path === '/admin' || path.startsWith('/api/admin')) {
      if (!account?.admin) { if (path === '/admin') { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Acceso exclusivo para administradores.'); } else json(res, 403, { error: 'Acceso exclusivo para administradores.' }); return; }
      if (path === '/api/admin/config') {
        if (req.method === 'PUT') {
          const config = validateConfig(await body(req), store);
          store.setSetting('content', config);
          store.logAdmin(account.id, null, 'config', config);
          json(res, 200, { ok: true, message: 'Guardado. Reiniciá el servidor para aplicar todos los cambios de forma segura.' });
        } else { const saved = store.getSetting<{ version?: number }>('content'); json(res, 200, saved?.version === 2 ? saved : getConfig()); }
        return;
      }
      if (path === '/api/admin/players') {
        json(res, 200, store.db.prepare('SELECT data FROM characters').all().map(row => {
          const saved = JSON.parse(String(row.data)) as import('../shared/model').Character;
          const c = game.players.get(saved.id)?.character ?? saved;
          return { id: c.id, name: c.name, classId: c.classId, level: c.level, resets: c.resets, crowns: c.crowns, ether: c.ether, hp: c.hp, mana: c.mana, x: c.x, z: c.z, stats: c.stats, equipment: c.equipment, online: game.players.has(c.id) };
        })); return;
      }
      if (path === '/api/admin/overview') {
        json(res, 200, { players: game.players.size, monsters: game.creatures.size, uptime: Math.floor(process.uptime()), audit: store.db.prepare('SELECT operation,character_id,timestamp FROM admin_actions ORDER BY timestamp DESC LIMIT 20').all() }); return;
      }
      if (path === '/api/admin/action' && req.method === 'POST') {
        const input = z.object({ characterId: z.string().max(80), operation: z.enum(['teleport', 'crowns', 'ether', 'level', 'reset', 'spawn', 'heal', 'mana']), amount: z.number().int().min(-1000000).max(1000000).optional(), x: z.number().finite().min(-78).max(78).optional(), z: z.number().finite().min(-78).max(78).optional(), monsterId: z.string().max(40).optional() }).strict().parse(await body(req));
        const player = game.players.get(input.characterId); if (!player) throw new Error('El personaje debe estar conectado.');
        const c = player.character;
        const before = { level: c.level, resets: c.resets, crowns: c.crowns, ether: c.ether, hp: c.hp, mana: c.mana, x: c.x, z: c.z };
        if (input.operation === 'teleport') { const point = { x: input.x ?? 0, z: input.z ?? 10 }; if (!walkable(point)) throw new Error('Destino bloqueado.'); Object.assign(c, point); player.path = []; player.targetId = undefined; }
        if (input.operation === 'crowns' || input.operation === 'ether') game.resource(c, input.operation, input.amount ?? 100, 'admin', 'admin');
        if (input.operation === 'heal') c.hp = formulas.maxHp(c.stats);
        if (input.operation === 'mana') c.mana = formulas.maxMana(c.stats);
        if (input.operation === 'level') {
          const target = Math.min(balance.maxLevel, Math.max(1, Math.floor(input.amount ?? 2)));
          c.freePoints += Math.max(0, target - c.level) * balance.pointsPerLevel; c.level = target; c.xp = 0; c.hp = formulas.maxHp(c.stats); c.mana = formulas.maxMana(c.stats);
        }
        if (input.operation === 'reset') { c.level = balance.maxLevel; game.reset(c); }
        if (input.operation === 'spawn') {
          const def = monsters.find(m => m.id === input.monsterId); if (!def) throw new Error('Monstruo inválido.');
          const point = { x: input.x ?? c.x + 3, z: input.z ?? c.z }; if (!walkable(point) || (Math.abs(point.x) <= 23 && Math.abs(point.z) <= 23)) throw new Error('Spawn fuera de la ciudad y obstáculos.');
          game.spawn({ id: 'admin', monsterId: def.id, ...point, radius: 0, count: 1, respawnMs: 20000 }, def);
        }
        store.save(c); store.logAdmin(account.id, c.id, input.operation, { input, before, after: { level: c.level, resets: c.resets, crowns: c.crowns, ether: c.ether, hp: c.hp, mana: c.mana, x: c.x, z: c.z } }); json(res, 200, { ok: true }); return;
      }
    }
    if (path.startsWith('/api/')) { json(res, 404, { error: 'Ruta inexistente.' }); return; }
    if (vite) { vite.middlewares(req, res); return; }
    const requested = path === '/admin' ? 'index.html' : path === '/' ? 'index.html' : decodeURIComponent(path.slice(1));
    const file = resolve(root, 'dist', requested), distRoot = resolve(root, 'dist');
    if (!file.startsWith(distRoot + '/') && !file.startsWith(distRoot + '\\')) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }); res.end(data);
  } catch (error) { json(res, 400, { error: error instanceof z.ZodError ? 'Datos inválidos.' : error instanceof Error ? error.message : 'Error de solicitud.' }); }
});
// Buffer the advertised idle deadline instead of resetting reused connections
// at its boundary during expensive local rendering or model loads.
if ('keepAliveTimeoutBuffer' in server) server.keepAliveTimeoutBuffer = 5000;
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const account = store.accountForSession(token(req));
  const character = account ? store.character(url.searchParams.get('characterId') ?? '', account.id) : undefined;
  if (url.pathname !== '/ws' || !originAllowed(req) || !account || !character || game.players.has(character.id) || [...game.players.values()].some(p => p.character.accountId === account.id)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    const player = game.connect(character, event => { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1_000_000) ws.send(JSON.stringify(event)); });
    sockets.set(character.id, ws);
    let count = 0, resetAt = Date.now() + 1000, alive = true;
    ws.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => { if (!alive) ws.terminate(); else { alive = false; ws.ping(); } }, 30000);
    ws.on('message', raw => {
      if (Date.now() > resetAt) { count = 0; resetAt = Date.now() + 1000; }
      if (++count > 40) { ws.close(1008, 'Rate limit'); return; }
      try { game.action(character.id, actionSchema.parse(JSON.parse(raw.toString()))); }
      catch { player.send({ type: 'notice', message: 'Mensaje inválido rechazado por el servidor.' }); }
    });
    ws.on('error', () => ws.close());
    ws.on('close', () => { clearInterval(heartbeat); game.disconnect(character.id); sockets.delete(character.id); });
    player.send({ type: 'welcome', admin: account.admin }); player.send(game.snapshot(player));
  });
});
let lastTick = Date.now();
const tick = setInterval(() => { const now = Date.now(); game.tick(Math.min(0.2, (now - lastTick) / 1000)); lastTick = now; }, balance.tickMs);
const snapshots = setInterval(() => { for (const player of game.players.values()) player.send(game.snapshot(player)); }, balance.snapshotMs);
const saves = setInterval(() => { for (const player of game.players.values()) store.save(player.character); }, balance.saveMs);
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return; closing = true;
  clearInterval(tick); clearInterval(snapshots); clearInterval(saves);
  for (const id of [...game.players.keys()]) { game.disconnect(id); sockets.get(id)?.close(); }
  wss.close(); await vite?.close(); server.close(); store.close();
}
process.on('SIGINT', () => { void shutdown(); }); process.on('SIGTERM', () => { void shutdown(); });
server.listen(port, host, () => console.log(`Éter ${production ? 'producción' : 'desarrollo'}: http://${host}:${port}`));
