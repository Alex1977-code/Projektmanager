// REST-API – unabhängig vom HTTP-Server testbar.
import {
  SCHEMA, REQUIRED, isTable, list, get, insert, update, remove, transaction,
  getSettings, setSettings, removeWhere, updateWhere,
} from './core.js';

import { ApiError, ANONYMOUS_ADMIN } from './errors.js';
import { handleAbsences, handleInvoices, maskAbsences } from './billing.js';
import { abacusExport, assertMonthOpen, handleRoles, handleWorktimeMonths, handleWorktimes } from './worktime.js';
import { handleAssets, handleOffers, handleWorkPackages } from './offers.js';
import { accountingExport, handleContacts, handleMessages, importPayments, messagesFor, reportHours } from './accounting.js';
import { ALL_PERMISSIONS, permissionsFor } from '../shared/permissions.js';

/** Rechte des Benutzers (aus seiner Rolle, ohne Anmeldung: alle). */
export function permissionSet(db, user) {
  if (user.anonymous || user.role === 'admin') return new Set(ALL_PERMISSIONS);
  return new Set(permissionsFor(user.role, list(db, 'roles')));
}

export { ApiError };

const BOOTSTRAP_TABLES = ['employees', 'projects', 'phases', 'milestones', 'tasks', 'allocations', 'costs', 'protocols', 'absences', 'workPackages', 'assets'];

/** Ist-Stunden und Ist-Personalkosten (Stunden × Verrechnungssatz). */
export function summary(db) {
  const rate = new Map(list(db, 'employees').map((e) => [e.id, e.hourlyRate || 0]));
  const group = (keyFn, fields) => {
    const m = new Map();
    for (const t of list(db, 'timeEntries')) {
      const k = keyFn(t);
      if (k === null) continue;
      const g = m.get(k) || { ...fields(t), hours: 0, cost: 0 };
      g.hours += t.hours || 0;
      g.cost += (t.hours || 0) * (rate.get(t.employeeId) || 0);
      m.set(k, g);
    }
    return [...m.values()];
  };
  return {
    byPhase: group((t) => `${t.projectId}|${t.phaseId}`, (t) => ({ projectId: t.projectId, phaseId: t.phaseId })),
    byEmployee: group((t) => `${t.projectId}|${t.employeeId}`, (t) => ({ projectId: t.projectId, employeeId: t.employeeId })),
    byTask: group((t) => (t.taskId ? String(t.taskId) : null), (t) => ({ taskId: t.taskId })).map(({ taskId, hours }) => ({ taskId, hours })),
    // Arbeitspaket: direkt gebucht oder über eine Aufgabe des Arbeitspakets
    byWorkPackage: (() => {
      const wpOfTask = new Map(list(db, 'tasks').filter((t) => t.workPackageId).map((t) => [t.id, t.workPackageId]));
      const wp = (t) => t.workPackageId || (t.taskId ? wpOfTask.get(t.taskId) : null) || null;
      return group((t) => (wp(t) ? String(wp(t)) : null), (t) => ({ workPackageId: wp(t) }));
    })(),
  };
}

function validate(table, data, partial) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError(400, 'Ungültige Daten');
  if (!partial) {
    for (const f of REQUIRED[table] || []) {
      if (data[f] === undefined || data[f] === null || data[f] === '') {
        throw new ApiError(400, `Pflichtfeld fehlt: ${f}`);
      }
    }
  }
  for (const k of ['startDate', 'endDate', 'date', 'dueDate', 'weekStart', 'nextDate', 'periodEnd', 'paidDate']) {
    if (data[k] && !/^\d{4}-\d{2}-\d{2}$/.test(String(data[k]))) {
      throw new ApiError(400, `Ungültiges Datum in Feld ${k}`);
    }
  }
  const start = data.startDate;
  const end = data.endDate ?? data.dueDate;
  if (start && end && String(start) > String(end)) {
    throw new ApiError(400, 'Das Enddatum liegt vor dem Startdatum');
  }
}

