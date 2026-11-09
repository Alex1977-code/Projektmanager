import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpenCheck, Building2, FilePlus2, Calendar, ChevronLeft, ChevronRight, Flag, MapPin, Pencil, Plus, Receipt, User } from 'lucide-react';
import { useStore } from '../store';
import { AmpelBadge, Avatar, Card, EmptyState, Kpi, PageHeader, PriorityTag, ProgressBar, ProjectStatusBadge, Segmented, TaskStatusBadge } from '../components/ui';
import { CostForm, MilestoneForm, PhaseForm, ProjectForm, TaskForm } from '../components/forms';
import { Gantt, ganttRange, type GanttRow, type GanttScale } from '../components/Gantt';
import { KanbanBoard } from '../components/Kanban';
import { TemplateDialog } from '../components/TemplateDialog';
import { NewProtocolDialog, OpenPointsTable, ProtocolTable } from '../components/Protocols';
import { InvoiceTable, useCreateInvoice } from '../components/Invoices';
import { billingStatus } from '../utils/invoices';
import { ProjectResourceGrid } from '../components/ResourceGrid';
import { BulletBar, BulletLegend } from '../components/Charts';
import { phaseKey, phaseMetrics, projectMetrics, type ProjectMetrics } from '../utils/metrics';
import { addDays, diffDays, fmtDate, relDays, startOfWeek, todayISO, weeksBetween } from '../utils/date';
import { classNames, fmtEur, fmtEurCompact, fmtEurSigned, fmtHours, fmtNum, fmtPct, sum } from '../utils/format';
import type { CostItem, Milestone, Phase, Project, Task, TaskStatus } from '../types';

type Tab = 'uebersicht' | 'termine' | 'aufgaben' | 'ressourcen' | 'kosten' | 'rechnungen' | 'protokolle';
const TABS: { id: Tab; label: string }[] = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'termine', label: 'Terminplan' },
  { id: 'aufgaben', label: 'Aufgaben' },
  { id: 'ressourcen', label: 'Ressourcen' },
  { id: 'kosten', label: 'Kosten' },
  { id: 'rechnungen', label: 'Rechnungen' },
  { id: 'protokolle', label: 'Protokolle' },
];

export function ProjectDetail() {
  const { id } = useParams();
  const { data, idx, isLead } = useStore();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const project = idx.projectById.get(Number(id));
  const tab = (params.get('tab') as Tab) || 'uebersicht';
  const today = todayISO();

  if (!project) {
    return (
      <div className="page">
        <EmptyState title="Projekt nicht gefunden" text="Das Projekt wurde möglicherweise gelöscht." action={<Link className="btn" to="/projekte">Zur Projektliste</Link>} />
      </div>
    );
  }
  const m = projectMetrics(project, idx, today);
  const lead = idx.employeeById.get(project.leadId || 0);
  const tasks = idx.tasksByProject.get(project.id) || [];
  const protocolCount = data.protocols.filter((pr) => pr.projectId === project.id).length;

  return (
    <div className="page">
      <PageHeader
        title={<><span className="proj-dot lg" style={{ background: project.color || '#64748b' }} />{project.name}</>}
        subtitle={
          <span className="header-meta">
            <Link to="/projekte" className="back-link"><ArrowLeft size={14} /> Projekte</Link>
            <span className="mono">{project.number}</span>
            <ProjectStatusBadge status={project.status} />
            <span><Building2 size={14} /> {project.client || '–'}</span>
            <span><MapPin size={14} /> {project.location || '–'}</span>
            <span><User size={14} /> {lead?.name || 'keine PL'}</span>
            <span><Calendar size={14} /> {fmtDate(project.startDate)} – {fmtDate(project.endDate)}</span>
          </span>
        }
        actions={isLead ? <button className="btn" onClick={() => setEditing(true)}><Pencil size={16} /> Bearbeiten</button> : undefined}
      >
        <nav className="tabs" role="tablist">
          {TABS.filter((t) => t.id !== 'rechnungen' || isLead).map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={classNames('tab', tab === t.id && 'active')}
              onClick={() => setParams(t.id === 'uebersicht' ? {} : { tab: t.id }, { replace: true })}>
              {t.label}
              {t.id === 'aufgaben' && <span className="tab-count">{m.tasksOpen}</span>}
              {t.id === 'protokolle' && <span className="tab-count">{protocolCount}</span>}
            </button>
          ))}
        </nav>
      </PageHeader>

      {tab === 'uebersicht' && <Overview project={project} m={m} tasks={tasks} />}
      {tab === 'termine' && <Schedule project={project} />}
      {tab === 'aufgaben' && <ProjectTasks project={project} tasks={tasks} />}
      {tab === 'ressourcen' && <ProjectResources project={project} />}
      {tab === 'kosten' && <ProjectCosts project={project} m={m} />}
      {tab === 'protokolle' && <ProjectProtocols project={project} />}
      {tab === 'rechnungen' && isLead && <ProjectInvoices project={project} />}

      {editing && <ProjectForm project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}

