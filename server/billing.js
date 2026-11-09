// Abschlags- und Schlussrechnungen nach HOAI (§ 15) sowie Abwesenheiten.
import { list, get, insert, update, remove, transaction, getSettings } from './core.js';
import { ApiError } from './errors.js';
import { nextNumber } from './offers.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);


/**
 * Rechnet eine Abschlagsrechnung:
 *   Leistung kumuliert = Σ Honoraranteil × Leistungsstand
 *   + Nebenkosten (Pauschale in % der Leistung)
 *   − bisherige Abschlagsrechnungen (netto)
 *   = Rechnungsbetrag netto, + Umsatzsteuer = brutto
 */
export function computeInvoice(inv, previousNet) {
  const lines = (Array.isArray(inv.lines) ? inv.lines : []).map((l) => {
    const fee = r2(num(l.fee));
    const percent = Math.max(0, Math.min(100, num(l.percent)));
    return { ...l, fee, percent, amount: r2((fee * percent) / 100) };
  });
  const performance = r2(lines.reduce((s, l) => s + l.amount, 0));
  const nkPct = num(inv.nkPct);
  const vatPct = num(inv.vatPct);
  const nk = r2((performance * nkPct) / 100);
  const cumulative = r2(performance + nk);
  const net = r2(cumulative - previousNet);
  const vat = r2((net * vatPct) / 100);
  return { lines, nkPct, vatPct, performance, nk, cumulative, previousNet: r2(previousNet), net, vat, gross: r2(net + vat) };
}

function previousNetOf(db, projectId, number) {
  return list(db, 'invoices', { projectId }).filter((i) => i.number < number && i.status !== 'storniert').reduce((s, i) => s + (i.net || 0), 0);
}

/** Entwürfe neu berechnen (gestellte Rechnungen bleiben unverändert). */
function recalcDrafts(db, projectId) {
  const drafts = list(db, 'invoices', { projectId }).filter((i) => i.status === 'entwurf').sort((a, b) => a.number - b.number);
  for (const d of drafts) update(db, 'invoices', d.id, computeInvoice(d, previousNetOf(db, projectId, d.number)));
}

function nextInvoiceNo(db, date) {
  return nextNumber(getSettings(db).invoiceNoFormat || 'RE-{JJJJ}-{NNN}', date, list(db, 'invoices').map((i) => i.invoiceNo));
}

const FROZEN_EDITABLE = ['status', 'paidDate', 'paidAmount', 'note', 'dueDate'];
const STATUS = ['entwurf', 'gestellt', 'bezahlt', 'storniert'];

