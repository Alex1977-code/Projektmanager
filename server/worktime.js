// Arbeitszeiterfassung, Monatsabschluss, Rollenverwaltung und Abacus-Export.
import { list, get, insert, update, remove, transaction, getSettings } from './core.js';
import { ApiError } from './errors.js';
import { ALL_PERMISSIONS } from '../shared/permissions.js';
import { netMinutes, minBreak, toMin } from '../shared/worktime.js';
import { holidayName } from '../shared/holidays.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const MONTH = /^\d{4}-\d{2}$/;
const deny = (msg) => { throw new ApiError(403, msg); };

/** Status des Monats einer Person ('offen' | 'eingereicht' | 'freigegeben'). */
export function monthStatus(db, employeeId, month) {
  return list(db, 'worktimeMonths', { employeeId: Number(employeeId), month })[0]?.status || 'offen';
}

/** Darf diese Person Zeiten des Monats noch ändern? */
export function assertMonthOpen(db, user, can, employeeId, date) {
  const status = monthStatus(db, employeeId, String(date).slice(0, 7));
  if (status === 'offen') return;
  if (status === 'eingereicht' && can('worktime.approve')) return;
  if (status === 'freigegeben' && can('worktime.approve')) {
    throw new ApiError(409, 'Der Monat ist freigegeben. Bitte zuerst wieder öffnen, um Zeiten zu ändern.');
  }
  throw new ApiError(409, status === 'eingereicht'
    ? 'Der Monat wurde zur Freigabe eingereicht. Änderungen nur nach Rückgabe durch die Freigabe.'
    : 'Der Monat ist abgeschlossen und freigegeben.');
}

function ownOrAll(user, can, employeeId, what) {
  if (Number(employeeId) !== user.employeeId && !can('time.all')) deny(`${what} anderer Personen sind nicht freigegeben.`);
}

