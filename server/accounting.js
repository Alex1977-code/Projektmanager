// Debitoren/Kreditoren (Geschäftspartner, Übergabe an die Buchhaltung, Zahlungsabgleich),
// interne Nachrichten und verdichtete Stunden für Auswertungen.
import { list, get, insert, update, remove, transaction, getSettings } from './core.js';
import { ApiError } from './errors.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// ======================================================================== Geschäftspartner
const KINDS = ['debitor', 'kreditor'];
export function nextContactNumber(db, kind) {
  const acc = getSettings(db).accounting || {};
  const start = Number(kind === 'debitor' ? acc.debitorStart : acc.kreditorStart) || (kind === 'debitor' ? 10000 : 70000);
  const used = list(db, 'contacts').filter((c) => c.kind === kind).map((c) => Number(c.number)).filter(Number.isFinite);
  return String(Math.max(start - 1, ...used) + 1);
}

export function handleContacts(db, method, id, body, validate, can) {
  if (method === 'GET') {
    const rows = id ? [get(db, 'contacts', id)].filter(Boolean) : list(db, 'contacts');
    const full = can('invoices.view') || can('accounting.export') || can('costs.view');
    const out = full ? rows : rows.map(({ iban, note, ...c }) => { void iban; void note; return c; });
    if (id && !out.length) throw new ApiError(404, 'Geschäftspartner nicht gefunden');
    return id ? out[0] : out;
  }
  if (!can('accounting.export') && !can('invoices.edit')) throw new ApiError(403, 'Keine Berechtigung, Debitoren und Kreditoren zu pflegen.');
  if (method === 'POST' && !id) {
    validate('contacts', body, false);
    if (!KINDS.includes(body.kind)) throw new ApiError(400, 'Art muss „debitor“ oder „kreditor“ sein');
    const number = String(body.number || '').trim() || nextContactNumber(db, body.kind);
    if (list(db, 'contacts').some((c) => c.kind === body.kind && c.number === number)) throw new ApiError(409, `Die Nummer ${number} ist bereits vergeben.`);
    return insert(db, 'contacts', { country: 'DE', active: true, ...body, number });
  }
  const current = id ? get(db, 'contacts', id) : null;
  if (!current) throw new ApiError(404, 'Geschäftspartner nicht gefunden');
  if (method === 'PUT' || method === 'PATCH') {
    if (body.number !== undefined && list(db, 'contacts').some((c) => c.id !== id && c.kind === current.kind && c.number === String(body.number))) throw new ApiError(409, `Die Nummer ${body.number} ist bereits vergeben.`);
    const { kind, ...patch } = body; void kind;
    return update(db, 'contacts', id, patch);
  }
  if (method === 'DELETE') {
    const used = current.kind === 'debitor' ? list(db, 'projects').some((p) => p.debitorId === id) : list(db, 'costs').some((c) => c.kreditorId === id);
    if (used) throw new ApiError(409, 'Der Geschäftspartner wird noch verwendet. Bitte stattdessen auf „inaktiv“ setzen.');
    remove(db, 'contacts', id);
    return { deleted: true };
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}

// ======================================================================== Nachrichten
const visibleTo = (m, emp) => m.fromId === emp || (Array.isArray(m.toIds) && m.toIds.includes(emp));

/** Nachrichten der angemeldeten Person; ohne Anmeldung alle (die Auswahl trifft das gewählte Profil). */
export function messagesFor(db, user) {
  const all = list(db, 'messages');
  if (user.anonymous) return all;
  return all.filter((m) => visibleTo(m, user.employeeId) && !(m.hiddenBy || []).includes(user.employeeId));
}

export function handleMessages(db, method, idOrAction, query, body, user) {
  // ohne Anmeldung kommt die handelnde Person aus der Profilauswahl im Browser
  const actor = user.anonymous ? Number(body?.actorId ?? query.employeeId) || null : user.employeeId;
  if (method === 'GET') return messagesFor(db, user).filter((m) => !actor || (visibleTo(m, actor) && !(m.hiddenBy || []).includes(actor)));
  if (!actor) throw new ApiError(400, 'Nachrichten setzen ein Mitarbeiterprofil voraus.');

  if (method === 'POST' && !idOrAction) {
    const toIds = [...new Set((Array.isArray(body?.toIds) ? body.toIds : []).map(Number).filter((n) => Number.isFinite(n) && n !== actor))];
    const text = String(body?.body || '').trim();
    if (!toIds.length) throw new ApiError(400, 'Bitte mindestens eine Empfängerin oder einen Empfänger wählen.');
    if (!text) throw new ApiError(400, 'Die Nachricht ist leer.');
    if (text.length > 8000) throw new ApiError(400, 'Die Nachricht ist zu lang (max. 8000 Zeichen).');
    const known = new Set(list(db, 'employees').map((e) => e.id));
    if (toIds.some((t) => !known.has(t))) throw new ApiError(400, 'Unbekannte Empfängerin oder unbekannter Empfänger.');
    let threadId = null;
    if (body.threadId) {
      const root = get(db, 'messages', Number(body.threadId));
      if (!root || !visibleTo(root, actor)) throw new ApiError(404, 'Die Nachricht, auf die geantwortet wird, wurde nicht gefunden.');
      threadId = root.threadId || root.id;
    }
    const link = typeof body.link === 'string' && body.link.startsWith('/') ? body.link.slice(0, 600) : null; // nur Verweise innerhalb der Anwendung
    return insert(db, 'messages', {
      fromId: actor, toIds, subject: String(body.subject || '').slice(0, 200), body: text, link, linkLabel: link ? String(body.linkLabel || '').slice(0, 120) : null,
      threadId, createdAt: new Date().toISOString(), readBy: [actor], hiddenBy: [],
    });
  }
  if (method === 'POST' && (idOrAction === 'read' || idOrAction === 'hide')) {
    const field = idOrAction === 'read' ? 'readBy' : 'hiddenBy';
    const on = idOrAction === 'hide' ? true : body?.read !== false;
    return transaction(db, () => (Array.isArray(body?.ids) ? body.ids : []).map((id) => {
      const m = get(db, 'messages', Number(id));
      if (!m || !visibleTo(m, actor)) return null;
      const set = new Set(m[field] || []);
      if (on) set.add(actor); else set.delete(actor);
      return update(db, 'messages', m.id, { [field]: [...set] });
    }).filter(Boolean));
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}

// ======================================================================== Auswertung: Stunden verdichtet
/** Stunden und Personalkosten je Monat, Person, Projekt und Leistungsphase. */
export function reportHours(db, query, user, can) {
  const all = can('time.all');
  const rate = new Map(list(db, 'employees').map((e) => [e.id, can('costs.view') ? e.hourlyRate || 0 : 0]));
  const m = new Map();
  for (const t of list(db, 'timeEntries')) {
    if (!all && t.employeeId !== user.employeeId) continue;
    if ((query.from && t.date < query.from) || (query.to && t.date > query.to)) continue;
    const key = `${t.date.slice(0, 7)}|${t.employeeId}|${t.projectId}|${t.phaseId ?? ''}`;
    const g = m.get(key) || { month: t.date.slice(0, 7), employeeId: t.employeeId, projectId: t.projectId, phaseId: t.phaseId ?? null, hours: 0, cost: 0 };
    g.hours += t.hours || 0;
    g.cost += (t.hours || 0) * (rate.get(t.employeeId) || 0);
    m.set(key, g);
  }
  return [...m.values()].map((g) => ({ ...g, hours: r2(g.hours), cost: r2(g.cost) }));
}

// ======================================================================== Übergabe an die Buchhaltung
function fmtDate(iso, pattern) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return (pattern || 'DD.MM.YYYY').replace('YYYY', y).replace('MM', m).replace('DD', d);
}
function toCsv(rows, columns, cfg) {
  const sep = cfg.separator === '\\t' ? '\t' : cfg.separator || ';';
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s; };
  return (cfg.encoding === 'utf-8-bom' ? '﻿' : '') + [columns.map((c) => esc(c.header)).join(sep), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(sep))].join('\r\n') + '\r\n';
}
const COLS = {
  debitoren: [['number', 'Debitor'], ['name', 'Name'], ['addition', 'Zusatz'], ['street', 'Strasse'], ['zip', 'PLZ'], ['city', 'Ort'], ['country', 'Land'], ['vatId', 'UStIdNr'], ['email', 'EMail'], ['paymentDays', 'Zahlungsziel']],
  kreditoren: [['number', 'Kreditor'], ['name', 'Name'], ['addition', 'Zusatz'], ['street', 'Strasse'], ['zip', 'PLZ'], ['city', 'Ort'], ['country', 'Land'], ['vatId', 'UStIdNr'], ['email', 'EMail'], ['iban', 'IBAN'], ['paymentDays', 'Zahlungsziel']],
  debitorenBelege: [['mandant', 'Mandant'], ['kind', 'Belegart'], ['docNo', 'Belegnummer'], ['date', 'Belegdatum'], ['due', 'Faelligkeit'], ['partner', 'Debitor'], ['name', 'Name'], ['account', 'Sammelkonto'], ['contra', 'Erloeskonto'], ['vatCode', 'Steuercode'], ['net', 'Netto'], ['vat', 'USt'], ['gross', 'Brutto'], ['costUnit', 'Kostentraeger'], ['text', 'Text']],
  kreditorenBelege: [['mandant', 'Mandant'], ['kind', 'Belegart'], ['docNo', 'Belegnummer'], ['date', 'Belegdatum'], ['due', 'Faelligkeit'], ['partner', 'Kreditor'], ['name', 'Name'], ['account', 'Sammelkonto'], ['contra', 'Aufwandskonto'], ['vatCode', 'Steuercode'], ['net', 'Netto'], ['vat', 'Vorsteuer'], ['gross', 'Brutto'], ['costUnit', 'Kostentraeger'], ['text', 'Text']],
};
export const ACCOUNTING_TYPES = Object.keys(COLS);

