import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Briefcase, CalendarClock, Check, Flag, Gauge, Wallet } from 'lucide-react';
import { useStore } from '../store';
import { AmpelBadge, Avatar, Card, EmptyState, Kpi, PageHeader, PriorityTag, ProgressBar } from '../components/ui';
import { BulletBar, UtilizationChart } from '../components/Charts';
import { TaskForm } from '../components/forms';
import { isActiveProject, projectMetrics } from '../utils/metrics';
import { addDays, fmtDate, fmtDateShort, isoWeek, relDays, todayISO, weekdayShort, weeksBetween } from '../utils/date';
import { classNames, fmtEurCompact, fmtNum, fmtPct, sum } from '../utils/format';
import type { Task } from '../types';
import { sortTasks } from '../components/Kanban';

export function Dashboard() {
  const { data, idx, me, update } = useStore();
  const navigate = useNavigate();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const today = todayISO();

  const active = data.projects.filter(isActiveProject);
  const metrics = useMemo(() => new Map(data.projects.map((p) => [p.id, projectMetrics(p, idx, today)])), [data.projects, idx, today]);

  const weeks = weeksBetween(today, 12);
  const capacity = sum(data.employees.filter((e) => e.active), (e) => e.weeklyHours);
  const util = weeks.map((w) => ({ week: w, planned: sum(data.allocations.filter((a) => a.weekStart === w), (a) => a.hours), capacity }));
  const next4 = util.slice(0, 4);
  const util4 = sum(next4, (u) => u.planned) / Math.max(1, sum(next4, (u) => u.capacity));

  const overdueTasks = data.tasks.filter((t) => t.status !== 'erledigt' && t.dueDate && t.dueDate < today);
  const myTasks = me ? data.tasks.filter((t) => t.assigneeId === me.id && t.status !== 'erledigt').sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9') || sortTasks(a, b)) : [];
  const critical = active.filter((p) => metrics.get(p.id)!.overall === 'bad');
  const volume = sum(active, (p) => p.budget);
  const actualActive = sum(active, (p) => metrics.get(p.id)!.actualCost);

  const upcoming = data.milestones.filter((m) => !m.done && m.date <= addDays(today, 60)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);

  // Engpässe: Personen mit > 100 % in den nächsten 4 Wochen
  const bottlenecks = useMemo(() => {
    const out: { id: number; name: string; weeks: { w: string; u: number }[] }[] = [];
    for (const e of data.employees.filter((x) => x.active)) {
      const ws = weeks.slice(0, 4).map((w) => ({ w, u: sum(data.allocations.filter((a) => a.employeeId === e.id && a.weekStart === w), (a) => a.hours) / Math.max(1, e.weeklyHours || 0) }));
      const over = ws.filter((x) => x.u > 1.0001);
      if (over.length) out.push({ id: e.id, name: e.name, weeks: over });
    }
    return out.sort((a, b) => Math.max(...b.weeks.map((x) => x.u)) - Math.max(...a.weeks.map((x) => x.u)));
  }, [data.allocations, data.employees, weeks]);

  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const projectsSorted = [...active].sort((a, b) => {
    const order = { bad: 0, warn: 1, good: 2, none: 3 };
    return order[metrics.get(a.id)!.overall] - order[metrics.get(b.id)!.overall] || (a.endDate || '').localeCompare(b.endDate || '');
  });
  const maxBudget = Math.max(...active.map((p) => Math.max(p.budget || 0, metrics.get(p.id)!.eac)));

  return (
    <div className="page">
      <PageHeader
        title={`${greet}${me ? ', ' + me.name.split(' ')[0] : ''}`}
        subtitle={`${weekdayShort(today)}, ${fmtDate(today)} · KW ${isoWeek(today)} · Überblick über alle laufenden Projekte`}
      />

      <div className="kpi-grid">
        <Kpi label="Laufende Projekte" icon={<Briefcase size={18} />} value={active.length}
          sub={`${data.projects.filter((p) => p.status === 'Akquise').length} in Akquise · ${data.projects.filter((p) => p.status === 'Abgeschlossen').length} abgeschlossen`} />
        <Kpi label="Honorarvolumen laufend" icon={<Wallet size={18} />} value={fmtEurCompact(volume)}
          sub={`Ist-Kosten bisher ${fmtEurCompact(actualActive)} (${fmtPct(actualActive / Math.max(1, volume))})`} />
        <Kpi label="Auslastung nächste 4 Wochen" icon={<Gauge size={18} />} value={fmtPct(util4)}
          tone={util4 > 1 ? 'bad' : util4 > 0.9 ? 'warn' : 'default'}
          sub={<><span>{bottlenecks.length} Person(en) überplant</span></>} />
        <Kpi label="Überfällige Aufgaben" icon={<CalendarClock size={18} />} value={overdueTasks.length}
          tone={overdueTasks.length > 10 ? 'warn' : 'default'}
          sub={me ? `davon ${overdueTasks.filter((t) => t.assigneeId === me.id).length} bei Ihnen` : undefined} />
        <Kpi label="Kritische Projekte" icon={<AlertTriangle size={18} />} value={critical.length}
          tone={critical.length ? 'bad' : 'good'} sub={critical.length ? critical.map((p) => p.number).join(', ') : `${active.filter((p) => metrics.get(p.id)!.overall === 'warn').length} Projekte unter Beobachtung`} />
      </div>

      <div className="dash-grid">
        <Card title="Projektampel" subtitle="Fortschritt gegen Soll, Kosten gegen Budget – sortiert nach Handlungsbedarf" className="span-3" padded={false}
          actions={<Link to="/projekte" className="btn btn-sm btn-ghost">Alle Projekte</Link>}>
          <div className="table-wrap">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>PL</th>
                  <th style={{ width: 150 }}>Fortschritt (Ist / Soll)</th>
                  <th style={{ width: 170 }}>Kosten / Budget</th>
                  <th>Termine</th>
                  <th>Kosten</th>
                  <th>Nächster Meilenstein</th>
                </tr>
              </thead>
              <tbody>
                {projectsSorted.map((p) => {
                  const m = metrics.get(p.id)!;
                  return (
                    <tr key={p.id} onClick={() => navigate(`/projekte/${p.id}`)} className="clickable">
                      <td>
                        <div className="proj-cell">
                          <span className="proj-dot" style={{ background: p.color || '#64748b' }} />
                          <div>
                            <strong>{p.name}</strong>
                            <small>{p.number} · {p.client}</small>
                          </div>
                        </div>
                      </td>
                      <td><Avatar employee={idx.employeeById.get(p.leadId || 0)} size={26} /></td>
                      <td>
                        <ProgressBar value={m.progress} marker={m.plannedProgress} label="Fertigstellung" />
                        <small className="muted">{fmtPct(m.progress)} / Soll {fmtPct(m.plannedProgress)}</small>
                      </td>
                      <td>
                        <BulletBar budget={p.budget || 0} actual={m.actualCost} forecast={m.eac} scaleMax={maxBudget} />
                        <small className="muted">{fmtEurCompact(m.actualCost)} von {fmtEurCompact(p.budget)}</small>
                      </td>
                      <td><AmpelBadge value={m.scheduleStatus} compact /></td>
                      <td><AmpelBadge value={m.costStatus} compact /></td>
                      <td>
                        {m.nextMilestone ? (
                          <div className="ms-cell"><strong>{m.nextMilestone.name}</strong><small>{fmtDate(m.nextMilestone.date)} · {relDays(m.nextMilestone.date)}</small></div>
                        ) : <span className="muted">–</span>}
                        {m.overdueMilestones > 0 && <small className="text-bad">{m.overdueMilestones} überfällig</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Teamauslastung" subtitle={`Geplante Stunden je Woche im Verhältnis zur Kapazität (${fmtNum(capacity)} h/Woche)`} className="span-2"
          actions={<Link to="/ressourcen" className="btn btn-sm btn-ghost">Ressourcenplanung</Link>}>
          <UtilizationChart data={util} />
        </Card>

        <Card title="Meine Aufgaben" subtitle={me ? `${myTasks.length} offen` : undefined} padded={false}
          actions={<Link to="/aufgaben?mine=1" className="btn btn-sm btn-ghost">Alle</Link>}>
          {myTasks.length === 0 ? (
            <EmptyState icon={<Check size={22} />} title="Keine offenen Aufgaben" text="Alles erledigt – gut gemacht." />
          ) : (
            <ul className="task-list">
              {myTasks.slice(0, 7).map((t) => {
                const p = idx.projectById.get(t.projectId);
                const overdue = t.dueDate && t.dueDate < today;
                return (
                  <li key={t.id}>
                    <button className="check" title="Als erledigt markieren" aria-label="Als erledigt markieren" onClick={() => update('tasks', t.id, { status: 'erledigt' })}><Check size={13} /></button>
                    <button className="task-list-main" onClick={() => setEditTask(t)}>
                      <strong>{t.title}</strong>
                      <small><span className="proj-dot" style={{ background: p?.color || '#64748b' }} /> {p?.number} · <span className={overdue ? 'text-bad' : ''}>{t.dueDate ? `fällig ${relDays(t.dueDate)}` : 'ohne Termin'}</span></small>
                    </button>
                    <PriorityTag priority={t.priority} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Anstehende Meilensteine" subtitle="Nächste 60 Tage" padded={false}>
          {upcoming.length === 0 ? <EmptyState icon={<Flag size={22} />} title="Keine Meilensteine" /> : (
            <ul className="ms-list">
              {upcoming.map((m) => {
                const p = idx.projectById.get(m.projectId);
                const overdue = m.date < today;
                return (
                  <li key={m.id} onClick={() => navigate(`/projekte/${m.projectId}?tab=termine`)}>
                    <div className={classNames('ms-date', overdue && 'overdue')}>
                      <strong>{fmtDateShort(m.date)}</strong>
                      <small>KW {isoWeek(m.date)}</small>
                    </div>
                    <div className="ms-text">
                      <strong>{m.name}</strong>
                      <small><span className="proj-dot" style={{ background: p?.color || '#64748b' }} /> {p?.number} · {p?.name}</small>
                    </div>
                    <span className={overdue ? 'text-bad small' : 'muted small'}>{relDays(m.date)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {bottlenecks.length > 0 && (
          <Card title="Kapazitätsengpässe" subtitle="Überplante Personen in den nächsten 4 Wochen" className="span-2" padded={false}
            actions={<Link to="/ressourcen" className="btn btn-sm btn-ghost">Ausgleichen</Link>}>
            <div className="bottlenecks">
              {bottlenecks.map((b) => (
                <div key={b.id} className="bottleneck">
                  <Avatar employee={idx.employeeById.get(b.id)} size={30} />
                  <div>
                    <strong>{b.name}</strong>
                    <small>{b.weeks.map((x) => `KW ${isoWeek(x.w)}: ${Math.round(x.u * 100)} %`).join(' · ')}</small>
                  </div>
                  <AmpelBadge value="bad" label="Überplant" />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      {editTask && <TaskForm task={editTask} onClose={() => setEditTask(null)} />}
    </div>
  );
}
