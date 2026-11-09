import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Check, CheckCheck, ChevronLeft, ChevronRight, Info, Send, Undo2 } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Modal';
import { Avatar, Card, EmptyState, Kpi, PageHeader } from '../components/ui';
import { AbacusPanel } from '../components/AbacusPanel';
import { LOCATIONS, StampCard } from '../components/StampCard';
import type { Employee, ID, MonthStatus, TimeEntry, Worktime as WT } from '../types';
import { addMonths, fmtDate, fmtDateShort, monthLong, todayISO, weekdayShort, endOfMonth } from '../utils/date';
import { classNames, fmtNum, sum } from '../utils/format';
import { flexBalance, fmtMin, monthRows, type DayRow } from '../utils/worktimeCalc';

const STATUS_LABEL: Record<MonthStatus, string> = { offen: 'Offen', eingereicht: 'Eingereicht', freigegeben: 'Freigegeben' };
const STATUS_TONE: Record<MonthStatus, string> = { offen: 'slate', eingereicht: 'amber', freigegeben: 'green' };

type Tab = 'meine' | 'freigaben' | 'abacus';

export function Worktime() {
  const { can } = useStore();
  const [params, setParams] = useSearchParams();
  const wanted = params.get('tab') as Tab | null;
  const [month, setMonth] = useState(() => (/^\d{4}-\d{2}$/.test(params.get('monat') || '') ? params.get('monat')! : todayISO().slice(0, 7)));
  const [person, setPerson] = useState<ID | null>(null);
  // Übergabe an Abacus betrifft üblicherweise den abgeschlossenen Vormonat
  const [exportMonth, setExportMonth] = useState(() => addMonths(`${todayISO().slice(0, 7)}-01`, -1).slice(0, 7));
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'meine', label: 'Arbeitszeit', show: true },
    { id: 'freigaben', label: 'Freigaben', show: can('worktime.approve') || can('time.all') },
    { id: 'abacus', label: 'Abacus-Export', show: can('abacus.export') || can('settings.edit') },
  ];
  const tab: Tab = tabs.find((t) => t.id === wanted && t.show)?.id || 'meine';
  const setTab = (t: Tab) => setParams(t === 'meine' ? {} : { tab: t }, { replace: true });
  return (
    <div className="page">
      <PageHeader title="Arbeitszeit" subtitle="Arbeitszeiterfassung nach Arbeitszeitgesetz mit Monatsabschluss und Übergabe an Abacus">
        {tabs.filter((t) => t.show).length > 1 && (
          <nav className="tabs" role="tablist">
            {tabs.filter((t) => t.show).map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={classNames('tab', tab === t.id && 'active')} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </nav>
        )}
      </PageHeader>
      {tab === 'meine' && <MyWorktime month={month} setMonth={setMonth} person={person} setPerson={setPerson} />}
      {tab === 'freigaben' && <Approvals month={month} setMonth={setMonth} onOpen={(id) => { setPerson(id); setTab('meine'); }} />}
      {tab === 'abacus' && <AbacusPanel month={exportMonth} setMonth={setExportMonth} />}
    </div>
  );
}

function MonthNav({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  return (
    <div className="week-nav">
      <button className="icon-btn" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))} aria-label="Vormonat"><ChevronLeft size={18} /></button>
      <strong className="week-label month-label">{monthLong(`${month}-01`)} {month.slice(0, 4)}</strong>
      <button className="icon-btn" onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))} aria-label="Folgemonat"><ChevronRight size={18} /></button>
      <button className="btn btn-sm" onClick={() => setMonth(todayISO().slice(0, 7))}>Aktuell</button>
    </div>
  );
}

