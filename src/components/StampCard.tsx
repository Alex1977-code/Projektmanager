// Stempeluhr: Kommen / Gehen – im Cockpit und auf der Seite „Arbeitszeit“.
import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';
import { useToast } from './Toast';
import type { Employee, Worktime } from '../types';
import { fmtDate, todayISO, weekdayShort } from '../utils/date';
import { classNames } from '../utils/format';
import { dayOff } from '../utils/capacity';
import { fmtMin } from '../utils/worktimeCalc';
import { netMinutes, toMin } from '../../shared/worktime.js';

export const LOCATIONS = ['Büro', 'Homeoffice', 'Baustelle', 'Dienstreise', 'Werk / Prüfung'];
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** Aktuelle Uhrzeit „HH:MM“, aktualisiert sich jede halbe Minute (für die laufende Arbeitszeit). */
function useClock(active: boolean) {
  const [now, setNow] = useState(nowHM);
  useEffect(() => {
    if (!active) return;
    setNow(nowHM());
    const t = window.setInterval(() => setNow(nowHM()), 30000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/** Eigene Arbeitszeiten laden (für Cockpit: heutiger Stand, fehlende Tage). */
export function useOwnWorktimes(employeeId: number | null | undefined) {
  const [list, setList] = useState<Worktime[] | null>(null);
  const load = useCallback(async () => {
    if (!employeeId) { setList(null); return; }
    try { setList(await api.get<Worktime[]>(`/api/worktimes?employeeId=${employeeId}`)); } catch { setList(null); }
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);
  const put = useCallback((wt: Worktime) => setList((l) => [...(l || []).filter((w) => w.date !== wt.date), wt].sort((a, b) => a.date.localeCompare(b.date))), []);
  return { list, put, reload: load };
}

export function StampCard({ employee, wt, locked, onStamped, compact }: { employee: Employee; wt: Worktime | undefined; locked?: boolean; onStamped: (wt: Worktime) => void; compact?: boolean }) {
  const { idx } = useStore();
  const toast = useToast();
  const today = todayISO();
  const [location, setLocation] = useState(() => { try { return localStorage.getItem('pm.location') || 'Büro'; } catch { return 'Büro'; } });
  const [busy, setBusy] = useState(false);
  const running = !!wt?.start && !wt.end;
  const now = useClock(running);
  const off = dayOff(idx.cap, employee.id, today);
  // laufende Arbeitszeit: seit Beginn, abzüglich bereits erfasster Pause
  const elapsed = running ? Math.max(0, (toMin(now) ?? 0) - (toMin(wt!.start) ?? 0) - (wt!.breakMin || 0)) : 0;

  const stamp = async (action: 'kommen' | 'gehen') => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post<Worktime>('/api/worktimes/stamp', { action, employeeId: employee.id, date: today, time: nowHM(), location });
      try { localStorage.setItem('pm.location', location); } catch { /* ohne Speicher */ }
      onStamped(res);
      toast.success(action === 'kommen' ? `Eingestempelt um ${nowHM()} Uhr` : `Ausgestempelt – heute ${fmtMin(netMinutes(res))} h`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className={classNames('stamp-card', running && 'running', compact && 'compact')}>
      <div className="stamp-info">
        <span className="muted small">{weekdayShort(today)}, {fmtDate(today)}{off ? ` · ${off.label}` : ''}</span>
        <strong>
          {running ? <>Eingestempelt seit {wt!.start} Uhr <span className="stamp-elapsed">{fmtMin(elapsed)} h</span></>
            : wt?.end ? `Heute ${wt.start}–${wt.end} · ${fmtMin(netMinutes(wt))} h`
              : 'Noch nicht eingestempelt'}
        </strong>
      </div>
      <div className="stamp-actions">
        <select className="select-sm" value={running ? wt!.location || location : location} disabled={running} onChange={(e) => setLocation(e.target.value)} aria-label="Arbeitsort">
          {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
        </select>
        {running
          ? <button className="btn btn-primary stamp-btn" onClick={() => stamp('gehen')} disabled={locked || busy}><LogOut size={18} /> Gehen</button>
          : <button className="btn btn-primary stamp-btn" onClick={() => stamp('kommen')} disabled={locked || busy}><LogIn size={18} /> {wt?.end ? 'Wieder kommen' : 'Kommen'}</button>}
      </div>
    </div>
  );
}
