// Datenbankschicht auf Basis des in Node.js integrierten SQLite (node:sqlite).
// Keine nativen Abhängigkeiten – läuft auf Windows, Linux und macOS ab Node 22.5.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'projektmanager.db');

/**
 * Tabellendefinitionen. Typen:
 *  text | real | int | bool (0/1) | json (als TEXT gespeichert)
 * Jede Tabelle erhält zusätzlich eine numerische `id` als Primärschlüssel.
 */
export const SCHEMA = {
  employees: {
    name: 'text', short: 'text', title: 'text', role: 'text', department: 'text',
    email: 'text', phone: 'text', hourlyRate: 'real', weeklyHours: 'real',
    skills: 'json', color: 'text', active: 'bool',
    login: 'text', appRole: 'text', vacationDays: 'real',
  },
  projects: {
    number: 'text', name: 'text', client: 'text', type: 'text', location: 'text',
    leadId: 'int', status: 'text', priority: 'text', startDate: 'text', endDate: 'text',
    budget: 'real', description: 'text', color: 'text',
  },
  phases: {
    projectId: 'int', code: 'text', name: 'text', startDate: 'text', endDate: 'text',
    budget: 'real', plannedHours: 'real', progress: 'real', sort: 'int',
  },
  milestones: { projectId: 'int', name: 'text', date: 'text', done: 'bool' },
  tasks: {
    projectId: 'int', phaseId: 'int', title: 'text', description: 'text', assigneeId: 'int',
    status: 'text', priority: 'text', estimatedHours: 'real', startDate: 'text',
    dueDate: 'text', createdAt: 'text', sort: 'real',
  },
  allocations: { employeeId: 'int', projectId: 'int', weekStart: 'text', hours: 'real' },
  timeEntries: {
    employeeId: 'int', projectId: 'int', phaseId: 'int', taskId: 'int',
    date: 'text', hours: 'real', note: 'text',
  },
  costs: {
    projectId: 'int', phaseId: 'int', date: 'text', category: 'text',
    description: 'text', amount: 'real', status: 'text',
  },
  protocols: {
    projectId: 'int', number: 'int', title: 'text', type: 'text', date: 'text', time: 'text',
    location: 'text', status: 'text', participants: 'json', items: 'json', nextDate: 'text',
    authorId: 'int', createdAt: 'text',
  },
  absences: {
    employeeId: 'int', type: 'text', startDate: 'text', endDate: 'text', halfDay: 'bool',
    status: 'text', note: 'text', createdBy: 'int', decidedBy: 'int',
  },
  invoices: {
    projectId: 'int', number: 'int', invoiceNo: 'text', type: 'text', date: 'text', periodEnd: 'text',
    lines: 'json', nkPct: 'real', vatPct: 'real', performance: 'real', nk: 'real', cumulative: 'real',
    previousNet: 'real', net: 'real', vat: 'real', gross: 'real', status: 'text', dueDate: 'text',
    paidDate: 'text', paidAmount: 'real', note: 'text', createdBy: 'int',
  },
};

/** Pflichtfelder je Tabelle (für POST). */
export const REQUIRED = {
  employees: ['name'],
  projects: ['name'],
  phases: ['projectId', 'name', 'startDate', 'endDate'],
  milestones: ['projectId', 'name', 'date'],
  tasks: ['projectId', 'title'],
  allocations: ['employeeId', 'projectId', 'weekStart'],
  timeEntries: ['employeeId', 'projectId', 'date', 'hours'],
  costs: ['projectId', 'amount'],
  protocols: ['projectId', 'date'],
  absences: ['type', 'startDate', 'endDate'],
  invoices: ['projectId', 'date'],
};

const SQL_TYPE = { text: 'TEXT', real: 'REAL', int: 'INTEGER', bool: 'INTEGER', json: 'TEXT' };