/**
 * Exportdatei für die Finanzbuchhaltung.
 *  debitoren / kreditoren          – Stammdaten
 *  debitorenBelege                 – gestellte Ausgangsrechnungen (Stornos als Gegenbuchung, wenn bereits übergeben)
 *  kreditorenBelege                – angefallene Fremdkosten mit Kreditor und Belegnummer
 */
export function accountingExport(db, body, user, can) {
  if (!can('accounting.export')) throw new ApiError(403, 'Keine Berechtigung für die Übergabe an die Buchhaltung.');
  const { type } = body || {};
  if (!COLS[type]) throw new ApiError(400, 'Unbekannte Exportart');
  const settings = getSettings(db);
  const cfg = { ...settings.abacus };
  const acc = settings.accounting || {};
  const dec = cfg.decimal || ',';
  const money = (n) => r2(n).toFixed(2).replace('.', dec);
  const inRange = (d) => (!body.from || d >= body.from) && (!body.to || d <= body.to);
  const contacts = new Map(list(db, 'contacts').map((c) => [c.id, c]));
  const projects = new Map(list(db, 'projects').map((p) => [p.id, p]));
  const warnings = [];
  const rows = [];
  const mark = [];
  let total = 0;

  if (type === 'debitoren' || type === 'kreditoren') {
    const kind = type === 'debitoren' ? 'debitor' : 'kreditor';
    for (const c of list(db, 'contacts').filter((x) => x.kind === kind && x.active !== false).sort((a, b) => String(a.number).localeCompare(String(b.number), 'de', { numeric: true }))) {
      rows.push({ ...c, country: c.country || 'DE', paymentDays: c.paymentDays ?? settings.paymentDays });
    }
  } else if (type === 'debitorenBelege') {
    const noDebitor = new Set();
    for (const i of list(db, 'invoices').sort((a, b) => String(a.invoiceNo).localeCompare(String(b.invoiceNo)))) {
      if (!i.invoiceNo || i.status === 'entwurf' || !inRange(i.date)) continue;
      const storno = i.status === 'storniert';
      if (storno ? !i.exportedAt || String(i.exportedAt).startsWith('S') : body.onlyNew !== false && i.exportedAt) continue;
      const p = projects.get(i.projectId);
      const d = p?.debitorId ? contacts.get(p.debitorId) : null;
      if (!d) { noDebitor.add(p?.number || `Projekt ${i.projectId}`); continue; }
      const sign = storno ? -1 : 1;
      rows.push({
        mandant: cfg.mandant, kind: storno ? 'ST' : 'RE', docNo: i.invoiceNo, date: fmtDate(i.date, cfg.dateFormat), due: fmtDate(i.dueDate, cfg.dateFormat), partner: d.number, name: d.name,
        account: acc.debitorAccount, contra: acc.revenueAccount, vatCode: acc.vatCode, net: money(sign * i.net), vat: money(sign * i.vat), gross: money(sign * i.gross),
        costUnit: p.extNo || p.number, text: `${i.type} ${i.number} ${p.name}`.slice(0, 80),
      });
      total += sign * i.gross;
      mark.push(['invoices', i.id, storno ? `S${new Date().toISOString()}` : null]);
    }
    if (noDebitor.size) warnings.push(`Kein Debitor zugeordnet – Rechnungen nicht übergeben: ${[...noDebitor].join(', ')} (Projekt bearbeiten → Debitor)`);
  } else {
    let incomplete = 0;
    for (const c of list(db, 'costs').sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      if (c.status !== 'angefallen' || !c.date || !inRange(c.date)) continue;
      if (body.onlyNew !== false && c.exportedAt) continue;
      const k = c.kreditorId ? contacts.get(c.kreditorId) : null;
      if (!k || !c.docNo) { incomplete += 1; continue; }
      const p = projects.get(c.projectId);
      const vatPct = c.vatPct ?? settings.vatPct;
      const vat = r2((c.amount * vatPct) / 100);
      rows.push({
        mandant: cfg.mandant, kind: 'ER', docNo: c.docNo, date: fmtDate(c.date, cfg.dateFormat), due: fmtDate(c.dueDate || addDays(c.date, k.paymentDays ?? 30), cfg.dateFormat), partner: k.number, name: k.name,
        account: acc.kreditorAccount, contra: (acc.expenseAccounts || {})[c.category] || acc.defaultExpenseAccount, vatCode: vatPct ? acc.inputVatCode : '', net: money(c.amount), vat: money(vat), gross: money(c.amount + vat),
        costUnit: p ? p.extNo || p.number : '', text: `${c.category || ''} ${c.description || ''}`.trim().slice(0, 80),
      });
      total += c.amount + vat;
      mark.push(['costs', c.id, null]);
    }
    if (incomplete) warnings.push(`${incomplete} angefallene Kostenposition(en) ohne Kreditor oder Belegnummer nicht übergeben (Projekt → Kosten).`);
  }

  const columns = COLS[type].map(([key, header]) => ({ key, header }));
  const stamp = body.from || body.to ? `${body.from || ''}_${body.to || ''}` : today();
  const filename = `fibu_${type}_${stamp}${cfg.mandant ? '_' + cfg.mandant : ''}.csv`;
  if (body.preview) return { filename, columns, rows: rows.slice(0, 200), count: rows.length, total: r2(total), warnings };
  return transaction(db, () => {
    const now = new Date().toISOString();
    if (body.markExported !== false) for (const [table, id, value] of mark) update(db, table, id, { exportedAt: value || now });
    const log = insert(db, 'abacusExports', { type, period: body.from || body.to ? `${body.from || '…'} – ${body.to || '…'}` : 'alle offenen', createdAt: now, createdBy: user.employeeId ?? null, count: rows.length, hours: r2(total), filename });
    return { filename, content: toCsv(rows, columns, cfg), count: rows.length, total: r2(total), warnings, log };
  });
}