function StatusBadge({ status }: { status: MonthStatus }) {
  return <span className={`badge badge-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

// ===================================================================== eigene Arbeitszeit
function MyWorktime({ month, setMonth, person, setPerson }: { month: string; setMonth: (m: string) => void; person: ID | null; setPerson: (id: ID) => void }) {
  const { data, idx, me, can, reload } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const today = todayISO();
  const empId = person ?? me?.id ?? null;
  const emp = empId ? idx.employeeById.get(empId) : undefined;
  const [worktimes, setWorktimes] = useState<WT[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const location = (() => { try { return localStorage.getItem('pm.location') || 'Büro'; } catch { return 'Büro'; } })();

  const load = useCallback(async () => {
    if (!empId) return;
    try {
      const [w, t] = await Promise.all([
        api.get<WT[]>(`/api/worktimes?employeeId=${empId}`),
        api.get<TimeEntry[]>(`/api/timeEntries?employeeId=${empId}&from=${month}-01&to=${endOfMonth(`${month}-01`)}`),
      ]);
      setWorktimes(w);
      setEntries(t);
    } catch (e) { toast.error((e as Error).message); }
  }, [empId, month, toast]);
  useEffect(() => { load(); }, [load]);

  const mstat: MonthStatus = data.worktimeMonths.find((m) => m.employeeId === empId && m.month === month)?.status || 'offen';
  const locked = mstat !== 'offen' && !(mstat === 'eingereicht' && can('worktime.approve'));
  const projByDate = useMemo(() => { const m = new Map<string, number>(); for (const e of entries) m.set(e.date, (m.get(e.date) || 0) + e.hours); return m; }, [entries]);
  const rows = useMemo(() => (emp ? monthRows(emp, month, worktimes, idx.cap, today, projByDate) : []), [emp, month, worktimes, idx.cap, today, projByDate]);
  const flex = useMemo(() => (emp ? flexBalance(emp, worktimes, idx.cap, endOfMonth(`${month}-01`), today) : 0), [emp, worktimes, idx.cap, month, today]);

  if (!emp) return <EmptyState title="Kein Mitarbeiterprofil" text="Arbeitszeiten werden für Personen mit Mitarbeiterprofil erfasst." />;

  const save = async (date: string, patch: Partial<WT>) => {
    const cur = worktimes.find((w) => w.date === date);
    const next = { start: cur?.start || '', end: cur?.end || '', breakMin: cur?.breakMin ?? 0, location: cur?.location || location, note: cur?.note || '', ...patch };
    try {
      const res = await api.post<WT | { deleted: boolean }>('/api/worktimes/set', { employeeId: emp.id, date, ...next });
      setWorktimes((list) => {
        const rest = list.filter((w) => w.date !== date);
        return 'id' in res ? [...rest, res].sort((a, b) => a.date.localeCompare(b.date)) : rest;
      });
    } catch (e) { toast.error((e as Error).message); }
  };
  const monthAction = async (action: 'submit' | 'approve' | 'reject' | 'reopen') => {
    if (action === 'submit') {
      const bad = rows.filter((r) => r.checks.some((c) => c.level === 'bad')).length;
      const gaps = rows.filter((r) => r.missing).length;
      const ok = await confirm({
        title: `${monthLong(`${month}-01`)} einreichen?`,
        message: <>Die Arbeitszeiten werden zur Freigabe eingereicht und können danach nicht mehr geändert werden.{gaps ? <><br /><br /><strong>{gaps} Arbeitstag(e) ohne Eintrag.</strong> Fehlt eine Zeit oder eine Abwesenheit (Urlaub, Krankheit, Gleitzeit)?</> : null}{bad ? <><br /><br /><strong>{bad} Tag(e) mit Verstößen gegen das Arbeitszeitgesetz.</strong> Bitte prüfen und ggf. begründen.</> : null}</>,
        confirmLabel: 'Einreichen',
      });
      if (!ok) return;
    }
    try {
      await api.post('/api/worktimeMonths/action', { employeeId: emp.id, month, action });
      await reload();
      toast.success({ submit: 'Monat eingereicht', approve: 'Monat freigegeben', reject: 'Monat zurückgegeben', reopen: 'Monat wieder geöffnet' }[action]);
    } catch (e) { toast.error((e as Error).message); }
  };

  const todayWt = worktimes.find((w) => w.date === today);
  const missing = rows.filter((r) => r.missing).length;
  const past = rows.filter((r) => r.saldo !== null);
  const ist = sum(past, (r) => r.net + r.credit);
  const soll = sum(past, (r) => r.soll);
  const issues = rows.reduce((n, r) => n + r.checks.filter((c) => c.level === 'bad').length, 0);
  const projTotal = sum(rows, (r) => r.projectHours) * 60;
  const own = emp.id === me?.id;

  return (
    <>
      <div className="toolbar">
        {can('time.all') && (
          <label className="person-select">
            <Avatar employee={emp} size={26} />
            <select value={emp.id} onChange={(e) => setPerson(Number(e.target.value))} aria-label="Person">
              {data.employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name, 'de')).map((e) => <option key={e.id} value={e.id}>{e.name}{e.id === me?.id ? ' (ich)' : ''}</option>)}
            </select>
          </label>
        )}
        <span className="spacer" />
        <MonthNav month={month} setMonth={setMonth} />
      </div>

      {own && month === today.slice(0, 7) && (
        <StampCard employee={emp} wt={todayWt} locked={locked}
          onStamped={(res) => setWorktimes((list) => [...list.filter((w) => w.date !== today), res].sort((a, b) => a.date.localeCompare(b.date)))} />
      )}

      <div className="kpi-grid">
        <Kpi label="Ist (bis heute)" value={`${fmtMin(ist)} h`} sub={`davon ${fmtMin(sum(past, (r) => r.credit))} h Gutschrift (Urlaub, Krankheit …)`} />
        <Kpi label="Soll (bis heute)" value={`${fmtMin(soll)} h`} sub={`${fmtNum(emp.weeklyHours)} h/Woche`} />
        <Kpi label="Saldo Monat" value={`${fmtMin(ist - soll, true)} h`} tone={ist - soll < -600 ? 'warn' : 'default'} sub="Mehr- / Minderstunden" />
        <Kpi label="Gleitzeitkonto" value={`${fmtMin(flex, true)} h`} sub={`Stand ${fmtDate(endOfMonth(`${month}-01`) < today ? endOfMonth(`${month}-01`) : today)}`} />
        <Kpi label="Zu prüfen" value={issues + missing} tone={issues ? 'bad' : missing ? 'warn' : 'good'} icon={issues ? <AlertOctagon size={18} /> : undefined}
          sub={issues + missing ? [missing && `${missing} Tag(e) ohne Eintrag`, issues && `${issues} ArbZG-Verst${issues > 1 ? 'öße' : 'oß'}`].filter(Boolean).join(' · ') : `alles vollständig · Projektzeit ${fmtMin(projTotal)} h`} />
      </div>

      <Card padded={false} title={<>Monat {monthLong(`${month}-01`)} <StatusBadge status={mstat} /></>}
        subtitle={locked ? 'Abgeschlossen – Änderungen nur nach Wiederöffnen durch die Freigabe' : 'Uhrzeiten direkt eintragen (Enter speichert). Mindestpausen und Höchstarbeitszeit werden geprüft.'}
        actions={
          <div className="row-actions">
            {mstat === 'offen' && (own || can('time.all')) && <button className="btn btn-sm btn-primary" onClick={() => monthAction('submit')}><Send size={14} /> Monat einreichen</button>}
            {mstat === 'eingereicht' && can('worktime.approve') && !own && <button className="btn btn-sm btn-primary" onClick={() => monthAction('approve')}><Check size={14} /> Freigeben</button>}
            {mstat === 'eingereicht' && (can('worktime.approve') || own) && <button className="btn btn-sm" onClick={() => monthAction('reject')}><Undo2 size={14} /> {own && !can('worktime.approve') ? 'Zurückziehen' : 'Zurückgeben'}</button>}
            {mstat === 'freigegeben' && can('worktime.approve') && <button className="btn btn-sm" onClick={() => monthAction('reopen')}><Undo2 size={14} /> Wieder öffnen</button>}
          </div>
        }>
        <div className="table-wrap">
          <table className="wt">
            <thead>
              <tr>
                <th>Tag</th><th>Beginn</th><th>Ende</th><th>Pause</th><th className="wt-loc">Ort</th>
                <th className="num">Arbeitszeit</th><th className="num">Soll</th><th className="num">Saldo</th><th className="num wt-proj">Projektzeit</th><th>Hinweise</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <DayLine key={r.date} r={r} today={today} locked={locked} onSave={save} />)}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="wt-sumlabel"><strong>Summe {monthLong(`${month}-01`)}</strong></td>
                <td className="num wt-net" data-label="Arbeitszeit"><strong>{fmtMin(sum(rows, (r) => r.net))}</strong></td>
                <td className="num wt-soll">{fmtMin(sum(rows, (r) => r.soll))}</td>
                <td className="num wt-saldo" data-label="Saldo">{fmtMin(ist - soll, true)}</td>
                <td className="num wt-proj">{fmtMin(projTotal)}</td>
                <td className="wt-hintcell" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="footnote">Prüfungen nach Arbeitszeitgesetz: werktäglich höchstens 8 h, bis 10 h nur mit Ausgleich (§ 3), Pausen 30 min ab 6 h und 45 min ab 9 h (§ 4), 11 h Ruhezeit (§ 5), Sonn- und Feiertagsarbeit (§ 9). Urlaub, Krankheit, Fortbildung und Sonderurlaub werden mit der Sollzeit gutgeschrieben, Gleitzeittage nicht.</p>
    </>
  );
}

function TimeInput({ value, onCommit, disabled, label }: { value: string; onCommit: (v: string) => void; disabled?: boolean; label: string }) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  const commit = () => {
    let v = t.trim().replace('.', ':').replace(',', ':');
    if (/^\d{3,4}$/.test(v)) v = v.padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2'); // „745“ → 07:45
    if (/^\d{1,2}$/.test(v)) v = `${v.padStart(2, '0')}:00`;
    if (v && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) { setT(value); return; }
    if (v.length === 4) v = '0' + v;
    if (v !== value) onCommit(v);
  };
  return <input className="wt-input" value={t} disabled={disabled} placeholder="–:–" inputMode="numeric" aria-label={label}
    onChange={(e) => setT(e.target.value)} onBlur={commit} onFocus={(e) => e.target.select()}
    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

function DayLine({ r, today, locked, onSave }: { r: DayRow; today: string; locked: boolean; onSave: (date: string, patch: Partial<WT>) => void }) {
  const w = r.wt;
  const checks = r.missing ? [{ level: 'warn' as const, text: 'Kein Eintrag – Zeit oder Abwesenheit nachtragen' }, ...r.checks] : r.checks;
  const worst = checks.find((c) => c.level === 'bad') || checks.find((c) => c.level === 'warn') || checks[0];
  const Icon = worst?.level === 'bad' ? AlertOctagon : worst?.level === 'warn' ? AlertTriangle : Info;
  const hasHint = !!(r.off || worst || w?.note);
  return (
    <tr className={classNames(r.weekend && 'we', r.date === today && 'today', r.off?.kind === 'holiday' && 'hol', r.missing && 'missing', !w && 'no-entry')}>
      <td className="nowrap wt-day"><strong>{weekdayShort(r.date)}</strong> {fmtDateShort(r.date)}</td>
      <td><TimeInput value={w?.start || ''} disabled={locked} label={`Beginn ${r.date}`} onCommit={(v) => onSave(r.date, { start: v })} /></td>
      <td><TimeInput value={w?.end || ''} disabled={locked} label={`Ende ${r.date}`} onCommit={(v) => onSave(r.date, { end: v })} /></td>
      <td>
        <input className="wt-input wt-break" inputMode="numeric" disabled={locked || !w} defaultValue={w ? String(w.breakMin ?? 0) : ''} key={`${r.date}-${w?.breakMin}`} aria-label={`Pause ${r.date}`} title="Pause in Minuten"
          onBlur={(e) => { const n = Number(e.target.value) || 0; if (w && n !== (w.breakMin ?? 0)) onSave(r.date, { breakMin: n }); }} />
      </td>
      <td className="wt-loc">
        {w ? <select className="wt-select" value={w.location || 'Büro'} disabled={locked} onChange={(e) => onSave(r.date, { location: e.target.value })} aria-label={`Ort ${r.date}`}>
          {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
        </select> : null}
      </td>
      <td className="num wt-net" data-label="Arbeitszeit">{w?.end ? <strong>{fmtMin(r.net)}</strong> : null}</td>
      <td className="num muted wt-soll">{r.soll ? fmtMin(r.soll) : ''}</td>
      <td className={classNames('num wt-saldo', r.saldo !== null && r.saldo < 0 && 'text-bad', r.saldo !== null && r.saldo > 0 && 'text-good')} data-label="Saldo">{r.saldo !== null && (r.soll || r.net) ? fmtMin(r.saldo, true) : ''}</td>
      <td className="num wt-proj muted">{r.projectHours ? fmtNum(r.projectHours, 2) : ''}</td>
      <td className="wt-hintcell">{hasHint && (
        <div className="wt-hint">
          {r.off && <span className={classNames('abs-chip', `abs-${r.off.kind}`)}>{r.off.kind === 'holiday' ? r.off.label : `${r.off.kind}${r.off.fraction < 1 ? ' ½' : ''}`}</span>}
          {worst && <span className={classNames('wt-check', worst.level)} title={checks.map((c) => c.text).join('\n')}><Icon size={13} /> {worst.text}{checks.length > 1 ? ` (+${checks.length - 1})` : ''}</span>}
          {w?.note && !worst && <span className="muted small">{w.note}</span>}
        </div>
      )}</td>
    </tr>
  );
}

// ===================================================================== Freigaben
function Approvals({ month, setMonth, onOpen }: { month: string; setMonth: (m: string) => void; onOpen: (id: ID) => void }) {
  const { data, idx, can, me, reload } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const today = todayISO();
  const [all, setAll] = useState<WT[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([
        api.get<WT[]>(`/api/worktimes?all=1&month=${month}`),
        api.get<TimeEntry[]>(`/api/timeEntries?from=${month}-01&to=${endOfMonth(`${month}-01`)}`),
      ]);
      setAll(w);
      setEntries(t);
    } catch (e) { toast.error((e as Error).message); }
  }, [month, toast]);
  useEffect(() => { load(); }, [load]);

  const people = data.employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const stats = (e: Employee) => {
    const w = all.filter((x) => x.employeeId === e.id);
    const proj = new Map<string, number>();
    for (const t of entries) if (t.employeeId === e.id) proj.set(t.date, (proj.get(t.date) || 0) + t.hours);
    const rows = monthRows(e, month, w, idx.cap, today, proj);
    const past = rows.filter((r) => r.saldo !== null);
    return {
      ist: sum(past, (r) => r.net + r.credit), soll: sum(past, (r) => r.soll),
      bad: rows.reduce((n, r) => n + r.checks.filter((c) => c.level === 'bad').length, 0),
      missing: rows.filter((r) => r.missing).length,
      days: w.length, proj: sum(rows, (r) => r.projectHours) * 60, net: sum(rows, (r) => r.net),
      status: (data.worktimeMonths.find((m) => m.employeeId === e.id && m.month === month)?.status || 'offen') as MonthStatus,
      exported: !!data.worktimeMonths.find((m) => m.employeeId === e.id && m.month === month)?.exportedAt,
    };
  };
  const act = async (e: Employee, action: 'approve' | 'reject' | 'reopen') => {
    try {
      await api.post('/api/worktimeMonths/action', { employeeId: e.id, month, action });
      await reload();
      toast.success(`${e.name}: ${{ approve: 'freigegeben', reject: 'zurückgegeben', reopen: 'wieder geöffnet' }[action]}`);
    } catch (err) { toast.error((err as Error).message); }
  };
  const list = people.map((e) => ({ e, s: stats(e) }));
  const approvable = list.filter((x) => x.s.status === 'eingereicht' && x.e.id !== me?.id);
  const approveAll = async () => {
    const clean = approvable.filter((x) => !x.s.bad && !x.s.missing);
    const rest = approvable.length - clean.length;
    if (!clean.length) return toast.error('Alle eingereichten Monate haben offene Punkte – bitte einzeln prüfen.');
    if (!(await confirm({
      title: `${clean.length} Monat(e) freigeben?`,
      message: <>Freigegeben werden alle eingereichten Monate <strong>ohne ArbZG-Verstöße und ohne fehlende Tage</strong>.{rest ? <><br /><br />{rest} Monat(e) mit offenen Punkten bleiben zur Einzelprüfung stehen.</> : null}</>,
      confirmLabel: 'Freigeben',
    }))) return;
    let done = 0;
    for (const x of clean) {
      try { await api.post('/api/worktimeMonths/action', { employeeId: x.e.id, month, action: 'approve' }); done++; } catch (err) { toast.error(`${x.e.name}: ${(err as Error).message}`); }
    }
    await reload();
    if (done) toast.success(`${done} Monat(e) freigegeben`);
  };
  const counts = { offen: list.filter((x) => x.s.status === 'offen').length, eingereicht: list.filter((x) => x.s.status === 'eingereicht').length, freigegeben: list.filter((x) => x.s.status === 'freigegeben').length };

  return (
    <>
      <div className="toolbar"><span className="spacer" /><MonthNav month={month} setMonth={setMonth} /></div>
      <div className="kpi-grid kpi-grid-4">
        <Kpi label="Zur Freigabe eingereicht" value={counts.eingereicht} tone={counts.eingereicht ? 'warn' : 'default'} sub="warten auf Prüfung" />
        <Kpi label="Freigegeben" value={counts.freigegeben} tone="good" sub={`von ${people.length} Personen`} />
        <Kpi label="Noch offen" value={counts.offen} sub="nicht eingereicht" />
        <Kpi label="ArbZG-Verstöße" value={sum(list, (x) => x.s.bad)} tone={sum(list, (x) => x.s.bad) ? 'bad' : 'good'} sub={`in ${monthLong(`${month}-01`)}`} />
      </div>
      <Card padded={false} title={`Monatsabschluss ${monthLong(`${month}-01`)} ${month.slice(0, 4)}`} subtitle="Freigegebene Monate sind gesperrt und können an Abacus übergeben werden. Zeile anklicken, um die Tage zu prüfen."
        actions={can('worktime.approve') && approvable.length > 0 ? <button className="btn btn-sm btn-primary" onClick={approveAll}><CheckCheck size={14} /> Alle unauffälligen freigeben ({approvable.filter((x) => !x.s.bad && !x.s.missing).length})</button> : undefined}>
        <div className="table-wrap">
          <table className="table table-hover">
            <thead><tr><th>Person</th><th>Status</th><th className="num">Ist</th><th className="num">Soll</th><th className="num">Saldo</th><th className="num">Projektzeit</th><th className="num">nicht verbucht</th><th className="num" title="Arbeitstage ohne Eintrag">Fehltage</th><th className="num">Verstöße</th><th /></tr></thead>
            <tbody>
              {list.map(({ e, s }) => (
                <tr key={e.id} className="clickable" onClick={() => onOpen(e.id)}>
                  <td><span className="person-cell"><Avatar employee={e} size={24} /> {e.name}</span></td>
                  <td><StatusBadge status={s.status} />{s.exported && <small>an Abacus übergeben</small>}</td>
                  <td className="num">{fmtMin(s.ist)}</td>
                  <td className="num">{fmtMin(s.soll)}</td>
                  <td className={classNames('num', s.ist - s.soll < 0 && 'text-bad')}>{fmtMin(s.ist - s.soll, true)}</td>
                  <td className="num">{fmtMin(s.proj)}</td>
                  <td className={classNames('num', s.net - s.proj > 600 && 'text-warn')} title="Arbeitszeit, die keinem Projekt zugeordnet ist">{fmtMin(Math.max(0, s.net - s.proj))}</td>
                  <td className={classNames('num', s.missing > 0 && 'text-warn')}>{s.missing || '–'}</td>
                  <td className={classNames('num', s.bad > 0 && 'text-bad')}>{s.bad || '–'}</td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    <div className="row-actions">
                      {s.status === 'eingereicht' && can('worktime.approve') && e.id !== me?.id && <button className="btn btn-sm btn-primary" onClick={() => act(e, 'approve')}><Check size={14} /> Freigeben</button>}
                      {s.status === 'eingereicht' && can('worktime.approve') && <button className="btn btn-sm" onClick={() => act(e, 'reject')}>Zurückgeben</button>}
                      {s.status === 'freigegeben' && can('worktime.approve') && <button className="btn btn-sm btn-ghost" onClick={() => act(e, 'reopen')}>Öffnen</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
