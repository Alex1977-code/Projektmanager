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

// ---------------------------------------------------------------- Rollen & Rechte
test('Rollen: eigene Rolle mit Rechten, Schutz der Standardrollen', () => {
  const db = fresh();
  seedRoles(db);
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'P', budget: 1000 });
  const e = handle(db, 'POST', '/api/employees', {}, { name: 'C', appRole: 'buero' });
  const custom = handle(db, 'POST', '/api/roles', {}, { name: 'Büro', permissions: ['invoices.view', 'unbekannt'] });
  assert.equal(custom.key, 'buero');
  assert.deepEqual(custom.permissions, ['invoices.view'], 'unbekannte Rechte werden verworfen');
  const u = { employeeId: e.id, role: 'buero', name: 'C', username: 'c' };
  assert.equal(handle(db, 'GET', '/api/invoices', {}, undefined, u).length, 0, 'darf Rechnungen sehen');
  assert.throws(() => handle(db, 'POST', '/api/invoices', {}, { projectId: p.id, date: '2026-11-09' }, u), (x) => x.status === 403, 'aber nicht erstellen');
  assert.throws(() => handle(db, 'PUT', `/api/projects/${p.id}`, {}, { budget: 2 }, u), (x) => x.status === 403);
  assert.throws(() => handle(db, 'POST', '/api/roles', {}, { name: 'X' }, u), (x) => x.status === 403, 'Rollenverwaltung nur mit roles.edit');
  handle(db, 'PUT', `/api/roles/${custom.id}`, {}, { permissions: ['invoices.view', 'invoices.edit'] });
  assert.ok(handle(db, 'POST', '/api/invoices', {}, { projectId: p.id, date: '2026-11-09' }, u).id, 'Rechteänderung wirkt sofort');
  const admin = handle(db, 'GET', '/api/roles', {}).find((r) => r.key === 'admin');
  assert.throws(() => handle(db, 'PUT', `/api/roles/${admin.id}`, {}, { permissions: [] }), /alle Rechte/);
  const ma = handle(db, 'GET', '/api/roles', {}).find((r) => r.key === 'mitarbeiter');
  assert.throws(() => handle(db, 'DELETE', `/api/roles/${ma.id}`, {}), (x) => x.status === 409);
  assert.throws(() => handle(db, 'DELETE', `/api/roles/${custom.id}`, {}), /zugewiesen/);
  const boot = handle(db, 'GET', '/api/bootstrap', {}, undefined, u);
  assert.deepEqual(boot.me.permissions.sort(), ['invoices.edit', 'invoices.view']);
  assert.equal(boot.employees[0].hourlyRate, null, 'Stundensätze nur mit costs.view');
});

test('AD-Gruppen: beliebige Rollen über LDAP_ROLE_GROUPS', () => {
  const db = fresh();
  seedRoles(db);
  handle(db, 'POST', '/api/employees', {}, { name: 'P', login: 'p.jung', appRole: 'mitarbeiter' });
  const cfg = { ...auth.config(), ldapGroupAdmin: 'PM-Admins', ldapGroupLeitung: '', ldapRoleGroups: 'controlling=PM-Controlling;extern=PM-Extern' };
  assert.equal(auth.mapUser(db, { username: 'p.jung', groups: ['CN=PM-Controlling,OU=G,DC=f,DC=l'] }, cfg).role, 'controlling');
  assert.equal(auth.mapUser(db, { username: 'p.jung', groups: ['CN=Andere,OU=G,DC=f,DC=l'] }, cfg).role, 'mitarbeiter');
});

// ---------------------------------------------------------------- Arbeitszeit
import { checkDay, netMinutes } from '../shared/worktime.js';
import { DEFAULT_ROLES } from '../shared/permissions.js';
function seedRoles(db) { DEFAULT_ROLES.forEach((r, i) => db.insert('roles', { ...r, sort: i })); }

