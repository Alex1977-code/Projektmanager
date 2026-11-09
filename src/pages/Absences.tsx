import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Ban, Check, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from '../components/Toast';
import { Modal, useConfirm } from '../components/Modal';
import { Avatar, Card, EmptyState, Field, PageHeader, ProgressBar } from '../components/ui';
import { DEPARTMENTS } from '../components/forms';
import { ABSENCE_TYPES, type Absence, type AbsenceType, type Employee, type ID } from '../types';
import { addDays, addMonths, dayOfWeek, endOfMonth, fmtDate, isoWeek, monthLong, startOfMonth, startOfWeek, todayISO, weekdayShort } from '../utils/date';
import { dayOff, workdays } from '../utils/capacity';
import { holidayName } from '../../shared/holidays.js';
import { classNames, fmtNum } from '../utils/format';

export const ABSENCE_LETTER: Record<AbsenceType, string> = { Urlaub: 'U', Krankheit: 'K', Fortbildung: 'F', Gleitzeit: 'G', Sonderurlaub: 'S', Sonstiges: 'A' };

/** Urlaubskonto eines Jahres: Anspruch, genommen (bis heute), geplant/beantragt, Rest */
export function vacationStats(e: Employee, year: number, absences: Absence[], state: string, today = todayISO()) {
  const relevant = absences.filter((a) => a.type === 'Urlaub' && a.status !== 'abgelehnt' && (a.employeeId === e.id || a.employeeId === null)
    && a.startDate <= `${year}-12-31` && a.endDate >= `${year}-01-01`);
  let taken = 0;
  let planned = 0;
  let pending = 0;
  for (const a of relevant) {
    const yesterday = addDays(today, -1);
    const pastEnd = a.endDate < today ? a.endDate : yesterday;
    const past = a.startDate <= pastEnd ? workdays(a.startDate, pastEnd, state, a.halfDay, year) : 0;
    const futStart = a.startDate > today ? a.startDate : today;
    const future = futStart <= a.endDate ? workdays(futStart, a.endDate, state, a.halfDay, year) : 0;
    if (a.status === 'beantragt') pending += past + future;
    else { taken += past; planned += future; }
  }
  const entitlement = e.vacationDays ?? 30;
  return { entitlement, taken, planned, pending, rest: entitlement - taken - planned - pending };
}

