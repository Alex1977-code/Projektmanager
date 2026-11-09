import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { createMemoryStore } from './memoryStore.js';
import { handle, ApiError } from './api.js';
import { seed } from './seed.js';

// Dieselben Tests laufen gegen SQLite (Server) und den In-Memory-Speicher (Browser), siehe api.memory.test.js
const STORE = process.env.PM_TEST_STORE || 'sqlite';
function fresh() {
  // wie im Browser: zeitlich aufsteigende, geräteübergreifend eindeutige IDs
  let n = 0;
  if (STORE === 'memory') return createMemoryStore({ idFactory: () => 1.7e12 * 1000 + (++n) * 1000 + Math.floor(Math.random() * 1000) });
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
    assert.equal(db.list(t).length, 0, t);
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

// ---------------------------------------------------------------- Rechnungen
import { computeInvoice } from './billing.js';
import * as auth from './auth.js';

test('Abschlagsrechnung: Berechnung nach Leistungsstand, Nebenkosten, Vorabschläge, USt', () => {
  const c = computeInvoice({ lines: [{ fee: 100000, percent: 50 }, { fee: 20000, percent: 100 }], nkPct: 5, vatPct: 19 }, 30000);
  assert.equal(c.performance, 70000);
  assert.equal(c.nk, 3500);
  assert.equal(c.cumulative, 73500);
  assert.equal(c.net, 43500);
  assert.equal(c.vat, 8265);
  assert.equal(c.gross, 51765);
  assert.equal(computeInvoice({ lines: [{ fee: 1000, percent: 140 }], nkPct: 0, vatPct: 0 }, 0).performance, 1000, 'Leistungsstand max. 100 %');
});

test('Rechnungen: Nummernvergabe beim Stellen, Festschreibung, kein Löschen', () => {
  const db = fresh();
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'P' });
  const lines = [{ key: 'a', label: 'LPH 2', fee: 10000, percent: 40 }];
  const r1 = handle(db, 'POST', '/api/invoices', {}, { projectId: p.id, date: '2026-03-01', lines, nkPct: 0, vatPct: 19 });
  assert.equal(r1.status, 'entwurf');
  assert.equal(r1.invoiceNo, null);
  assert.equal(r1.net, 4000);
  const g1 = handle(db, 'PUT', `/api/invoices/${r1.id}`, {}, { status: 'gestellt' });
  assert.equal(g1.invoiceNo, 'RE-2026-001');
  assert.equal(g1.dueDate, '2026-03-31');
  const frozen = handle(db, 'PUT', `/api/invoices/${r1.id}`, {}, { lines: [{ fee: 10000, percent: 90 }], paidDate: '2026-03-20', paidAmount: 4760 });
  assert.equal(frozen.net, 4000, 'gestellte Rechnung bleibt unverändert');
  assert.equal(frozen.paidAmount, 4760);
  assert.throws(() => handle(db, 'DELETE', `/api/invoices/${r1.id}`, {}), (e) => e.status === 409);
  const r2 = handle(db, 'POST', '/api/invoices', {}, { projectId: p.id, date: '2026-06-01', lines: [{ ...lines[0], percent: 100 }], nkPct: 0, vatPct: 19 });
  assert.equal(r2.number, 2);
  assert.equal(r2.previousNet, 4000);
  assert.equal(r2.net, 6000);
  assert.throws(() => handle(db, 'DELETE', `/api/projects/${p.id}`, {}), (e) => e.status === 409, 'Projekt mit gestellten Rechnungen');
});

