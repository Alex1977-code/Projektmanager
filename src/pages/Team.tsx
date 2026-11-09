import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Phone, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, PageHeader, ProgressBar } from '../components/ui';
import { EmployeeForm, DEPARTMENTS } from '../components/forms';
import type { Employee } from '../types';
import { todayISO, weeksBetween } from '../utils/date';
import { classNames, fmtEur, fmtNum, fmtPct, groupBy, sum } from '../utils/format';
import { weekCapacity } from '../utils/capacity';
import { addDays, fmtDateShort } from '../utils/date';

export function Team() {
  const { data, idx, can } = useStore();
  const isAdmin = can('employees.edit');
  const seeRates = can('costs.view');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<Employee | 'new' | null>(null);
  const today = todayISO();
  const weeks = useMemo(() => weeksBetween(today, 4), [today]);

  useEffect(() => {
    const id = Number(params.get('id'));
    if (id) {
      const e = idx.employeeById.get(id);
      if (e) setEdit(e);
      params.delete('id');
      setParams(params, { replace: true });
    }
  }, [params, setParams, idx]);

  const list = data.employees
    .filter((e) => showInactive || e.active)
    .filter((e) => !q || `${e.name} ${e.role} ${e.department} ${e.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const groups = groupBy(list, (e) => e.department || 'Ohne Abteilung');
  const order = [...DEPARTMENTS, 'Ohne Abteilung'];
  const sortedGroups = [...groups.entries()].sort((a, b) => (order.indexOf(a[0]) + 99) % 100 - (order.indexOf(b[0]) + 99) % 100);

  const stats = (e: Employee) => {
    const planned = sum(data.allocations.filter((a) => a.employeeId === e.id && weeks.includes(a.weekStart)), (a) => a.hours);
    const avail = sum(weeks, (w) => weekCapacity(idx.cap, e, w).hours);
    const util = avail > 0 ? planned / avail : planned > 0 ? 9.99 : 0;
    const soon = data.absences.filter((a) => (a.employeeId === e.id) && a.status !== 'abgelehnt' && a.endDate >= today && a.startDate <= addDays(today, 21))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    const openTasks = data.tasks.filter((t) => t.assigneeId === e.id && t.status !== 'erledigt').length;
    const projects = new Set(data.allocations.filter((a) => a.employeeId === e.id && weeks.includes(a.weekStart)).map((a) => a.projectId)).size;
    return { util, openTasks, projects, soon };
  };

  const capacity = sum(data.employees.filter((e) => e.active), (e) => e.weeklyHours);

  return (
    <div className="page">
      <PageHeader title="Team" subtitle={`${data.employees.filter((e) => e.active).length} aktive Mitarbeitende · Kapazität ${fmtNum(capacity)} h/Woche`}
        actions={isAdmin ? <button className="btn btn-primary" onClick={() => setEdit('new')}><Plus size={16} /> Mitarbeiter anlegen</button> : undefined}>
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Rolle, Qualifikation …" />
          </div>
          <label className="check-inline"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> inaktive anzeigen</label>
        </div>
      </PageHeader>

      {sortedGroups.map(([dept, emps]) => (
        <section key={dept} className="team-section">
          <h2 className="section-title">{dept} <span className="count">{emps.length}</span></h2>
          <div className="people-grid">
            {emps.sort((a, b) => a.name.localeCompare(b.name, 'de')).map((e) => {
              const s = stats(e);
              return (
                <article key={e.id} className={classNames('person-card', !e.active && 'inactive', !isAdmin && 'readonly')} onClick={() => isAdmin && setEdit(e)} tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && isAdmin && setEdit(e)}>
                  <header>
                    <Avatar employee={e} size={44} />
                    <div>
                      <strong>{e.title ? `${e.title} ` : ''}{e.name}</strong>
                      <small>{e.role}</small>
                    </div>
                  </header>
                  {s.soon && (
                    <div className={classNames('abs-note', s.soon.startDate <= today && 'now')}>
                      <span className={classNames('abs-chip', `abs-${s.soon.type}`)}>{s.soon.type}</span>
                      {s.soon.startDate <= today ? `bis ${fmtDateShort(s.soon.endDate)}` : `${fmtDateShort(s.soon.startDate)} – ${fmtDateShort(s.soon.endDate)}`}
                      {s.soon.status === 'beantragt' && <span className="muted"> (beantragt)</span>}
                    </div>
                  )}
                  <div className="skills">{e.skills.slice(0, 4).map((sk) => <span key={sk} className="skill">{sk}</span>)}</div>
                  <div className="person-load">
                    <div className="person-load-head"><span className="muted small">Auslastung 4 Wochen (verfügbare Zeit)</span><strong className={s.util > 1 ? 'text-bad' : ''}>{s.util > 9 ? 'abwesend' : fmtPct(s.util)}</strong></div>
                    <ProgressBar value={s.util} tone="auto" />
                  </div>
                  <div className="person-stats">
                    <span><strong>{s.projects}</strong> Projekte</span>
                    <span><strong>{s.openTasks}</strong> offene Aufgaben</span>
                    <span><strong>{fmtNum(e.weeklyHours)}</strong> h/Woche</span>
                  </div>
                  <footer>
                    {e.email && <a href={`mailto:${e.email}`} onClick={(ev) => ev.stopPropagation()} title={e.email}><Mail size={14} /></a>}
                    {e.phone && <a href={`tel:${e.phone}`} onClick={(ev) => ev.stopPropagation()} title={e.phone}><Phone size={14} /></a>}
                    <span className="spacer" />
                    {seeRates && <span className="muted small">{fmtEur(e.hourlyRate)}/h</span>}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {edit && <EmployeeForm employee={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