/** Löschen mit referenzieller Bereinigung. */
function cascadeDelete(db, table, id) {
  return transaction(db, () => {
    switch (table) {
      case 'projects':
        if (list(db, 'invoices', { projectId: id }).some((i) => i.status !== 'entwurf')) {
          throw new ApiError(409, 'Für dieses Projekt wurden bereits Rechnungen gestellt. Bitte den Status auf „Abgeschlossen“ setzen statt zu löschen.');
        }
        for (const t of ['invoices', 'offers', 'workPackages', 'phases', 'milestones', 'tasks', 'allocations', 'timeEntries', 'costs', 'protocols']) {
          removeWhere(db, t, (r) => r.projectId === id);
        }
        break;
      case 'phases':
        for (const t of ['tasks', 'timeEntries', 'costs', 'workPackages']) updateWhere(db, t, (r) => r.phaseId === id, { phaseId: null });
        break;
      case 'tasks':
        updateWhere(db, 'timeEntries', (r) => r.taskId === id, { taskId: null });
        break;
      case 'employees': {
        if (list(db, 'timeEntries', { employeeId: id }).length > 0) {
          throw new ApiError(409, 'Für diese Person existieren Zeitbuchungen. Bitte deaktivieren statt löschen.');
        }
        updateWhere(db, 'tasks', (r) => r.assigneeId === id, { assigneeId: null });
        updateWhere(db, 'projects', (r) => r.leadId === id, { leadId: null });
        removeWhere(db, 'allocations', (r) => r.employeeId === id);
        removeWhere(db, 'absences', (r) => r.employeeId === id);
        break;
      }
      default:
        break;
    }
    if (!remove(db, table, id)) throw new ApiError(404, 'Datensatz nicht gefunden');
    return { ok: true };
  });
}

/** Setzt eine Wochenplanung (Upsert, 0 Stunden = löschen). */
function setAllocation(db, body) {
  const { employeeId, projectId, weekStart } = body || {};
  const hours = Number(body?.hours) || 0;
  validate('allocations', { employeeId, projectId, weekStart }, false);
  if (hours < 0 || hours > 80) throw new ApiError(400, 'Stunden müssen zwischen 0 und 80 liegen');
  const existing = list(db, 'allocations', { employeeId: Number(employeeId), projectId: Number(projectId), weekStart })[0];
  if (hours === 0) {
    if (existing) remove(db, 'allocations', existing.id);
    return { deleted: existing ? existing.id : null };
  }
  if (existing) return update(db, 'allocations', existing.id, { hours });
  return insert(db, 'allocations', { employeeId, projectId, weekStart, hours });
}

/** Setzt die Stunden einer Zeile im Stundenzettel für einen Tag (Upsert). */
function setTimeEntry(db, body) {
  const { employeeId, projectId, date } = body || {};
  const phaseId = body?.phaseId ?? null;
  const wpId = body?.workPackageId ? Number(body.workPackageId) : null;
  const hours = Number(body?.hours) || 0;
  validate('timeEntries', { employeeId, projectId, date, hours: hours || 1 }, false);
  if (hours < 0 || hours > 24) throw new ApiError(400, 'Stunden müssen zwischen 0 und 24 liegen');
  return transaction(db, () => {
    const pid = phaseId === null || phaseId === undefined || phaseId === '' ? null : Number(phaseId);
    const rows = list(db, 'timeEntries', { employeeId: Number(employeeId), projectId: Number(projectId), date })
      .filter((r) => (r.phaseId ?? null) === pid && (r.workPackageId ?? null) === wpId);
    for (const r of rows.slice(1)) remove(db, 'timeEntries', r.id);
    if (hours === 0) {
      if (rows[0]) remove(db, 'timeEntries', rows[0].id);
      return { deleted: true };
    }
    if (rows[0]) return update(db, 'timeEntries', rows[0].id, { hours, note: body.note });
    return insert(db, 'timeEntries', { employeeId, projectId, phaseId, workPackageId: wpId, date, hours, note: body.note });
  });
}

