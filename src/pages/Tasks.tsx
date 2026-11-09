import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Columns3, List, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Card, EmptyState, PageHeader, PriorityTag, Segmented } from '../components/ui';
import { KanbanBoard, sortTasks } from '../components/Kanban';
import { TaskForm } from '../components/forms';
import { PRIORITIES, TASK_STATUS, TASK_STATUS_LABEL, type Task, type TaskStatus } from '../types';
import { fmtDate, relDays, todayISO } from '../utils/date';
import { classNames, fmtNum } from '../utils/format';

export function Tasks() {
  const { data, idx, me, update } = useStore();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [q, setQ] = useState('');
  const [project, setProject] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [showDone, setShowDone] = useState(true);
  const [edit, setEdit] = useState<Task | null>(null);
  const [create, setCreate] = useState<Partial<Task> | null>(null);
  const mine = params.get('mine') === '1';
  const today = todayISO();

  // Deep-Link aus der Schnellsuche: /aufgaben?task=123
  useEffect(() => {
    const id = Number(params.get('task'));
    if (id) {
      const t = data.tasks.find((x) => x.id === id);
      if (t) setEdit(t);
      params.delete('task');
      setParams(params, { replace: true });
    }
  }, [params, setParams, data.tasks]);

  const setMine = (v: boolean) => {
    if (v) params.set('mine', '1');
    else params.delete('mine');
    setParams(params, { replace: true });
  };

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.tasks.filter((t) => {
      if (mine && t.assigneeId !== me?.id) return false;
      if (project && String(t.projectId) !== project) return false;
      if (assignee === 'none' ? t.assigneeId : assignee && String(t.assigneeId) !== assignee) return false;
      if (priority && t.priority !== priority) return false;
      if (onlyOverdue && !(t.status !== 'erledigt' && t.dueDate && t.dueDate < today)) return false;
      if (!showDone && t.status === 'erledigt') return false;
      const p = idx.projectById.get(t.projectId);
      if (p?.status === 'Abgeschlossen' && !project) return false;
      const hay = `${t.title} ${t.description} ${p?.number} ${p?.name}`.toLowerCase();
      return terms.every((x) => hay.includes(x));
    });
  }, [data.tasks, q, mine, me, project, assignee, priority, onlyOverdue, showDone, idx, today]);

  const openProjects = data.projects.filter((p) => p.status !== 'Abgeschlossen');
  const overdueCount = filtered.filter((t) => t.status !== 'erledigt' && t.dueDate && t.dueDate < today).length;

  return (
    <div className="page">
      <PageHeader title="Aufgaben" subtitle={`${filtered.filter((t) => t.status !== 'erledigt').length} offen · ${overdueCount} überfällig`}
        actions={<button className="btn btn-primary" onClick={() => setCreate({ assigneeId: mine ? me?.id : undefined, projectId: project ? Number(project) : undefined })}><Plus size={16} /> Neue Aufgabe</button>}>
        <div className="toolbar">
          <Segmented value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')} options={[{ value: 'mine', label: 'Meine Aufgaben' }, { value: 'all', label: 'Alle' }]} />
          <div className="search-input">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Aufgaben durchsuchen …" />
          </div>
          <select className="select-sm" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Projekt">
            <option value="">Alle Projekte</option>
            {openProjects.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
          </select>
          {!mine && (
            <select className="select-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Zuständig">
              <option value="">Alle Personen</option>
              <option value="none">– nicht zugewiesen –</option>
              {data.employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name, 'de')).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <select className="select-sm" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priorität">
            <option value="">Jede Priorität</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <label className="check-inline"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> nur überfällige</label>
          <label className="check-inline"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> erledigte zeigen</label>
          <span className="spacer" />
          <Segmented value={view} onChange={setView} options={[
            { value: 'board', label: <><Columns3 size={15} /> Board</> },
            { value: 'list', label: <><List size={15} /> Liste</> },
          ]} />
        </div>
      </PageHeader>

      {view === 'board' ? (
        <KanbanBoard tasks={filtered} onOpen={setEdit}
          onCreate={(status) => setCreate({ status, assigneeId: mine ? me?.id : undefined, projectId: project ? Number(project) : undefined })} />
      ) : (
        <Card padded={false}>
          {filtered.length === 0 ? <EmptyState title="Keine Aufgaben für diese Auswahl" /> : (
            <div className="table-wrap">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Status</th>
                    <th>Aufgabe</th>
                    <th>Projekt / Phase</th>
                    <th>Zuständig</th>
                    <th>Fällig</th>
                    <th>Priorität</th>
                    <th className="num">Std. (Ist/Plan)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filtered].sort((a, b) => (a.status === 'erledigt' ? 1 : 0) - (b.status === 'erledigt' ? 1 : 0) || (a.dueDate || '9').localeCompare(b.dueDate || '9') || sortTasks(a, b)).map((t) => {
                    const p = idx.projectById.get(t.projectId);
                    const ph = t.phaseId ? idx.phaseById.get(t.phaseId) : null;
                    const a = idx.employeeById.get(t.assigneeId || 0);
                    const overdue = t.status !== 'erledigt' && t.dueDate && t.dueDate < today;
                    return (
                      <tr key={t.id} className={classNames('clickable', t.status === 'erledigt' && 'row-done')} onClick={() => setEdit(t)}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select className={`status-select status-${t.status}`} value={t.status} onChange={(e) => update('tasks', t.id, { status: e.target.value as TaskStatus })} aria-label="Status">
                            {TASK_STATUS.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                          </select>
                        </td>
                        <td><strong>{t.title}</strong></td>
                        <td><span className="proj-cell-inline"><span className="proj-dot" style={{ background: p?.color || '#64748b' }} />{p?.number}{ph && <span className="muted"> · {ph.code}</span>}</span></td>
                        <td><span className="person-cell"><Avatar employee={a} size={22} /> {a?.name || <span className="muted">offen</span>}</span></td>
                        <td className={classNames('nowrap', overdue && 'text-bad')}>{fmtDate(t.dueDate)}{t.dueDate && t.status !== 'erledigt' && <small className="block">{relDays(t.dueDate)}</small>}</td>
                        <td><PriorityTag priority={t.priority} /></td>
                        <td className="num">{fmtNum(idx.actualByTask.get(t.id) || 0)} / {fmtNum(t.estimatedHours || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {edit && <TaskForm task={edit} onClose={() => setEdit(null)} />}
      {create && <TaskForm defaults={create} onClose={() => setCreate(null)} />}
    </div>
  );
}