test('ArbZG-Prüfungen', () => {
  assert.equal(netMinutes({ start: '07:30', end: '16:30', breakMin: 30 }), 510);
  assert.equal(netMinutes({ start: '22:00', end: '06:00', breakMin: 30 }), 450, 'über Mitternacht');
  const txt = (w, prev) => checkDay({ date: '2026-11-10', ...w }, prev).map((x) => x.text).join(' | ');
  assert.match(txt({ start: '06:00', end: '17:00', breakMin: 30 }), /10 Stunden/);
  assert.match(txt({ start: '08:00', end: '15:00', breakMin: 15 }), /mindestens 30 min/);
  assert.match(txt({ start: '07:00', end: '17:00', breakMin: 30 }), /mindestens 45 min/);
  assert.match(txt({ start: '06:00', end: '14:00', breakMin: 30 }, { date: '2026-11-09', start: '12:00', end: '22:00' }), /Ruhezeit nur 8 h/);
  assert.match(checkDay({ date: '2026-11-08', start: '09:00', end: '12:00', breakMin: 0 }, null).map((x) => x.text).join(), /Sonntag/);
  assert.equal(txt({ start: '08:00', end: '16:30', breakMin: 30 }), '');
});

test('Arbeitszeit: Stempeluhr, Mindestpause, Monatsabschluss sperrt Änderungen', () => {
  const db = fresh();
  seedRoles(db);
  const a = handle(db, 'POST', '/api/employees', {}, { name: 'A', appRole: 'mitarbeiter', weeklyHours: 40 });
  const b = handle(db, 'POST', '/api/employees', {}, { name: 'B', appRole: 'leitung' });
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'P' });
  const ua = { employeeId: a.id, role: 'mitarbeiter', name: 'A', username: 'a' };
  const ub = { employeeId: b.id, role: 'leitung', name: 'B', username: 'b' };
  handle(db, 'POST', '/api/worktimes/stamp', {}, { action: 'kommen', date: '2026-11-10', time: '07:30' }, ua);
  assert.throws(() => handle(db, 'POST', '/api/worktimes/stamp', {}, { action: 'kommen', date: '2026-11-10', time: '07:31' }, ua), /eingestempelt/);
  const w = handle(db, 'POST', '/api/worktimes/stamp', {}, { action: 'gehen', date: '2026-11-10', time: '17:00' }, ua);
  assert.equal(w.breakMin, 45, 'gesetzliche Mindestpause ergänzt');
  assert.match(w.note, /§ 4 ArbZG/);
  assert.throws(() => handle(db, 'GET', '/api/worktimes', { employeeId: String(b.id) }, undefined, ua), (x) => x.status === 403, 'fremde Arbeitszeiten');
  assert.equal(handle(db, 'GET', '/api/worktimes', { employeeId: String(a.id), month: '2026-11' }, undefined, ub).length, 1, 'Leitung sieht alle');
  // Monat einreichen, freigeben → gesperrt
  handle(db, 'POST', '/api/worktimeMonths/action', {}, { employeeId: a.id, month: '2026-11', action: 'submit' }, ua);
  assert.throws(() => handle(db, 'POST', '/api/worktimes/set', {}, { employeeId: a.id, date: '2026-11-11', start: '08:00', end: '16:00' }, ua), /eingereicht/);
  assert.throws(() => handle(db, 'POST', '/api/worktimeMonths/action', {}, { employeeId: a.id, month: '2026-11', action: 'approve' }, ua), (x) => x.status === 403);
  const m = handle(db, 'POST', '/api/worktimeMonths/action', {}, { employeeId: a.id, month: '2026-11', action: 'approve' }, ub);
  assert.equal(m.status, 'freigegeben');
  assert.throws(() => handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: a.id, projectId: p.id, date: '2026-11-12', hours: 2 }, ua), /abgeschlossen/);
  assert.throws(() => handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: a.id, projectId: p.id, date: '2026-11-12', hours: 2 }, ub), /wieder öffnen/);
  handle(db, 'POST', '/api/worktimeMonths/action', {}, { employeeId: a.id, month: '2026-11', action: 'reopen' }, ub);
  assert.ok(handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: a.id, projectId: p.id, date: '2026-12-01', hours: 2 }, ua).id);
});