/** Zahl aus „1.234,56“, „1234.56“ oder „1'234.56“ */
function parseAmount(s) {
  let t = String(s).replace(/[€\s'’]|EUR|CHF/g, '');
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function parseDate(s) {
  const t = String(s).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(t);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/**
 * Zahlungseingänge aus der Buchhaltung abgleichen (CSV mit Rechnungsnummer, Datum, Betrag – Spalten beliebig).
 * Ohne `apply` nur Vorschau.
 */
export function importPayments(db, body, can) {
  if (!can('accounting.export')) throw new ApiError(403, 'Keine Berechtigung für den Zahlungsabgleich.');
  const text = String(body?.text || '').replace(/^﻿/, '');
  if (!text.trim()) throw new ApiError(400, 'Die Datei ist leer.');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = [';', '\t', ','].map((s) => [s, lines[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const byNo = new Map(list(db, 'invoices').filter((i) => i.invoiceNo).map((i) => [i.invoiceNo.toLowerCase(), i]));
  const matches = [];
  let unmatched = 0;
  for (const line of lines) {
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const inv = cells.map((c) => byNo.get(c.toLowerCase())).find(Boolean);
    if (!inv) { unmatched += 1; continue; }
    const date = cells.map(parseDate).find(Boolean) || today();
    const amounts = cells.filter((c) => c.toLowerCase() !== inv.invoiceNo.toLowerCase() && !parseDate(c)).map(parseAmount).filter((n) => n !== null && n > 0);
    // der Betrag, der dem Rechnungsbetrag am nächsten liegt (Dateien enthalten oft auch Konten und Nummern)
    const amount = amounts.length ? amounts.sort((a, b) => Math.abs(a - inv.gross) - Math.abs(b - inv.gross))[0] : inv.gross;
    const full = amount >= inv.gross - 0.01;
    matches.push({ invoiceId: inv.id, invoiceNo: inv.invoiceNo, gross: inv.gross, date, amount: r2(amount), result: inv.status === 'bezahlt' ? 'bereits bezahlt' : inv.status === 'storniert' ? 'storniert' : full ? 'bezahlt' : 'Teilzahlung' });
  }
  if (lines.length > 1 && unmatched === lines.length) throw new ApiError(400, 'In der Datei wurde keine bekannte Rechnungsnummer gefunden.');
  if (!body.apply) return { matches, unmatched: Math.max(0, unmatched - 1), applied: 0 };
  return transaction(db, () => {
    let applied = 0;
    for (const m of matches) {
      if (m.result !== 'bezahlt' && m.result !== 'Teilzahlung') continue;
      update(db, 'invoices', m.invoiceId, { paidDate: m.date, paidAmount: m.amount, status: m.result === 'bezahlt' ? 'bezahlt' : 'gestellt' });
      applied += 1;
    }
    return { matches, unmatched: Math.max(0, unmatched - 1), applied };
  });
}

/** Einmalig: Auftraggeber der Projekte als Debitoren anlegen und zuordnen, neues Recht vergeben. */
export function migrateAccounting(db) {
  const byName = new Map(list(db, 'contacts').filter((c) => c.kind === 'debitor').map((c) => [c.name.trim().toLowerCase(), c]));
  for (const p of list(db, 'projects')) {
    const name = String(p.client || '').trim();
    if (!name || p.debitorId) continue;
    let d = byName.get(name.toLowerCase());
    if (!d) { d = insert(db, 'contacts', { kind: 'debitor', number: nextContactNumber(db, 'debitor'), name, country: 'DE', active: true }); byName.set(name.toLowerCase(), d); }
    update(db, 'projects', p.id, { debitorId: d.id });
  }
  for (const r of list(db, 'roles')) {
    if (r.key === 'controlling' && Array.isArray(r.permissions) && r.permissions.includes('abacus.export') && !r.permissions.includes('accounting.export')) {
      update(db, 'roles', r.id, { permissions: [...r.permissions, 'accounting.export'] });
    }
  }
}