// ================================================================== Dialog
export function AbsenceDialog({ absence, defaults, onClose }: { absence?: Absence; defaults?: Partial<Absence>; onClose: () => void }) {
  const { data, idx, me, isLead, create, update, remove } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = !absence;
  const base = { ...defaults, ...absence };
  const [employeeId, setEmployeeId] = useState<string>(base.employeeId === null ? 'all' : String(base.employeeId ?? me?.id ?? ''));
  const [type, setType] = useState<AbsenceType>(base.type || 'Urlaub');
  const [startDate, setStart] = useState(base.startDate || todayISO());
  const [endDate, setEnd] = useState(base.endDate || base.startDate || todayISO());
  const [halfDay, setHalfDay] = useState(!!base.halfDay);
  const [note, setNote] = useState(base.note || '');
  const [status, setStatus] = useState<Absence['status']>(base.status || (isLead ? 'genehmigt' : 'beantragt'));
  const editable = isLead || (absence ? absence.employeeId === me?.id && absence.status === 'beantragt' : true);
  const state = data.settings.state || 'HB';
  const days = endDate >= startDate ? workdays(startDate, endDate, state, halfDay && startDate === endDate) : 0;
  const emp = employeeId !== 'all' ? idx.employeeById.get(Number(employeeId)) : null;
  const stats = emp && type === 'Urlaub' ? vacationStats(emp, Number(startDate.slice(0, 4)), data.absences.filter((a) => a.id !== absence?.id), state) : null;

  // Planungskonflikte: eingeplante Projektstunden in den betroffenen Wochen
  const conflicts = useMemo(() => {
    if (!emp || endDate < startDate) return [];
    const weeks = new Set<string>();
    for (let d = startOfWeek(startDate); d <= endDate; d = addDays(d, 7)) weeks.add(d);
    const m = new Map<ID, number>();
    for (const a of data.allocations) if (a.employeeId === emp.id && weeks.has(a.weekStart)) m.set(a.projectId, (m.get(a.projectId) || 0) + a.hours);
    return [...m].map(([pid, h]) => ({ p: idx.projectById.get(pid), h })).filter((x) => x.p);
  }, [emp, startDate, endDate, data.allocations, idx]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (endDate < startDate) return toast.error('Das Ende liegt vor dem Beginn');
    const payload: Partial<Absence> = {
      employeeId: employeeId === 'all' ? null : Number(employeeId), type, startDate, endDate,
      halfDay: halfDay && startDate === endDate, note, ...(isLead ? { status } : {}),
    };
    try {
      if (isNew) {
        const row = await create('absences', payload);
        toast.success(row.status === 'beantragt' ? 'Antrag gestellt – die Projektleitung wurde informiert' : 'Abwesenheit eingetragen');
      } else {
        await update('absences', absence.id, payload);
        toast.success('Abwesenheit gespeichert');
      }
      onClose();
    } catch { /* gemeldet */ }
  };
  const del = async () => {
    if (!absence) return;
    if (await confirm({ title: 'Abwesenheit löschen?', message: <>{absence.type} vom {fmtDate(absence.startDate)} bis {fmtDate(absence.endDate)} wird gelöscht.</>, confirmLabel: 'Löschen', danger: true })) {
      if (await remove('absences', absence.id)) onClose();
    }
  };

  const people = data.employees.filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return (
    <Modal title={isNew ? (isLead ? 'Abwesenheit eintragen' : 'Abwesenheit beantragen') : 'Abwesenheit'} onClose={onClose} width={620}
      footer={
        <>
          {!isNew && editable && <button type="button" className="btn btn-ghost-danger mr-auto" onClick={del}>Löschen</button>}
          <button type="button" className="btn" onClick={onClose}>{editable ? 'Abbrechen' : 'Schließen'}</button>
          {editable && <button type="submit" form="absence-form" className="btn btn-primary">{isNew && !isLead && type !== 'Krankheit' ? 'Beantragen' : 'Speichern'}</button>}
        </>
      }>
      <form id="absence-form" className="form-grid" onSubmit={submit}>
        <Field label="Person">
          <select value={employeeId} disabled={!isLead || !editable} onChange={(e) => setEmployeeId(e.target.value)}>
            {isLead && <option value="all">Alle Mitarbeitenden (Betriebsruhe)</option>}
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Art">
          <select value={type} disabled={!editable} onChange={(e) => setType(e.target.value as AbsenceType)}>
            {ABSENCE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Von"><input type="date" value={startDate} disabled={!editable} onChange={(e) => { setStart(e.target.value); if (endDate < e.target.value) setEnd(e.target.value); }} required /></Field>
        <Field label="Bis"><input type="date" value={endDate} disabled={!editable} min={startDate} onChange={(e) => setEnd(e.target.value)} required /></Field>
        {startDate === endDate && (
          <label className="check-field"><input type="checkbox" checked={halfDay} disabled={!editable} onChange={(e) => setHalfDay(e.target.checked)} /> nur halber Tag</label>
        )}
        {isLead && (
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as Absence['status'])}>
              <option value="beantragt">beantragt</option>
              <option value="genehmigt">genehmigt</option>
              <option value="abgelehnt">abgelehnt</option>
            </select>
          </Field>
        )}
        <Field label="Bemerkung" span={2}><input value={note} disabled={!editable} onChange={(e) => setNote(e.target.value)} placeholder={type === 'Fortbildung' ? 'z. B. Seminar DIN 19704' : ''} /></Field>
        <div className="field field-span2 abs-info">
          <strong>{fmtNum(days, 1)} Arbeitstage</strong> <span className="muted">(ohne Wochenenden und Feiertage)</span>
          {stats && <div>Urlaubskonto {startDate.slice(0, 4)}: Anspruch {fmtNum(stats.entitlement)} · bereits verplant {fmtNum(stats.taken + stats.planned + stats.pending, 1)} · <strong className={stats.rest - days < 0 ? 'text-bad' : ''}>Rest danach {fmtNum(stats.rest - days, 1)} Tage</strong></div>}
          {conflicts.length > 0 && (
            <div className="abs-conflicts">In diesen Wochen eingeplant: {conflicts.map((c) => `${c.p!.number} (${fmtNum(c.h)} h)`).join(', ')} – bitte Ressourcenplanung prüfen.</div>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ================================================================== Seite
export function Absences() {
  const { data, idx, me, isLead, update } = useStore();
  const toast = useToast();
  const today = todayISO();
  const [month, setMonth] = useState(startOfMonth(today));
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<{ absence?: Absence; defaults?: Partial<Absence> } | null>(null);
  const state = data.settings.state || 'HB';
  const year = Number(month.slice(0, 4));

  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = month; d <= endOfMonth(month); d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const people = data.employees.filter((e) => e.active)
    .filter((e) => !dept || e.department === dept)
    .filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : (a.department || '').localeCompare(b.department || '') || a.name.localeCompare(b.name, 'de')));

  const pending = data.absences.filter((a) => a.status === 'beantragt').sort((a, b) => a.startDate.localeCompare(b.startDate));
  const canEdit = (empId: ID) => isLead || empId === me?.id;

  const decide = async (a: Absence, status: 'genehmigt' | 'abgelehnt') => {
    const row = await update('absences', a.id, { status });
    if (row) toast.success(`${a.type} von ${idx.employeeById.get(a.employeeId || 0)?.name || 'allen'} ${status}`);
  };

  const absentToday = data.employees.filter((e) => e.active && (() => { const o = dayOff(idx.cap, e.id, today); return o && o.kind !== 'holiday'; })()).length;

  return (
    <div className="page">
      <PageHeader title="Abwesenheiten" subtitle={`Urlaub, Krankheit, Fortbildung und Feiertage (${state}) – fließen automatisch in die Kapazitätsplanung ein · heute abwesend: ${absentToday}`}
        actions={<button className="btn btn-primary" onClick={() => setDialog({ defaults: { employeeId: me?.id ?? null, startDate: today } })}><Plus size={16} /> {isLead ? 'Abwesenheit eintragen' : 'Urlaub beantragen'}</button>}>
        <div className="toolbar">
          <div className="week-nav">
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Vormonat"><ChevronLeft size={18} /></button>
            <strong className="week-label month-label">{monthLong(month)} {month.slice(0, 4)}</strong>
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Folgemonat"><ChevronRight size={18} /></button>
            <button className="btn btn-sm" onClick={() => setMonth(startOfMonth(today))}>Heute</button>
          </div>
          <div className="search-input">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Person suchen …" />
          </div>
          <select className="select-sm" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Abteilung">
            <option value="">Alle Abteilungen</option>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </PageHeader>

      {isLead && pending.length > 0 && (
        <Card title="Offene Anträge" subtitle="Bitte prüfen – Konflikte mit der Ressourcenplanung werden beim Öffnen angezeigt" padded={false}>
          <ul className="team-list">
            {pending.map((a) => {
              const e = idx.employeeById.get(a.employeeId || 0);
              return (
                <li key={a.id}>
                  <Avatar employee={e} size={30} />
                  <div className="clickable-text" onClick={() => setDialog({ absence: a })}>
                    <strong>{e?.name || 'Alle'} · {a.type}</strong>
                    <small>{fmtDate(a.startDate)} – {fmtDate(a.endDate)} · {fmtNum(workdays(a.startDate, a.endDate, state, a.halfDay), 1)} Arbeitstage{a.note ? ` · ${a.note}` : ''}</small>
                  </div>
                  <div className="row-actions">
                    <button className="btn btn-sm btn-ghost-danger" onClick={() => decide(a, 'abgelehnt')}><Ban size={14} /> Ablehnen</button>
                    <button className="btn btn-sm btn-primary" onClick={() => decide(a, 'genehmigt')}><Check size={14} /> Genehmigen</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card padded={false}>
        <div className="cal-wrap">
          <table className="cal">
            <thead>
              <tr>
                <th className="cal-name">Mitarbeiter</th>
                {days.map((d) => {
                  const hol = holidayName(d, state);
                  return (
                    <th key={d} className={classNames('cal-day', dayOfWeek(d) >= 5 && 'we', hol && 'hol', d === today && 'today', dayOfWeek(d) === 0 && 'week-end')} title={hol || `KW ${isoWeek(d)}`}>
                      <small>{weekdayShort(d).slice(0, 2)}</small>
                      <span>{Number(d.slice(8, 10))}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {people.map((e) => (
                <tr key={e.id} className={e.id === me?.id ? 'me' : ''}>
                  <td className="cal-name">
                    <span className="person-cell"><Avatar employee={e} size={22} /> <span className="ellipsis">{e.name}</span></span>
                  </td>
                  {days.map((d) => {
                    const we = dayOfWeek(d) >= 5;
                    const o = we ? null : dayOff(idx.cap, e.id, d);
                    const a = o?.absence;
                    const label = o ? (o.kind === 'holiday' ? o.label : `${o.label}${o.fraction < 1 ? ' (½ Tag)' : ''}${o.pending ? ' – beantragt' : ''}${a?.note ? `: ${a.note}` : ''}`) : '';
                    return (
                      <td key={d} className={classNames('cal-cell', we && 'we', o?.kind === 'holiday' && 'hol', d === today && 'today', dayOfWeek(d) === 0 && 'week-end')}
                        title={`${e.name} · ${weekdayShort(d)} ${fmtDate(d)}${label ? `\n${label}` : ''}`}
                        onClick={() => {
                          if (we || o?.kind === 'holiday') return;
                          if (a) setDialog({ absence: a });
                          else if (canEdit(e.id)) setDialog({ defaults: { employeeId: e.id, startDate: d, endDate: d } });
                        }}>
                        {a && (
                          <span className={classNames('cal-abs', `abs-${a.type}`, a.status === 'beantragt' && 'pending', a.halfDay && 'half')}>
                            {ABSENCE_LETTER[a.type]}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rg-legend">
          {ABSENCE_TYPES.map((t) => <span key={t}><i className={`cal-abs abs-${t}`}>{ABSENCE_LETTER[t]}</i> {t}{t === 'Sonstiges' && !isLead ? ' / abwesend' : ''}</span>)}
          <span><i className="cal-abs abs-Urlaub pending">U</i> beantragt</span>
          <span><i className="cal-legend-hol" /> Feiertag / Wochenende</span>
          <span className="muted">Klick auf einen freien Tag legt eine Abwesenheit an</span>
        </div>
      </Card>

      <Card title={`Urlaubskonto ${year}`} subtitle="Arbeitstage ohne Wochenenden und Feiertage · Betriebsruhe wird angerechnet" padded={false}>
        {people.length === 0 ? <EmptyState title="Keine Personen" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Mitarbeiter</th><th className="num">Anspruch</th><th className="num">Genommen</th><th className="num">Genehmigt geplant</th><th className="num">Beantragt</th><th className="num">Rest</th><th style={{ width: 220 }} /></tr></thead>
              <tbody>
                {people.filter((e) => isLead || e.id === me?.id).map((e) => {
                  const s = vacationStats(e, year, data.absences, state);
                  return (
                    <Fragment key={e.id}>
                      <tr>
                        <td><span className="person-cell"><Avatar employee={e} size={22} /> {e.name}</span></td>
                        <td className="num">{fmtNum(s.entitlement)}</td>
                        <td className="num">{fmtNum(s.taken, 1)}</td>
                        <td className="num">{fmtNum(s.planned, 1)}</td>
                        <td className="num">{s.pending ? fmtNum(s.pending, 1) : '–'}</td>
                        <td className={classNames('num', s.rest < 0 && 'text-bad')}><strong>{fmtNum(s.rest, 1)}</strong></td>
                        <td><ProgressBar value={(s.taken + s.planned + s.pending) / Math.max(1, s.entitlement)} tone={s.rest < 0 ? 'red' : 'blue'} marker={s.taken / Math.max(1, s.entitlement)} /></td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {dialog && <AbsenceDialog absence={dialog.absence} defaults={dialog.defaults} onClose={() => setDialog(null)} />}
    </div>
  );
}