test('Abacus-Export: CSV nach Vorlage, nur freigegebene Monate, Exportkennzeichen', () => {
  const db = fresh();
  seedRoles(db);
  const a = handle(db, 'POST', '/api/employees', {}, { name: 'Anna', personnelNo: '4711', weeklyHours: 40 });
  const c = handle(db, 'POST', '/api/employees', {}, { name: 'Carl', weeklyHours: 40 });
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'Schleuse', number: 'P-2026-001', extNo: '26001' });
  const ph = handle(db, 'POST', '/api/phases', {}, { projectId: p.id, code: 'LPH 3', name: 'Entwurf', startDate: '2026-10-01', endDate: '2026-12-31' });
  handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: a.id, projectId: p.id, phaseId: ph.id, date: '2026-10-05', hours: 7.5 });
  handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: c.id, projectId: p.id, phaseId: ph.id, date: '2026-10-05', hours: 3 });
  handle(db, 'POST', '/api/worktimes/set', {}, { employeeId: a.id, date: '2026-10-05', start: '07:30', end: '15:30', breakMin: 30 });
  handle(db, 'POST', '/api/worktimeMonths/action', {}, { employeeId: a.id, month: '2026-10', action: 'approve' });
  handle(db, 'PUT', '/api/settings', {}, { abacus: { ...handle(db, 'GET', '/api/settings', {}).abacus, mandant: '7777' } });
  const ma = { employeeId: a.id, role: 'mitarbeiter', name: 'A', username: 'a' };
  assert.throws(() => handle(db, 'POST', '/api/abacus/export', {}, { type: 'leistungen', month: '2026-10' }, ma), (x) => x.status === 403);
  const pre = handle(db, 'POST', '/api/abacus/export', {}, { type: 'leistungen', month: '2026-10', preview: true });
  assert.equal(pre.count, 1, 'Carl ohne freigegebenen Monat nicht dabei');
  assert.match(pre.warnings.join(), /Carl/);
  assert.equal(pre.content, undefined, 'Vorschau ohne Datei');
  const out = handle(db, 'POST', '/api/abacus/export', {}, { type: 'leistungen', month: '2026-10' });
  const lines = out.content.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], 'Mandant;Mitarbeiter;Datum;Projekt;Leistungsart;Menge;Text');
  assert.equal(lines[1], '7777;4711;05.10.2026;26001;103;7,50;LPH 3 Entwurf');
  assert.ok(handle(db, 'GET', '/api/timeEntries', { employeeId: String(a.id) })[0].exportedAt, 'als exportiert gekennzeichnet');
  assert.equal(handle(db, 'GET', '/api/abacusExports', {}).length, 1);
  const az = handle(db, 'POST', '/api/abacus/export', {}, { type: 'arbeitszeit', month: '2026-10' });
  const azl = az.content.trim().split('\r\n');
  assert.ok(azl.includes('4711;05.10.2026;07:30;15:30;30;7,50;'), azl.slice(0, 4).join(' / '));
  assert.ok(azl.some((l) => l.startsWith('4711;03.10.2026') === false), 'Wochenende/Feiertag ohne Zeile');
});

test('Rechteausweitung: Mitarbeiterdaten-Recht erlaubt keine Rollenzuweisung', () => {
  const db = fresh();
  seedRoles(db);
  db.insert('roles', { key: 'personal', name: 'Personal', permissions: ['employees.edit'], system: false, sort: 9 });
  const e = handle(db, 'POST', '/api/employees', {}, { name: 'HR', appRole: 'personal' });
  const u = { employeeId: e.id, role: 'personal', name: 'HR', username: 'hr' };
  assert.equal(handle(db, 'PUT', `/api/employees/${e.id}`, {}, { phone: '123', appRole: 'personal' }, u).phone, '123', 'unveränderte Rolle ist erlaubt');
  assert.throws(() => handle(db, 'PUT', `/api/employees/${e.id}`, {}, { appRole: 'admin' }, u), (x) => x.status === 403);
  assert.throws(() => handle(db, 'POST', '/api/employees', {}, { name: 'X', appRole: 'admin' }, u), (x) => x.status === 403);
});

