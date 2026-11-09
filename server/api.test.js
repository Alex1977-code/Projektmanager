import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { handle, ApiError } from './api.js';
import { seed } from './seed.js';

function fresh() {
  return openDb(':memory:');
}

test('CRUD: Projekt anlegen, ändern, lesen', () => {
  const db = fresh();
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'Testbrücke', budget: '1000', status: 'Beauftragt' });
  assert.equal(p.name, 'Testbrücke');
  assert.equal(p.budget, 1000);
  const u = handle(db, 'PUT', `/api/projects/${p.id}`, {}, { status: 'In Bearbeitung', unbekannt: 'x' });
  assert.equal(u.status, 'In Bearbeitung');
  assert.equal(u.unbekannt, undefined);
  assert.equal(handle(db, 'GET', `/api/projects/${p.id}`, {}).name, 'Testbrücke');
});

test('Validierung: Pflichtfelder und Datumsreihenfolge', () => {
  const db = fresh();
  assert.throws(() => handle(db, 'POST', '/api/projects', {}, {}), (e) => e instanceof ApiError && e.status === 400);
  assert.throws(
    () => handle(db, 'POST', '/api/projects', {}, { name: 'X', startDate: '2026-05-01', endDate: '2026-01-01' }),
    /Enddatum/,
  );
  assert.throws(() => handle(db, 'POST', '/api/phases', {}, { projectId: 1, name: 'LPH', startDate: '01.01.2026', endDate: '2026-02-01' }), /Ungültiges Datum/);
});

test('Projekt löschen entfernt abhängige Daten', () => {
  const db = fresh();
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'P' });
  const e = handle(db, 'POST', '/api/employees', {}, { name: 'M', hourlyRate: 100 });
  const ph = handle(db, 'POST', '/api/phases', {}, { projectId: p.id, name: 'LPH 1', startDate: '2026-01-01', endDate: '2026-02-01' });
  handle(db, 'POST', '/api/tasks', {}, { projectId: p.id, phaseId: ph.id, title: 'T' });
  handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: e.id, projectId: p.id, phaseId: ph.id, date: '2026-01-05', hours: 4 });
  handle(db, 'DELETE', `/api/projects/${p.id}`, {});
  for (const t of ['phases', 'tasks', 'timeEntries']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0, t);
  }
});

test('Mitarbeiter mit Zeitbuchungen kann nicht gelöscht werden', () => {
  const db = fresh();
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'P' });
  const e = handle(db, 'POST', '/api/employees', {}, { name: 'M' });
  assert.equal(e.active, true);
  handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: e.id, projectId: p.id, date: '2026-01-05', hours: 2 });
  assert.throws(() => handle(db, 'DELETE', `/api/employees/${e.id}`, {}), (err) => err.status === 409);
});

test('Wochenplanung: Upsert und Löschen bei 0 Stunden', () => {
  const db = fresh();
  const body = { employeeId: 1, projectId: 2, weekStart: '2026-11-09', hours: 16 };
  const a = handle(db, 'POST', '/api/allocations/set', {}, body);
  assert.equal(a.hours, 16);
  const b = handle(db, 'POST', '/api/allocations/set', {}, { ...body, hours: 24 });
  assert.equal(b.id, a.id);
  assert.equal(b.hours, 24);
  handle(db, 'POST', '/api/allocations/set', {}, { ...body, hours: 0 });
  assert.equal(handle(db, 'GET', '/api/allocations', {}).length, 0);
});

test('Zeiterfassung: Upsert je Tag und Kostenauswertung', () => {
  const db = fresh();
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'P' });
  const e = handle(db, 'POST', '/api/employees', {}, { name: 'M', hourlyRate: 100 });
  const base = { employeeId: e.id, projectId: p.id, phaseId: null, date: '2026-11-09' };
  handle(db, 'POST', '/api/timeEntries/set', {}, { ...base, hours: 6 });
  handle(db, 'POST', '/api/timeEntries/set', {}, { ...base, hours: 7.5 });
  const s = handle(db, 'GET', '/api/summary', {});
  assert.equal(s.byPhase.length, 1);
  assert.equal(s.byPhase[0].hours, 7.5);
  assert.equal(s.byPhase[0].cost, 750);
  handle(db, 'POST', '/api/timeEntries/set', {}, { ...base, hours: 0 });
  assert.equal(handle(db, 'GET', '/api/timeEntries', { employeeId: String(e.id) }).length, 0);
});

test('Demodaten sind konsistent', () => {
  const db = fresh();
  seed(db, '2026-11-09');
  const b = handle(db, 'GET', '/api/bootstrap', {});
  assert.equal(b.employees.length, 25);
  assert.ok(b.projects.length >= 10);
  const projectIds = new Set(b.projects.map((p) => p.id));
  for (const t of b.tasks) assert.ok(projectIds.has(t.projectId));
  for (const ph of b.phases) assert.ok(ph.startDate <= ph.endDate, `${ph.code} Termine`);
  for (const p of b.projects) {
    const sum = b.phases.filter((ph) => ph.projectId === p.id).reduce((s, ph) => s + ph.budget, 0);
    assert.ok(Math.abs(sum - p.budget) < 1000, `${p.number} Budgetverteilung`);
  }
});

test('Protokolle: fortlaufende Nummer je Projekt, JSON-Felder, Löschen mit Projekt', () => {
  const db = fresh();
  const p1 = handle(db, 'POST', '/api/projects', {}, { name: 'A' });
  const p2 = handle(db, 'POST', '/api/projects', {}, { name: 'B' });
  const a = handle(db, 'POST', '/api/protocols', {}, { projectId: p1.id, date: '2026-11-09', items: [{ id: 'x', kind: 'A', text: 'Test' }] });
  const b = handle(db, 'POST', '/api/protocols', {}, { projectId: p1.id, date: '2026-11-16' });
  const c = handle(db, 'POST', '/api/protocols', {}, { projectId: p2.id, date: '2026-11-16' });
  assert.deepEqual([a.number, b.number, c.number], [1, 2, 1]);
  assert.equal(a.status, 'entwurf');
  assert.equal(a.items[0].text, 'Test');
  assert.deepEqual(b.participants, []);
  assert.throws(() => handle(db, 'PUT', `/api/protocols/${a.id}`, {}, { nextDate: '16.11.2026' }), /Ungültiges Datum/);
  handle(db, 'DELETE', `/api/projects/${p1.id}`, {});
  assert.equal(handle(db, 'GET', '/api/protocols', {}).length, 1);
});

test('Aufgaben im Stapel anlegen (Vorlagen)', () => {
  const db = fresh();
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'A' });
  const rows = handle(db, 'POST', '/api/tasks/batch', {}, [
    { projectId: p.id, title: 'Lastannahmen', dueDate: '2026-12-01' },
    { projectId: p.id, title: 'Entwurfsstatik', status: 'in_arbeit' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'offen');
  assert.equal(rows[1].status, 'in_arbeit');
  assert.throws(() => handle(db, 'POST', '/api/tasks/batch', {}, [{ projectId: p.id }]), /Pflichtfeld/);
  assert.equal(handle(db, 'GET', '/api/tasks', {}).length, 2, 'fehlerhafter Stapel legt nichts an');
});
