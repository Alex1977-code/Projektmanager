import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { Field } from './ui';
import type { Data, ID, Project, Task } from '../types';
import { planTemplate, ROLE_LABEL, scopeOf, TEMPLATE_SETS, type PlannedTask, type TemplateSet } from '../utils/taskTemplates';
import { addDays, fmtDate, fmtDateShort, todayISO } from '../utils/date';
import { classNames, fmtNum, sum } from '../utils/format';

/** Personen, die bereits am Projekt arbeiten (Planung, Aufgaben, Buchungen, PL). */
export function projectTeamIds(data: Data, projectId: ID): Set<ID> {
  const ids = new Set<ID>();
  data.allocations.forEach((a) => a.projectId === projectId && ids.add(a.employeeId));
  data.tasks.forEach((t) => t.projectId === projectId && t.assigneeId && ids.add(t.assigneeId));
  data.summary.byEmployee.forEach((r) => r.projectId === projectId && r.employeeId && ids.add(r.employeeId));
  const lead = data.projects.find((p) => p.id === projectId)?.leadId;
  if (lead) ids.add(lead);
  return ids;
}

type Target = 'new' | 'none' | `${number}`;

export function TemplateDialog({ project, onClose, initialSet }: { project: Project; onClose: () => void; initialSet?: string }) {
  const { data, idx, create, createTasks } = useStore();
  const toast = useToast();
  const phases = idx.phasesByProject.get(project.id) || [];
  const [setId, setSetId] = useState(initialSet || 'hoai');
  const set = TEMPLATE_SETS.find((s) => s.id === setId) as TemplateSet;
  const today = todayISO();

  const defaultTarget = (s: TemplateSet): Target => {
    const ph = phases.find((p) => p.code === s.defaultPhase?.code);
    return ph ? (String(ph.id) as Target) : s.id === 'werkstatt-pruefung' && phases.length ? (String(phases[phases.length - 1].id) as Target) : 'new';
  };
  const [target, setTarget] = useState<Target>(() => defaultTarget(set));
  const [winStart, setWinStart] = useState(today);
  const [winEnd, setWinEnd] = useState(addDays(today, 84));
  const [showB, setShowB] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [assign, setAssign] = useState<Record<string, ID | null>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTarget(defaultTarget(set)); setAssign({}); }, [setId]);

  const targetPhase = target !== 'new' && target !== 'none' ? idx.phaseById.get(Number(target)) : undefined;
  const win = set.mode === 'window'
    ? { start: targetPhase ? targetPhase.startDate : winStart, end: targetPhase ? targetPhase.endDate : winEnd, phaseId: targetPhase ? targetPhase.id : null }
    : undefined;

  const teamIds = useMemo(() => projectTeamIds(data, project.id), [data, project.id]);
  const planned = useMemo(() => planTemplate({
    set, project, phases, existingTasks: idx.tasksByProject.get(project.id) || [], employees: data.employees, teamIds, window: win,
  }), [set, project, phases, idx, data.employees, teamIds, win?.start, win?.end, win?.phaseId]);

  // Vorauswahl: Grundleistungen ja, Besondere Leistungen nein, Vorhandenes nie
  useEffect(() => {
    setSelected(Object.fromEntries(planned.map((p) => [p.key, !p.exists && p.template.kind === 'G'])));
  }, [planned]);

  const visible = planned.filter((p) => showB || p.template.kind === 'G');
  const chosen = visible.filter((p) => selected[p.key] && !p.exists);
  const assigneeOf = (p: PlannedTask) => (p.key in assign ? assign[p.key] : p.assigneeId);
  const groups = set.groups.map((grp) => ({ grp, items: visible.filter((p) => p.group === grp.key) })).filter((x) => x.items.length);
  const missingPhases = set.mode === 'byPhase' ? set.groups.filter((grp) => !phases.some((p) => p.code === grp.code)).map((g2) => g2.code) : [];
  const employees = data.employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const submit = async () => {
    if (!chosen.length) return toast.error('Bitte mindestens eine Aufgabe auswählen');
    setSaving(true);
    try {
      let phaseId: ID | null = win?.phaseId ?? null;
      if (set.mode === 'window' && target === 'new' && set.defaultPhase) {
        if (winEnd < winStart) { toast.error('Ende liegt vor dem Beginn'); setSaving(false); return; }
        const ph = await create('phases', {
          projectId: project.id, code: set.defaultPhase.code, name: set.defaultPhase.name, startDate: winStart, endDate: winEnd,
          plannedHours: sum(chosen, (c) => c.template.hours), progress: 0, sort: phases.length,
        });
        phaseId = ph.id;
      }
      const list: Partial<Task>[] = chosen.map((p, i) => ({
        projectId: project.id,
        phaseId: set.mode === 'window' ? phaseId : p.phaseId,
        title: p.title,
        description: [p.template.kind === 'B' ? 'Besondere Leistung' : '', p.template.note || '', `Vorlage: ${set.short}`].filter(Boolean).join(' · '),
        assigneeId: assigneeOf(p),
        status: 'offen',
        priority: p.template.prio || 'mittel',
        estimatedHours: p.template.hours,
        startDate: p.startDate,
        dueDate: p.dueDate,
        sort: i,
      }));
      await createTasks(list);
      toast.success(`${list.length} Aufgaben angelegt (${fmtNum(sum(chosen, (c) => c.template.hours))} h)`);
      onClose();
    } catch {
      /* gemeldet */
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (items: PlannedTask[], on: boolean) => setSelected((s) => ({ ...s, ...Object.fromEntries(items.filter((p) => !p.exists).map((p) => [p.key, on])) }));
  const scope = scopeOf(project);

  return (
    <Modal title="Aufgaben aus Vorlage anlegen" subtitle={`${project.number} · ${project.name}${scope ? ` · Vorlagen gefiltert für ${scope === 'swb' ? 'Stahlwasserbau' : 'bewegliche Brücken'}` : ''}`}
      onClose={onClose} width={1040}
      footer={
        <>
          <span className="mr-auto muted small">{chosen.length} Aufgaben · {fmtNum(sum(chosen, (c) => c.template.hours))} h geschätzt</span>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !chosen.length}>
            <BookOpenCheck size={16} /> {chosen.length} Aufgaben anlegen
          </button>
        </>
      }>
      <div className="tpl-sets">
        {TEMPLATE_SETS.map((s) => (
          <button key={s.id} type="button" className={classNames('tpl-set', s.id === setId && 'active')} onClick={() => setSetId(s.id)}>
            <strong>{s.name}</strong>
            <span>{s.description}</span>
          </button>
        ))}
      </div>

      {set.mode === 'window' && (
        <div className="tpl-window">
          <Field label="Leistungsphase im Projekt">
            <select value={target} onChange={(e) => setTarget(e.target.value as Target)}>
              {set.defaultPhase && <option value="new">Neue Phase „{set.defaultPhase.name}“ anlegen</option>}
              {phases.map((p) => <option key={p.id} value={p.id}>{p.code} {p.name} ({fmtDate(p.startDate)} – {fmtDate(p.endDate)})</option>)}
              <option value="none">ohne Phasenzuordnung</option>
            </select>
          </Field>
          <Field label="Beginn"><input type="date" value={win?.start || ''} disabled={!!targetPhase} onChange={(e) => setWinStart(e.target.value)} /></Field>
          <Field label="Ende"><input type="date" value={win?.end || ''} disabled={!!targetPhase} onChange={(e) => setWinEnd(e.target.value)} /></Field>
        </div>
      )}
      {missingPhases.length > 0 && (
        <p className="tpl-hint">Für {missingPhases.join(', ')} gibt es in diesem Projekt keine Leistungsphase – diese Vorlagen werden nicht angeboten. Phasen lassen sich im Terminplan ergänzen.</p>
      )}

      <div className="tpl-toolbar">
        <label className="check-inline"><input type="checkbox" checked={showB} onChange={(e) => setShowB(e.target.checked)} /> Besondere Leistungen anzeigen</label>
        <span className="spacer" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggleGroup(visible, true)}>Alle auswählen</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggleGroup(visible, false)}>Keine</button>
      </div>

      {groups.length === 0 && <p className="muted">Für diese Auswahl gibt es keine passenden Vorlagen.</p>}
      <div className="tpl-groups">
        {groups.map(({ grp, items }) => {
          const sel = items.filter((p) => selected[p.key] && !p.exists).length;
          const open = !collapsed.has(grp.key);
          const ph = items[0]?.phaseId ? idx.phaseById.get(items[0].phaseId) : null;
          return (
            <section key={grp.key} className="tpl-group">
              <header>
                <button type="button" className="icon-btn" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(grp.key)) n.delete(grp.key); else n.add(grp.key); return n; })} aria-expanded={open}>
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <input type="checkbox" checked={sel > 0 && sel === items.filter((p) => !p.exists).length} ref={(el) => { if (el) el.indeterminate = sel > 0 && sel < items.filter((p) => !p.exists).length; }}
                  onChange={(e) => toggleGroup(items, e.target.checked)} aria-label={`${grp.title} auswählen`} />
                <strong>{grp.title}</strong>
                {ph && set.mode === 'byPhase' && <span className="muted small">{fmtDate(ph.startDate)} – {fmtDate(ph.endDate)}</span>}
                <span className="spacer" />
                <span className="muted small">{sel} von {items.length} gewählt</span>
              </header>
              {open && (
                <table className="tpl-table">
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.key} className={classNames(p.exists && 'exists', !selected[p.key] && 'off')}>
                        <td className="tpl-check">
                          <input type="checkbox" disabled={p.exists} checked={!!selected[p.key] && !p.exists} onChange={(e) => setSelected((s) => ({ ...s, [p.key]: e.target.checked }))} aria-label={p.title} />
                        </td>
                        <td>
                          <span className="tpl-title">{p.title}</span>
                          <span className={classNames('tpl-kind', p.template.kind === 'B' && 'b')} title={p.template.kind === 'G' ? 'Grundleistung' : 'Besondere Leistung'}>{p.template.kind === 'G' ? 'GL' : 'BL'}</span>
                          {p.exists && <span className="tag-mini">bereits vorhanden</span>}
                          {p.template.note && <small className="block muted">{p.template.note}</small>}
                        </td>
                        <td className="tpl-role">{ROLE_LABEL[p.template.role]}</td>
                        <td className="tpl-hours">{fmtNum(p.template.hours)} h</td>
                        <td className="tpl-assignee">
                          <select value={assigneeOf(p) ?? ''} disabled={p.exists} onChange={(e) => setAssign((a) => ({ ...a, [p.key]: e.target.value ? Number(e.target.value) : null }))} aria-label="Zuständig">
                            <option value="">– offen –</option>
                            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{teamIds.has(e.id) ? '' : ' (nicht im Team)'}</option>)}
                          </select>
                        </td>
                        <td className="tpl-dates">{fmtDateShort(p.startDate)} – {fmtDateShort(p.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
