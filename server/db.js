// SQLite-Speicher für den Server (node:sqlite, ab Node 22.5 – keine nativen Abhängigkeiten).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA, rowToObject, pickColumns } from './core.js';

export * from './core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'projektmanager.db');

const SQL_TYPE = { text: 'TEXT', real: 'REAL', int: 'INTEGER', bool: 'INTEGER', json: 'TEXT' };

/** Öffnet (und migriert) die Datenbank und liefert einen Store. */
export function openDb(file = DB_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  for (const [table, cols] of Object.entries(SCHEMA)) {
    const colSql = Object.entries(cols).map(([c, t]) => `"${c}" ${SQL_TYPE[t]}`).join(', ');
    raw.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${colSql})`);
    // Fehlende Spalten nachrüsten (einfache Migration bei Schema-Erweiterungen)
    const existing = new Set(raw.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name));
    for (const [c, t] of Object.entries(cols)) {
      if (!existing.has(c)) raw.exec(`ALTER TABLE "${table}" ADD COLUMN "${c}" ${SQL_TYPE[t]}`);
    }
  }
  raw.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_alloc ON allocations(employeeId, projectId, weekStart);
    CREATE INDEX IF NOT EXISTS ix_time_emp ON timeEntries(employeeId, date);
    CREATE INDEX IF NOT EXISTS ix_time_proj ON timeEntries(projectId, phaseId);
    CREATE INDEX IF NOT EXISTS ix_tasks_proj ON tasks(projectId);
    CREATE INDEX IF NOT EXISTS ix_phases_proj ON phases(projectId);
    CREATE INDEX IF NOT EXISTS ix_protocols_proj ON protocols(projectId);
    CREATE INDEX IF NOT EXISTS ix_absences_emp ON absences(employeeId, startDate);
    CREATE INDEX IF NOT EXISTS ix_invoices_proj ON invoices(projectId, number);
    CREATE TABLE IF NOT EXISTS sessions (
      tokenHash TEXT PRIMARY KEY, employeeId INTEGER, role TEXT, username TEXT, name TEXT,
      createdAt TEXT, expiresAt TEXT
    );
  `);
  return sqliteStore(raw);
}

function sqliteStore(raw) {
  let depth = 0;
  const store = {
    kind: 'sqlite',
    raw,
    list(table, where = {}) {
      const keys = Object.keys(where).filter((k) => k in SCHEMA[table] || k === 'id');
      const clause = keys.length ? ' WHERE ' + keys.map((k) => `"${k}" = ?`).join(' AND ') : '';
      return raw.prepare(`SELECT * FROM "${table}"${clause} ORDER BY id`).all(...keys.map((k) => where[k])).map((r) => rowToObject(table, r));
    },
    get(table, id) {
      return rowToObject(table, raw.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(Number(id)));
    },
    insert(table, data) {
      const values = pickColumns(table, data);
      if (data.id !== undefined && data.id !== null) values.id = Number(data.id);
      const keys = Object.keys(values);
      const r = keys.length
        ? raw.prepare(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => values[k]))
        : raw.prepare(`INSERT INTO "${table}" DEFAULT VALUES`).run();
      return store.get(table, r.lastInsertRowid);
    },
    update(table, id, data) {
      const values = pickColumns(table, data);
      const keys = Object.keys(values);
      if (keys.length) raw.prepare(`UPDATE "${table}" SET ${keys.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => values[k]), Number(id));
      return store.get(table, id);
    },
    remove(table, id) {
      return raw.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(Number(id)).changes > 0;
    },
    transaction(fn) {
      // verschachtelte Aufrufe laufen in der äußeren Transaktion mit
      if (depth > 0) return fn();
      depth++;
      raw.exec('BEGIN');
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },
    settingsAll() {
      const out = {};
      for (const r of raw.prepare('SELECT key, value FROM settings').all()) {
        try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
      }
      return out;
    },
    settingSet(key, value) {
      raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
    },
    close() {
      raw.close();
    },
  };
  return store;
}
