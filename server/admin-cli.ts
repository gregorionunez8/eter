import { Store } from './database';
const username = process.argv[2];
if (!username) throw new Error('Uso: npm run admin -- usuarioExistente');
const store = new Store(process.env.DATABASE_PATH ?? 'data/eter.sqlite');
if (!store.makeAdmin(username)) { store.close(); throw new Error('Cuenta inexistente. Registrala primero desde el juego.'); }
store.close(); console.log(`Cuenta administradora: ${username}`);
