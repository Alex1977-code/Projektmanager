import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Avatar, Card, PageHeader, ProgressBar } from '../components/ui';
import type { ID, TimeEntry } from '../types';
import { addDays, fmtDate, fmtDateShort, isoWeek, startOfWeek, todayISO, weekdayShort } from '../utils/date';
import { classNames, fmtNum, sum } from '../utils/format';
import { dayOff } from '../utils/capacity';

interface Row { key: string; projectId: ID; phaseId: ID | null; planned?: number }
const rowKey = (projectId: ID, phaseId: ID | null) => `${projectId}:${phaseId ?? '-'}`;

function DayInput({ value, onCommit, label, weekend }: { value: number; onCommit: (v: number) => void; label: string; weekend?: boolean }) {
  const fmt = (v: number) => (v ? fmtNum(v, 2) : '');
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const commit = () => {
    const n = text.trim() === '' ? 0 : Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 24) { setText(fmt(value)); return; }
    const r = Math.round(n * 4) / 4;
    if (r !== value) onCommit(r);
    else setText(fmt(value));
  };
  return (
    <input className={classNames('ts-input', weekend && 'weekend')} inputMode="decimal" value={text} aria-label={label} placeholder="–"
      onChange={(e) => setText(e.target.value)} onBlur={commit} onFocus={(e) => e.target.select()}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setText(fmt(value)); (e.target as HTMLInputElement).blur(); }
      }} />
  );
}