// ---------------------------------------------------------------- Angebote & Arbeitspakete
test('Angebot: Summen, Nummernkreis, Festschreibung, Beauftragung erzeugt Arbeitspakete', () => {
  const db = fresh();
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'Wehr', status: 'Akquise', budget: 0 });
  const ph = handle(db, 'POST', '/api/phases', {}, { projectId: p.id, code: 'LPH 3', name: 'Entwurf', startDate: '2026-01-01', endDate: '2026-06-30' });
  const positions = [
    { key: 'a', title: 'LPH 3 Entwurfsplanung', phaseCode: 'LPH 3', mode: 'pauschal', amount: 40000, hours: 380 },
    { key: 'b', title: 'Vermessung', mode: 'aufwand', hours: 20, rate: 110 },
    { key: 'c', title: 'Zusatztermine', mode: 'aufwand', hours: 8, rate: 125, optional: true },
  ];
  const o = handle(db, 'POST', '/api/offers', {}, { projectId: p.id, date: '2026-02-10', positions, nkPct: 5, discountPct: 2, vatPct: 19 });
  assert.equal(o.status, 'entwurf');
  assert.equal(o.offerNo, null);
  assert.equal(o.subtotal, 42200, 'Bedarfsposition zählt nicht mit');
  assert.equal(o.optionalTotal, 1000);
  assert.equal(o.nk, 2110);
  assert.equal(o.discount, 886.2);
  assert.equal(o.net, 43423.8);
  assert.equal(o.gross, 51674.32);
  assert.equal(o.hours, 400);
  assert.equal(o.validUntil, '2026-04-11', 'Bindefrist aus den Einstellungen');
  assert.throws(() => handle(db, 'PUT', `/api/offers/${o.id}`, {}, { status: 'beauftragt' }), (e) => e.status === 409);
  handle(db, 'PUT', '/api/settings', {}, { offerNoFormat: 'A{JJ}/{NNNN}' });
  const sent = handle(db, 'PUT', `/api/offers/${o.id}`, {}, { status: 'versendet' });
  assert.equal(sent.offerNo, 'A26/0001');
  const frozen = handle(db, 'PUT', `/api/offers/${o.id}`, {}, { positions: [], note: 'Rückfrage AG' });
  assert.equal(frozen.net, 43423.8, 'versendetes Angebot bleibt unverändert');
  assert.equal(frozen.note, 'Rückfrage AG');
  assert.throws(() => handle(db, 'DELETE', `/api/offers/${o.id}`, {}), (e) => e.status === 409);

  const res = handle(db, 'POST', '/api/offers/accept', {}, { id: o.id, setBudget: true });
  assert.equal(res.offer.status, 'beauftragt');
  assert.equal(res.workPackages.length, 2, 'je feste Position ein Arbeitspaket');
  assert.deepEqual(res.workPackages.map((w) => [w.code, w.positionKey, w.budget, w.plannedHours, w.phaseId]), [['AP 1', 'a', 40000, 380, ph.id], ['AP 2', 'b', 2200, 20, null]]);
  const proj = handle(db, 'GET', `/api/projects/${p.id}`, {});
  assert.equal(proj.status, 'Beauftragt');
  assert.equal(proj.budget, 43423.8);
  assert.equal(handle(db, 'POST', '/api/offers/accept', {}, { id: o.id }).workPackages.length, 0, 'keine doppelten Arbeitspakete');

  // Zeiten auf Arbeitspakete buchen – direkt und über eine Aufgabe
  const e = handle(db, 'POST', '/api/employees', {}, { name: 'A', hourlyRate: 100, weeklyHours: 40 });
  const [ap1, ap2] = res.workPackages;
  handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: e.id, projectId: p.id, phaseId: ph.id, workPackageId: ap1.id, date: '2026-03-02', hours: 6 });
  handle(db, 'POST', '/api/timeEntries/set', {}, { employeeId: e.id, projectId: p.id, phaseId: ph.id, date: '2026-03-02', hours: 2 });
  const t = handle(db, 'POST', '/api/tasks', {}, { projectId: p.id, title: 'Aufmaß', workPackageId: ap2.id });
  handle(db, 'POST', '/api/timeEntries', {}, { employeeId: e.id, projectId: p.id, taskId: t.id, date: '2026-03-03', hours: 3 });
  const by = new Map(handle(db, 'GET', '/api/summary', {}).byWorkPackage.map((r) => [r.workPackageId, r]));
  assert.deepEqual([by.get(ap1.id).hours, by.get(ap1.id).cost, by.get(ap2.id).hours], [6, 600, 3]);
  assert.equal(handle(db, 'GET', '/api/timeEntries', { employeeId: String(e.id) }).length, 3, 'gleicher Tag, mit und ohne Arbeitspaket getrennt');
  handle(db, 'DELETE', `/api/workPackages/${ap2.id}`, {});
  assert.equal(handle(db, 'GET', `/api/tasks/${t.id}`, {}).workPackageId, null);
  assert.equal(handle(db, 'PUT', `/api/workPackages/${ap1.id}`, {}, { progress: 100 }).status, 'abgeschlossen');
});

