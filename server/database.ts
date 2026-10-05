import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { balance, classes, formulas, items, skills, type ClassId } from '../shared/content';
import { world } from '../shared/world';
import type { Character, ResourceTransaction } from '../shared/model';

export interface Account { id: string; username: string; admin: boolean }
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), name TEXT UNIQUE NOT NULL COLLATE NOCASE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS resource_ledger(id TEXT PRIMARY KEY, character_id TEXT NOT NULL, resource TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, reference_id TEXT NOT NULL, timestamp INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }
  register(username: string, password: string): Account {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) throw new Error('Usuario: 3–24 letras, números o guion bajo.');
    if (password.length < 10 || password.length > 128) throw new Error('Contraseña: entre 10 y 128 caracteres.');
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    const id = randomUUID();
    try { this.db.prepare('INSERT INTO accounts(id,username,salt,hash) VALUES(?,?,?,?)').run(id, username, salt, hash); }
    catch { throw new Error('El nombre de usuario ya está registrado.'); }
    return { id, username, admin: false };
  }
  login(username: string, password: string): Account {
    const row = this.db.prepare('SELECT * FROM accounts WHERE username=?').get(username) as { id: string; username: string; salt: string; hash: string; admin: number } | undefined;
    const hash = scryptSync(password, row?.salt ?? 'authentication-dummy-salt', 64);
    if (!row || !timingSafeEqual(hash, Buffer.from(row.hash, 'hex'))) throw new Error('Credenciales incorrectas.');
    return { id: row.id, username: row.username, admin: !!row.admin };
  }
  session(account: Account): string {
    const token = randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, account.id, Date.now() + 7 * 86400000);
    return token;
  }
  accountForSession(token: string): Account | undefined {
    const row = this.db.prepare('SELECT a.id,a.username,a.admin FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token=? AND s.expires>?').get(token, Date.now()) as { id: string; username: string; admin: number } | undefined;
    return row && { ...row, admin: !!row.admin };
  }
  logout(token: string): void { this.db.prepare('DELETE FROM sessions WHERE token=?').run(token); }
  makeAdmin(username: string): boolean { return this.db.prepare('UPDATE accounts SET admin=1 WHERE username=?').run(username).changes > 0; }
  characters(accountId: string): Character[] {
    return this.db.prepare('SELECT data FROM characters WHERE account_id=?').all(accountId).map(row => JSON.parse(String(row.data)) as Character);
  }
  character(id: string, accountId: string): Character | undefined {
    const row = this.db.prepare('SELECT data FROM characters WHERE id=? AND account_id=?').get(id, accountId);
    return row && JSON.parse(String(row.data)) as Character;
  }
  createCharacter(accountId: string, name: string, classId: ClassId): Character {
    if (!/^[\p{L}][\p{L}\p{N} _-]{2,19}$/u.test(name)) throw new Error('Nombre: 3–20 caracteres, comenzando con una letra.');
    if (!(classId in classes)) throw new Error('Clase inválida.');
    if (this.characters(accountId).length >= 6) throw new Error('Máximo seis personajes por cuenta.');
    const stats = { ...classes[classId].stats };
    const starter = classId === 'VANGUARD' ? 'iron-sword' : classId === 'ARCANIST' ? 'ether-staff' : 'ash-bow';
    const weapon = items.find(i => i.id === starter)!;
    const character: Character = {
      id: randomUUID(), accountId, name, classId, level: 1, xp: 0, resets: 0, stats, freePoints: 0,
      crowns: 50, ether: 0, sanctum: [], unlockedSkills: skills.filter(s => s.classId === classId).map(s => s.id),
      ...world.spawn, hp: formulas.maxHp(stats), mana: formulas.maxMana(stats),
      inventory: ['hp-potion', 'hp-potion', 'mana-potion', 'mana-potion'].map((definitionId, x) => ({ id: randomUUID(), definitionId, x, y: 0, durability: 0, modifiers: {}, upgradeLevel: 0, metadata: {} })),
      equipment: { weapon: { id: randomUUID(), definitionId: starter, x: 0, y: 0, durability: weapon.durability!, modifiers: {}, upgradeLevel: 0, metadata: {} } },
    };
    try { this.db.prepare('INSERT INTO characters VALUES(?,?,?,?)').run(character.id, accountId, name, JSON.stringify(character)); }
    catch { throw new Error('El nombre de personaje ya existe.'); }
    return character;
  }
  save(character: Character): void { this.db.prepare('UPDATE characters SET data=? WHERE id=? AND account_id=?').run(JSON.stringify(character), character.id, character.accountId); }
  saveWithTransaction(character: Character, transaction: ResourceTransaction): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.save(character);
      this.db.prepare('INSERT INTO resource_ledger VALUES(?,?,?,?,?,?,?)').run(transaction.id, transaction.characterId, transaction.resource, transaction.amount, transaction.reason, transaction.referenceId, transaction.timestamp);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  getSetting<T>(key: string): T | undefined { const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(String(row.value)) as T : undefined; }
  setSetting(key: string, value: unknown): void { this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  close(): void { this.db.close(); }
}
