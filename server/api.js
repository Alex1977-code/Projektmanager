// REST-API – unabhängig vom HTTP-Server testbar.
import {
  SCHEMA, REQUIRED, isTable, list, get, insert, update, remove, transaction,
  getSettings, setSettings,
} from './db.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const BOOTSTRAP_TABLES = ['employees', 'projects', 'phases', 'milestones', 'tasks', 'allocations', 'costs'];

/** Ist-Stunden und Ist-Personalkosten (Stunden × Verrechnungssatz). */
export function summary(db) {
  const byPhase = db.prepare(`
    SELECT t.projectId, t.phaseId, SUM(t.hours) AS hours, SUM(t.hours * COALESCE(e.hourlyRate, 0)) AS cost
    FROM timeEntries t LEFT JOIN employees e ON e.id = t.employeeId
    GROUP BY t.projectId, t.phaseId`).all();
  const byEmployee = db.prepare(`
    SELECT t.projectId, t.employeeId, SUM(t.hours) AS hours, SUM(t.hours * COALESCE(e.hourlyRate, 0)) AS cost
    FROM timeEntries t LEFT JOIN employees e ON e.id = t.employeeId
    GROUP BY t.projectId, t.employeeId`).all();
  const byTask = db.prepare(`
    SELECT taskId, SUM(hours) AS hours FROM timeEntries WHERE taskId IS NOT NULL GROUP BY taskId`).all();
  const plain = (rows) => rows.map((r) => ({ ...r }));
  return { byPhase: plain(byPhase), byEmployee: plain(byEmployee), byTask: plain(byTask) };
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
  for (const k of ['startDate', 'endDate', 'date', 'dueDate', 'weekStart']) {
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
        for (const t of ['phases', 'milestones', 'tasks', 'allocations', 'timeEntries', 'costs']) {
          db.prepare(`DELETE FROM "${t}" WHERE projectId = ?`).run(id);
        }
        break;
      case 'phases':
        for (const t of ['tasks', 'timeEntries', 'costs']) {
          db.prepare(`UPDATE "${t}" SET phaseId = NULL WHERE phaseId = ?`).run(id);
        }
        break;
      case 'tasks':
        db.prepare('UPDATE timeEntries SET taskId = NULL WHERE taskId = ?').run(id);
        break;
      case 'employees': {
        const booked = db.prepare('SELECT COUNT(*) AS n FROM timeEntries WHERE employeeId = ?').get(id).n;
        if (booked > 0) {
          throw new ApiError(409, 'Für diese Person existieren Zeitbuchungen. Bitte deaktivieren statt löschen.');
        }
        db.prepare('UPDATE tasks SET assigneeId = NULL WHERE assigneeId = ?').run(id);
        db.prepare('UPDATE projects SET leadId = NULL WHERE leadId = ?').run(id);
        db.prepare('DELETE FROM allocations WHERE employeeId = ?').run(id);
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
  const existing = db.prepare('SELECT id FROM allocations WHERE employeeId = ? AND projectId = ? AND weekStart = ?')
    .get(Number(employeeId), Number(projectId), weekStart);
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
  const hours = Number(body?.hours) || 0;
  validate('timeEntries', { employeeId, projectId, date, hours: hours || 1 }, false);
  if (hours < 0 || hours > 24) throw new ApiError(400, 'Stunden müssen zwischen 0 und 24 liegen');
  return transaction(db, () => {
    const rows = db.prepare(`SELECT id FROM timeEntries WHERE employeeId = ? AND projectId = ? AND date = ?
      AND (phaseId IS ? ) ORDER BY id`).all(Number(employeeId), Number(projectId), date, phaseId === null ? null : Number(phaseId));
    for (const r of rows.slice(1)) remove(db, 'timeEntries', r.id);
    if (hours === 0) {
      if (rows[0]) remove(db, 'timeEntries', rows[0].id);
      return { deleted: true };
    }
    if (rows[0]) return update(db, 'timeEntries', rows[0].id, { hours, note: body.note });
    return insert(db, 'timeEntries', { employeeId, projectId, phaseId, date, hours, note: body.note });
  });
}

function queryTimeEntries(db, q) {
  const where = [];
  const params = [];
  if (q.employeeId) { where.push('employeeId = ?'); params.push(Number(q.employeeId)); }
  if (q.projectId) { where.push('projectId = ?'); params.push(Number(q.projectId)); }
  if (q.from) { where.push('date >= ?'); params.push(q.from); }
  if (q.to) { where.push('date <= ?'); params.push(q.to); }
  const sql = `SELECT * FROM timeEntries${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY date, id LIMIT 5000`;
  return db.prepare(sql).all(...params).map((r) => ({ ...r }));
}

/**
 * Zentrale Routing-Funktion.
 * @returns {Promise<any>|any} Antwortobjekt (wird als JSON gesendet)
 */
export function handle(db, method, pathname, query, body) {
  const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [resource, idOrAction] = parts;

  if (resource === 'health') return { ok: true, time: new Date().toISOString() };

  if (resource === 'bootstrap' && method === 'GET') {
    const out = { settings: getSettings(db) };
    for (const t of BOOTSTRAP_TABLES) out[t] = list(db, t);
    out.summary = summary(db);
    return out;
  }

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