export function Timesheet() {
  const { data, idx, me, refreshSummary, can } = useStore();
  const isLead = can('time.all');
  const toast = useToast();
  const today = todayISO();
  const [week, setWeek] = useState(startOfWeek(today));
  const [empId, setEmpId] = useState<ID | null>(me?.id ?? null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [extra, setExtra] = useState<Row[]>([]);
  const [addProject, setAddProject] = useState('');
  const refreshTimer = useRef<number | undefined>(undefined);

  useEffect(() => { if (!empId && me) setEmpId(me.id); }, [me, empId]);
  const employee = empId ? idx.employeeById.get(empId) : null;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);

  const load = useCallback(async () => {
    if (!empId) return;
    setLoading(true);
    try {
      setEntries(await api.get<TimeEntry[]>(`/api/timeEntries?employeeId=${empId}&from=${week}&to=${addDays(week, 6)}`));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [empId, week, toast]);

  useEffect(() => { load(); setExtra([]); }, [load]);

  const activePhaseOf = (projectId: ID) => {
    const phases = idx.phasesByProject.get(projectId) || [];
    return phases.find((p) => p.startDate <= addDays(week, 6) && p.endDate >= week)?.id ?? phases[0]?.id ?? null;
  };

  // Zeilen: gebuchte Kombinationen + geplante Projekte der Woche + manuell hinzugefügte
  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const e of entries) map.set(rowKey(e.projectId, e.phaseId), { key: rowKey(e.projectId, e.phaseId), projectId: e.projectId, phaseId: e.phaseId });
    const planned = data.allocations.filter((a) => a.employeeId === empId && a.weekStart === week);
    for (const a of planned) {
      const existing = [...map.values()].find((r) => r.projectId === a.projectId);
      if (existing) existing.planned = a.hours;
      else {
        const phaseId = activePhaseOf(a.projectId);
        map.set(rowKey(a.projectId, phaseId), { key: rowKey(a.projectId, phaseId), projectId: a.projectId, phaseId, planned: a.hours });
      }
    }
    for (const r of extra) if (!map.has(r.key)) map.set(r.key, r);
    return [...map.values()].sort((a, b) => (idx.projectById.get(a.projectId)?.number || '').localeCompare(idx.projectById.get(b.projectId)?.number || ''));
  }, [entries, data.allocations, empId, week, extra, idx]);

  const cell = (r: Row, d: string) => sum(entries.filter((e) => e.projectId === r.projectId && (e.phaseId ?? null) === r.phaseId && e.date === d), (e) => e.hours);

  const commit = async (r: Row, date: string, hours: number) => {
    if (!empId) return;
    try {
      await api.post('/api/timeEntries/set', { employeeId: empId, projectId: r.projectId, phaseId: r.phaseId, date, hours });
      setEntries((list) => {
        const rest = list.filter((e) => !(e.projectId === r.projectId && (e.phaseId ?? null) === r.phaseId && e.date === date));
        return hours > 0 ? [...rest, { id: -Date.now(), employeeId: empId, projectId: r.projectId, phaseId: r.phaseId, taskId: null, date, hours, note: '' }] : rest;
      });
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => refreshSummary(), 800);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const dayTotals = days.map((d) => sum(entries.filter((e) => e.date === d), (e) => e.hours));
  const weekTotal = sum(dayTotals, (h) => h);
  const perDay = (employee?.weeklyHours || 40) / 5;
  const offs = days.map((d, i) => (i < 5 && employee ? dayOff(idx.cap, employee.id, d) : null));
  const target = sum(offs.slice(0, 5), (o) => perDay * (1 - (o?.fraction || 0)));
  const bookable = data.projects.filter((p) => p.status === 'In Bearbeitung' || p.status === 'Beauftragt' || p.status === 'Akquise');

  return (
    <div className="page">
      <PageHeader title="Zeiterfassung" subtitle="Stunden je Projekt und Leistungsphase erfassen – Grundlage für Ist-Kosten und Controlling">
        <div className="toolbar">
          <label className="person-select">
            <Avatar employee={employee} size={26} />
            <select value={empId ?? ''} disabled={!isLead} onChange={(e) => setEmpId(Number(e.target.value))} aria-label="Mitarbeiter">
              {data.employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name, 'de')).map((e) => <option key={e.id} value={e.id}>{e.name}{e.id === me?.id ? ' (ich)' : ''}</option>)}
            </select>
          </label>
          <span className="spacer" />
          <div className="week-nav">
            <button className="icon-btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Vorwoche"><ChevronLeft size={18} /></button>
            <strong className="week-label">KW {isoWeek(week)} · {fmtDateShort(week)} – {fmtDate(addDays(week, 6))}</strong>
            <button className="icon-btn" onClick={() => setWeek(addDays(week, 7))} aria-label="Folgewoche"><ChevronRight size={18} /></button>
            <button className="btn btn-sm" onClick={() => setWeek(startOfWeek(today))} disabled={week === startOfWeek(today)}>Aktuelle Woche</button>
          </div>
        </div>
      </PageHeader>

      <div className="ts-summary">
        <div>
          <span className="muted small">Wochensumme</span>
          <strong className="ts-total">{fmtNum(weekTotal, 2)} h <span className="muted">/ {fmtNum(target, 1)} h Soll{offs.some(Boolean) ? ' (nach Abwesenheiten)' : ''}</span></strong>
        </div>
        <div className="ts-summary-bar"><ProgressBar value={weekTotal / target} tone={weekTotal > target * 1.1 ? 'amber' : weekTotal >= target * 0.95 ? 'green' : 'blue'} height={8} /></div>
        <div className="muted small">{loading ? 'Lädt …' : weekTotal < target ? `noch ${fmtNum(target - weekTotal, 2)} h offen` : weekTotal > target ? `${fmtNum(weekTotal - target, 2)} h Mehrarbeit` : 'Soll erfüllt'}</div>
      </div>

      <Card padded={false}>
        <div className="table-wrap">
          <table className="ts">
            <thead>
              <tr>
                <th className="ts-proj">Projekt / Leistungsphase</th>
                <th className="ts-plan">Geplant</th>
                {days.map((d, i) => (
                  <th key={d} className={classNames('ts-day', d === today && 'today', i >= 5 && 'weekend')}>
                    <span>{weekdayShort(d)}</span><small>{fmtDateShort(d)}</small>
                    {offs[i] && <em className={classNames('ts-off', `abs-${offs[i]!.kind}`)} title={offs[i]!.label}>{offs[i]!.kind === 'holiday' ? 'Feiertag' : offs[i]!.kind}{offs[i]!.fraction < 1 ? ' ½' : ''}</em>}
                  </th>
                ))}
                <th className="ts-sum">Summe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = idx.projectById.get(r.projectId);
                const phases = idx.phasesByProject.get(r.projectId) || [];
                const ph = r.phaseId ? idx.phaseById.get(r.phaseId) : null;
                const rowSum = sum(days, (d) => cell(r, d));
                const hasHours = rowSum > 0;
                return (
                  <tr key={r.key}>
                    <td className="ts-proj">
                      <div className="proj-cell">
                        <span className="proj-dot" style={{ background: p?.color || '#64748b' }} />
                        <div>
                          <strong>{p?.number} · {p?.name}</strong>
                          {hasHours ? (
                            <small>{ph ? `${ph.code} ${ph.name}` : 'ohne Phase'}</small>
                          ) : (
                            <select className="ts-phase-select" value={r.phaseId ?? ''} aria-label="Leistungsphase"
                              onChange={(e) => {
                                const phaseId = e.target.value ? Number(e.target.value) : null;
                                setExtra((x) => [...x.filter((y) => y.key !== r.key), { key: rowKey(r.projectId, phaseId), projectId: r.projectId, phaseId, planned: r.planned }]);
                              }}>
                              <option value="">ohne Phase</option>
                              {phases.map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="ts-plan">{r.planned ? `${fmtNum(r.planned)} h` : '–'}</td>
                    {days.map((d, i) => (
                      <td key={d} className={classNames('ts-cell', d === today && 'today')}>
                        <DayInput value={cell(r, d)} weekend={i >= 5} label={`${p?.number} ${weekdayShort(d)} ${fmtDateShort(d)}`} onCommit={(v) => commit(r, d, v)} />
                      </td>
                    ))}
                    <td className="ts-sum"><strong>{fmtNum(rowSum, 2)}</strong></td>
                  </tr>
                );
              })}
              <tr className="ts-add">
                <td colSpan={2}>
                  <label className="rg-add-select">
                    <Plus size={14} />
                    <select value={addProject} onChange={(e) => {
                      const pid = Number(e.target.value);
                      setAddProject('');
                      if (!pid) return;
                      const phaseId = activePhaseOf(pid);
                      setExtra((x) => [...x, { key: rowKey(pid, phaseId), projectId: pid, phaseId }]);
                    }}>
                      <option value="">Projekt hinzufügen …</option>
                      {bookable.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
                    </select>
                  </label>
                </td>
                <td colSpan={8} className="rg-add-hint">Dezimalstunden eingeben (z. B. 7,5) · Enter oder Tab speichert</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="ts-proj"><strong>Tagessumme</strong></td>
                <td className="ts-plan">{fmtNum(sum(rows, (r) => r.planned || 0))} h</td>
                {dayTotals.map((h, i) => (
                  <td key={days[i]} className={classNames('ts-day-total', i < 5 && h > 0 && h < perDay * 0.75 && 'under', h > 10 && 'over')}>{h ? fmtNum(h, 2) : '–'}</td>
                ))}
                <td className="ts-sum"><strong>{fmtNum(weekTotal, 2)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