test('Angebote und Vorlagen: Rechte', () => {
  const db = fresh();
  seedRoles(db);
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'P' });
  handle(db, 'POST', '/api/offers', {}, { projectId: p.id, date: '2026-01-01', positions: [{ title: 'x', amount: 100 }] });
  const ma = { employeeId: 1, role: 'mitarbeiter' };
  assert.throws(() => handle(db, 'GET', '/api/offers', {}, null, ma), (e) => e.status === 403);
  assert.equal(handle(db, 'GET', '/api/bootstrap', {}, null, ma).offers.length, 0);
  assert.throws(() => handle(db, 'POST', '/api/workPackages', {}, { projectId: p.id, title: 'AP' }, ma), (e) => e.status === 403);
  assert.equal(handle(db, 'POST', '/api/workPackages', {}, { projectId: p.id, title: 'AP', budget: 500 }).code, 'AP 1');
  assert.equal(handle(db, 'GET', '/api/bootstrap', {}, null, ma).workPackages[0].budget, null, 'Budget nur mit Kostenrecht');
  const img = 'data:image/png;base64,iVBORw0KGgo=';
  assert.throws(() => handle(db, 'PUT', '/api/assets/frameFirst', {}, { data: img }, ma), (e) => e.status === 403);
  assert.throws(() => handle(db, 'PUT', '/api/assets/frameFirst', {}, { data: 'data:text/html;base64,AAAA' }), (e) => e.status === 400);
  handle(db, 'PUT', '/api/assets/frameFirst', {}, { data: img, name: 'Briefbogen.png' });
  handle(db, 'PUT', '/api/assets/frameFirst', {}, { data: img, name: 'Neu.png' });
  assert.deepEqual(handle(db, 'GET', '/api/assets', {}).map((a) => [a.key, a.name]), [['frameFirst', 'Neu.png']]);
  // Rechnungsnummernkreis aus den Stammdaten
  handle(db, 'PUT', '/api/settings', {}, { invoiceNoFormat: '{JJJJ}-{NN}-R' });
  const inv = handle(db, 'POST', '/api/invoices', {}, { projectId: p.id, date: '2026-05-01', lines: [{ key: 'a', label: 'L', fee: 100, percent: 100 }], nkPct: 0, vatPct: 19 });
  assert.equal(handle(db, 'PUT', `/api/invoices/${inv.id}`, {}, { status: 'gestellt' }).invoiceNo, '2026-01-R');
});