// ======================================================================= Übersicht
function Overview({ project, m, tasks }: { project: Project; m: ProjectMetrics; tasks: Task[] }) {
  const { data, idx, update, isLead } = useStore();
  const [, setParams] = useSearchParams();
  const [editPhase, setEditPhase] = useState<Phase | null>(null);
  const [editMs, setEditMs] = useState<Milestone | 'new' | null>(null);
  const phases = idx.phasesByProject.get(project.id) || [];
  const milestones = idx.milestonesByProject.get(project.id) || [];
  const today = todayISO();

  const team = useMemo(() => {
    const ids = new Set<number>();
    data.summary.byEmployee.filter((r) => r.projectId === project.id).forEach((r) => ids.add(r.employeeId!));
    data.allocations.filter((a) => a.projectId === project.id && a.weekStart >= startOfWeek(today)).forEach((a) => ids.add(a.employeeId));
    tasks.forEach((t) => t.assigneeId && ids.add(t.assigneeId));
    return [...ids].map((i) => idx.employeeById.get(i)!).filter(Boolean).map((e) => ({
      e,
      hours: data.summary.byEmployee.find((r) => r.projectId === project.id && r.employeeId === e.id)?.hours || 0,
      open: tasks.filter((t) => t.assigneeId === e.id && t.status !== 'erledigt').length,
    })).sort((a, b) => (a.e.id === project.leadId ? -1 : b.e.id === project.leadId ? 1 : b.hours - a.hours));
  }, [data, idx, project, tasks, today]);

  const timePct = project.startDate && project.endDate ? Math.min(1, Math.max(0, diffDays(project.startDate, today) / Math.max(1, diffDays(project.startDate, project.endDate)))) : 0;

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Honorar / Budget" value={fmtEurCompact(m.budget)} sub={`${fmtNum(m.plannedHours)} Plan-Stunden`} />
        <Kpi label="Ist-Kosten" value={fmtEurCompact(m.actualCost)} sub={`${fmtPct(m.budgetUsed)} des Budgets · ${fmtNum(m.actualHours)} h gebucht`} />
        <Kpi label="Fertigstellung" value={fmtPct(m.progress)} sub={<>Soll heute {fmtPct(m.plannedProgress)} · <AmpelBadge value={m.scheduleStatus} /></>}
          tone={m.scheduleStatus === 'bad' ? 'bad' : m.scheduleStatus === 'warn' ? 'warn' : 'default'} />
        <Kpi label="Prognose Gesamtkosten" value={fmtEurCompact(m.eac)}
          sub={<>{m.variance >= 0 ? 'Reserve' : 'Überschreitung'} {fmtEurCompact(Math.abs(m.variance))} · <AmpelBadge value={m.costStatus} /></>}
          tone={m.costStatus === 'bad' ? 'bad' : m.costStatus === 'warn' ? 'warn' : 'default'} />
        <Kpi label="Aufgaben" value={`${m.tasksDone} / ${m.tasksTotal}`} sub={m.tasksOverdue ? <span className="text-bad">{m.tasksOverdue} überfällig</span> : 'keine überfällig'} />
      </div>

      <div className="detail-grid">
        <div className="stack">
          <Card title="Leistungsphasen" subtitle="Klick auf eine Phase zum Bearbeiten von Termin, Budget und Fertigstellungsgrad" padded={false}
            actions={<button className="btn btn-sm btn-ghost" onClick={() => setParams({ tab: 'termine' })}>Terminplan öffnen</button>}>
            {phases.length === 0 ? <EmptyState title="Keine Leistungsphasen" text="Im Terminplan können Phasen ergänzt werden." /> : (
              <table className="table table-hover">
                <thead><tr><th>Phase</th><th>Zeitraum</th><th className="num">Budget</th><th style={{ width: 200 }}>Fertigstellung</th></tr></thead>
                <tbody>
                  {phases.map((ph) => {
                    const pm = phaseMetrics(ph, idx);
                    const active = ph.startDate <= today && ph.endDate >= today;
                    return (
                      <tr key={ph.id} className={classNames(isLead && 'clickable', active && 'row-active')} onClick={() => isLead && setEditPhase(ph)}>
                        <td><strong>{ph.code}</strong> {ph.name}{active && <span className="tag-mini tag-blue">aktuell</span>}</td>
                        <td className="nowrap small">{fmtDate(ph.startDate)} – {fmtDate(ph.endDate)}</td>
                        <td className="num">{fmtEurCompact(ph.budget)}</td>
                        <td>
                          <div className="progress-row">
                            <ProgressBar value={(ph.progress || 0) / 100} marker={pm.plannedProgress} tone={(ph.progress || 0) >= 100 ? 'green' : 'blue'} />
                            <span className="small">{fmtNum(ph.progress)} %</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Projektbeschreibung">
            <p className="prewrap">{project.description || <span className="muted">Keine Beschreibung hinterlegt.</span>}</p>
            <dl className="facts">
              <div><dt>Bauwerkstyp</dt><dd>{project.type || '–'}</dd></div>
              <div><dt>Priorität</dt><dd><PriorityTag priority={project.priority} /></dd></div>
              <div><dt>Laufzeit</dt><dd>{project.startDate && project.endDate ? `${Math.round(diffDays(project.startDate, project.endDate) / 30.4)} Monate` : '–'}</dd></div>
              <div><dt>Zeitverlauf</dt><dd>{fmtPct(timePct)} der Laufzeit vergangen</dd></div>
            </dl>
          </Card>
        </div>

        <div className="stack">
          <Card title="Meilensteine" padded={false} actions={<button className="btn btn-sm btn-ghost" onClick={() => setEditMs('new')}><Plus size={14} /> Neu</button>}>
            {milestones.length === 0 ? <EmptyState icon={<Flag size={20} />} title="Keine Meilensteine" /> : (
              <ul className="ms-check-list">
                {milestones.map((ms) => {
                  const overdue = !ms.done && ms.date < today;
                  return (
                    <li key={ms.id} className={classNames(ms.done && 'done', overdue && 'overdue')}>
                      <input type="checkbox" checked={ms.done} onChange={(e) => update('milestones', ms.id, { done: e.target.checked })} aria-label={`${ms.name} erreicht`} />
                      <button className="link-btn" onClick={() => setEditMs(ms)}>
                        <strong>{ms.name}</strong>
                        <small>{fmtDate(ms.date)} · {ms.done ? 'erreicht' : relDays(ms.date)}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Projektteam" subtitle="Gebuchte Stunden und offene Aufgaben" padded={false}>
            <ul className="team-list">
              {team.map(({ e, hours, open }) => (
                <li key={e.id}>
                  <Avatar employee={e} size={30} />
                  <div><strong>{e.name}{e.id === project.leadId && <span className="tag-mini">PL</span>}</strong><small>{e.role}</small></div>
                  <div className="team-nums"><strong>{fmtNum(hours)} h</strong><small>{open} offen</small></div>
                </li>
              ))}
              {team.length === 0 && <li className="muted">Noch kein Team zugeordnet</li>}
            </ul>
          </Card>
        </div>
      </div>
      {editPhase && <PhaseForm phase={editPhase} projectId={project.id} onClose={() => setEditPhase(null)} />}
      {editMs && <MilestoneForm milestone={editMs === 'new' ? undefined : editMs} projectId={project.id} onClose={() => setEditMs(null)} />}
    </>
  );
}

// ======================================================================= Terminplan
const TASK_COLOR: Record<TaskStatus, string> = { offen: '#94a3b8', in_arbeit: '#2563eb', pruefung: '#d97706', erledigt: '#16a34a' };

function Schedule({ project }: { project: Project }) {
  const { idx, update, isLead } = useStore();
  const [scale, setScale] = useState<GanttScale>('month');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [editPhase, setEditPhase] = useState<Phase | 'new' | null>(null);
  const [editMs, setEditMs] = useState<Milestone | 'new' | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const phases = idx.phasesByProject.get(project.id) || [];
  const milestones = idx.milestonesByProject.get(project.id) || [];
  const tasks = idx.tasksByProject.get(project.id) || [];
  const color = project.color || '#2563eb';

  const range = ganttRange([project.startDate || '', project.endDate || '', ...phases.flatMap((p) => [p.startDate, p.endDate]), ...milestones.map((m) => m.date)], scale);

  const rows: GanttRow[] = [];
  rows.push({
    id: 'ms', label: <span className="gantt-ms-label"><Flag size={14} /> Meilensteine</span>, bars: [],
    milestones: milestones.map((m) => ({ id: `m${m.id}`, date: m.date, label: m.name, done: m.done, onClick: () => setEditMs(m) })),
    className: 'gantt-row-ms',
  });
  if (project.startDate && project.endDate) {
    const m = projectMetrics(project, idx);
    rows.push({
      id: 'proj', label: <strong>Gesamtprojekt</strong>, meta: <span className="small muted">{fmtPct(m.progress)}</span>,
      bars: [{ id: 'proj', start: project.startDate, end: project.endDate, color: '#334155', progress: m.progress, variant: 'summary', label: project.number || '' }],
    });
  }
  for (const ph of phases) {
    const ptasks = tasks.filter((t) => t.phaseId === ph.id);
    const isOpen = open.has(ph.id);
    rows.push({
      id: `ph${ph.id}`,
      label: <><strong>{ph.code}</strong> {ph.name}</>,
      meta: <span className="small muted">{fmtNum(ph.progress)} %</span>,
      expanded: isOpen,
      onToggle: ptasks.length ? () => setOpen((s) => { const n = new Set(s); if (n.has(ph.id)) n.delete(ph.id); else n.add(ph.id); return n; }) : undefined,
      bars: [{
        id: `ph${ph.id}`, start: ph.startDate, end: ph.endDate, color, progress: (ph.progress || 0) / 100, label: ph.code || ph.name, tooltip: `${ph.code} ${ph.name}`,
        onClick: () => setEditPhase(ph),
        onChange: isLead ? (s, e) => update('phases', ph.id, { startDate: s, endDate: e }) : undefined,
      }],
    });
    if (isOpen) {
      for (const t of ptasks) {
        const s = t.startDate || t.dueDate;
        const e = t.dueDate || t.startDate;
        rows.push({
          id: `t${t.id}`, level: 1,
          label: <span className="gantt-task-label">{t.title}</span>,
          meta: <Avatar employee={idx.employeeById.get(t.assigneeId || 0)} size={20} />,
          bars: s && e ? [{
            id: `t${t.id}`, start: s, end: e, color: TASK_COLOR[t.status], variant: 'task', tooltip: t.title,
            onClick: () => setEditTask(t),
            onChange: (ns, ne) => update('tasks', t.id, { startDate: ns, dueDate: ne }),
          }] : [],
        });
      }
    }
  }
  const unphased = tasks.filter((t) => !t.phaseId);
  if (unphased.length) {
    rows.push({
      id: 'nophase', label: <span className="muted">Aufgaben ohne Phase</span>, bars: [],
    });
    for (const t of unphased) {
      const s = t.startDate || t.dueDate;
      const e = t.dueDate || t.startDate;
      rows.push({
        id: `t${t.id}`, level: 1, label: t.title, bars: s && e ? [{ id: `t${t.id}`, start: s, end: e, color: TASK_COLOR[t.status], variant: 'task', onClick: () => setEditTask(t), onChange: (ns, ne) => update('tasks', t.id, { startDate: ns, dueDate: ne }) }] : [],
      });
    }
  }

  return (
    <Card padded={false}
      title="Terminplan"
      subtitle="Balken ziehen zum Verschieben, an den Enden ziehen zum Verlängern · Klick öffnet Details"
      actions={
        <>
          <button className="btn btn-sm btn-ghost" onClick={() => setOpen(open.size ? new Set() : new Set(phases.map((p) => p.id)))}>{open.size ? 'Aufgaben einklappen' : 'Aufgaben anzeigen'}</button>
          <Segmented value={scale} onChange={setScale} options={[{ value: 'week', label: 'Wochen' }, { value: 'month', label: 'Monate' }, { value: 'quarter', label: 'Quartale' }]} />
          <button className="btn btn-sm" onClick={() => setEditMs('new')}><Flag size={14} /> Meilenstein</button>
          {isLead && <button className="btn btn-sm btn-primary" onClick={() => setEditPhase('new')}><Plus size={14} /> Phase</button>}
        </>
      }>
      <Gantt rows={rows} from={range.from} to={range.to} scale={scale} labelHeader="Leistungsphase / Aufgabe" />
      <div className="gantt-legend">
        <span><i className="lg-bar" style={{ background: color }} /> Leistungsphase (weißer Streifen = Fertigstellung)</span>
        {(['offen', 'in_arbeit', 'pruefung', 'erledigt'] as TaskStatus[]).map((s) => <span key={s}><i className="lg-bar" style={{ background: TASK_COLOR[s] }} /> <TaskStatusBadge status={s} /></span>)}
        <span><i className="lg-diamond" /> Meilenstein</span>
        <span><i className="lg-diamond overdue" /> überfällig</span>
      </div>
      {editPhase && <PhaseForm phase={editPhase === 'new' ? undefined : editPhase} projectId={project.id} onClose={() => setEditPhase(null)} />}
      {editMs && <MilestoneForm milestone={editMs === 'new' ? undefined : editMs} projectId={project.id} onClose={() => setEditMs(null)} />}
      {editTask && <TaskForm task={editTask} onClose={() => setEditTask(null)} />}
    </Card>
  );
}

// ======================================================================= Aufgaben
function ProjectTasks({ project, tasks }: { project: Project; tasks: Task[] }) {
  const { idx } = useStore();
  const [edit, setEdit] = useState<Task | null>(null);
  const [create, setCreate] = useState<Partial<Task> | null>(null);
  const [assignee, setAssignee] = useState('');
  const [phase, setPhase] = useState('');
  const [templates, setTemplates] = useState(false);
  const phases = idx.phasesByProject.get(project.id) || [];
  const people = [...new Set(tasks.map((t) => t.assigneeId).filter(Boolean))].map((id) => idx.employeeById.get(id!)!).filter(Boolean);
  const filtered = tasks.filter((t) => (!assignee || String(t.assigneeId) === assignee) && (!phase || String(t.phaseId) === phase));

  return (
    <>
      <div className="toolbar">
        <select className="select-sm" value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="Leistungsphase">
          <option value="">Alle Leistungsphasen</option>
          {phases.map((p) => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
        </select>
        <select className="select-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Zuständig">
          <option value="">Alle Zuständigen</option>
          {people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn" onClick={() => setTemplates(true)}><BookOpenCheck size={16} /> Aus Vorlage …</button>
        <button className="btn btn-primary" onClick={() => setCreate({ projectId: project.id, phaseId: phase ? Number(phase) : null })}><Plus size={16} /> Aufgabe</button>
      </div>
      <KanbanBoard tasks={filtered} onOpen={setEdit} showProject={false}
        onCreate={(status) => setCreate({ projectId: project.id, status, phaseId: phase ? Number(phase) : null })} />
      {edit && <TaskForm task={edit} onClose={() => setEdit(null)} />}
      {create && <TaskForm defaults={create} onClose={() => setCreate(null)} />}
      {templates && <TemplateDialog project={project} onClose={() => setTemplates(false)} />}
    </>
  );
}

// ======================================================================= Rechnungen
function ProjectInvoices({ project }: { project: Project }) {
  const { idx } = useStore();
  const createInvoice = useCreateInvoice();
  const invoices = idx.invoicesByProject.get(project.id) || [];
  const b = billingStatus(project, idx);
  const budget = project.budget || 0;
  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Honorar" value={fmtEurCompact(budget)} sub="laut Vertrag (netto, ohne NK)" />
        <Kpi label="Leistung erbracht" value={fmtEurCompact(b.earned)} sub={`${fmtPct(b.earned / Math.max(1, budget))} nach Fertigstellungsgrad`} />
        <Kpi label="Abgerechnet" value={fmtEurCompact(b.billedPerformance)} sub={`${fmtPct(b.billedPerformance / Math.max(1, budget))} der Leistung · netto inkl. NK ${fmtEurCompact(b.billedNet)}`} />
        <Kpi label="Noch abzurechnen" value={fmtEurCompact(b.unbilled)} tone={b.unbilled > 20000 ? 'warn' : 'default'} sub="erbracht, aber nicht in Rechnung gestellt" />
        <Kpi label="Offene Posten" value={fmtEurCompact(b.openGross)} tone={b.overdue ? 'bad' : 'default'} sub={b.overdue ? `${b.overdue} Rechnung(en) überfällig` : `bezahlt ${fmtEurCompact(b.paid)}`} />
      </div>
      <Card title="Abschlagsrechnungen" subtitle="Nach § 15 HOAI auf Basis des nachgewiesenen Leistungsstands je Leistungsphase" padded={false}
        actions={<button className="btn btn-sm btn-primary" onClick={() => createInvoice(project)}><FilePlus2 size={14} /> Abschlagsrechnung erstellen</button>}>
        <InvoiceTable invoices={invoices} />
      </Card>
    </>
  );
}

// ======================================================================= Protokolle
function ProjectProtocols({ project }: { project: Project }) {
  const { data } = useStore();
  const [creating, setCreating] = useState(false);
  const protocols = data.protocols.filter((p) => p.projectId === project.id);
  return (
    <>
      <Card title="Offene Punkte" subtitle="Aufgaben (A) aus allen Protokollen dieses Projekts" padded={false}>
        <OpenPointsTable protocols={protocols} />
      </Card>
      <Card title="Besprechungsprotokolle" padded={false} actions={<button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> Neues Protokoll</button>}>
        <ProtocolTable protocols={protocols} />
      </Card>
      {creating && <NewProtocolDialog projectId={project.id} onClose={() => setCreating(false)} />}
    </>
  );
}

// ======================================================================= Ressourcen
function ProjectResources({ project }: { project: Project }) {
  const [offset, setOffset] = useState(0);
  const today = todayISO();
  const weeks = weeksBetween(addDays(today, offset * 7 - 7), 12);
  return (
    <Card padded={false} title="Personalplanung" subtitle="Geplante Wochenstunden je Teammitglied – Konflikte mit anderen Projekten werden direkt angezeigt"
      actions={
        <div className="week-nav">
          <button className="icon-btn" onClick={() => setOffset((o) => o - 4)} aria-label="Früher"><ChevronLeft size={18} /></button>
          <button className="btn btn-sm" onClick={() => setOffset(0)}>Heute</button>
          <button className="icon-btn" onClick={() => setOffset((o) => o + 4)} aria-label="Später"><ChevronRight size={18} /></button>
        </div>
      }>
      <ProjectResourceGrid projectId={project.id} weeks={weeks} />
    </Card>
  );
}

// ======================================================================= Kosten
function ProjectCosts({ project, m }: { project: Project; m: ProjectMetrics }) {
  const { data, idx, isLead } = useStore();
  const [editCost, setEditCost] = useState<CostItem | 'new' | null>(null);
  const [editPhase, setEditPhase] = useState<Phase | null>(null);
  const phases = idx.phasesByProject.get(project.id) || [];
  const costs = (idx.costsByProject.get(project.id) || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const noPhase = idx.actualByPhase.get(phaseKey(project.id, null));
  const byEmp = data.summary.byEmployee.filter((r) => r.projectId === project.id).sort((a, b) => b.hours - a.hours);
  const scaleMax = Math.max(...phases.map((ph) => Math.max(ph.budget || 0, phaseMetrics(ph, idx).eac)), 1);

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Budget (BAC)" value={fmtEurCompact(m.budget)} sub="Honorar netto" />
        <Kpi label="Ist-Kosten (AC)" value={fmtEurCompact(m.actualCost)} sub={`Personal ${fmtEurCompact(m.laborCost)} · Fremd ${fmtEurCompact(m.extCost)}`} />
        <Kpi label="Leistungswert (EV)" value={fmtEurCompact(m.earnedValue)} sub={`= Budget × Fertigstellung ${fmtPct(m.progress)}`} />
        <Kpi label="Kosteneffizienz (CPI)" value={m.cpi ? fmtNum(m.cpi, 2) : '–'} sub={m.cpi ? (m.cpi >= 1 ? 'Leistung ≥ Kosten' : 'Kosten über Leistungswert') : 'noch keine Ist-Daten'}
          tone={m.cpi === null ? 'default' : m.cpi >= 0.97 ? 'good' : m.cpi >= 0.9 ? 'warn' : 'bad'} />
        <Kpi label="Prognose (EAC)" value={fmtEurCompact(m.eac)} sub={`${m.variance >= 0 ? 'Reserve' : 'Überschreitung'} ${fmtEurCompact(Math.abs(m.variance))}`}
          tone={m.costStatus === 'bad' ? 'bad' : m.costStatus === 'warn' ? 'warn' : 'default'} />
      </div>

      <Card title="Kosten je Leistungsphase" subtitle="Ist-Kosten = gebuchte Stunden × Verrechnungssatz + angefallene Fremdkosten · Prognose nach Earned-Value-Methode" padded={false}
        actions={<BulletLegend />}>
        <div className="table-wrap">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Phase</th>
                <th className="num">Budget</th>
                <th className="num">Plan-h</th>
                <th className="num">Ist-h</th>
                <th className="num">Personal</th>
                <th className="num">Fremd</th>
                <th className="num">Ist gesamt</th>
                <th className="num">Fertig</th>
                <th className="num">Prognose</th>
                <th className="num">Abweichung</th>
                <th style={{ width: 160 }}>Budget / Ist / Prognose</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((ph) => {
                const pm = phaseMetrics(ph, idx);
                return (
                  <tr key={ph.id} className="clickable" onClick={() => setEditPhase(ph)}>
                    <td><strong>{ph.code}</strong> <span className="small">{ph.name}</span></td>
                    <td className="num">{fmtEur(pm.budget)}</td>
                    <td className="num">{fmtNum(pm.plannedHours)}</td>
                    <td className={classNames('num', pm.actualHours > pm.plannedHours && pm.plannedHours > 0 && 'text-bad')}>{fmtNum(pm.actualHours)}</td>
                    <td className="num">{fmtEur(pm.laborCost)}</td>
                    <td className="num">{fmtEur(pm.extCost)}</td>
                    <td className="num"><strong>{fmtEur(pm.actualCost)}</strong></td>
                    <td className="num">{fmtNum(ph.progress)} %</td>
                    <td className="num">{fmtEur(pm.eac)}</td>
                    <td className={classNames('num', pm.variance < 0 ? 'text-bad' : 'text-good')}>{fmtEurSigned(pm.variance)}</td>
                    <td><BulletBar budget={pm.budget} actual={pm.actualCost} forecast={pm.eac} scaleMax={scaleMax} /></td>
                  </tr>
                );
              })}
              {noPhase && (
                <tr>
                  <td className="muted">ohne Phasenzuordnung</td>
                  <td className="num">–</td><td className="num">–</td>
                  <td className="num">{fmtNum(noPhase.hours)}</td>
                  <td className="num">{fmtEur(noPhase.cost)}</td>
                  <td colSpan={6} />
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Summe</strong></td>
                <td className="num"><strong>{fmtEur(sum(phases, (p) => p.budget))}</strong></td>
                <td className="num">{fmtNum(m.plannedHours)}</td>
                <td className="num">{fmtNum(m.actualHours)}</td>
                <td className="num">{fmtEur(m.laborCost)}</td>
                <td className="num">{fmtEur(m.extCost)}</td>
                <td className="num"><strong>{fmtEur(m.actualCost)}</strong></td>
                <td className="num">{fmtPct(m.progress)}</td>
                <td className="num"><strong>{fmtEur(m.eac)}</strong></td>
                <td className={classNames('num', m.variance < 0 ? 'text-bad' : 'text-good')}><strong>{fmtEurSigned(m.variance)}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="detail-grid">
        <Card title="Fremd- und Sachkosten" subtitle={`Angefallen ${fmtEur(m.extCost)} · geplant (Obligo) ${fmtEur(m.extCostPlanned)}`} padded={false}
          actions={isLead ? <button className="btn btn-sm btn-primary" onClick={() => setEditCost('new')}><Plus size={14} /> Kosten erfassen</button> : undefined}>
          {costs.length === 0 ? <EmptyState icon={<Receipt size={20} />} title="Keine Fremdkosten erfasst" /> : (
            <table className="table table-hover">
              <thead><tr><th>Datum</th><th>Bezeichnung</th><th>Kategorie</th><th>Phase</th><th className="num">Betrag</th><th>Status</th></tr></thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setEditCost(c)}>
                    <td className="nowrap">{fmtDate(c.date)}</td>
                    <td>{c.description}</td>
                    <td className="small">{c.category}</td>
                    <td className="small">{c.phaseId ? idx.phaseById.get(c.phaseId)?.code : '–'}</td>
                    <td className="num">{fmtEur(c.amount)}</td>
                    <td><span className={classNames('badge', c.status === 'angefallen' ? 'badge-blue' : 'badge-slate')}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Stunden je Person" subtitle="Gebuchte Stunden und Personalkosten" padded={false}>
          <table className="table">
            <thead><tr><th>Person</th><th className="num">Stunden</th><th className="num">Kosten</th></tr></thead>
            <tbody>
              {byEmp.map((r) => {
                const e = idx.employeeById.get(r.employeeId!);
                return (
                  <tr key={r.employeeId}>
                    <td><span className="person-cell"><Avatar employee={e} size={22} /> {e?.name}</span></td>
                    <td className="num">{fmtHours(r.hours)}</td>
                    <td className="num">{fmtEur(r.cost)}</td>
                  </tr>
                );
              })}
              {byEmp.length === 0 && <tr><td colSpan={3} className="muted">Noch keine Zeitbuchungen</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
      {editCost && <CostForm cost={editCost === 'new' ? undefined : editCost} projectId={project.id} onClose={() => setEditCost(null)} />}
      {editPhase && <PhaseForm phase={editPhase} projectId={project.id} onClose={() => setEditPhase(null)} />}
    </>
  );
}
