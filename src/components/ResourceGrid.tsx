import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import type { Allocation, Employee, ID } from '../types';
import { Avatar } from './ui';
import { addDays, fmtDateShort, isoWeek, todayISO } from '../utils/date';
import { classNames, fmtNum } from '../utils/format';
import { reasonSummary, weekCapacity, type WeekCapacity } from '../utils/capacity';

export function utilClass(hours: number, capacity: number) {
  if (hours <= 0) return 'util-0';
  const u = capacity > 0 ? hours / capacity : 2;
  if (u > 1.0001) return 'util-over';
  if (u >= 0.85) return 'util-high';
  if (u >= 0.5) return 'util-ok';
  return 'util-low';
}

function HoursInput({ value, onCommit, title, disabled }: { value: number; onCommit: (v: number) => void; title?: string; disabled?: boolean }) {
  const [text, setText] = useState(value ? fmtNum(value, 1) : '');
  useEffect(() => setText(value ? fmtNum(value, 1) : ''), [value]);
  const commit = () => {
    const n = text.trim() === '' ? 0 : Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) {
      setText(value ? fmtNum(value, 1) : '');
      return;
    }
    const r = Math.round(n * 2) / 2;
    if (r !== value) onCommit(r);
    else setText(value ? fmtNum(value, 1) : '');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') { setText(value ? fmtNum(value, 1) : ''); (e.target as HTMLInputElement).blur(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const n = (Number(text.replace(',', '.')) || 0) + (e.key === 'ArrowUp' ? 1 : -1);
      setText(fmtNum(Math.max(0, n), 1));
    }
  };
  return (
    <input className="hours-input" inputMode="decimal" value={text} placeholder="·" title={title} readOnly={disabled}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={onKey} onFocus={(e) => e.target.select()} aria-label={title} />
  );
}

function capTitle(name: string, w: string, h: number, wc: WeekCapacity) {
  const u = wc.hours > 0 ? Math.round((h / wc.hours) * 100) : null;
  const reasons = wc.reasons.map((r) => `  ${r.date.slice(8, 10)}.${r.date.slice(5, 7)}. ${r.label}${r.fraction < 1 ? ' (½ Tag)' : ''}${r.pending ? ' – beantragt' : ''}`).join('\n');
  return `${name} · KW ${isoWeek(w)}\nGeplant: ${fmtNum(h, 1)} h · verfügbar: ${fmtNum(wc.hours, 1)} von ${fmtNum(wc.nominal)} h${u !== null ? ` (${u} %)` : ''}${reasons ? `\nNicht verfügbar:\n${reasons}` : ''}`;
}

function OffMark({ wc }: { wc: WeekCapacity }) {
  if (!wc.offDays) return null;
  const pending = wc.reasons.some((r) => r.pending);
  return <span className={classNames('rg-off', pending && 'pending')} aria-label={reasonSummary(wc)}>−{String(wc.offDays).replace('.', ',')} T</span>;
}

function WeekHead({ weeks }: { weeks: string[] }) {
  const today = todayISO();
  return (
    <>
      {weeks.map((w) => (
        <th key={w} className={classNames('rg-week', today >= w && today < addDays(w, 7) && 'current')}>
          <span>KW {isoWeek(w)}</span>
          <small>{fmtDateShort(w)}</small>
        </th>
      ))}
    </>
  );
}

function useAllocIndex(weeks: string[]) {
  const { data } = useStore();
  return useMemo(() => {
    const set = new Set(weeks);
    const byEmpWeek = new Map<string, number>();
    const byEmpProjWeek = new Map<string, number>();
    const projectsByEmp = new Map<ID, Set<ID>>();
    const empsByProject = new Map<ID, Set<ID>>();
    for (const a of data.allocations as Allocation[]) {
      if (!set.has(a.weekStart)) continue;
      byEmpWeek.set(`${a.employeeId}|${a.weekStart}`, (byEmpWeek.get(`${a.employeeId}|${a.weekStart}`) || 0) + a.hours);
      byEmpProjWeek.set(`${a.employeeId}|${a.projectId}|${a.weekStart}`, a.hours);
      if (!projectsByEmp.has(a.employeeId)) projectsByEmp.set(a.employeeId, new Set());
      projectsByEmp.get(a.employeeId)!.add(a.projectId);
      if (!empsByProject.has(a.projectId)) empsByProject.set(a.projectId, new Set());
      empsByProject.get(a.projectId)!.add(a.employeeId);
    }
    return { byEmpWeek, byEmpProjWeek, projectsByEmp, empsByProject };
  }, [data.allocations, weeks]);
}

