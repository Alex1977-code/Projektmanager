import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, FileText } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { Avatar, EmptyState, Field, TaskStatusBadge } from './ui';
import { PROTOCOL_TYPES, type ID, type Participant, type Protocol, type Task } from '../types';
import { fmtDate, relDays, todayISO } from '../utils/date';
import { classNames } from '../utils/format';
import { initialItems, isItemOpen, openPoints, type OpenPoint } from '../utils/protocols';

export function useTasksById() {
  const { data } = useStore();
  return useMemo(() => new Map<ID, Task>(data.tasks.map((t) => [t.id, t])), [data.tasks]);
}

export function ProtocolStatusBadge({ status }: { status: Protocol['status'] }) {
  return <span className={classNames('badge', status === 'versendet' ? 'badge-green' : 'badge-amber')}>{status === 'versendet' ? 'Versendet' : 'Entwurf'}</span>;
}

// ------------------------------------------------------------------ Protokollliste
export function ProtocolTable({ protocols, showProject }: { protocols: Protocol[]; showProject?: boolean }) {
  const { idx } = useStore();
  const navigate = useNavigate();
  const tasksById = useTasksById();
  const sorted = [...protocols].sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
  if (!sorted.length) return <EmptyState icon={<FileText size={22} />} title="Noch keine Protokolle" text="Legen Sie das erste Besprechungsprotokoll an." />;
  return (
    <div className="table-wrap">
      <table className="table table-hover">
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Datum</th>
            <th>Besprechung</th>
            {showProject && <th>Projekt</th>}
            <th className="num">Punkte</th>
            <th className="num">Offen</th>
            <th>Verfasser</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const project = idx.projectById.get(p.projectId);
            const open = p.items.filter((it) => isItemOpen(it, tasksById)).length;
            return (
              <tr key={p.id} className="clickable" onClick={() => navigate(`/protokolle/${p.id}`)}>
                <td className="mono"><strong>{p.number}</strong></td>
                <td className="nowrap">{fmtDate(p.date)}{p.time && <small>{p.time} Uhr</small>}</td>
                <td><strong>{p.title || p.type}</strong><small>{p.type}{p.location ? ` · ${p.location}` : ''}</small></td>
                {showProject && <td><span className="proj-cell-inline"><span className="proj-dot" style={{ background: project?.color || '#64748b' }} />{project?.number}</span></td>}
                <td className="num">{p.items.filter((it) => it.kind !== 'top').length}</td>
                <td className={classNames('num', open > 0 && 'text-warn')}>{open}</td>
                <td><Avatar employee={idx.employeeById.get(p.authorId || 0)} size={24} /></td>
                <td><ProtocolStatusBadge status={p.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ Offene Punkte
export function OpenPointsTable({ protocols, showProject, onlyEmployee }: { protocols: Protocol[]; showProject?: boolean; onlyEmployee?: ID | null }) {
  const { idx, update } = useStore();
  const navigate = useNavigate();
  const tasksById = useTasksById();
  const today = todayISO();
  let points = openPoints(protocols, tasksById);
  if (onlyEmployee) points = points.filter((p) => p.item.assigneeId === onlyEmployee);

  const markDone = async (op: OpenPoint) => {
    const t = op.item.taskId ? tasksById.get(op.item.taskId) : undefined;
    if (t) {
      await update('tasks', t.id, { status: 'erledigt' });
    } else {
      const items = op.protocol.items.map((it) => (it.id === op.item.id ? { ...it, done: true } : it));
      await update('protocols', op.protocol.id, { items });
    }
  };

  if (!points.length) return <EmptyState icon={<Check size={22} />} title="Keine offenen Punkte" text="Alle Aufgaben aus den Protokollen sind erledigt." />;
  return (
    <div className="table-wrap">
      <table className="table table-hover">
        <thead>
          <tr>
            <th style={{ width: 36 }} />
            <th>Punkt</th>
            {showProject && <th>Projekt</th>}
            <th>Protokoll</th>
            <th>Verantwortlich</th>
            <th>Termin</th>
            <th>Aufgabe</th>
          </tr>
        </thead>
        <tbody>
          {points.map((op) => {
            const project = idx.projectById.get(op.protocol.projectId);
            const emp = op.item.assigneeId ? idx.employeeById.get(op.item.assigneeId) : null;
            const task = op.item.taskId ? tasksById.get(op.item.taskId) : null;
            const overdue = op.item.dueDate && op.item.dueDate < today;
            return (
              <tr key={`${op.protocol.id}-${op.item.id}`} className="clickable" onClick={() => navigate(`/protokolle/${op.protocol.id}#${op.item.id}`)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="check" title="Als erledigt markieren" aria-label="Als erledigt markieren" onClick={() => markDone(op)}><Check size={13} /></button>
                </td>
                <td className="op-text"><span className="op-num">{op.label}</span> {op.item.text}</td>
                {showProject && <td><span className="proj-cell-inline"><span className="proj-dot" style={{ background: project?.color || '#64748b' }} />{project?.number}</span></td>}
                <td className="nowrap small">Nr. {op.protocol.number} · {fmtDate(op.protocol.date)}</td>
                <td>{emp ? <span className="person-cell"><Avatar employee={emp} size={22} /> {emp.name}</span> : <span className="ext-resp">{op.item.responsible || '–'}</span>}</td>
                <td className={classNames('nowrap', overdue && 'text-bad')}>{fmtDate(op.item.dueDate)}{op.item.dueDate && <small>{relDays(op.item.dueDate)}</small>}</td>
                <td>{task ? <TaskStatusBadge status={task.status} /> : <span className="muted small">–</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ Neues Protokoll
export function NewProtocolDialog({ projectId, onClose }: { projectId?: ID; onClose: () => void }) {
  const { data, idx, me, create } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const tasksById = useTasksById();
  const openProjects = data.projects.filter((p) => p.status !== 'Abgeschlossen');
  const [pid, setPid] = useState<string>(String(projectId ?? openProjects.find((p) => p.leadId === me?.id)?.id ?? openProjects[0]?.id ?? ''));
  const [type, setType] = useState<string>('Planungsbesprechung');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [carry, setCarry] = useState(true);
  const [carryPeople, setCarryPeople] = useState(true);

  const previous = useMemo(() => data.protocols.filter((p) => p.projectId === Number(pid)).sort((a, b) => b.number - a.number)[0] || null, [data.protocols, pid]);
  const prevOpen = previous ? previous.items.filter((it) => isItemOpen(it, tasksById)).length : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pid) return toast.error('Bitte ein Projekt wählen');
    const project = idx.projectById.get(Number(pid));
    let participants: Participant[] = [];
    if (previous && carryPeople) participants = previous.participants.map((p) => ({ ...p, present: true }));
    else {
      if (me) participants.push({ employeeId: me.id, present: true });
      if (project?.leadId && project.leadId !== me?.id) participants.push({ employeeId: project.leadId, present: true });
    }
    try {
      const row = await create('protocols', {
        projectId: Number(pid), type, title: title || type, date, time, location: location || previous?.location || '',
        status: 'entwurf', authorId: me?.id ?? null, participants,
        items: initialItems(type, previous, carry, tasksById), nextDate: null,
      });
      toast.success(`Protokoll Nr. ${row.number} angelegt`);
      onClose();
      navigate(`/protokolle/${row.id}`);
    } catch {
      /* gemeldet */
    }
  };

  return (
    <Modal title="Neues Protokoll" subtitle="Tagesordnung wird passend zur Besprechungsart vorbereitet" onClose={onClose} width={640}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" type="submit" form="protocol-form">Protokoll anlegen</button></>}>
      <form id="protocol-form" className="form-grid" onSubmit={submit}>
        {!projectId && (
          <Field label="Projekt *" span={2}>
            <select value={pid} onChange={(e) => setPid(e.target.value)}>
              {openProjects.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Besprechungsart">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {PROTOCOL_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Titel"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type} /></Field>
        <Field label="Datum"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Uhrzeit"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Ort" span={2}><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={previous?.location || 'z. B. Baustelle, Baucontainer / Videokonferenz'} /></Field>
        {previous && (
          <div className="field field-span2 carry-box">
            <label className="check-inline"><input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} disabled={!prevOpen} />
              {prevOpen ? <>{prevOpen} offene Punkte aus Protokoll Nr. {previous.number} ({fmtDate(previous.date)}) übernehmen</> : <>Protokoll Nr. {previous.number} hat keine offenen Punkte</>}
            </label>
            <label className="check-inline"><input type="checkbox" checked={carryPeople} onChange={(e) => setCarryPeople(e.target.checked)} />
              Teilnehmerkreis aus Protokoll Nr. {previous.number} übernehmen ({previous.participants.length} Personen)
            </label>
          </div>
        )}
      </form>
    </Modal>
  );
}