function queryTimeEntries(db, q) {
  const where = {};
  if (q.employeeId) where.employeeId = Number(q.employeeId);
  if (q.projectId) where.projectId = Number(q.projectId);
  return list(db, 'timeEntries', where)
    .filter((r) => (!q.from || r.date >= q.from) && (!q.to || r.date <= q.to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .slice(0, 5000);
}

/**
 * Zentrale Routing-Funktion.
 * @returns {Promise<any>|any} Antwortobjekt (wird als JSON gesendet)
 */
export function handle(db, method, pathname, query = {}, body, user = ANONYMOUS_ADMIN) {
  const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [resource, idOrAction] = parts;
  const write = method !== 'GET';
  const deny = (msg) => { throw new ApiError(403, msg); };

  if (resource === 'health') return { ok: true, time: new Date().toISOString() };

  // ------------------------------------------------------------ Berechtigungen (Rollen)
  const perms = permissionSet(db, user);
  const can = (p) => perms.has(p);
  const need = (p, msg) => { if (!can(p)) deny(msg); };
  if (resource === 'export') need('data.export', 'Der Gesamtdatenexport ist nicht freigegeben.');
  if (resource === 'settings' && write) need('settings.edit', 'Keine Berechtigung, Einstellungen zu ändern.');
  if (resource === 'employees' && write) need('employees.edit', 'Keine Berechtigung, Mitarbeiterdaten zu ändern.');
  if (resource === 'employees' && (method === 'POST' || method === 'PUT' || method === 'PATCH') && body?.appRole !== undefined && !can('roles.edit')) {
    // Rollen zuweisen nur mit Rollenrecht – sonst könnte man sich selbst höhere Rechte geben
    const current = idOrAction ? get(db, 'employees', Number(idOrAction))?.appRole : 'mitarbeiter';
    if ((body.appRole || 'mitarbeiter') !== (current || 'mitarbeiter')) deny('Rollen darf nur zuweisen, wer Rollen und Rechte verwalten darf.');
  }
  if (resource === 'projects' && method === 'DELETE') need('projects.delete', 'Keine Berechtigung, Projekte zu löschen.');
  else if (resource === 'projects' && write) need('projects.edit', 'Keine Berechtigung, Projekte anzulegen oder zu ändern.');
  if ((resource === 'phases' || resource === 'milestones') && write) need('schedule.edit', 'Keine Berechtigung, den Terminplan zu ändern.');
  if (resource === 'costs' && write) need('costs.edit', 'Keine Berechtigung, Kosten zu erfassen.');
  if (resource === 'allocations' && write) need('resources.edit', 'Keine Berechtigung, die Ressourcenplanung zu ändern.');
  if (resource === 'tasks' && write) need('tasks.edit', 'Keine Berechtigung, Aufgaben zu bearbeiten.');
  if (resource === 'protocols' && write) need('protocols.edit', 'Keine Berechtigung, Protokolle zu bearbeiten.');
  if (resource === 'timeEntries') {
    const target = write ? body?.employeeId : query.employeeId;
    if ((write || target !== undefined) && Number(target) !== user.employeeId && !can('time.all')) deny('Zeiten anderer Personen sind nicht freigegeben.');
    if (!write && target === undefined && !can('time.all')) query = { ...query, employeeId: String(user.employeeId ?? -1) };
    if (write && body?.date) assertMonthOpen(db, user, can, body.employeeId, body.date);
  }

  if (resource === 'bootstrap' && method === 'GET') {
    const out = { settings: getSettings(db) };
    for (const t of BOOTSTRAP_TABLES) out[t] = list(db, t);
    out.invoices = can('invoices.view') ? list(db, 'invoices') : [];
    out.offers = can('offers.view') ? list(db, 'offers') : [];
    out.contacts = handleContacts(db, 'GET', null, null, validate, can);
    out.messages = messagesFor(db, user);
    out.absences = maskAbsences(out.absences, user, can('absences.details'));
    out.roles = list(db, 'roles').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    out.worktimeMonths = handleWorktimeMonths(db, 'GET', null, {}, null, user, can);
    out.summary = summary(db);
    if (!can('costs.view')) {
      // Stundensätze und Personalkosten nur mit Kostenrecht
      out.employees = out.employees.map((e) => ({ ...e, hourlyRate: null }));
      for (const k of ['byPhase', 'byEmployee', 'byWorkPackage']) out.summary[k] = out.summary[k].map((r) => ({ ...r, cost: 0 }));
      out.workPackages = out.workPackages.map((w) => ({ ...w, budget: null }));
    }
    out.me = { employeeId: user.employeeId ?? null, role: user.role, permissions: [...perms] };
    return out;
  }

  if (resource === 'invoices') return handleInvoices(db, method, idOrAction ? Number(idOrAction) : null, body, user, validate, can);
  if (resource === 'contacts') return handleContacts(db, method, idOrAction ? Number(idOrAction) : null, body, validate, can);
  if (resource === 'messages') return handleMessages(db, method, idOrAction, query, body, user);
  if (resource === 'accounting' && method === 'POST' && idOrAction === 'export') return accountingExport(db, body, user, can);
  if (resource === 'accounting' && method === 'POST' && idOrAction === 'payments') return importPayments(db, body, can);
  if (resource === 'reports' && method === 'GET' && idOrAction === 'hours') return reportHours(db, query, user, can);
  if (resource === 'offers') return handleOffers(db, method, idOrAction, body, user, validate, can);
  if (resource === 'workPackages') return handleWorkPackages(db, method, idOrAction ? Number(idOrAction) : null, query, body, validate, can);
  if (resource === 'assets') return handleAssets(db, method, idOrAction, body, can);
  if (resource === 'absences') return handleAbsences(db, method, idOrAction ? Number(idOrAction) : null, body, user, validate, can);
  if (resource === 'worktimes') return handleWorktimes(db, method, idOrAction, query, body, user, can);
  if (resource === 'worktimeMonths') return handleWorktimeMonths(db, method, idOrAction, query, body, user, can);
  if (resource === 'roles') return handleRoles(db, method, idOrAction ? Number(idOrAction) : null, body, user, can);
  if (resource === 'abacus' && idOrAction === 'export' && method === 'POST') return abacusExport(db, body, user, can);
  if (resource === 'abacusExports' && method === 'GET') {
    if (!can('abacus.export') && !can('accounting.export')) deny('Keine Berechtigung für das Exportprotokoll.');
    return list(db, 'abacusExports').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  if (resource === 'abacusExports') throw new ApiError(405, 'Methode nicht erlaubt');

  if (resource === 'summary' && method === 'GET') return summary(db);

  if (resource === 'settings') {
    if (method === 'GET') return getSettings(db);
    if (method === 'PUT' || method === 'PATCH') return setSettings(db, body || {});
  }

  if (resource === 'export' && method === 'GET') {
    const out = { exportedAt: new Date().toISOString(), settings: getSettings(db) };
    for (const t of Object.keys(SCHEMA)) out[t] = list(db, t);
    return out;
  }

  if (resource === 'allocations' && idOrAction === 'set' && method === 'POST') return setAllocation(db, body);
  if (resource === 'timeEntries' && idOrAction === 'set' && method === 'POST') return setTimeEntry(db, body);
  if (resource === 'timeEntries' && !idOrAction && method === 'GET') return queryTimeEntries(db, query);

  if (resource === 'tasks' && idOrAction === 'batch' && method === 'POST') {
    // Mehrere Aufgaben in einem Schritt anlegen (z. B. aus Aufgabenvorlagen)
    if (!Array.isArray(body) || body.length > 500) throw new ApiError(400, 'Liste mit max. 500 Aufgaben erwartet');
    body.forEach((t) => validate('tasks', t, false));
    const createdAt = new Date().toISOString().slice(0, 10);
    return transaction(db, () => body.map((t) => insert(db, 'tasks', { status: 'offen', createdAt, ...t })));
  }

  if (resource === 'tasks' && idOrAction === 'reorder' && method === 'POST') {
    // [{id, status, sort}] – Kanban-Reihenfolge in einem Schritt speichern
    if (!Array.isArray(body)) throw new ApiError(400, 'Liste erwartet');
    return transaction(db, () => body.map((t) => update(db, 'tasks', t.id, { status: t.status, sort: t.sort })));
  }

  if (!isTable(resource)) throw new ApiError(404, `Unbekannte Ressource: ${resource}`);
  const table = resource;
  const id = idOrAction ? Number(idOrAction) : null;
  if (idOrAction && !Number.isInteger(id)) throw new ApiError(400, 'Ungültige ID');

  if (!id) {
    if (method === 'GET') return list(db, table, query);
    if (method === 'POST') {
      validate(table, body, false);
      const data = { ...body };
      if (table === 'tasks' && !data.createdAt) data.createdAt = new Date().toISOString().slice(0, 10);
      if (table === 'employees' && data.active === undefined) data.active = true;
      if (table === 'protocols') {
        // fortlaufende Protokollnummer je Projekt
        if (!data.number) data.number = Math.max(0, ...list(db, 'protocols', { projectId: Number(data.projectId) }).map((p) => p.number || 0)) + 1;
        if (!data.status) data.status = 'entwurf';
        if (!data.createdAt) data.createdAt = new Date().toISOString().slice(0, 10);
      }
      return insert(db, table, data);
    }
  } else {
    if (method === 'GET') {
      const row = get(db, table, id);
      if (!row) throw new ApiError(404, 'Datensatz nicht gefunden');
      return row;
    }
    if (method === 'PUT' || method === 'PATCH') {
      const current = get(db, table, id);
      if (!current) throw new ApiError(404, 'Datensatz nicht gefunden');
      validate(table, { ...current, ...body }, true);
      return update(db, table, id, body);
    }
    if (method === 'DELETE') return cascadeDelete(db, table, id);
  }
  throw new ApiError(405, 'Methode nicht erlaubt');
}
