import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { Store } from '../server/database';
import type { Character } from '../shared/model';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(condition: () => boolean | Promise<boolean>, timeout = 15000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await condition()) return; await wait(50); }
  throw new Error('La condición de integración no se cumplió.');
}
interface Snapshot { type: string; self: Character; now: number; players: { id: string; x: number; z: number }[]; monsters: { id: string; definitionId: string; hp: number; x: number; z: number }[]; loot: { id: string; ownerId: string; kind: string }[] }

test('real HTTP/WS server handles ten users, authoritative contested combat, admin protection, logout and restart persistence', { timeout: 90000 }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'eter-network-')), path = join(folder, 'world.sqlite');
  const base = 'http://127.0.0.1:3200';
  let child: ChildProcess | undefined, output = '';
  const clients: { cookie: string; character: Character; socket: WebSocket; state?: Snapshot; snapshots: number; notices: string[] }[] = [];
  async function start(): Promise<void> {
    child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/index.ts', '--production'], { cwd: resolve('.'), env: { ...process.env, PORT: '3200', DATABASE_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.stdout?.on('data', data => { output += String(data); }); child.stderr?.on('data', data => { output += String(data); });
    await until(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } }, 20000);
  }
  async function request(route: string, method = 'GET', body?: unknown, cookie = '') {
    return fetch(`${base}${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function stop(): Promise<void> {
    for (const client of clients) client.socket.close();
    await until(async () => { try { const response = await request('/api/health'); return (await response.json() as { players: number }).players === 0; } catch { return true; } });
    if (child && child.exitCode === null) { const exited = new Promise<void>(r => child!.once('exit', () => r())); child.kill(); await exited; }
  }
  try {
    await start(); assert.equal((await request('/admin')).status, 403);
    assert.equal((await request('/api/me')).status, 401);
    for (let i = 0; i < 10; i++) {
      const registration = await request('/api/register', 'POST', { username: `load_user_${i}`, password: 'network-secure-password' });
      assert.equal(registration.status, 200); const cookie = registration.headers.get('set-cookie')!.split(';')[0];
      const characterResponse = await request('/api/characters', 'POST', { name: `Network Hero ${i}`, classId: ['VANGUARD', 'ARCANIST', 'RANGER'][i % 3] }, cookie);
      assert.equal(characterResponse.status, 201); const { character } = await characterResponse.json() as { character: Character };
      const socket = new WebSocket(`ws://127.0.0.1:3200/ws?characterId=${character.id}`, { headers: { Cookie: cookie } });
      const client = { cookie, character, socket, snapshots: 0, notices: [] as string[], state: undefined as Snapshot | undefined };
      socket.on('message', data => { const value = JSON.parse(String(data)) as Snapshot & { message: string }; if (value.type === 'state') { client.state = value; client.snapshots++; } else if (value.type === 'notice') client.notices.push(value.message); });
      clients.push(client); await until(() => !!client.state);
    }
    await until(() => clients.every(c => c.state?.players.length === 10));
    assert.equal((await request('/api/admin/config', 'GET', undefined, clients[1].cookie)).status, 403);
    assert.equal((await request('/api/admin/action', 'POST', { operation: 'crowns', amount: 100000 }, clients[1].cookie)).status, 403);
    const originalMonsters = clients[0].state!.monsters.map(m => m.id).sort();
    for (const client of clients) { assert.deepEqual(client.state!.monsters.map(m => m.id).sort(), originalMonsters); client.socket.send(JSON.stringify({ type: 'move', x: 0, z: 30 })); }
    await until(() => clients.every(c => c.state!.self.z >= 29.9));
    const startCounts = clients.map(c => c.snapshots); await wait(2000);
    for (let i = 0; i < 10; i++) assert.ok(clients[i].snapshots - startCounts[i] >= 10, 'Each of ten clients receives regular snapshots during gameplay');
    clients[0].socket.send(JSON.stringify({ type: 'move', x: 1, z: 30, crowns: 9999999 }));
    await until(() => clients[0].notices.some(n => n.includes('inválido'))); assert.equal(clients[0].state!.self.crowns, 50);
    const store = new Store(path); assert.ok(store.makeAdmin('load_user_0')); store.close();
    const adminCookie = clients[0].cookie;
    const monster = clients[0].state!.monsters.find(m => m.definitionId === 'sproutling' && m.hp > 0)!;
    for (const client of clients.slice(0, 2)) {
      const response = await request('/api/admin/action', 'POST', { characterId: client.character.id, operation: 'teleport', x: monster.x, z: monster.z - 1 }, adminCookie); assert.equal(response.status, 200);
      client.socket.send(JSON.stringify({ type: 'attack', targetId: monster.id }));
    }
    await until(() => clients.every(c => c.state!.monsters.find(m => m.id === monster.id)?.hp === 0));
    assert.equal(clients[0].state!.self.xp + clients[1].state!.self.xp, 25, 'One killer receives XP; shared death cannot duplicate it');
    const adminConfig = await request('/api/admin/config', 'GET', undefined, adminCookie); assert.equal(adminConfig.status, 200);
    const config = await adminConfig.json() as { balance: { dayNightCycleDuration: number }; monsters: unknown[]; spots: unknown[]; items: unknown[] };
    config.balance.dayNightCycleDuration = 120000;
    assert.equal((await request('/api/admin/config', 'PUT', config, adminCookie)).status, 200);
    await wait(300);
    const persisted = clients.map(c => ({ id: c.character.id, xp: c.state!.self.xp, crowns: c.state!.self.crowns, equipment: c.state!.self.equipment }));
    await stop(); await start();
    for (let i = 0; i < 10; i++) {
      const response = await request('/api/me', 'GET', undefined, clients[i].cookie); assert.equal(response.status, 200);
      const data = await response.json() as { characters: Character[] };
      assert.equal(data.characters[0].id, persisted[i].id); assert.equal(data.characters[0].xp, persisted[i].xp); assert.equal(data.characters[0].crowns, persisted[i].crowns); assert.deepEqual(data.characters[0].equipment, persisted[i].equipment);
    }
    const loaded = await (await request('/api/admin/config', 'GET', undefined, adminCookie)).json() as typeof config;
    assert.equal(loaded.balance.dayNightCycleDuration, 120000);
    const login = await request('/api/login', 'POST', { username: 'load_user_1', password: 'network-secure-password' }); assert.equal(login.status, 200);
    assert.equal((await request('/api/logout', 'POST', undefined, clients[1].cookie)).status, 200);
    assert.equal((await request('/api/me', 'GET', undefined, clients[1].cookie)).status, 401);
    assert.ok(!output.includes('uncaughtException'), output);
  } finally { await stop(); rmSync(folder, { recursive: true }); }
});