// ---------------------------------------------------------------- Berechtigungen & Abwesenheiten
test('Rollen: Mitarbeiter sehen keine Rechnungen und beantragen nur eigene Abwesenheiten', () => {
  const db = fresh();
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'P' });
  const a = handle(db, 'POST', '/api/employees', {}, { name: 'A' });
  const b = handle(db, 'POST', '/api/employees', {}, { name: 'B' });
  const ma = { employeeId: a.id, role: 'mitarbeiter', name: 'A', username: 'a' };
  const pl = { employeeId: b.id, role: 'leitung', name: 'B', username: 'b' };
  assert.throws(() => handle(db, 'GET', '/api/invoices', {}, undefined, ma), (e) => e.status === 403);
  assert.deepEqual(handle(db, 'GET', '/api/bootstrap', {}, undefined, ma).invoices, []);
  assert.throws(() => handle(db, 'PUT', `/api/projects/${p.id}`, {}, { budget: 1 }, ma), (e) => e.status === 403);
  assert.throws(() => handle(db, 'PUT', `/api/employees/${a.id}`, {}, { appRole: 'admin' }, ma), (e) => e.status === 403);
  assert.throws(() => handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: b.id, projectId: p.id, date: '2026-11-09', hours: 1 }, ma), (e) => e.status === 403);

  const req = handle(db, 'POST', '/api/absences', {}, { employeeId: a.id, type: 'Urlaub', startDate: '2026-12-01', endDate: '2026-12-04', status: 'genehmigt' }, ma);
  assert.equal(req.status, 'beantragt', 'Mitarbeiter können sich nicht selbst genehmigen');
  assert.throws(() => handle(db, 'POST', '/api/absences', {}, { employeeId: b.id, type: 'Urlaub', startDate: '2026-12-01', endDate: '2026-12-01' }, ma), (e) => e.status === 403);
  const ok = handle(db, 'PUT', `/api/absences/${req.id}`, {}, { status: 'genehmigt' }, pl);
  assert.equal(ok.status, 'genehmigt');
  assert.equal(ok.decidedBy, b.id);
  assert.throws(() => handle(db, 'DELETE', `/api/absences/${req.id}`, {}, undefined, ma), (e) => e.status === 403, 'genehmigt = gesperrt');
  assert.throws(() => handle(db, 'POST', '/api/absences', {}, { employeeId: a.id, type: 'Urlaub', startDate: '2026-12-01', endDate: '2026-12-02', halfDay: true }, pl), /Halbe Tage/);
  const krank = handle(db, 'POST', '/api/absences', {}, { employeeId: a.id, type: 'Krankheit', startDate: '2026-11-09', endDate: '2026-11-10' }, ma);
  assert.equal(krank.status, 'genehmigt');
});

// ---------------------------------------------------------------- Anmeldung
test('Anmeldung: Benutzernamen, Zuordnung, AD-Gruppen, Notfall-Admin, Sitzungen', () => {
  const db = fresh();
  handle(db, 'POST', '/api/employees', {}, { name: 'Sabine Hartmann', login: 's.hartmann', email: 'sh@firma.de', appRole: 'leitung' });
  handle(db, 'POST', '/api/employees', {}, { name: 'Alt', login: 'alt', active: false });
  assert.equal(auth.normalizeUsername('FIRMA\\S.Hartmann'), 's.hartmann');
  assert.equal(auth.normalizeUsername('s.hartmann@firma.local'), 's.hartmann');
  const cfg = { ...auth.config(), ldapGroupAdmin: 'PM-Admins', ldapGroupLeitung: '' };
  assert.equal(auth.mapUser(db, { username: 'FIRMA\\s.hartmann' }, { ...cfg, ldapGroupAdmin: '' }).role, 'leitung');
  assert.equal(auth.mapUser(db, { username: 'x', email: 'SH@firma.de' }, { ...cfg, ldapGroupAdmin: '' }).name, 'Sabine Hartmann');
  assert.equal(auth.mapUser(db, { username: 's.hartmann', groups: ['CN=PM-Admins,OU=Gruppen,DC=firma,DC=local'] }, cfg).role, 'admin');
  assert.throws(() => auth.mapUser(db, { username: 'unbekannt' }, cfg), (e) => e.status === 403);
  assert.throws(() => auth.mapUser(db, { username: 'alt' }, cfg), /deaktiviert/);

  assert.equal(auth.checkAdminPassword('admin', 'geheim', { adminPassword: 'geheim' }), true);
  assert.equal(auth.checkAdminPassword('admin', 'falsch', { adminPassword: 'geheim' }), false);
  assert.equal(auth.checkAdminPassword('admin', '', { adminPassword: '' }), false);

  if (db.raw) {
    const token = auth.createSession(db, { employeeId: 1, role: 'leitung', username: 's.hartmann', name: 'S' }, 1);
    assert.equal(auth.getSession(db, token).username, 's.hartmann');
    assert.equal(auth.getSession(db, 'x'.repeat(64)), null);
    auth.deleteSession(db, token);
    assert.equal(auth.getSession(db, token), null);
    const expired = auth.createSession(db, { employeeId: 1, role: 'leitung', username: 's', name: 'S' }, -1);
    assert.equal(auth.getSession(db, expired), null, 'abgelaufene Sitzung');
  }
});

