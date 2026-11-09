// Kommandozeile: Demodaten anlegen bzw. mit --reset die Datenbank neu aufsetzen.
//   npm run seed
import fs from 'node:fs';
import { openDb, DB_FILE } from './db.js';
import { seedIfEmpty } from './seed.js';

if (process.argv.includes('--reset')) {
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);
}
const db = openDb();
seedIfEmpty(db);
db.close();