// ---------------------------------------------------------------- Debitoren, Kreditoren, Nachrichten, Auswertung
test('Debitoren/Kreditoren: Nummern, Übergabe der Belege, Storno, Zahlungsabgleich', () => {
  const db = fresh();
  seedRoles(db);
  const deb = handle(db, 'POST', '/api/contacts', {}, { kind: 'debitor', name: 'WSA Nord', city: 'Bremen' });
  const kre = handle(db, 'POST', '/api/contacts', {}, { kind: 'kreditor', name: 'Vermessung Tiede' });
  assert.deepEqual([deb.number, kre.number], ['10000', '70000']);
  assert.throws(() => handle(db, 'POST', '/api/contacts', {}, { kind: 'debitor', name: 'X', number: '10000' }), (e) => e.status === 409);
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'Wehr', number: 'P-1', extNo: '4711', debitorId: deb.id });
  const p2 = handle(db, 'POST', '/api/projects', {}, { name: 'Ohne Debitor', number: 'P-2' });
  const mk = (pid, date) => {
    const i = handle(db, 'POST', '/api/invoices', {}, { projectId: pid, date, lines: [{ key: 'a', label: 'L', fee: 1000, percent: 100 }], nkPct: 0, vatPct: 19 });
    return handle(db, 'PUT', `/api/invoices/${i.id}`, {}, { status: 'gestellt' });
  };
  const i1 = mk(p.id, '2026-03-10');
  mk(p2.id, '2026-03-11');
  const pre = handle(db, 'POST', '/api/accounting/export', {}, { type: 'debitorenBelege', preview: true });
  assert.equal(pre.count, 1);
  assert.match(pre.warnings[0], /Kein Debitor zugeordnet.*P-2/);
  const out = handle(db, 'POST', '/api/accounting/export', {}, { type: 'debitorenBelege' });
  const lines = out.content.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], 'Mandant;Belegart;Belegnummer;Belegdatum;Faelligkeit;Debitor;Name;Sammelkonto;Erloeskonto;Steuercode;Netto;USt;Brutto;Kostentraeger;Text');
  assert.equal(lines[1], ';RE;RE-2026-001;10.03.2026;09.04.2026;10000;WSA Nord;1400;8400;U19;1000,00;190,00;1190,00;4711;Abschlagsrechnung 1 Wehr');
  assert.equal(handle(db, 'POST', '/api/accounting/export', {}, { type: 'debitorenBelege', preview: true }).count, 0, 'bereits übergeben');
  handle(db, 'PUT', `/api/invoices/${i1.id}`, {}, { status: 'storniert' });
  const st = handle(db, 'POST', '/api/accounting/export', {}, { type: 'debitorenBelege' });
  assert.match(st.content, /;ST;RE-2026-001;.*;-1000,00;-190,00;-1190,00;/, 'Storno als Gegenbuchung');
  assert.equal(handle(db, 'POST', '/api/accounting/export', {}, { type: 'debitorenBelege', preview: true }).count, 0, 'Storno nur einmal');

  // Kreditoren-Belege: nur vollständige, angefallene Kosten
  handle(db, 'POST', '/api/costs', {}, { projectId: p.id, amount: 500, date: '2026-04-01', category: 'Vermessung', description: 'Aufmaß', status: 'angefallen', kreditorId: kre.id, docNo: 'ER-77' });
  handle(db, 'POST', '/api/costs', {}, { projectId: p.id, amount: 300, date: '2026-04-02', category: 'Reisekosten', status: 'angefallen' });
  const k = handle(db, 'POST', '/api/accounting/export', {}, { type: 'kreditorenBelege' });
  assert.equal(k.count, 1);
  assert.match(k.content, /;ER;ER-77;01\.04\.2026;01\.05\.2026;70000;Vermessung Tiede;1600;3110;V19;500,00;95,00;595,00;4711;Vermessung Aufmaß/);
  assert.match(k.warnings[0], /1 angefallene Kostenposition/);
  assert.match(handle(db, 'POST', '/api/accounting/export', {}, { type: 'kreditoren' }).content, /70000;Vermessung Tiede/);
  assert.throws(() => handle(db, 'DELETE', `/api/contacts/${kre.id}`, {}), (e) => e.status === 409, 'verwendeter Kreditor');
  assert.throws(() => handle(db, 'POST', '/api/accounting/export', {}, { type: 'debitoren' }, { employeeId: 1, role: 'leitung' }), (e) => e.status === 403);

  // Zahlungsabgleich
  const i3 = mk(p.id, '2026-05-01');
  const csv = `Konto;Beleg;Valuta;Betrag\r\n1400;${i3.invoiceNo};15.05.2026;1.190,00\r\n1400;UNBEKANNT;16.05.2026;50,00\r\n`;
  const prev = handle(db, 'POST', '/api/accounting/payments', {}, { text: csv });
  assert.deepEqual(prev.matches.map((m) => [m.invoiceNo, m.date, m.amount, m.result]), [[i3.invoiceNo, '2026-05-15', 1190, 'bezahlt']]);
  assert.equal(prev.unmatched, 1);
  assert.equal(handle(db, 'GET', `/api/invoices/${i3.id}`, {}).status, 'gestellt', 'Vorschau ändert nichts');
  assert.equal(handle(db, 'POST', '/api/accounting/payments', {}, { text: csv, apply: true }).applied, 1);
  assert.equal(handle(db, 'GET', `/api/invoices/${i3.id}`, {}).status, 'bezahlt');
});

