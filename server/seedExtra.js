// Demodaten: Abwesenheiten (Urlaub, Krankheit, Fortbildung …) und Abschlagsrechnungen.
import { insert } from './db.js';
import { computeInvoice } from './billing.js';
import { holidayName } from '../shared/holidays.js';

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const parse = (s) => Date.parse(s + 'T00:00:00Z');
const addDays = (s, n) => iso(parse(s) + n * DAY);
const mondayOf = (s) => addDays(s, -((new Date(parse(s)).getUTCDay() + 6) % 7));

/** Abwesenheiten relativ zum aktuellen Datum. emp = Index in der Mitarbeiterliste, null = alle (Betriebsruhe). */
export function buildAbsences(today, rand, employeeCount) {
  const mon = mondayOf(today);
  const w = (n, d = 0) => addDays(mon, n * 7 + d);
  const year = Number(today.slice(0, 4));
  const summerYear = today >= `${year}-09-01` ? year : year - 1;
  const summerStart = mondayOf(`${summerYear}-07-01`);
  const list = [];

  // Sommerurlaub (2–3 Wochen) für alle
  for (let i = 0; i < employeeCount; i++) {
    const start = addDays(summerStart, Math.floor(rand() * 7) * 7);
    const weeks = rand() < 0.5 ? 2 : 3;
    list.push({ emp: i, type: 'Urlaub', start, end: addDays(start, weeks * 7 - 3), status: 'genehmigt', note: 'Sommerurlaub' });
  }
  // Betriebsruhe zwischen den Jahren
  const xmasYear = today > `${year}-12-31` ? year + 1 : year;
  list.push({ emp: null, type: 'Urlaub', start: `${xmasYear}-12-24`, end: `${xmasYear}-12-31`, status: 'genehmigt', note: 'Betriebsruhe zwischen den Jahren' });

  // Aktuelle und kommende Abwesenheiten
  list.push(
    { emp: 18, type: 'Krankheit', start: w(0), end: w(0, 2), status: 'genehmigt', note: '' },
    { emp: 14, type: 'Krankheit', start: w(-1, 3), end: w(-1, 4), status: 'genehmigt', note: '' },
    { emp: 6, type: 'Urlaub', start: w(1), end: w(1, 4), status: 'genehmigt', note: '' },
    { emp: 15, type: 'Urlaub', start: w(2), end: w(3, 4), status: 'genehmigt', note: '' },
    { emp: 7, type: 'Urlaub', start: w(3, 2), end: w(3, 4), status: 'beantragt', note: 'Brückentage' },
    { emp: 19, type: 'Fortbildung', start: w(4, 1), end: w(4, 3), status: 'genehmigt', note: 'Lehrgang Korrosionsschutz-Inspektor' },
    { emp: 11, type: 'Fortbildung', start: w(2, 3), end: w(2, 4), status: 'genehmigt', note: 'Seminar Funktionale Sicherheit EN ISO 13849' },
    { emp: 12, type: 'Gleitzeit', start: w(0, 4), end: w(0, 4), halfDay: true, status: 'genehmigt', note: 'Überstundenabbau' },
    { emp: 8, type: 'Urlaub', start: w(12), end: w(13, 4), status: 'beantragt', note: 'Winterurlaub' },
    { emp: 13, type: 'Urlaub', start: w(9), end: w(9, 4), status: 'beantragt', note: '' },
    { emp: 2, type: 'Urlaub', start: w(5), end: w(5, 4), status: 'genehmigt', note: '' },
    { emp: 21, type: 'Sonderurlaub', start: w(1, 2), end: w(1, 2), status: 'genehmigt', note: 'Umzug' },
  );
  // Herbsturlaub einzelner Personen
  for (const i of [3, 9, 16, 22]) {
    const start = w(-6 + Math.floor(rand() * 4));
    list.push({ emp: i, type: 'Urlaub', start, end: addDays(start, 4), status: 'genehmigt', note: '' });
  }
  return list;
}

