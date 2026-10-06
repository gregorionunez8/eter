/** Production acceptance server with reproducible encounter randomness.
 * Only this test entry point changes Math.random; npm start/dev retain normal randomness.
 * Crypto IDs, passwords, authoritative rules and all default drop rates are unchanged.
 */
import { resolve } from 'node:path';
import { Store } from '../../server/database';
import { getConfig } from '../../server/config';

// Each run starts with code defaults, not stale drafts from a previous browser run.
// Refuse to reset any database other than this explicitly isolated acceptance DB.
if (resolve(process.env.DATABASE_PATH ?? '') !== resolve('data/e2e.sqlite')) throw new Error('Acceptance setup requires data/e2e.sqlite.');
const fixture = new Store(process.env.DATABASE_PATH!); fixture.setSetting('content', getConfig()); fixture.close();

let seed = 42;
Math.random = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
  value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};
await import('../../server/index');
export {};
