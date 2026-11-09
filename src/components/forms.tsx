import { useMemo, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from './Toast';
import { Modal, useConfirm } from './Modal';
import { Field } from './ui';
import {
  COST_CATEGORIES, PRIORITIES, PROJECT_STATUS, PROJECT_TYPES, TASK_STATUS, TASK_STATUS_LABEL,
  ROLE_LABEL, type CostItem, type Employee, type ID, type Milestone, type Phase, type Project, type Role, type Task,
} from '../types';
import { addDays, addMonths, todayISO } from '../utils/date';
import { HOAI_PHASES, planPhases } from '../utils/hoai';
import { planTemplate, TEMPLATE_SETS } from '../utils/taskTemplates';
import { fmtEur, fmtHours } from '../utils/format';

const num = (v: string) => (v === '' ? null : Number(v.replace(',', '.')));
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function useForm<T extends object>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = <K extends keyof T>(k: K, v: T[K]) => setValues((s) => ({ ...s, [k]: v }));
  return { values, set, setValues };
}

function FormFooter({ onClose, onDelete, saving, submitLabel }: { onClose: () => void; onDelete?: () => void; saving?: boolean; submitLabel: string }) {
  return (
    <>
      {onDelete && (
        <button type="button" className="btn btn-ghost-danger mr-auto" onClick={onDelete}>
          <Trash2 size={16} /> Löschen
        </button>
      )}
      <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
      <button type="submit" form="entity-form" className="btn btn-primary" disabled={saving}>{submitLabel}</button>
    </>
  );
}