/** Anteil verfügbarer Arbeitstage (Mo–Fr) einer Woche nach Feiertagen und Abwesenheiten. */
export function availability(list, empIdx, weekStart, state = 'HB') {
  let off = 0;
  for (let d = 0; d < 5; d++) {
    const day = addDays(weekStart, d);
    if (holidayName(day, state)) { off += 1; continue; }
    const a = list.find((x) => (x.emp === empIdx || x.emp === null) && x.start <= day && x.end >= day && x.status !== 'abgelehnt');
    if (a) off += a.halfDay ? 0.5 : 1;
  }
  return (5 - off) / 5;
}

/**
 * Abschlagsrechnungen: etwa alle 3 Monate, Leistungsstand entsprechend dem damaligen Planfortschritt.
 * Rechnungsnummern werden chronologisch über alle Projekte vergeben.
 */
export function seedInvoices(db, { projects, today, rand, authorOf }) {
  const all = [];
  for (const { project, phases } of projects) {
    if (!['In Bearbeitung', 'Abgeschlossen'].includes(project.status)) continue;
    let d = addDays(project.startDate, 75);
    const until = project.status === 'Abgeschlossen' ? project.endDate : addDays(today, -10);
    const dates = [];
    while (d <= until) { dates.push(d); d = addDays(d, 84 + Math.floor(rand() * 14)); }
    if (project.status === 'Abgeschlossen') dates.push(addDays(project.endDate, 14));
    let previousNet = 0;
    dates.forEach((date, k) => {
      const final = project.status === 'Abgeschlossen' && k === dates.length - 1;
      const lines = phases.map((ph) => {
        let pct;
        if (final) pct = 100;
        else if (date >= ph.endDate) pct = 100;
        else if (date <= ph.startDate) pct = 0;
        else pct = Math.round(((parse(date) - parse(ph.startDate)) / (parse(ph.endDate) - parse(ph.startDate))) * 100 / 5) * 5;
        pct = Math.min(pct, ph.progress ?? 100);
        return { key: `ph${ph.id}`, phaseId: ph.id, label: `${ph.code} ${ph.name}`, fee: ph.budget, percent: pct };
      });
      const base = { lines, nkPct: 5, vatPct: 19 };
      const calc = computeInvoice(base, previousNet);
      if (calc.net <= 0) return;
      previousNet = calc.cumulative;
      all.push({ project, date, k, final, calc });
    });
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  const perYear = new Map();
  const perProject = new Map();
  const lastOf = new Map(all.map((x) => [x.project.id, x]));
  let overdueDone = false;
  for (const x of all) {
    const y = x.date.slice(0, 4);
    perYear.set(y, (perYear.get(y) || 0) + 1);
    perProject.set(x.project.id, (perProject.get(x.project.id) || 0) + 1);
    const due = addDays(x.date, 30);
    const isLast = lastOf.get(x.project.id) === x;
    let status = 'bezahlt';
    let paidDate = addDays(x.date, 18 + Math.floor(rand() * 20));
    if (isLast && x.project.status !== 'Abgeschlossen' && paidDate >= today) { status = 'gestellt'; paidDate = null; }
    if (isLast && !overdueDone && x.project.status !== 'Abgeschlossen' && due < today) { status = 'gestellt'; paidDate = null; overdueDone = true; }
    insert(db, 'invoices', {
      projectId: x.project.id, number: perProject.get(x.project.id), invoiceNo: `RE-${y}-${String(perYear.get(y)).padStart(3, '0')}`,
      type: x.final ? 'Schlussrechnung' : 'Abschlagsrechnung', date: x.date, periodEnd: addDays(x.date, -3),
      ...x.calc, status, dueDate: due, paidDate, paidAmount: paidDate ? x.calc.gross : null, note: '', createdBy: authorOf(x.project),
    });
  }
}
