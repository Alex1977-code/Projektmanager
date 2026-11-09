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
    login: 'text', appRole: 'text', vacationDays: 'real', personnelNo: 'text',
  },
  projects: {
    number: 'text', name: 'text', client: 'text', type: 'text', location: 'text',
    leadId: 'int', status: 'text', priority: 'text', startDate: 'text', endDate: 'text',
    budget: 'real', description: 'text', color: 'text', extNo: 'text', debitorId: 'int',
  },
  phases: {
    projectId: 'int', code: 'text', name: 'text', startDate: 'text', endDate: 'text',
    budget: 'real', plannedHours: 'real', progress: 'real', sort: 'int',
  },
  milestones: { projectId: 'int', name: 'text', date: 'text', done: 'bool' },
  tasks: {
    projectId: 'int', phaseId: 'int', title: 'text', description: 'text', assigneeId: 'int',
    status: 'text', priority: 'text', estimatedHours: 'real', startDate: 'text',
    dueDate: 'text', createdAt: 'text', sort: 'real', workPackageId: 'int',
  },
  allocations: { employeeId: 'int', projectId: 'int', weekStart: 'text', hours: 'real' },
  timeEntries: {
    employeeId: 'int', projectId: 'int', phaseId: 'int', taskId: 'int',
    date: 'text', hours: 'real', note: 'text', exportedAt: 'text', workPackageId: 'int',
  },
  costs: {
    projectId: 'int', phaseId: 'int', date: 'text', category: 'text',
    description: 'text', amount: 'real', status: 'text',
    kreditorId: 'int', docNo: 'text', vatPct: 'real', dueDate: 'text', paidDate: 'text', exportedAt: 'text',
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
    paidDate: 'text', paidAmount: 'real', note: 'text', createdBy: 'int', exportedAt: 'text',
  },
  roles: { key: 'text', name: 'text', description: 'text', permissions: 'json', system: 'bool', sort: 'int' },
  worktimes: {
    employeeId: 'int', date: 'text', start: 'text', end: 'text', breakMin: 'real', location: 'text', note: 'text',
  },
  worktimeMonths: {
    employeeId: 'int', month: 'text', status: 'text', submittedAt: 'text', approvedBy: 'int', approvedAt: 'text',
    exportedAt: 'text', note: 'text',
  },
  abacusExports: { type: 'text', period: 'text', createdAt: 'text', createdBy: 'int', count: 'int', hours: 'real', filename: 'text' },
  /** Angebote: Positionen = angebotene Leistungen (pauschal oder nach Aufwand) */
  offers: {
    projectId: 'int', offerNo: 'text', revision: 'int', title: 'text', recipient: 'text', contact: 'text',
    date: 'text', validUntil: 'text', status: 'text', intro: 'text', closing: 'text', positions: 'json',
    nkPct: 'real', discountPct: 'real', vatPct: 'real', subtotal: 'real', optionalTotal: 'real', nk: 'real',
    discount: 'real', net: 'real', vat: 'real', gross: 'real', hours: 'real',
    sentAt: 'text', decidedAt: 'text', note: 'text', createdBy: 'int',
  },
  /** Arbeitspakete, optional einer Angebotsposition zugeordnet (offerId + positionKey) */
  workPackages: {
    projectId: 'int', offerId: 'int', positionKey: 'text', code: 'text', title: 'text', description: 'text',
    phaseId: 'int', responsibleId: 'int', plannedHours: 'real', budget: 'real', startDate: 'text', endDate: 'text',
    status: 'text', progress: 'real', sort: 'real',
  },
  /** Geschäftspartner: Debitoren (Auftraggeber) und Kreditoren (Lieferanten, Nachunternehmer) */
  contacts: {
    kind: 'text', number: 'text', name: 'text', addition: 'text', street: 'text', zip: 'text', city: 'text', country: 'text',
    vatId: 'text', email: 'text', phone: 'text', iban: 'text', paymentDays: 'int', note: 'text', active: 'bool',
  },
  /** Interne Nachrichten; Antworten tragen die ID der ersten Nachricht in threadId */
  messages: {
    fromId: 'int', toIds: 'json', subject: 'text', body: 'text', link: 'text', linkLabel: 'text',
    threadId: 'int', createdAt: 'text', readBy: 'json', hiddenBy: 'json',
  },
  /** Dateien für Druckvorlagen (Briefbogen erste Seite / Folgeseiten) als Data-URL */
  assets: { key: 'text', name: 'text', mime: 'text', data: 'text', updatedAt: 'text' },
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
  roles: ['key', 'name'],
  worktimes: ['employeeId', 'date'],
  worktimeMonths: ['employeeId', 'month'],
  abacusExports: ['type', 'period'],
  offers: ['projectId', 'date'],
  workPackages: ['projectId', 'title'],
  assets: ['key', 'data'],
  contacts: ['kind', 'name'],
  messages: ['fromId', 'body'],
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
  /** Rechnungsstammdaten */
  companyPhone: '',
  companyEmail: '',
  companyWeb: '',
  managingDirectors: '',
  registerInfo: '',
  taxNumber: '',
  bankName: '',
  skontoPct: 0,
  skontoDays: 0,
  /** Nummernkreise: {JJJJ} Jahr, {JJ} Jahr zweistellig, {NNN} laufende Nummer je Jahr (Anzahl N = Stellen) */
  invoiceNoFormat: 'RE-{JJJJ}-{NNN}',
  offerNoFormat: 'AN-{JJJJ}-{NNN}',
  invoiceIntro: 'Für die bis zum {leistungsstand} erbrachten Leistungen im o. g. Projekt berechnen wir gemäß Ingenieurvertrag:',
  invoiceClosing: 'Bitte überweisen Sie den Rechnungsbetrag bis zum {faellig} ohne Abzug unter Angabe der Rechnungsnummer.',
  offerIntro: 'Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage. Für die nachfolgend beschriebenen Ingenieurleistungen unterbreiten wir Ihnen folgendes Angebot:',
  offerClosing: 'Die Abrechnung erfolgt nach Leistungsfortschritt durch Abschlagsrechnungen. Es gelten die Regelungen der HOAI in der jeweils gültigen Fassung. An dieses Angebot halten wir uns bis zum {gueltig} gebunden.\n\nFür Rückfragen stehen wir Ihnen gern zur Verfügung.\n\nMit freundlichen Grüßen',
  offerValidDays: 60,
  /** Stundensätze für die Angebotskalkulation (Positionen nach Aufwand) */
  offerRates: [
    { label: 'Projektleitung', rate: 135 },
    { label: 'Ingenieur/in', rate: 115 },
    { label: 'Konstrukteur/in', rate: 95 },
    { label: 'Techn. Zeichner/in', rate: 78 },
  ],
  /** Standardrahmen für Angebote und Rechnungen (Maße in mm). Bilder liegen in der Tabelle „assets“. */
  docFrame: {
    mode: 'generated', // 'generated' = Kopf/Fuß aus den Stammdaten, 'image' = eigener Briefbogen
    accent: '#0b1f3a',
    topFirst: 45, topNext: 28, bottom: 30, left: 25, right: 18,
    foldMarks: true,
  },
  /** Debitoren-/Kreditoren-Schnittstelle (Format wie Abacus-Export: Trennzeichen, Datum, Zeichensatz von dort) */
  accounting: {
    revenueAccount: '8400', debitorAccount: '1400', kreditorAccount: '1600',
    vatCode: 'U19', inputVatCode: 'V19', defaultExpenseAccount: '3100',
    expenseAccounts: { Fremdleistung: '3100', Vermessung: '3110', 'Prüfingenieur': '3120', 'Prüfung & Versuche': '3130', Reisekosten: '4660', 'Software / Lizenzen': '4964', Sonstiges: '4900' },
    debitorStart: 10000, kreditorStart: 70000,
  },
  /** interne Stufe für einmalige Datenanpassungen */
  dataLevel: 0,
  /** Abacus-Schnittstelle (Export-Datei für den Import in Abacus) */
  abacus: {
    mandant: '',
    separator: ';',
    decimal: ',',
    dateFormat: 'DD.MM.YYYY',
    encoding: 'utf-8-bom',
    onlyApproved: true,
    defaultServiceType: '100',
    serviceTypes: { 'LPH 1': '101', 'LPH 2': '102', 'LPH 3': '103', 'LPH 4': '104', 'LPH 5': '105', 'LPH 6': '106', 'LPH 7': '107', 'LPH 8': '108', 'LPH 9': '109', WP: '120', BWP: '130' },
    absenceCodes: { Urlaub: 'U', Krankheit: 'K', Fortbildung: 'F', Gleitzeit: 'G', Sonderurlaub: 'S', Sonstiges: 'A', holiday: 'FT' },
    leistungColumns: [
      { key: 'mandant', header: 'Mandant' }, { key: 'personnelNo', header: 'Mitarbeiter' }, { key: 'date', header: 'Datum' },
      { key: 'projectNo', header: 'Projekt' }, { key: 'serviceType', header: 'Leistungsart' }, { key: 'hours', header: 'Menge' },
      { key: 'text', header: 'Text' },
    ],
    arbeitszeitColumns: [
      { key: 'personnelNo', header: 'Mitarbeiter' }, { key: 'date', header: 'Datum' }, { key: 'start', header: 'Von' },
      { key: 'end', header: 'Bis' }, { key: 'breakMin', header: 'Pause' }, { key: 'hours', header: 'Stunden' },
      { key: 'absence', header: 'Absenz' },
    ],
  },
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