// ============================================================ Teamansicht (alle Mitarbeiter)
export function ResourceGrid({ weeks, employees, showAbsolute }: { weeks: string[]; employees: Employee[]; showAbsolute: boolean }) {
  const { data, idx, setAllocation, can } = useStore();
  const canPlan = can('resources.edit');
  const ai = useAllocIndex(weeks);
  const [open, setOpen] = useState<Set<ID>>(new Set());
  const [extra, setExtra] = useState<Record<ID, ID[]>>({});
  const assignable = data.projects.filter((p) => p.status !== 'Abgeschlossen');

  const toggle = (id: ID) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const totals = weeks.map((w) => {
    let planned = 0;
    let cap = 0;
    for (const e of employees) {
      planned += ai.byEmpWeek.get(`${e.id}|${w}`) || 0;
      cap += weekCapacity(idx.cap, e, w).hours;
    }
    return { planned, cap };
  });

  return (
    <div className="rg-wrap">
      <table className="rg">
        <thead>
          <tr>
            <th className="rg-name">Mitarbeiter</th>
            <th className="rg-cap">Kapazität</th>
            <WeekHead weeks={weeks} />
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => {
            const cap = e.weeklyHours || 0;
            const projectIds = [...new Set([...(ai.projectsByEmp.get(e.id) || []), ...(extra[e.id] || [])])];
            const isOpen = open.has(e.id);
            return (
              <Fragment key={e.id}>
                <tr className={classNames('rg-emp', isOpen && 'open')}>
                  <td className="rg-name">
                    <button className="rg-expand" onClick={() => toggle(e.id)} aria-expanded={isOpen}>
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <Avatar employee={e} size={28} />
                      <span className="rg-emp-text">
                        <strong>{e.name}</strong>
                        <small>{e.role}</small>
                      </span>
                    </button>
                  </td>
                  <td className="rg-cap">{fmtNum(cap)} h</td>
                  {weeks.map((w) => {
                    const h = ai.byEmpWeek.get(`${e.id}|${w}`) || 0;
                    const wc = weekCapacity(idx.cap, e, w);
                    const avail = wc.hours;
                    const u = avail > 0 ? h / avail : h > 0 ? 9.99 : 0;
                    const absent = avail === 0 && wc.nominal > 0;
                    return (
                      <td key={w} className={classNames('rg-cell', absent && h === 0 ? 'rg-absent' : utilClass(h, avail))} onClick={() => !isOpen && toggle(e.id)}
                        title={capTitle(e.name, w, h, wc)}>
                        {absent && h === 0 ? <span className="rg-absent-label">{wc.reasons[0]?.kind === 'holiday' ? 'Feiertag' : wc.reasons[0]?.label.split(' ')[0]}</span>
                          : h > 0 ? (showAbsolute || absent ? `${fmtNum(h, 1)}${absent ? ' h' : ''}` : `${Math.round(u * 100)}%`) : ''}
                        {u > 1.0001 && <AlertTriangle size={11} className="rg-over-icon" aria-label="überplant" />}
                        {!absent && <OffMark wc={wc} />}
                      </td>
                    );
                  })}
                </tr>
                {isOpen && projectIds.map((pid) => {
                  const p = idx.projectById.get(pid);
                  if (!p) return null;
                  return (
                    <tr key={pid} className="rg-proj">
                      <td className="rg-name">
                        <span className="rg-proj-label">
                          <span className="proj-dot" style={{ background: p.color || '#64748b' }} />
                          <span><strong>{p.number}</strong> {p.name}</span>
                        </span>
                      </td>
                      <td className="rg-cap" />
                      {weeks.map((w) => (
                        <td key={w} className="rg-input-cell">
                          <HoursInput value={ai.byEmpProjWeek.get(`${e.id}|${pid}|${w}`) || 0} title={`${p.number} · KW ${isoWeek(w)}`} disabled={!canPlan}
                            onCommit={(v) => setAllocation(e.id, pid, w, v)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {isOpen && canPlan && (
                  <tr className="rg-proj rg-add">
                    <td className="rg-name" colSpan={2}>
                      <label className="rg-add-select">
                        <Plus size={14} />
                        <select value="" onChange={(ev) => {
                          const pid = Number(ev.target.value);
                          if (pid) setExtra((x) => ({ ...x, [e.id]: [...(x[e.id] || []), pid] }));
                        }}>
                          <option value="">Projekt zuordnen …</option>
                          {assignable.filter((p) => !projectIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
                        </select>
                      </label>
                    </td>
                    <td colSpan={weeks.length} className="rg-add-hint">Stunden je Woche eintragen · Enter speichert · ↑/↓ ändert um 1 h</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="rg-name"><strong>Summe Team</strong></td>
            <td className="rg-cap">{fmtNum(totals[0]?.cap || 0)} h</td>
            {totals.map((t, i) => (
              <td key={weeks[i]} className="rg-total" title={`Geplant ${fmtNum(t.planned)} h von ${fmtNum(t.cap)} h`}>
                <strong>{t.cap ? Math.round((t.planned / t.cap) * 100) : 0}%</strong>
                <small>{fmtNum(t.planned)} h</small>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ============================================================ Projektansicht
export function ProjectResourceGrid({ projectId, weeks }: { projectId: ID; weeks: string[] }) {
  const { data, idx, setAllocation, can } = useStore();
  const canPlan = can('resources.edit');
  const ai = useAllocIndex(weeks);
  const [extra, setExtra] = useState<ID[]>([]);
  const project = idx.projectById.get(projectId);
  const empIds = [...new Set([...(ai.empsByProject.get(projectId) || []), ...extra])];
  const emps = empIds.map((id) => idx.employeeById.get(id)).filter((e): e is Employee => !!e)
    .sort((a, b) => (a.id === project?.leadId ? -1 : b.id === project?.leadId ? 1 : a.name.localeCompare(b.name, 'de')));

  const weekSum = weeks.map((w) => emps.reduce((s, e) => s + (ai.byEmpProjWeek.get(`${e.id}|${projectId}|${w}`) || 0), 0));

  return (
    <div className="rg-wrap">
      <table className="rg rg-project">
        <thead>
          <tr>
            <th className="rg-name">Teammitglied</th>
            <th className="rg-cap">Kapazität</th>
            <WeekHead weeks={weeks} />
          </tr>
        </thead>
        <tbody>
          {emps.map((e) => {
            const cap = e.weeklyHours || 0;
            return (
              <tr key={e.id} className="rg-emp">
                <td className="rg-name">
                  <span className="rg-expand static">
                    <Avatar employee={e} size={28} />
                    <span className="rg-emp-text">
                      <strong>{e.name}{e.id === project?.leadId && <span className="tag-mini">PL</span>}</strong>
                      <small>{e.role}</small>
                    </span>
                  </span>
                </td>
                <td className="rg-cap">{fmtNum(cap)} h</td>
                {weeks.map((w) => {
                  const total = ai.byEmpWeek.get(`${e.id}|${w}`) || 0;
                  const wc = weekCapacity(idx.cap, e, w);
                  const u = wc.hours ? total / wc.hours : total ? 9.99 : 0;
                  return (
                    <td key={w} className={classNames('rg-input-cell rg-with-load', wc.hours === 0 && 'rg-absent-cell')}>
                      <HoursInput value={ai.byEmpProjWeek.get(`${e.id}|${projectId}|${w}`) || 0} title={`${e.name} · KW ${isoWeek(w)}`} disabled={!canPlan}
                        onCommit={(v) => setAllocation(e.id, projectId, w, v)} />
                      <span className={classNames('rg-load', wc.hours === 0 ? 'rg-absent' : utilClass(total, wc.hours))} title={`Gesamtauslastung über alle Projekte\n${capTitle(e.name, w, total, wc)}`}>
                        {wc.hours === 0 ? 'abwesend' : total > 0 ? `${Math.round(u * 100)}%` : '–'}{wc.offDays > 0 && wc.hours > 0 ? ` · −${String(wc.offDays).replace('.', ',')} T` : ''}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {emps.length === 0 && (
            <tr><td colSpan={weeks.length + 2} className="rg-empty">Noch niemand eingeplant. Fügen Sie unten Teammitglieder hinzu.</td></tr>
          )}
          {canPlan && <tr className="rg-proj rg-add">
            <td className="rg-name" colSpan={2}>
              <label className="rg-add-select">
                <Plus size={14} />
                <select value="" onChange={(ev) => { const id = Number(ev.target.value); if (id) setExtra((x) => [...x, id]); }}>
                  <option value="">Teammitglied einplanen …</option>
                  {data.employees.filter((e) => e.active && !empIds.includes(e.id)).sort((a, b) => a.name.localeCompare(b.name, 'de'))
                    .map((e) => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}
                </select>
              </label>
            </td>
            <td colSpan={weeks.length} className="rg-add-hint">Oben: Projektstunden · darunter: Gesamtauslastung der Person über alle Projekte</td>
          </tr>}
        </tbody>
        <tfoot>
          <tr>
            <td className="rg-name"><strong>Summe Projekt</strong></td>
            <td className="rg-cap" />
            {weekSum.map((h, i) => <td key={weeks[i]} className="rg-total"><strong>{fmtNum(h)} h</strong></td>)}
          </tr>
        </tfoot>
      </table>
      {extra.length > 0 && (
        <button className="btn btn-sm btn-ghost rg-reset" onClick={() => setExtra([])}><X size={14} /> Leere Zeilen ausblenden</button>
      )}
    </div>
  );
}