function activeEmployees(list: Employee[], keepId?: ID | null) {
  return list.filter((e) => e.active || e.id === keepId).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// ===================================================================== Projekt
export function ProjectForm({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved?: (p: Project) => void }) {
  const { data, create, createTasks, update, remove } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = !project;
  const today = todayISO();
  const [withTasks, setWithTasks] = useState(true);
  const nextNumber = useMemo(() => {
    const y = today.slice(0, 4);
    const nums = data.projects.map((p) => p.number || '').filter((n) => n.startsWith(`P-${y}-`)).map((n) => Number(n.slice(7)) || 0);
    return `P-${y}-${String((Math.max(0, ...nums) + 1)).padStart(3, '0')}`;
  }, [data.projects, today]);

  const { values: v, set } = useForm({
    number: project?.number ?? nextNumber,
    name: project?.name ?? '',
    client: project?.client ?? '',
    type: project?.type ?? 'Schleuse',
    location: project?.location ?? '',
    leadId: str(project?.leadId),
    status: project?.status ?? 'Beauftragt',
    priority: project?.priority ?? 'mittel',
    startDate: project?.startDate ?? today,
    endDate: project?.endDate ?? addMonths(today, 12),
    budget: str(project?.budget),
    description: project?.description ?? '',
  });
  const [lph, setLph] = useState<number[]>([1, 2, 3, 4]);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return toast.error('Bitte eine Projektbezeichnung angeben');
    if (v.endDate < v.startDate) return toast.error('Das Projektende liegt vor dem Projektstart');
    setSaving(true);
    const payload: Partial<Project> = {
      ...v, status: v.status as Project['status'], priority: v.priority as Project['priority'],
      leadId: v.leadId ? Number(v.leadId) : null, budget: num(v.budget),
    };
    try {
      if (isNew) {
        const colors = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#ea580c', '#db2777', '#4f46e5', '#0d9488'];
        const created = await create('projects', { ...payload, color: colors[data.projects.length % colors.length] });
        const createdPhases: Phase[] = [];
        for (const ph of planPhases(lph, v.startDate, v.endDate, payload.budget || 0)) {
          createdPhases.push(await create('phases', { ...ph, projectId: created.id }));
        }
        if (withTasks && createdPhases.length) {
          // Grundleistungen als Aufgaben – PL-Aufgaben an die Projektleitung, übrige zunächst offen
          const planned = planTemplate({
            set: TEMPLATE_SETS[0], project: created, phases: createdPhases, existingTasks: [], employees: data.employees, teamIds: new Set(),
          }).filter((t) => t.template.kind === 'G');
          await createTasks(planned.map((t, i) => ({
            projectId: created.id, phaseId: t.phaseId, title: t.title, status: 'offen', priority: t.template.prio || 'mittel',
            assigneeId: t.template.role === 'pl' ? created.leadId : null, estimatedHours: t.template.hours,
            startDate: t.startDate, dueDate: t.dueDate, description: 'Vorlage: HOAI-Leistungsphasen', sort: i,
          })));
        }
        await create('milestones', { projectId: created.id, name: 'Auftragserteilung', date: v.startDate, done: v.startDate <= today });
        toast.success(`Projekt ${created.number} angelegt`);
        onSaved?.(created);
      } else {
        const saved = await update('projects', project.id, payload);
        if (saved) {
          toast.success('Projekt gespeichert');
          onSaved?.(saved);
        }
      }
      onClose();
    } catch {
      /* Fehler bereits gemeldet */
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!project) return;
    const ok = await confirm({
      title: 'Projekt löschen?',
      message: <>Das Projekt <strong>{project.name}</strong> wird mit allen Phasen, Aufgaben, Planungen, Zeitbuchungen und Kosten endgültig gelöscht.</>,
      confirmLabel: 'Endgültig löschen', danger: true,
    });
    if (ok && (await remove('projects', project.id))) {
      toast.success('Projekt gelöscht');
      onClose();
    }
  };

  return (
    <Modal title={isNew ? 'Neues Projekt' : 'Projekt bearbeiten'} subtitle={isNew ? 'Stammdaten erfassen – Leistungsphasen werden automatisch angelegt' : project.number} onClose={onClose} width={760}
      footer={<FormFooter onClose={onClose} onDelete={isNew ? undefined : del} saving={saving} submitLabel={isNew ? 'Projekt anlegen' : 'Speichern'} />}>
      <form id="entity-form" className="form-grid" onSubmit={submit}>
        <Field label="Projektnummer"><input value={v.number} onChange={(e) => set('number', e.target.value)} /></Field>
        <Field label="Bauwerkstyp">
          <select value={v.type} onChange={(e) => set('type', e.target.value)}>
            {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Projektbezeichnung *" span={2}><input value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="z. B. Schleuse Musterstadt – Ersatz Stemmtore" required /></Field>
        <Field label="Auftraggeber"><input value={v.client} onChange={(e) => set('client', e.target.value)} /></Field>
        <Field label="Standort"><input value={v.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Projektleitung">
          <select value={v.leadId} onChange={(e) => set('leadId', e.target.value)}>
            <option value="">– nicht festgelegt –</option>
            {activeEmployees(data.employees, project?.leadId).map((e) => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={v.status} onChange={(e) => set('status', e.target.value as Project['status'])}>
            {PROJECT_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Projektstart"><input type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} required /></Field>
        <Field label="Projektende"><input type="date" value={v.endDate} onChange={(e) => set('endDate', e.target.value)} required /></Field>
        <Field label="Honorar / Budget (netto, €)"><input inputMode="decimal" value={v.budget} onChange={(e) => set('budget', e.target.value)} placeholder="0" /></Field>
        <Field label="Priorität">
          <select value={v.priority} onChange={(e) => set('priority', e.target.value as Project['priority'] & string)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Beschreibung / Leistungsumfang" span={2}><textarea rows={3} value={v.description} onChange={(e) => set('description', e.target.value)} /></Field>
        {isNew && (
          <div className="field field-span2">
            <span className="field-label">Leistungsphasen nach HOAI anlegen</span>
            <div className="chip-select">
              {HOAI_PHASES.map((h, i) => (
                <button type="button" key={h.code} className={lph.includes(i) ? 'chip active' : 'chip'}
                  onClick={() => setLph((l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i]))}
                  title={`${h.name} – ${h.share} %`}>
                  {h.code} <span className="chip-sub">{h.name}</span>
                </button>
              ))}
            </div>
            <span className="field-hint">Termine und Budget werden anteilig (HOAI-Bewertung) verteilt und können anschließend im Terminplan angepasst werden.</span>
            <label className="check-inline" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={withTasks} onChange={(e) => setWithTasks(e.target.checked)} />
              Grundleistungen je Leistungsphase als Aufgaben anlegen (fachlich angepasst an den Bauwerkstyp)
            </label>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ===================================================================== Aufgabe
export function TaskForm({ task, defaults, onClose }: { task?: Task; defaults?: Partial<Task>; onClose: () => void }) {
  const { data, idx, create, update, remove } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = !task;
  const base = { ...defaults, ...task };
  const firstProject = data.projects.find((p) => p.status === 'In Bearbeitung');
  const { values: v, set } = useForm({
    title: base.title ?? '',
    description: base.description ?? '',
    projectId: str(base.projectId ?? firstProject?.id),
    phaseId: str(base.phaseId),
    assigneeId: str(base.assigneeId),
    status: (base.status ?? 'offen') as Task['status'],
    priority: (base.priority ?? 'mittel') as NonNullable<Task['priority']>,
    estimatedHours: str(base.estimatedHours),
    startDate: base.startDate ?? '',
    dueDate: base.dueDate ?? addDays(todayISO(), 14),
  });
  const phases = idx.phasesByProject.get(Number(v.projectId)) || [];
  const booked = task ? idx.actualByTask.get(task.id) : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.title.trim()) return toast.error('Bitte einen Titel angeben');
    if (!v.projectId) return toast.error('Bitte ein Projekt wählen');
    if (v.startDate && v.dueDate && v.dueDate < v.startDate) return toast.error('Fälligkeit liegt vor dem Beginn');
    const payload: Partial<Task> = {
      ...v, projectId: Number(v.projectId), phaseId: v.phaseId ? Number(v.phaseId) : null,
      assigneeId: v.assigneeId ? Number(v.assigneeId) : null, estimatedHours: num(v.estimatedHours),
      startDate: v.startDate || null, dueDate: v.dueDate || null,
    };
    try {
      if (isNew) {
        await create('tasks', { ...payload, sort: Date.now() / 1e10 });
        toast.success('Aufgabe angelegt');
      } else {
        await update('tasks', task.id, payload);
        toast.success('Aufgabe gespeichert');
      }
      onClose();
    } catch {
      /* gemeldet */
    }
  };

  const del = async () => {
    if (!task) return;
    if (await confirm({ title: 'Aufgabe löschen?', message: <>„{task.title}“ wird gelöscht. Gebuchte Stunden bleiben im Projekt erhalten.</>, confirmLabel: 'Löschen', danger: true })) {
      if (await remove('tasks', task.id)) {
        toast.success('Aufgabe gelöscht');
        onClose();
      }
    }
  };

  return (
    <Modal title={isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten'} subtitle={booked ? `Bisher gebucht: ${fmtHours(booked)}` : undefined} onClose={onClose} width={680}
      footer={<FormFooter onClose={onClose} onDelete={isNew ? undefined : del} submitLabel={isNew ? 'Aufgabe anlegen' : 'Speichern'} />}>
      <form id="entity-form" className="form-grid" onSubmit={submit}>
        <Field label="Titel *" span={2}><input value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Ermüdungsnachweis Torriegel" required /></Field>
        <Field label="Projekt *">
          <select value={v.projectId} onChange={(e) => { set('projectId', e.target.value); set('phaseId', ''); }}>
            <option value="">– wählen –</option>
            {data.projects.filter((p) => p.status !== 'Abgeschlossen' || p.id === base.projectId).map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
          </select>
        </Field>
        <Field label="Leistungsphase">
          <select value={v.phaseId} onChange={(e) => set('phaseId', e.target.value)}>
            <option value="">– ohne –</option>
            {phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.code} {ph.name}</option>)}
          </select>
        </Field>
        <Field label="Zuständig">
          <select value={v.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
            <option value="">– nicht zugewiesen –</option>
            {activeEmployees(data.employees, base.assigneeId).map((e) => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={v.status} onChange={(e) => set('status', e.target.value as Task['status'])}>
            {TASK_STATUS.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Beginn"><input type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Fällig am"><input type="date" value={v.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
        <Field label="Aufwand (Std.)"><input inputMode="decimal" value={v.estimatedHours} onChange={(e) => set('estimatedHours', e.target.value)} /></Field>
        <Field label="Priorität">
          <select value={v.priority} onChange={(e) => set('priority', e.target.value as NonNullable<Task['priority']>)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Beschreibung" span={2}><textarea rows={4} value={v.description} onChange={(e) => set('description', e.target.value)} placeholder="Leistungsbeschreibung, Normen, Randbedingungen …" /></Field>
      </form>
    </Modal>
  );
}

// ===================================================================== Leistungsphase
export function PhaseForm({ phase, projectId, onClose }: { phase?: Phase; projectId: ID; onClose: () => void }) {
  const { idx, create, update, remove } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = !phase;
  const project = idx.projectById.get(projectId);
  const existing = idx.phasesByProject.get(projectId) || [];
  const last = existing[existing.length - 1];
  const { values: v, set } = useForm({
    code: phase?.code ?? '',
    name: phase?.name ?? '',
    startDate: phase?.startDate ?? last?.endDate ?? project?.startDate ?? todayISO(),
    endDate: phase?.endDate ?? addDays(last?.endDate ?? todayISO(), 60),
    budget: str(phase?.budget),
    plannedHours: str(phase?.plannedHours),
    progress: phase?.progress ?? 0,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (v.endDate < v.startDate) return toast.error('Ende liegt vor dem Beginn');
    const payload: Partial<Phase> = { ...v, budget: num(v.budget), plannedHours: num(v.plannedHours), progress: Number(v.progress) };
    try {
      if (isNew) await create('phases', { ...payload, projectId, sort: existing.length });
      else await update('phases', phase.id, payload);
      toast.success('Leistungsphase gespeichert');
      onClose();
    } catch {
      /* gemeldet */
    }
  };
  const del = async () => {
    if (!phase) return;
    if (await confirm({ title: 'Leistungsphase löschen?', message: <>„{phase.code} {phase.name}“ wird gelöscht. Zugeordnete Aufgaben und Buchungen bleiben ohne Phase erhalten.</>, confirmLabel: 'Löschen', danger: true })) {
      if (await remove('phases', phase.id)) onClose();
    }
  };

  return (
    <Modal title={isNew ? 'Leistungsphase hinzufügen' : 'Leistungsphase bearbeiten'} subtitle={project?.name} onClose={onClose}
      footer={<FormFooter onClose={onClose} onDelete={isNew ? undefined : del} submitLabel="Speichern" />}>
      <form id="entity-form" className="form-grid" onSubmit={submit}>
        {isNew && (
          <Field label="Vorlage (HOAI)" span={2}>
            <select value="" onChange={(e) => { const h = HOAI_PHASES[Number(e.target.value)]; if (h) { set('code', h.code); set('name', h.name); } }}>
              <option value="">– Leistungsphase wählen oder frei eingeben –</option>
              {HOAI_PHASES.map((h, i) => <option key={h.code} value={i}>{h.code} {h.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Kürzel"><input value={v.code} onChange={(e) => set('code', e.target.value)} placeholder="LPH 5" /></Field>
        <Field label="Bezeichnung *"><input value={v.name} onChange={(e) => set('name', e.target.value)} required /></Field>
        <Field label="Beginn"><input type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} required /></Field>
        <Field label="Ende"><input type="date" value={v.endDate} onChange={(e) => set('endDate', e.target.value)} required /></Field>
        <Field label="Budget (€)"><input inputMode="decimal" value={v.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
        <Field label="Plan-Stunden"><input inputMode="decimal" value={v.plannedHours} onChange={(e) => set('plannedHours', e.target.value)} /></Field>
        <Field label={`Fertigstellungsgrad: ${v.progress} %`} span={2} hint="Einschätzung der Projektleitung – Basis für Earned Value und Prognose">
          <input type="range" min={0} max={100} step={5} value={v.progress} onChange={(e) => set('progress', Number(e.target.value))} />
        </Field>
      </form>
    </Modal>
  );
}

// ===================================================================== Meilenstein
export function MilestoneForm({ milestone, projectId, onClose }: { milestone?: Milestone; projectId: ID; onClose: () => void }) {
  const { create, update, remove } = useStore();
  const toast = useToast();
  const isNew = !milestone;
  const { values: v, set } = useForm({ name: milestone?.name ?? '', date: milestone?.date ?? addDays(todayISO(), 30), done: milestone?.done ?? false });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (isNew) await create('milestones', { ...v, projectId });
      else await update('milestones', milestone.id, v);
      toast.success('Meilenstein gespeichert');
      onClose();
    } catch {
      /* gemeldet */
    }
  };
  return (
    <Modal title={isNew ? 'Meilenstein hinzufügen' : 'Meilenstein bearbeiten'} onClose={onClose} width={480}
      footer={<FormFooter onClose={onClose} onDelete={isNew ? undefined : async () => { if (await remove('milestones', milestone.id)) onClose(); }} submitLabel="Speichern" />}>
      <form id="entity-form" className="form-grid" onSubmit={submit}>
        <Field label="Bezeichnung *" span={2}><input value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="z. B. Abgabe Entwurfsplanung" required /></Field>
        <Field label="Termin"><input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} required /></Field>
        <label className="check-field"><input type="checkbox" checked={v.done} onChange={(e) => set('done', e.target.checked)} /> Erreicht</label>
      </form>
    </Modal>
  );
}

// ===================================================================== Mitarbeiter
export const DEPARTMENTS = ['Geschäftsführung', 'Stahlwasserbau', 'Bewegliche Brücken', 'Maschinen- & E-Technik', 'Konstruktion & CAD', 'Bauüberwachung', 'Projektsteuerung'];
const AVATAR_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#059669', '#4f46e5', '#0d9488', '#b45309', '#be123c'];

export function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const { data, create, update, remove } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = !employee;
  const { values: v, set } = useForm({
    name: employee?.name ?? '', short: employee?.short ?? '', title: employee?.title ?? '', role: employee?.role ?? '',
    department: employee?.department ?? DEPARTMENTS[1], email: employee?.email ?? '', phone: employee?.phone ?? '',
    hourlyRate: str(employee?.hourlyRate ?? 95), weeklyHours: str(employee?.weeklyHours ?? 40),
    skills: (employee?.skills || []).join(', '), color: employee?.color ?? AVATAR_COLORS[data.employees.length % AVATAR_COLORS.length],
    active: employee?.active ?? true,
    login: employee?.login ?? '', appRole: (employee?.appRole ?? 'mitarbeiter') as Role, vacationDays: str(employee?.vacationDays ?? 30),
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const short = v.short || v.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 3).toUpperCase();
    const payload: Partial<Employee> = {
      ...v, short, hourlyRate: num(v.hourlyRate), weeklyHours: num(v.weeklyHours), vacationDays: num(v.vacationDays), login: v.login.trim().toLowerCase() || null,
      skills: v.skills.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (isNew) await create('employees', payload);
      else await update('employees', employee.id, payload);
      toast.success('Mitarbeiterdaten gespeichert');
      onClose();
    } catch {
      /* gemeldet */
    }
  };
  const del = async () => {
    if (!employee) return;
    if (await confirm({ title: 'Mitarbeiter löschen?', message: <>{employee.name} wird gelöscht. Bei vorhandenen Zeitbuchungen ist nur eine Deaktivierung möglich.</>, confirmLabel: 'Löschen', danger: true })) {
      if (await remove('employees', employee.id)) onClose();
    }
  };
  return (
    <Modal title={isNew ? 'Mitarbeiter anlegen' : 'Mitarbeiter bearbeiten'} onClose={onClose} width={680}
      footer={<FormFooter onClose={onClose} onDelete={isNew ? undefined : del} submitLabel="Speichern" />}>
      <form id="entity-form" className="form-grid" onSubmit={submit}>
        <Field label="Name *"><input value={v.name} onChange={(e) => set('name', e.target.value)} required /></Field>
        <Field label="Titel"><input value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Dipl.-Ing., M.Sc. …" /></Field>
        <Field label="Funktion / Rolle"><input value={v.role} onChange={(e) => set('role', e.target.value)} placeholder="Tragwerksplaner" /></Field>
        <Field label="Abteilung">
          <select value={v.department} onChange={(e) => set('department', e.target.value)}>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="E-Mail"><input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Telefon"><input value={v.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Verrechnungssatz (€/h)"><input inputMode="decimal" value={v.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} /></Field>
        <Field label="Wochenarbeitszeit (h)"><input inputMode="decimal" value={v.weeklyHours} onChange={(e) => set('weeklyHours', e.target.value)} /></Field>
        <Field label="Kürzel"><input value={v.short} maxLength={3} onChange={(e) => set('short', e.target.value.toUpperCase())} placeholder="automatisch" /></Field>
        <Field label="Farbe">
          <div className="color-row">
            {AVATAR_COLORS.map((c) => (
              <button type="button" key={c} className={v.color === c ? 'swatch active' : 'swatch'} style={{ background: c }} onClick={() => set('color', c)} aria-label={`Farbe ${c}`} />
            ))}
          </div>
        </Field>
        <Field label="Qualifikationen (kommagetrennt)" span={2}><input value={v.skills} onChange={(e) => set('skills', e.target.value)} placeholder="FEM, DIN 19704, Tekla …" /></Field>
        <Field label="Urlaubsanspruch (Tage/Jahr)"><input inputMode="decimal" value={v.vacationDays} onChange={(e) => set('vacationDays', e.target.value)} /></Field>
        <label className="check-field"><input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} /> Aktiv (in Planung verfügbar)</label>
        <div className="field-span2 form-section">Anmeldung</div>
        <Field label="Windows-Anmeldename" hint="sAMAccountName im Active Directory, z. B. s.hartmann"><input value={v.login} onChange={(e) => set('login', e.target.value)} placeholder="vorname.nachname" autoComplete="off" /></Field>
        <Field label="Berechtigung" hint="Wird überschrieben, wenn AD-Gruppen konfiguriert sind">
          <select value={v.appRole} onChange={(e) => set('appRole', e.target.value as Role)}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

// ===================================================================== Fremdkosten
export function CostForm({ cost, projectId, onClose }: { cost?: CostItem; projectId: ID; onClose: () => void }) {
  const { idx, create, update, remove } = useStore();
  const toast = useToast();
  const isNew = !cost;
  const phases = idx.phasesByProject.get(projectId) || [];
  const { values: v, set } = useForm({
    date: cost?.date ?? todayISO(), category: cost?.category ?? COST_CATEGORIES[0], description: cost?.description ?? '',
    amount: str(cost?.amount), status: cost?.status ?? 'angefallen', phaseId: str(cost?.phaseId),
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = num(v.amount);
    if (!amount) return toast.error('Bitte einen Betrag angeben');
    const payload: Partial<CostItem> = { ...v, amount, phaseId: v.phaseId ? Number(v.phaseId) : null, status: v.status as CostItem['status'] };
    try {
      if (isNew) await create('costs', { ...payload, projectId });
      else await update('costs', cost.id, payload);
      toast.success(`Kostenposition gespeichert (${fmtEur(amount)})`);
      onClose();
    } catch {
      /* gemeldet */
    }
  };
  return (
    <Modal title={isNew ? 'Kostenposition erfassen' : 'Kostenposition bearbeiten'} subtitle="Fremd- und Sachkosten (Nachunternehmer, Prüfung, Reisen …)" onClose={onClose}
      footer={<FormFooter onClose={onClose} onDelete={isNew ? undefined : async () => { if (await remove('costs', cost.id)) onClose(); }} submitLabel="Speichern" />}>
      <form id="entity-form" className="form-grid" onSubmit={submit}>
        <Field label="Bezeichnung" span={2}><input value={v.description} onChange={(e) => set('description', e.target.value)} placeholder="z. B. Prüfung Standsicherheitsnachweis" /></Field>
        <Field label="Kategorie">
          <select value={v.category} onChange={(e) => set('category', e.target.value)}>
            {COST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Leistungsphase">
          <select value={v.phaseId} onChange={(e) => set('phaseId', e.target.value)}>
            <option value="">– ohne –</option>
            {phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.code} {ph.name}</option>)}
          </select>
        </Field>
        <Field label="Betrag netto (€) *"><input inputMode="decimal" value={v.amount} onChange={(e) => set('amount', e.target.value)} required /></Field>
        <Field label="Datum"><input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Status">
          <select value={v.status} onChange={(e) => set('status', e.target.value as CostItem['status'])}>
            <option value="angefallen">angefallen (Ist)</option>
            <option value="geplant">geplant (Obligo)</option>
          </select>
        </Field>
      </form>
    </Modal>
  );
}
