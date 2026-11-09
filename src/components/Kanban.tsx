import { useState, type DragEvent } from 'react';
import { CalendarClock, Clock, Plus } from 'lucide-react';
import { useStore } from '../store';
import { TASK_STATUS, TASK_STATUS_LABEL, type Task, type TaskStatus } from '../types';
import { Avatar, PriorityTag } from './ui';
import { addDays, fmtDateShort, relDays, todayISO } from '../utils/date';
import { classNames, fmtNum } from '../utils/format';
import { useToast } from './Toast';

const PRIO_ORDER = { hoch: 0, mittel: 1, niedrig: 2 } as const;

export function sortTasks(a: Task, b: Task) {
  return (a.sort ?? 0) - (b.sort ?? 0) || PRIO_ORDER[a.priority || 'mittel'] - PRIO_ORDER[b.priority || 'mittel'] || (a.dueDate || '9').localeCompare(b.dueDate || '9');
}

const COLUMN_HINT: Record<TaskStatus, string> = {
  offen: 'Noch nicht begonnen',
  in_arbeit: 'Wird bearbeitet',
  pruefung: '4-Augen-Prinzip / Freigabe',
  erledigt: 'Abgeschlossen',
};

export function KanbanBoard({ tasks, onOpen, onCreate, showProject = true }: { tasks: Task[]; onOpen: (t: Task) => void; onCreate?: (status: TaskStatus) => void; showProject?: boolean }) {
  const { idx, update } = useStore();
  const toast = useToast();
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; index: number } | null>(null);
  const today = todayISO();

  const columns = TASK_STATUS.map((s) => ({ status: s, items: tasks.filter((t) => t.status === s).sort(sortTasks) }));

  const onDrop = async (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const id = dragId ?? Number(e.dataTransfer.getData('text/plain'));
    setDragId(null);
    const target = over;
    setOver(null);
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const col = columns.find((c) => c.status === status)!.items.filter((t) => t.id !== id);
    const index = target && target.status === status ? Math.min(target.index, col.length) : col.length;
    const prev = col[index - 1]?.sort ?? (col[0]?.sort ?? 0) - 1;
    const next = col[index]?.sort ?? prev + 2;
    const sort = index === 0 ? (col[0]?.sort ?? 1) - 1 : index >= col.length ? (col[col.length - 1]?.sort ?? 0) + 1 : (prev + next) / 2;
    if (task.status === status && task.sort === sort) return;
    await update('tasks', id, { status, sort });
    if (task.status !== status) toast.success(`„${task.title}“ → ${TASK_STATUS_LABEL[status]}`);
  };

  return (
    <div className="kanban">
      {columns.map((col) => (
        <div
          key={col.status}
          className={classNames('kanban-col', `kanban-${col.status}`, over?.status === col.status && 'drag-over')}
          onDragOver={(e) => {
            e.preventDefault();
            if (!over || over.status !== col.status) setOver({ status: col.status, index: col.items.length });
          }}
          onDragLeave={(e) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
          }}
          onDrop={(e) => onDrop(e, col.status)}
        >
          <header className="kanban-col-head">
            <div>
              <span className="kanban-dot" />
              <strong>{TASK_STATUS_LABEL[col.status]}</strong>
              <span className="count">{col.items.length}</span>
            </div>
            {onCreate && (
              <button className="icon-btn" title="Aufgabe hinzufügen" onClick={() => onCreate(col.status)}><Plus size={16} /></button>
            )}
          </header>
          <p className="kanban-hint">{COLUMN_HINT[col.status]}</p>
          <div className="kanban-list">
            {col.items.map((t, i) => {
              const project = idx.projectById.get(t.projectId);
              const phase = t.phaseId ? idx.phaseById.get(t.phaseId) : null;
              const assignee = t.assigneeId ? idx.employeeById.get(t.assigneeId) : null;
              const overdue = t.status !== 'erledigt' && t.dueDate && t.dueDate < today;
              const dueSoon = !overdue && t.status !== 'erledigt' && t.dueDate && t.dueDate <= addDays(today, 3);
              const booked = idx.actualByTask.get(t.id);
              return (
                <div key={t.id}>
                  {over?.status === col.status && over.index === i && dragId !== t.id && <div className="kanban-drop-indicator" />}
                  <article
                    className={classNames('task-card', dragId === t.id && 'dragging', overdue && 'overdue')}
                    draggable
                    onDragStart={(e) => {
                      setDragId(t.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(t.id));
                    }}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const index = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
                      if (!over || over.status !== col.status || over.index !== index) setOver({ status: col.status, index });
                    }}
                    onClick={() => onOpen(t)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onOpen(t)}
                  >
                    {showProject && project && (
                      <div className="task-card-project">
                        <span className="proj-dot" style={{ background: project.color || '#64748b' }} />
                        <span>{project.number}</span>
                        {phase && <span className="muted">· {phase.code}</span>}
                      </div>
                    )}
                    {!showProject && phase && <div className="task-card-project muted">{phase.code} {phase.name}</div>}
                    <div className="task-card-title">{t.title}</div>
                    <div className="task-card-foot">
                      <PriorityTag priority={t.priority} />
                      {t.dueDate && (
                        <span className={classNames('due', overdue && 'due-overdue', dueSoon && 'due-soon')} title={relDays(t.dueDate)}>
                          <CalendarClock size={13} /> {fmtDateShort(t.dueDate)}
                        </span>
                      )}
                      {(t.estimatedHours || booked) ? (
                        <span className="hours" title={booked ? 'gebucht / geschätzt' : 'geschätzter Aufwand'}>
                          <Clock size={13} /> {booked ? `${fmtNum(booked)}/${fmtNum(t.estimatedHours || 0)}` : fmtNum(t.estimatedHours || 0)} h
                        </span>
                      ) : null}
                      <span className="spacer" />
                      <Avatar employee={assignee} size={24} />
                    </div>
                  </article>
                </div>
              );
            })}
            {over?.status === col.status && over.index >= col.items.length && <div className="kanban-drop-indicator" />}
            {col.items.length === 0 && <div className="kanban-empty">Aufgaben hierher ziehen</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