// ======================================================================== Arbeitszeiten
export function handleWorktimes(db, method, action, query, body, user, can) {
  if (method === 'GET' && !action && query.all) {
    // Monatsübersicht aller Personen (für die Freigabe)
    if (!can('time.all')) deny('Arbeitszeiten anderer Personen sind nicht freigegeben.');
    if (!MONTH.test(String(query.month))) throw new ApiError(400, 'Monat erforderlich');
    return list(db, 'worktimes').filter((w) => w.date.startsWith(query.month));
  }
  if (method === 'GET' && !action) {
    const employeeId = Number(query.employeeId ?? user.employeeId);
    ownOrAll(user, can, employeeId, 'Arbeitszeiten');
    return list(db, 'worktimes', { employeeId }).filter((w) => !query.month || w.date.startsWith(query.month))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  if (method === 'POST' && action === 'set') {
    const { employeeId, date } = body || {};
    if (!employeeId || !DATE.test(String(date))) throw new ApiError(400, 'Person und Datum erforderlich');
    ownOrAll(user, can, employeeId, 'Arbeitszeiten');
    for (const k of ['start', 'end']) if (body[k] && !TIME.test(body[k])) throw new ApiError(400, `Ungültige Uhrzeit (${k === 'start' ? 'Beginn' : 'Ende'}), bitte HH:MM`);
    const breakMin = body.breakMin === '' || body.breakMin == null ? 0 : Number(body.breakMin);
    if (!Number.isFinite(breakMin) || breakMin < 0 || breakMin > 600) throw new ApiError(400, 'Ungültige Pause');
    assertMonthOpen(db, user, can, employeeId, date);
    return transaction(db, () => {
      const existing = list(db, 'worktimes', { employeeId: Number(employeeId), date });
      for (const r of existing.slice(1)) remove(db, 'worktimes', r.id);
      if (!body.start && !body.end) {
        if (existing[0]) remove(db, 'worktimes', existing[0].id);
        return { deleted: true };
      }
      const data = { employeeId: Number(employeeId), date, start: body.start || null, end: body.end || null, breakMin, location: body.location || '', note: body.note || '' };
      return existing[0] ? update(db, 'worktimes', existing[0].id, data) : insert(db, 'worktimes', data);
    });
  }

  // Stempeluhr: Kommen / Gehen (Uhrzeit vom Gerät der Person)
  if (method === 'POST' && action === 'stamp') {
    // ohne Anmeldung kommt die Person aus der Profilauswahl im Browser
    const emp = Number(body?.employeeId) || user.employeeId;
    if (!emp) throw new ApiError(400, 'Stempeln ist nur mit einem Mitarbeiterprofil möglich.');
    if (emp !== user.employeeId && !can('time.all')) throw new ApiError(403, 'Sie können nur für sich selbst stempeln.');
    const { action: act, date, time } = body || {};
    if (!DATE.test(String(date)) || !TIME.test(String(time))) throw new ApiError(400, 'Datum und Uhrzeit erforderlich');
    assertMonthOpen(db, user, can, emp, date);
    return transaction(db, () => {
      const cur = list(db, 'worktimes', { employeeId: emp, date })[0];
      if (act === 'kommen') {
        if (cur?.start && !cur.end) throw new ApiError(409, `Bereits eingestempelt seit ${cur.start} Uhr.`);
        if (cur?.start && cur.end) {
          // erneutes Kommen am selben Tag: Unterbrechung als Pause werten
          const gap = toMin(time) - toMin(cur.end);
          return update(db, 'worktimes', cur.id, { end: null, breakMin: (cur.breakMin || 0) + Math.max(0, gap) });
        }
        return insert(db, 'worktimes', { employeeId: emp, date, start: time, end: null, breakMin: 0, location: body.location || '', note: '' });
      }
      if (act === 'gehen') {
        if (!cur?.start || cur.end) throw new ApiError(409, 'Sie sind heute nicht eingestempelt.');
        const draft = { ...cur, end: time };
        const work = netMinutes(draft);
        const need = minBreak(work);
        const patch = { end: time };
        if ((cur.breakMin || 0) < need) {
          patch.breakMin = need; // gesetzliche Mindestpause (§ 4 ArbZG) ergänzen
          patch.note = [cur.note, `Pause auf ${need} min ergänzt (§ 4 ArbZG)`].filter(Boolean).join(' · ');
        }
        return update(db, 'worktimes', cur.id, patch);
      }
      throw new ApiError(400, 'Unbekannte Stempelaktion');
    });
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}

// ======================================================================== Monatsabschluss
export function handleWorktimeMonths(db, method, action, query, body, user, can) {
  if (method === 'GET' && !action) {
    const rows = list(db, 'worktimeMonths').filter((m) => !query.month || m.month === query.month);
    return can('time.all') ? rows : rows.filter((m) => m.employeeId === user.employeeId);
  }
  if (method === 'POST' && action === 'action') {
    const { employeeId, month, action: act, note } = body || {};
    if (!employeeId || !MONTH.test(String(month))) throw new ApiError(400, 'Person und Monat erforderlich');
    const own = Number(employeeId) === user.employeeId;
    const cur = list(db, 'worktimeMonths', { employeeId: Number(employeeId), month })[0];
    const status = cur?.status || 'offen';
    const now = new Date().toISOString();
    let patch;
    if (act === 'submit') {
      if (!own && !can('time.all')) deny('Nur die eigene Arbeitszeit kann eingereicht werden.');
      if (status !== 'offen') throw new ApiError(409, 'Der Monat ist bereits eingereicht.');
      const open = list(db, 'worktimes', { employeeId: Number(employeeId) }).filter((w) => w.date.startsWith(month) && w.start && !w.end);
      if (open.length) throw new ApiError(409, `Am ${open[0].date.split('-').reverse().join('.')} fehlt das Arbeitsende.`);
      patch = { status: 'eingereicht', submittedAt: now };
    } else if (act === 'approve') {
      if (!can('worktime.approve')) deny('Keine Berechtigung zur Freigabe von Arbeitszeiten.');
      if (own && user.role !== 'admin') deny('Die eigene Arbeitszeit muss eine andere Person freigeben.');
      patch = { status: 'freigegeben', approvedBy: user.employeeId ?? null, approvedAt: now };
    } else if (act === 'reject' || act === 'reopen') {
      if (!can('worktime.approve') && !(own && status === 'eingereicht' && act === 'reject')) deny('Keine Berechtigung, den Monat wieder zu öffnen.');
      patch = { status: 'offen', approvedBy: null, approvedAt: null, exportedAt: act === 'reopen' ? null : cur?.exportedAt ?? null, note: note || '' };
    } else throw new ApiError(400, 'Unbekannte Aktion');
    return cur ? update(db, 'worktimeMonths', cur.id, patch) : insert(db, 'worktimeMonths', { employeeId: Number(employeeId), month, ...patch });
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}

// ======================================================================== Rollen
export function handleRoles(db, method, id, body, user, can) {
  if (method === 'GET') return list(db, 'roles').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  if (!can('roles.edit')) deny('Rollen und Rechte kann nur die Administration verwalten.');
  const clean = (perms) => (Array.isArray(perms) ? perms.filter((p) => ALL_PERMISSIONS.includes(p)) : []);
  if (method === 'POST' && !id) {
    const key = String(body?.key || body?.name || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (!key || !body?.name) throw new ApiError(400, 'Bitte einen Namen für die Rolle angeben');
    if (list(db, 'roles', { key }).length) throw new ApiError(409, 'Eine Rolle mit diesem Namen gibt es bereits');
    const sort = Math.max(0, ...list(db, 'roles').map((r) => r.sort || 0)) + 1;
    return insert(db, 'roles', { key, name: body.name, description: body.description || '', permissions: clean(body.permissions), system: false, sort });
  }
  const role = get(db, 'roles', id);
  if (!role) throw new ApiError(404, 'Rolle nicht gefunden');
  if (method === 'PUT' || method === 'PATCH') {
    const patch = {};
    if (body?.name) patch.name = String(body.name);
    if (body?.description !== undefined) patch.description = String(body.description);
    if (body?.permissions !== undefined) {
      if (role.key === 'admin') throw new ApiError(409, 'Die Rolle „Administration“ hat immer alle Rechte.');
      patch.permissions = clean(body.permissions);
    }
    return update(db, 'roles', id, patch);
  }
  if (method === 'DELETE') {
    if (role.system) throw new ApiError(409, 'Standardrollen können nicht gelöscht werden.');
    const users = list(db, 'employees', { appRole: role.key }).length;
    if (users) throw new ApiError(409, `Die Rolle ist noch ${users} Person(en) zugewiesen.`);
    remove(db, 'roles', id);
    return { ok: true };
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}

// ======================================================================== Abacus-Export
function fmtDate(iso, pattern) {
  const [y, m, d] = iso.split('-');
  return pattern.replace('YYYY', y).replace('MM', m).replace('DD', d);
}
const fmtNum = (n, dec) => (Math.round(n * 100) / 100).toFixed(2).replace('.', dec);

function csv(rows, columns, cfg) {
  const sep = cfg.separator === '\\t' ? '\t' : cfg.separator || ';';
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.header)).join(sep), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(sep))];
  return (cfg.encoding === 'utf-8-bom' ? '﻿' : '') + lines.join('\r\n') + '\r\n';
}

/**
 * Exportdatei für Abacus erzeugen.
 *  type 'leistungen'  – Projektzeiten (für AbaProject / Leistungserfassung)
 *  type 'arbeitszeit' – Anwesenheit je Tag inkl. Abwesenheiten (für Abacus HR / Lohn)
 */
export function abacusExport(db, body, user, can) {
  if (!can('abacus.export')) deny('Keine Berechtigung für den Abacus-Export.');
  const { type, month } = body || {};
  if (!['leistungen', 'arbeitszeit'].includes(type)) throw new ApiError(400, 'Unbekannte Exportart');
  if (!MONTH.test(String(month))) throw new ApiError(400, 'Bitte einen Monat wählen (JJJJ-MM)');
  const settings = getSettings(db);
  const cfg = { ...settings.abacus, ...(body.config || {}) };
  const employees = new Map(list(db, 'employees').map((e) => [e.id, e]));
  const projects = new Map(list(db, 'projects').map((p) => [p.id, p]));
  const phases = new Map(list(db, 'phases').map((p) => [p.id, p]));
  const months = list(db, 'worktimeMonths').filter((m) => m.month === month);
  const approved = new Set(months.filter((m) => m.status === 'freigegeben').map((m) => m.employeeId));
  const warnings = [];
  const skipped = new Set();
  const include = (empId) => {
    if (!cfg.onlyApproved || approved.has(empId)) return true;
    skipped.add(empId);
    return false;
  };
  const emp = (id) => employees.get(id);
  const missingNo = new Set();
  const pno = (id) => {
    const e = emp(id);
    if (!e?.personnelNo) missingNo.add(e?.name || `#${id}`);
    return e?.personnelNo || '';
  };

  let rows = [];
  let columns;
  let markIds = [];
  if (type === 'leistungen') {
    columns = cfg.leistungColumns;
    const entries = list(db, 'timeEntries').filter((t) => t.date.startsWith(month) && include(t.employeeId))
      .sort((a, b) => (emp(a.employeeId)?.name || '').localeCompare(emp(b.employeeId)?.name || '') || a.date.localeCompare(b.date));
    for (const t of entries) {
      const p = projects.get(t.projectId);
      const ph = t.phaseId ? phases.get(t.phaseId) : null;
      const st = (ph?.code && cfg.serviceTypes?.[ph.code]) || cfg.defaultServiceType || '';
      rows.push({
        mandant: cfg.mandant, personnelNo: pno(t.employeeId), employeeName: emp(t.employeeId)?.name || '',
        date: fmtDate(t.date, cfg.dateFormat), projectNo: p?.extNo || p?.number || '', projectName: p?.name || '',
        phaseCode: ph?.code || '', serviceType: st, hours: fmtNum(t.hours, cfg.decimal), _hours: t.hours,
        text: [ph ? `${ph.code} ${ph.name}` : '', t.note || ''].filter(Boolean).join(' – '),
        exported: t.exportedAt ? 'ja' : '',
      });
      markIds.push(t.id);
    }
  } else {
    columns = cfg.arbeitszeitColumns;
    const state = settings.state || 'HB';
    const absences = list(db, 'absences').filter((a) => a.status === 'genehmigt');
    const byEmpDay = new Map(list(db, 'worktimes').filter((w) => w.date.startsWith(month)).map((w) => [`${w.employeeId}|${w.date}`, w]));
    const [y, m] = month.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const e of [...employees.values()].filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
      if (!include(e.id)) continue;
      for (let d = 1; d <= days; d++) {
        const date = `${month}-${String(d).padStart(2, '0')}`;
        const dow = new Date(date + 'T00:00:00Z').getUTCDay();
        const w = byEmpDay.get(`${e.id}|${date}`);
        const hol = holidayName(date, state);
        const abs = absences.find((a) => (a.employeeId === e.id || a.employeeId === null) && a.startDate <= date && a.endDate >= date);
        let absence = '';
        if (dow >= 1 && dow <= 5) {
          if (hol) absence = cfg.absenceCodes?.holiday || 'FT';
          else if (abs) absence = cfg.absenceCodes?.[abs.type] || abs.type;
        }
        if (!w && !absence) continue;
        const net = w ? netMinutes(w) : 0;
        if (w && w.start && !w.end) warnings.push(`${e.name}: am ${fmtDate(date, 'DD.MM.YYYY')} fehlt das Arbeitsende`);
        rows.push({
          mandant: cfg.mandant, personnelNo: pno(e.id), employeeName: e.name, date: fmtDate(date, cfg.dateFormat),
          start: w?.start || '', end: w?.end || '', breakMin: w ? String(w.breakMin || 0) : '',
          hours: fmtNum(net / 60, cfg.decimal), _hours: net / 60, absence, location: w?.location || '', text: w?.note || '',
        });
      }
    }
  }
  if (missingNo.size) warnings.unshift(`Keine Abacus-Personalnummer hinterlegt: ${[...missingNo].join(', ')} (Team → Mitarbeiter bearbeiten)`);
  if (skipped.size) warnings.push(`${skipped.size} Person(en) ohne freigegebenen Monat nicht exportiert: ${[...skipped].map((id) => emp(id)?.name).join(', ')}`);
  const hours = rows.reduce((s, r) => s + (r._hours || 0), 0);
  const filename = `abacus_${type}_${month}${cfg.mandant ? '_' + cfg.mandant : ''}.csv`;
  const content = csv(rows, columns, cfg);
  const preview = rows.slice(0, 200).map(({ _hours, ...r }) => { void _hours; return r; });
  if (body.preview) return { filename, rows: preview, count: rows.length, hours, warnings, columns };

  return transaction(db, () => {
    const now = new Date().toISOString();
    if (body.markExported !== false) {
      if (type === 'leistungen') for (const id of markIds) update(db, 'timeEntries', id, { exportedAt: now });
      else for (const m of months.filter((x) => x.status === 'freigegeben')) update(db, 'worktimeMonths', m.id, { exportedAt: now });
    }
    const log = insert(db, 'abacusExports', { type, period: month, createdAt: now, createdBy: user.employeeId ?? null, count: rows.length, hours, filename });
    return { filename, content, count: rows.length, hours, warnings, log };
  });
}