test('Nachrichten: nur Beteiligte lesen, Antworten im Verlauf, gelesen/ausgeblendet', () => {
  const db = fresh();
  seedRoles(db);
  const [a, b, c] = ['A', 'B', 'C'].map((name) => handle(db, 'POST', '/api/employees', {}, { name }));
  const ua = { employeeId: a.id, role: 'mitarbeiter' }; const ub = { employeeId: b.id, role: 'mitarbeiter' }; const uc = { employeeId: c.id, role: 'mitarbeiter' };
  const m = handle(db, 'POST', '/api/messages', {}, { toIds: [b.id, a.id], subject: 'Hallo', body: 'Text', link: 'https://example.org', actorId: c.id }, ua);
  assert.deepEqual([m.fromId, m.toIds, m.link, m.readBy], [a.id, [b.id], null, [a.id]], 'Absender ist die angemeldete Person, externe Verweise werden verworfen');
  assert.throws(() => handle(db, 'POST', '/api/messages', {}, { toIds: [], body: 'x' }, ua), (e) => e.status === 400);
  assert.equal(handle(db, 'GET', '/api/messages', {}, null, ub).length, 1);
  assert.equal(handle(db, 'GET', '/api/messages', {}, null, uc).length, 0, 'Unbeteiligte sehen nichts');
  assert.equal(handle(db, 'GET', '/api/bootstrap', {}, null, uc).messages.length, 0);
  assert.throws(() => handle(db, 'POST', '/api/messages', {}, { toIds: [a.id], body: 'r', threadId: m.id }, uc), (e) => e.status === 404);
  const r = handle(db, 'POST', '/api/messages', {}, { toIds: [a.id], body: 'Antwort', threadId: m.id, link: '/controlling?tab=angebote', linkLabel: 'Angebote' }, ub);
  assert.deepEqual([r.threadId, r.link], [m.id, '/controlling?tab=angebote']);
  handle(db, 'POST', '/api/messages/read', {}, { ids: [m.id] }, ub);
  assert.deepEqual(handle(db, 'GET', '/api/messages', {}, null, ub).find((x) => x.id === m.id).readBy.sort(), [a.id, b.id].sort());
  handle(db, 'POST', '/api/messages/hide', {}, { ids: [m.id] }, ub);
  assert.deepEqual(handle(db, 'GET', '/api/messages', {}, null, ub).map((x) => x.id), [r.id], 'ausgeblendet nur für B');
  assert.equal(handle(db, 'GET', '/api/messages', {}, null, ua).length, 2);
  // ohne Anmeldung: handelnde Person aus dem gewählten Profil
  assert.equal(handle(db, 'POST', '/api/messages', {}, { toIds: [a.id], body: 'x', actorId: c.id }).fromId, c.id);
  assert.equal(handle(db, 'GET', '/api/messages', { employeeId: String(c.id) }).length, 1);
});

test('Auswertung Stunden: verdichtet je Monat, eigene Zeiten ohne Recht, Debitoren aus Auftraggebern', async () => {
  const db = fresh();
  seedRoles(db);
  const p = handle(db, 'POST', '/api/projects', {}, { name: 'P', client: 'Stadtwerke' });
  handle(db, 'POST', '/api/projects', {}, { name: 'Q', client: 'stadtwerke ' });
  const [a, b] = ['A', 'B'].map((name) => handle(db, 'POST', '/api/employees', {}, { name, hourlyRate: 100 }));
  for (const [e, date, hours] of [[a, '2026-01-10', 4], [a, '2026-01-20', 2], [a, '2026-02-01', 1], [b, '2026-01-11', 8]]) handle(db, 'POST', '/api/timeEntries', {}, { employeeId: e.id, projectId: p.id, date, hours });
  const all = handle(db, 'GET', '/api/reports/hours', { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(all.map((r) => [r.month, r.employeeId, r.hours, r.cost]).sort(), [['2026-01', a.id, 6, 600], ['2026-01', b.id, 8, 800], ['2026-02', a.id, 1, 100]].sort());
  const own = handle(db, 'GET', '/api/reports/hours', {}, null, { employeeId: a.id, role: 'mitarbeiter' });
  assert.deepEqual([own.length, own.every((r) => r.employeeId === a.id && r.cost === 0)], [2, true]);
  const { migrateAccounting } = await import('./accounting.js');
  migrateAccounting(db);
  const debs = handle(db, 'GET', '/api/contacts', {});
  assert.equal(debs.length, 1, 'gleicher Auftraggeber nur einmal');
  assert.equal(handle(db, 'GET', `/api/projects/${p.id}`, {}).debitorId, debs[0].id);
});
