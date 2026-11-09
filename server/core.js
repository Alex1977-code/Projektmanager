// Gemeinsamer Kern der Datenhaltung – ohne Node-Abhängigkeiten, damit dieselbe Geschäftslogik
// auf dem Server (SQLite, server/db.js) und im Browser (server/memoryStore.js) läuft.
//
// Ein Speicher („Store“) stellt bereit:
//   list(table, where) · get(table, id) · insert(table, data) · update(table, id, data)
//   remove(table, id) · transaction(fn) · settingsAll() · settingSet(key, value)

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


// ---------------------------------------------------------------------------
// Typumwandlung
// ---------------------------------------------------------------------------

export function toDb(type, value) {
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

export function fromDb(type, value) {
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
export function pickColumns(table, data) {
  const cols = SCHEMA[table];
  const out = {};
  for (const [c, t] of Object.entries(cols)) {
    if (Object.prototype.hasOwnProperty.call(data, c)) out[c] = toDb(t, data[c]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CRUD (delegiert an den Store)
// ---------------------------------------------------------------------------

/** Zeilen einer Tabelle; `where` = Gleichheitsfilter {spalte: wert} */
export const list = (db, table, where = {}) => db.list(table, where);
export const get = (db, table, id) => db.get(table, Number(id));
export const insert = (db, table, data) => db.insert(table, data);
export const update = (db, table, id, data) => db.update(table, Number(id), data);
export const remove = (db, table, id) => db.remove(table, Number(id));
export const transaction = (db, fn) => db.transaction(fn);

/** Löscht alle Zeilen, auf die `pred` zutrifft. */
export function removeWhere(db, table, pred) {
  const rows = list(db, table).filter(pred);
  for (const r of rows) remove(db, table, r.id);
  return rows.length;
}

/** Ändert alle Zeilen, auf die `pred` zutrifft. */
export function updateWhere(db, table, pred, patch) {
  const rows = list(db, table).filter(pred);
  for (const r of rows) update(db, table, r.id, patch);
  return rows.length;
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
  return { ...DEFAULT_SETTINGS, ...db.settingsAll() };
}

export function setSettings(db, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (k in DEFAULT_SETTINGS) db.settingSet(k, v);
  }
  return getSettings(db);
}