export function openDb(file = DB_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  for (const [table, cols] of Object.entries(SCHEMA)) {
    const colSql = Object.entries(cols).map(([c, t]) => `"${c}" ${SQL_TYPE[t]}`).join(', ');
    db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${colSql})`);
    // Fehlende Spalten nachrüsten (einfache Migration bei Schema-Erweiterungen)
    const existing = new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name));
    for (const [c, t] of Object.entries(cols)) {
      if (!existing.has(c)) db.exec(`ALTER TABLE "${table}" ADD COLUMN "${c}" ${SQL_TYPE[t]}`);
    }
  }
  db.exec(`
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
  return db;
}

// ---------------------------------------------------------------------------
// Konvertierung zwischen JS-Objekten und SQLite-Zeilen
// ---------------------------------------------------------------------------

function toDb(type, value) {
  if (value === undefined || value === null || value === '') return null;
  switch (type) {
    case 'bool': return value ? 1 : 0;
    case 'json': return JSON.stringify(value);
    case 'int': {
      const n = Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'real': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    default: return String(value);
  }
}

function fromDb(type, value) {
  if (value === null || value === undefined) {
    if (type === 'bool') return false;
    if (type === 'json') return [];
    return null;
  }
  switch (type) {
    case 'bool': return value === 1;
    case 'json':
      try { return JSON.parse(value); } catch { return []; }
    default: return value;
  }
}

export function rowToObject(table, row) {
  if (!row) return null;
  const cols = SCHEMA[table];
  const obj = { id: row.id };
  for (const [c, t] of Object.entries(cols)) obj[c] = fromDb(t, row[c]);
  return obj;
}

export function isTable(name) {
  return Object.prototype.hasOwnProperty.call(SCHEMA, name);
}

/** Übernimmt nur bekannte Spalten aus `data`. */
function pickColumns(table, data) {
  const cols = SCHEMA[table];
  const out = {};
  for (const [c, t] of Object.entries(cols)) {
    if (Object.prototype.hasOwnProperty.call(data, c)) out[c] = toDb(t, data[c]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function list(db, table, where = {}) {
  const keys = Object.keys(where).filter((k) => k in SCHEMA[table] || k === 'id');
  const clause = keys.length ? ' WHERE ' + keys.map((k) => `"${k}" = ?`).join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM "${table}"${clause} ORDER BY id`).all(...keys.map((k) => where[k]));
  return rows.map((r) => rowToObject(table, r));
}

export function get(db, table, id) {
  return rowToObject(table, db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(Number(id)));
}

export function insert(db, table, data) {
  const values = pickColumns(table, data);
  const keys = Object.keys(values);
  if (!keys.length) {
    const r = db.prepare(`INSERT INTO "${table}" DEFAULT VALUES`).run();
    return get(db, table, r.lastInsertRowid);
  }
  const sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  const r = db.prepare(sql).run(...keys.map((k) => values[k]));
  return get(db, table, r.lastInsertRowid);
}

export function update(db, table, id, data) {
  const values = pickColumns(table, data);
  const keys = Object.keys(values);
  if (keys.length) {
    const sql = `UPDATE "${table}" SET ${keys.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...keys.map((k) => values[k]), Number(id));
  }
  return get(db, table, id);
}

export function remove(db, table, id) {
  return db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(Number(id)).changes > 0;
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS = {
  companyName: 'Ingenieurbüro Stahlwasserbau & Bewegliche Brücken',
  hoursPerDay: 8,
  currency: 'EUR',
  /** Bundesland für gesetzliche Feiertage (ISO-Kürzel ohne DE-) */
  state: 'HB',
  /** Rechnungsstellung */
  companyAddress: 'Musterstraße 1\n28195 Bremen',
  bankDetails: 'IBAN DE00 0000 0000 0000 0000 00 · BIC XXXXDEXXXXX',
  taxId: 'USt-IdNr. DE000000000',
  nkPct: 5,
  vatPct: 19,
  paymentDays: 30,
};

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

export function setSettings(db, patch) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) stmt.run(k, JSON.stringify(v));
  }
  return getSettings(db);
}
