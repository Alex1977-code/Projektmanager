import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Briefcase, CalendarClock, Check, ChevronRight, ClipboardCheck, Clock, Flag, Gauge, Palmtree as PalmIcon, Receipt, Send, Wallet } from 'lucide-react';
import { useStore } from '../store';
import { AmpelBadge, Avatar, Card, EmptyState, Kpi, PageHeader, PriorityTag, ProgressBar } from '../components/ui';
import { BulletBar, UtilizationChart } from '../components/Charts';
import { TaskForm } from '../components/forms';
import { isActiveProject, projectMetrics } from '../utils/metrics';
import { addDays, fmtDate, fmtDateShort, isoWeek, relDays, todayISO, weekdayShort, weeksBetween } from '../utils/date';
import { Palmtree } from 'lucide-react';
import { classNames, fmtEurCompact, fmtNum, fmtPct, sum } from '../utils/format';
import type { Task } from '../types';
import { sortTasks } from '../components/Kanban';
import { dayOff, weekCapacity } from '../utils/capacity';
import { StampCard, useOwnWorktimes } from '../components/StampCard';
import { TaskStatusPicker } from '../components/StatusPicker';
import { monthRows } from '../utils/worktimeCalc';
import { addMonths, monthLong } from '../utils/date';

export function Dashboard() {
  const { data, idx, me, can } = useStore();
  const seeCosts = can('costs.view');
  const navigate = useNavigate();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const today = todayISO();

  const active = data.projects.filter(isActiveProject);
  const metrics = useMemo(() => new Map(data.projects.map((p) => [p.id, projectMetrics(p, idx, today)])), [data.projects, idx, today]);

  const weeks = weeksBetween(today, 12);
  const activeEmps = data.employees.filter((e) => e.active);
  const capacity = sum(activeEmps, (e) => e.weeklyHours);
  const util = weeks.map((w) => ({ week: w, planned: sum(data.allocations.filter((a) => a.weekStart === w), (a) => a.hours), capacity: sum(activeEmps, (e) => weekCapacity(idx.cap, e, w).hours) }));
  // Wer ist heute bzw. in dieser Woche nicht da?
  const absentThisWeek = activeEmps.map((e) => ({ e, days: weeks[0] ? [0, 1, 2, 3, 4].map((i) => ({ d: addDays(weeks[0], i), o: dayOff(idx.cap, e.id, addDays(weeks[0], i)) })).filter((x) => x.o && x.o.kind !== 'holiday') : [] }))
    .filter((x) => x.days.length);
  const holidaysThisWeek = [0, 1, 2, 3, 4].map((i) => addDays(weeks[0], i)).map((d) => ({ d, o: activeEmps[0] ? dayOff(idx.cap, activeEmps[0].id, d) : null })).filter((x) => x.o?.kind === 'holiday');
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
      const ws = weeks.slice(0, 4).map((w) => {
        const h = sum(data.allocations.filter((a) => a.employeeId === e.id && a.weekStart === w), (a) => a.hours);
        const c = weekCapacity(idx.cap, e, w).hours;
        return { w, u: c > 0 ? h / c : h > 0 ? 9.99 : 0 };
      });
      const over = ws.filter((x) => x.u > 1.0001);
      if (over.length) out.push({ id: e.id, name: e.name, weeks: over });
    }
    return out.sort((a, b) => Math.max(...b.weeks.map((x) => x.u)) - Math.max(...a.weeks.map((x) => x.u)));
  }, [data.allocations, data.employees, weeks, idx.cap]);

  // ---- Heute: Stempeluhr und offene Vorgänge
  const own = useOwnWorktimes(me?.id);
  const todos = useMemo(() => {
    const out: { key: string; tone: 'warn' | 'bad' | 'info'; icon: 'send' | 'clock' | 'check' | 'palm' | 'receipt'; text: string; sub?: string; to: string }[] = [];
    const month = today.slice(0, 7);
    const prev = addMonths(`${month}-01`, -1).slice(0, 7);
    const statusOf = (empId: number, m: string) => data.worktimeMonths.find((x) => x.employeeId === empId && x.month === m)?.status || 'offen';
    if (me && own.list?.length) {
      if (own.list.some((w) => w.date.startsWith(prev)) && statusOf(me.id, prev) === 'offen') {
        out.push({ key: 'submit', tone: 'warn', icon: 'send', text: `Arbeitszeit ${monthLong(`${prev}-01`)} einreichen`, sub: 'Monatsabschluss steht noch aus', to: `/arbeitszeit?monat=${prev}` });
      }
      const gaps = statusOf(me.id, month) === 'offen' ? monthRows(me, month, own.list, idx.cap, today, new Map()).filter((r) => r.missing).length : 0;
      if (gaps) out.push({ key: 'gaps', tone: 'warn', icon: 'clock', text: `${gaps} Arbeitstag${gaps > 1 ? 'e' : ''} ohne Zeiteintrag`, sub: `${monthLong(`${month}-01`)} – Zeit oder Abwesenheit nachtragen`, to: '/arbeitszeit' });
    }
    if (can('worktime.approve')) {
      const n = data.worktimeMonths.filter((m) => m.status === 'eingereicht' && m.employeeId !== me?.id);
      if (n.length) {
        const latest = n.map((m) => m.month).sort().pop()!;
        out.push({ key: 'approve', tone: 'info', icon: 'check', text: `${n.length} Monatsabschl${n.length > 1 ? 'üsse' : 'uss'} zur Freigabe`, sub: 'Arbeitszeiten prüfen und freigeben', to: `/arbeitszeit?tab=freigaben&monat=${latest}` });
      }
    }
    if (can('absences.approve')) {
      const n = data.absences.filter((a) => a.status === 'beantragt').length;
      if (n) out.push({ key: 'abs', tone: 'info', icon: 'palm', text: `${n} Abwesenheitsantr${n > 1 ? 'äge' : 'ag'} offen`, sub: 'Urlaub genehmigen oder ablehnen', to: '/abwesenheiten' });
    }
    if (can('invoices.view')) {
      const n = (data.invoices || []).filter((i) => i.status === 'gestellt' && i.dueDate && i.dueDate < today).length;
      if (n) out.push({ key: 'inv', tone: 'bad', icon: 'receipt', text: `${n} Rechnung${n > 1 ? 'en' : ''} überfällig`, sub: 'Zahlungseingang prüfen', to: '/rechnungen' });
    }
    return out;
  }, [data.worktimeMonths, data.absences, data.invoices, me, own.list, idx.cap, today, can]);
  const todoIcon = { send: <Send size={14} />, clock: <Clock size={14} />, check: <ClipboardCheck size={14} />, palm: <PalmIcon size={14} />, receipt: <Receipt size={14} /> };
  const monthLocked = me ? (data.worktimeMonths.find((x) => x.employeeId === me.id && x.month === today.slice(0, 7))?.status || 'offen') !== 'offen' : false;

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

      {(me || todos.length > 0) && (
        <div className={classNames('today-grid', (!me || !todos.length) && 'single')}>
          {me && <StampCard compact employee={me} wt={own.list?.find((w) => w.date === today)} locked={monthLocked} onStamped={own.put} />}
          {todos.length > 0 && (
            <section className="todo-card" aria-label="Zu erledigen">
              <h3>Zu erledigen</h3>
              {todos.map((t) => (
                <Link key={t.key} to={t.to} className={classNames('todo-item', t.tone)}>
                  <i className="todo-dot">{todoIcon[t.icon]}</i>
                  <span>{t.text}{t.sub && <small>{t.sub}</small>}</span>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </section>
          )}
        </div>
      )}

      <div className="kpi-grid">
        <Kpi label="Laufende Projekte" icon={<Briefcase size={18} />} value={active.length}
          sub={`${data.projects.filter((p) => p.status === 'Akquise').length} in Akquise · ${data.projects.filter((p) => p.status === 'Abgeschlossen').length} abgeschlossen`} />
        {seeCosts && <Kpi label="Honorarvolumen laufend" icon={<Wallet size={18} />} value={fmtEurCompact(volume)}
          sub={`Ist-Kosten bisher ${fmtEurCompact(actualActive)} (${fmtPct(actualActive / Math.max(1, volume))})`} />}
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
                  {seeCosts && <th style={{ width: 170 }}>Kosten / Budget</th>}
                  <th>Termine</th>
                  {seeCosts && <th>Kosten</th>}
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
                      {seeCosts && <td>
                        <BulletBar budget={p.budget || 0} actual={m.actualCost} forecast={m.eac} scaleMax={maxBudget} />
                        <small className="muted">{fmtEurCompact(m.actualCost)} von {fmtEurCompact(p.budget)}</small>
                      </td>}
                      <td><AmpelBadge value={m.scheduleStatus} compact /></td>
                      {seeCosts && <td><AmpelBadge value={m.costStatus} compact /></td>}
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

        <Card title="Teamauslastung" subtitle={`Geplante Stunden je Woche im Verhältnis zur verfügbaren Kapazität (Soll ${fmtNum(capacity)} h/Woche abzüglich Urlaub, Feiertagen und weiterer Abwesenheiten)`} className="span-2"
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
                    <button className="task-list-main" onClick={() => setEditTask(t)}>
                      <strong>{t.title}</strong>
                      <small><span className="proj-dot" style={{ background: p?.color || '#64748b' }} /> {p?.number} · <span className={overdue ? 'text-bad' : ''}>{t.dueDate ? `fällig ${relDays(t.dueDate)}` : 'ohne Termin'}</span> <PriorityTag priority={t.priority} /></small>
                    </button>
                    <TaskStatusPicker task={t} labels="none" />
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

        <Card title="Abwesenheiten diese Woche" subtitle={holidaysThisWeek.length ? `Feiertag: ${holidaysThisWeek.map((h) => `${weekdayShort(h.d)} ${fmtDateShort(h.d)} ${h.o!.label}`).join(', ')}` : `KW ${isoWeek(today)}`} padded={false}
          actions={<Link to="/abwesenheiten" className="btn btn-sm btn-ghost">Kalender</Link>}>
          {absentThisWeek.length === 0 ? <EmptyState icon={<Palmtree size={22} />} title="Alle an Bord" text="Keine Abwesenheiten in dieser Woche." /> : (
            <ul className="team-list">
              {absentThisWeek.map(({ e, days }) => {
                const first = days[0];
                const last = days[days.length - 1];
                const pending = days.some((x) => x.o!.pending);
                return (
                  <li key={e.id}>
                    <Avatar employee={e} size={28} />
                    <div><strong>{e.name}</strong><small>{first.o!.label}{pending ? ' (beantragt)' : ''} · {weekdayShort(first.d)}{days.length > 1 ? `–${weekdayShort(last.d)}` : ''}{days.some((x) => x.o!.fraction < 1) ? ' (½ Tag)' : ''}</small></div>
                    <span className={classNames('abs-chip', `abs-${first.o!.kind}`)}>{first.o!.kind}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {bottlenecks.length > 0 && (
          <Card title="Kapazitätsengpässe" subtitle="Überplante Personen in den nächsten 4 Wochen" padded={false}
            actions={<Link to="/ressourcen" className="btn btn-sm btn-ghost">Ausgleichen</Link>}>
            <div className="bottlenecks">
              {bottlenecks.map((b) => (
                <div key={b.id} className="bottleneck">
                  <Avatar employee={idx.employeeById.get(b.id)} size={30} />
                  <div>
                    <strong>{b.name}</strong>
                    <small>{b.weeks.map((x) => `KW ${isoWeek(x.w)}: ${x.u > 9 ? 'abwesend, aber eingeplant' : `${Math.round(x.u * 100)} %`}`).join(' · ')}</small>
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
