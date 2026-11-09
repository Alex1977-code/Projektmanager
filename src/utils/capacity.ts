// Verfügbare Kapazität je Person und Woche unter Berücksichtigung von Feiertagen und Abwesenheiten.
import { holidayName } from '../../shared/holidays.js';
import type { Absence, Employee, ID } from '../types';
import { addDays, dayOfWeek, diffDays } from './date';

export interface DayOff {
  kind: 'holiday' | Absence['type'];
  label: string;
  fraction: number; // 1 = ganzer Tag, 0.5 = halber Tag
  absence?: Absence;
  pending?: boolean;
}

export interface CapacityIndex {
  state: string;
  byEmployee: Map<ID, Absence[]>;
  company: Absence[];
}

export function buildCapacityIndex(absences: Absence[], state: string): CapacityIndex {
  const byEmployee = new Map<ID, Absence[]>();
  const company: Absence[] = [];
  for (const a of absences) {
    if (a.status === 'abgelehnt') continue;
    if (a.employeeId === null) company.push(a);
    else {
      const l = byEmployee.get(a.employeeId);
      if (l) l.push(a);
      else byEmployee.set(a.employeeId, [a]);
    }
  }
  return { state, byEmployee, company };
}

export const isWeekend = (d: string) => dayOfWeek(d) >= 5;

/** Grund, warum eine Person an einem Arbeitstag nicht (voll) verfügbar ist. */
export function dayOff(ci: CapacityIndex, employeeId: ID, date: string): DayOff | null {
  const h = holidayName(date, ci.state);
  if (h) return { kind: 'holiday', label: h, fraction: 1 };
  const a = (ci.byEmployee.get(employeeId) || []).find((x) => x.startDate <= date && x.endDate >= date)
    || ci.company.find((x) => x.startDate <= date && x.endDate >= date);
  if (!a) return null;
  return {
    kind: a.type, label: a.employeeId === null ? `${a.type} (Betriebsruhe)` : a.type, fraction: a.halfDay ? 0.5 : 1,
    absence: a, pending: a.status === 'beantragt',
  };
}

export interface WeekCapacity {
  nominal: number;
  hours: number; // verfügbar
  offDays: number;
  reasons: { date: string; kind: DayOff['kind']; label: string; fraction: number; pending?: boolean }[];
}

export function weekCapacity(ci: CapacityIndex, e: Employee, weekStart: string): WeekCapacity {
  const nominal = e.weeklyHours || 0;
  let off = 0;
  const reasons: WeekCapacity['reasons'] = [];
  for (let i = 0; i < 5; i++) {
    const d = addDays(weekStart, i);
    const o = dayOff(ci, e.id, d);
    if (o) {
      off += o.fraction;
      reasons.push({ date: d, kind: o.kind, label: o.label, fraction: o.fraction, pending: o.pending });
    }
  }
  return { nominal, hours: (nominal * (5 - off)) / 5, offDays: off, reasons };
}

/** Kurzbeschreibung, z. B. „2 T Urlaub, 1 T Feiertag“ */
export function reasonSummary(w: WeekCapacity): string {
  const m = new Map<string, number>();
  for (const r of w.reasons) {
    const k = r.kind === 'holiday' ? 'Feiertag' : r.kind;
    m.set(k, (m.get(k) || 0) + r.fraction);
  }
  return [...m].map(([k, v]) => `${String(v).replace('.', ',')} T ${k}`).join(', ');
}

/** Arbeitstage (Mo–Fr ohne Feiertage) in einem Zeitraum, optional auf ein Jahr begrenzt. */
export function workdays(start: string, end: string, state: string, halfDay = false, year?: number): number {
  let n = 0;
  const len = diffDays(start, end);
  for (let i = 0; i <= len; i++) {
    const d = addDays(start, i);
    if (year && Number(d.slice(0, 4)) !== year) continue;
    if (isWeekend(d) || holidayName(d, state)) continue;
    n += 1;
  }
  return halfDay ? n / 2 : n;
}