export function handleInvoices(db, method, id, body, user, validate, can) {
  if (!can('invoices.view')) throw new ApiError(403, 'Keine Berechtigung, Rechnungen einzusehen.');
  if (method === 'GET') return id ? get(db, 'invoices', id) : list(db, 'invoices');
  if (!can('invoices.edit')) throw new ApiError(403, 'Keine Berechtigung, Rechnungen zu bearbeiten.');

  if (method === 'POST' && !id) {
    validate('invoices', body, false);
    return transaction(db, () => {
      const projectId = Number(body.projectId);
      if (!get(db, 'projects', projectId)) throw new ApiError(400, 'Projekt nicht gefunden');
      const settings = getSettings(db);
      const number = Math.max(0, ...list(db, 'invoices', { projectId }).map((i) => i.number || 0)) + 1;
      const base = {
        projectId, number, type: body.type || 'Abschlagsrechnung', date: body.date, periodEnd: body.periodEnd || body.date,
        lines: body.lines || [], nkPct: body.nkPct ?? settings.nkPct, vatPct: body.vatPct ?? settings.vatPct,
        status: 'entwurf', note: body.note || '', createdBy: user.employeeId ?? null,
      };
      return insert(db, 'invoices', { ...base, ...computeInvoice(base, previousNetOf(db, projectId, number)) });
    });
  }

  const current = id ? get(db, 'invoices', id) : null;
  if (!current) throw new ApiError(404, 'Rechnung nicht gefunden');

  if (method === 'DELETE') {
    if (current.status !== 'entwurf') throw new ApiError(409, 'Gestellte Rechnungen können nicht gelöscht, nur storniert werden.');
    return transaction(db, () => {
      remove(db, 'invoices', id);
      recalcDrafts(db, current.projectId);
      return { ok: true };
    });
  }

  if (method === 'PUT' || method === 'PATCH') {
    const patch = { ...body };
    if (patch.status && !STATUS.includes(patch.status)) throw new ApiError(400, 'Unbekannter Rechnungsstatus');
    validate('invoices', { ...current, ...patch }, true);
    return transaction(db, () => {
      if (current.status !== 'entwurf') {
        // Festgeschrieben: nur Zahlungs- und Statusangaben änderbar
        for (const k of Object.keys(patch)) if (!FROZEN_EDITABLE.includes(k)) delete patch[k];
        if (patch.status === 'entwurf') throw new ApiError(409, 'Eine gestellte Rechnung kann nicht zurück in den Entwurf gesetzt werden.');
        update(db, 'invoices', id, patch);
      } else {
        const merged = { ...current, ...patch };
        const settings = getSettings(db);
        const calc = computeInvoice(merged, previousNetOf(db, current.projectId, current.number));
        const extra = {};
        if (patch.status && patch.status !== 'entwurf') {
          if (calc.net <= 0 && merged.type !== 'Schlussrechnung') throw new ApiError(409, 'Der Rechnungsbetrag ist nicht positiv – Leistungsstand prüfen.');
          extra.invoiceNo = nextInvoiceNo(db, merged.date);
          extra.dueDate = merged.dueDate || addDays(merged.date, Number(settings.paymentDays) || 30);
        }
        const { id: _i, projectId: _p, number: _n, invoiceNo: _no, ...rest } = merged;
        void _i; void _p; void _n; void _no;
        update(db, 'invoices', id, { ...rest, ...calc, ...extra });
      }
      recalcDrafts(db, current.projectId);
      return get(db, 'invoices', id);
    });
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}

// ============================================================================ Abwesenheiten
export const ABSENCE_TYPES = ['Urlaub', 'Krankheit', 'Fortbildung', 'Gleitzeit', 'Sonderurlaub', 'Sonstiges'];

/** Datenschutz: Mitarbeiter sehen bei Kolleg/innen nur „abwesend“, keinen Krankheitsgrund und keine Notizen. */
export function maskAbsences(rows, user, seeDetails) {
  if (seeDetails) return rows;
  return rows.map((a) => (a.employeeId !== null && a.employeeId !== user.employeeId
    ? { ...a, type: a.type === 'Krankheit' ? 'Sonstiges' : a.type, note: '' }
    : a));
}

export function handleAbsences(db, method, id, body, user, validate, can) {
  const details = can('absences.details');
  if (method === 'GET') return id ? maskAbsences([get(db, 'absences', id)].filter(Boolean), user, details)[0] ?? null : maskAbsences(list(db, 'absences'), user, details);
  const lead = can('absences.approve');

  if (method === 'POST' && !id) {
    validate('absences', body, false);
    if (!ABSENCE_TYPES.includes(body.type)) throw new ApiError(400, 'Unbekannte Abwesenheitsart');
    const employeeId = body.employeeId === null || body.employeeId === undefined || body.employeeId === '' ? null : Number(body.employeeId);
    if (!lead && employeeId !== user.employeeId) throw new ApiError(403, 'Keine Berechtigung, Abwesenheiten für andere einzutragen.');
    let status = body.status || (lead || body.type === 'Krankheit' ? 'genehmigt' : 'beantragt');
    if (!lead && status !== 'beantragt' && body.type !== 'Krankheit') status = 'beantragt';
    if (body.halfDay && body.startDate !== body.endDate) throw new ApiError(400, 'Halbe Tage nur für eintägige Abwesenheiten');
    return insert(db, 'absences', {
      ...body, employeeId, status, createdBy: user.employeeId ?? null, decidedBy: status === 'genehmigt' && lead ? user.employeeId ?? null : null,
    });
  }

  const current = id ? get(db, 'absences', id) : null;
  if (!current) throw new ApiError(404, 'Abwesenheit nicht gefunden');
  const own = current.employeeId !== null && current.employeeId === user.employeeId;
  if (!lead && !(own && current.status === 'beantragt')) throw new ApiError(403, 'Nur eigene, noch nicht genehmigte Anträge können geändert werden.');

  if (method === 'DELETE') {
    remove(db, 'absences', id);
    return { ok: true };
  }
  if (method === 'PUT' || method === 'PATCH') {
    const patch = { ...body };
    if (!lead) { delete patch.status; delete patch.employeeId; }
    if (patch.type && !ABSENCE_TYPES.includes(patch.type)) throw new ApiError(400, 'Unbekannte Abwesenheitsart');
    const merged = { ...current, ...patch };
    validate('absences', merged, true);
    if (merged.halfDay && merged.startDate !== merged.endDate) throw new ApiError(400, 'Halbe Tage nur für eintägige Abwesenheiten');
    if (patch.status && patch.status !== current.status) patch.decidedBy = user.employeeId ?? null;
    return update(db, 'absences', id, patch);
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}
