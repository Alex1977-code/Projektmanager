// Monatsübersicht der Arbeitszeit: Soll, Ist, Gutschriften, Saldo, ArbZG-Hinweise.
import { checkDay, netMinutes } from '../../shared/worktime.js';
import type { Employee, Worktime } from '../types';
import { dayOff, type CapacityIndex, type DayOff } from './capacity';
import { addDays, dayOfWeek, endOfMonth } from './date';

export interface DayRow {
  date: string;
  weekend: boolean;
  wt?: Worktime;
  net: number; // Minuten
  soll: number;
  credit: number; // Gutschrift für Urlaub, Krankheit …
  saldo: number | null; // null = Zukunft
  off: DayOff | null;
  checks: { level: 'bad' | 'warn' | 'info'; text: string }[];
  projectHours: number;
}

/** Soll-Minuten je Arbeitstag (5-Tage-Woche). */
export const dailySoll = (e: Employee) => ((e.weeklyHours || 0) * 60) / 5;

export function dayRow(e: Employee, date: string, byDate: Map<string, Worktime>, cap: CapacityIndex, today: string, projectHours = 0): DayRow {
  const weekend = dayOfWeek(date) >= 5;
  const wt = byDate.get(date);
  const off = weekend ? null : dayOff(cap, e.id, date);
  const soll = weekend || off?.kind === 'holiday' ? 0 : dailySoll(e);
  const credit = off && off.kind !== 'holiday' && off.kind !== 'Gleitzeit' && !off.pending ? soll * off.fraction : 0;
  const net = netMinutes(wt);
  const prevWt = byDate.get(addDays(date, -1));
  const checks = wt ? checkDay({ ...wt, date }, prevWt ? { ...prevWt, date: addDays(date, -1) } : null, { holiday: off?.kind === 'holiday' ? off.label : null }) : [];
  const past = date < today || (date === today && !!wt?.end); // laufender Tag zählt erst nach „Gehen“
  return { date, weekend, wt, net, soll, credit, saldo: past ? net + credit - soll : null, off, checks, projectHours };
}

export function monthRows(e: Employee, month: string, worktimes: Worktime[], cap: CapacityIndex, today: string, projectByDate: Map<string, number>) {
  const byDate = new Map(worktimes.map((w) => [w.date, w]));
  const rows: DayRow[] = [];
  for (let d = `${month}-01`; d <= endOfMonth(`${month}-01`); d = addDays(d, 1)) rows.push(dayRow(e, d, byDate, cap, today, projectByDate.get(d) || 0));
  return rows;
}

/** Gleitzeitkonto: Summe der Tagessalden vom Jahresanfang bis `until` (höchstens heute). */
export function flexBalance(e: Employee, worktimes: Worktime[], cap: CapacityIndex, until: string, today: string) {
  const byDate = new Map(worktimes.map((w) => [w.date, w]));
  const end = until < today ? until : today;
  let sum = 0;
  // ab dem ersten erfassten Tag des Jahres (vorher gab es keine Erfassung)
  const firstOfYear = `${end.slice(0, 4)}-01-01`;
  const first = worktimes.map((w) => w.date).filter((d) => d >= firstOfYear).sort()[0];
  if (!first) return 0;
  for (let d = first; d <= end; d = addDays(d, 1)) sum += dayRow(e, d, byDate, cap, today).saldo || 0;
  return sum;
}

/** 425 → "7:05", -30 → "−0:30" */
export function fmtMin(min: number, signed = false) {
  const sign = min < 0 ? '−' : signed && min > 0 ? '+' : '';
  const a = Math.round(Math.abs(min));
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}