test('Active Directory: Bind als benutzer@domain, falsches Kennwort, Dienstkonto-Suche', async () => {
  const calls = [];
  class FakeClient {
    constructor(opts) { this.opts = opts; }
    async bind(dn, pw) {
      calls.push(['bind', dn]);
      if (pw !== 'richtig' && pw !== 'svc') { const e = new Error('80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data 52e'); e.code = 49; throw e; }
    }
    async search(base, o) {
      calls.push(['search', base, o.filter]);
      return { searchEntries: [{ dn: 'CN=Sabine Hartmann,OU=Mitarbeiter,DC=firma,DC=local', sAMAccountName: 's.hartmann', displayName: 'Sabine Hartmann', mail: 'sh@firma.de', memberOf: ['CN=PM-Leitung,OU=Gruppen,DC=firma,DC=local'] }] };
    }
    async unbind() {}
  }
  const { EqualityFilter } = await import('ldapts');
  const deps = { ClientClass: FakeClient, EqualityFilter };
  const cfg = { ...auth.config(), ldapUrl: 'ldaps://dc.firma.local', ldapDomain: 'firma.local', ldapBaseDn: 'DC=firma,DC=local', ldapBindDn: '' };
  const u = await auth.ldapAuthenticate('FIRMA\\s.hartmann', 'richtig', cfg, deps);
  assert.equal(u.email, 'sh@firma.de');
  assert.deepEqual(u.groups, ['CN=PM-Leitung,OU=Gruppen,DC=firma,DC=local']);
  assert.deepEqual(calls[0], ['bind', 's.hartmann@firma.local']);
  assert.equal(calls[1][2], '(sAMAccountName=s.hartmann)');
  await assert.rejects(auth.ldapAuthenticate('s.hartmann', 'falsch', cfg, deps), (e) => e.status === 401);
  await assert.rejects(auth.ldapAuthenticate('s.hart*mann)(x', 'richtig', cfg, deps), (e) => e.status === 401, 'unzulässige Zeichen');
  calls.length = 0;
  await auth.ldapAuthenticate('s.hartmann', 'richtig', { ...cfg, ldapBindDn: 'CN=svc-pm,DC=firma,DC=local', ldapBindPassword: 'svc' }, deps);
  assert.deepEqual(calls.map((c) => c[0] === 'bind' ? c[1] : c[0]), ['CN=svc-pm,DC=firma,DC=local', 'search', 'CN=Sabine Hartmann,OU=Mitarbeiter,DC=firma,DC=local']);
});

test('Datenschutz: Krankheit anderer Personen wird für Mitarbeiter verborgen', () => {
  const db = fresh();
  const a = handle(db, 'POST', '/api/employees', {}, { name: 'A' });
  const b = handle(db, 'POST', '/api/employees', {}, { name: 'B' });
  handle(db, 'POST', '/api/absences', {}, { employeeId: b.id, type: 'Krankheit', startDate: '2026-11-09', endDate: '2026-11-10', note: 'Grippe' });
  handle(db, 'POST', '/api/absences', {}, { employeeId: a.id, type: 'Krankheit', startDate: '2026-11-09', endDate: '2026-11-09', note: 'Arzt' });
  const ma = { employeeId: a.id, role: 'mitarbeiter', name: 'A', username: 'a' };
  const seen = handle(db, 'GET', '/api/bootstrap', {}, undefined, ma).absences;
  assert.deepEqual(seen.map((x) => [x.employeeId, x.type, x.note]), [[b.id, 'Sonstiges', ''], [a.id, 'Krankheit', 'Arzt']]);
  assert.equal(handle(db, 'GET', '/api/absences', {}).filter((x) => x.type === 'Krankheit').length, 2, 'Leitung sieht alles');
});
