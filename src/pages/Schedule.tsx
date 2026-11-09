import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Avatar, Card, PageHeader, Segmented } from '../components/ui';
import { Gantt, ganttRange, type GanttRow, type GanttScale } from '../components/Gantt';
import { PhaseForm, MilestoneForm } from '../components/forms';
import { projectMetrics } from '../utils/metrics';
import type { Milestone, Phase } from '../types';

export function Schedule() {
  const { data, idx, update } = useStore();
  const [scale, setScale] = useState<GanttScale>('month');
  const [scope, setScope] = useState<'laufend' | 'alle'>('laufend');
  const [lead, setLead] = useState('');
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [editPhase, setEditPhase] = useState<Phase | null>(null);
  const [editMs, setEditMs] = useState<Milestone | null>(null);

  const projects = data.projects
    .filter((p) => (scope === 'alle' ? true : p.status !== 'Abgeschlossen'))
    .filter((p) => !lead || String(p.leadId) === lead)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  const range = ganttRange(projects.flatMap((p) => [p.startDate || '', p.endDate || '']), scale);
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const rows: GanttRow[] = [];
  for (const p of projects) {
    const phases = idx.phasesByProject.get(p.id) || [];
    const ms = idx.milestonesByProject.get(p.id) || [];
    const m = projectMetrics(p, idx);
    const isOpen = open.has(p.id);
    rows.push({
      id: `p${p.id}`,
      expanded: isOpen,
      onToggle: phases.length ? () => toggle(p.id) : undefined,
      label: (
        <Link to={`/projekte/${p.id}?tab=termine`} className="gantt-proj-label">
          <span className="proj-dot" style={{ background: p.color || '#64748b' }} />
          <span className="gantt-proj-text" title={`${p.number} ${p.name}`}><strong>{p.number}</strong> {p.name}</span>
        </Link>
      ),
      meta: <Avatar employee={idx.employeeById.get(p.leadId || 0)} size={22} />,
      className: p.status === 'Akquise' ? 'gantt-row-tentative' : undefined,
      bars: p.startDate && p.endDate ? [{
        id: `p${p.id}`, start: p.startDate, end: p.endDate, color: p.color || '#475569', progress: m.progress, variant: 'project',
        label: p.status === 'Akquise' ? 'Akquise' : undefined, tooltip: `${p.number} ${p.name}`,
        onClick: () => toggle(p.id),
      }] : [],
      milestones: isOpen ? [] : ms.map((x) => ({ id: `m${x.id}`, date: x.date, label: `${p.number}: ${x.name}`, done: x.done, onClick: () => setEditMs(x) })),
    });
    if (isOpen) {
      for (const ph of phases) {
        rows.push({
          id: `ph${ph.id}`, level: 1,
          label: <span><strong>{ph.code}</strong> {ph.name}</span>,
          bars: [{
            id: `ph${ph.id}`, start: ph.startDate, end: ph.endDate, color: p.color || '#475569', progress: (ph.progress || 0) / 100,
            label: ph.code || '', tooltip: `${ph.code} ${ph.name}`, onClick: () => setEditPhase(ph),
            onChange: (s, e) => update('phases', ph.id, { startDate: s, endDate: e }),
          }],
        });
      }
      rows.push({
        id: `ms${p.id}`, level: 1, label: <span className="muted">Meilensteine</span>, bars: [],
        milestones: ms.map((x) => ({ id: `m${x.id}`, date: x.date, label: x.name, done: x.done, onClick: () => setEditMs(x) })),
      });
    }
  }

  const leads = [...new Set(data.projects.map((p) => p.leadId).filter(Boolean))].map((id) => idx.employeeById.get(id!)).filter(Boolean);

  return (
    <div className="page">
      <PageHeader title="Terminplanung" subtitle="Rahmenterminplan aller Projekte mit Leistungsphasen und Meilensteinen">
        <div className="toolbar">
          <Segmented value={scope} onChange={setScope} options={[{ value: 'laufend', label: 'Laufend & Akquise' }, { value: 'alle', label: 'Alle Projekte' }]} />
          <select className="select-sm" value={lead} onChange={(e) => setLead(e.target.value)} aria-label="Projektleitung">
            <option value="">Alle Projektleiter</option>
            {leads.map((e) => <option key={e!.id} value={e!.id}>{e!.name}</option>)}
          </select>
          <button className="btn btn-sm btn-ghost" onClick={() => setOpen(open.size ? new Set() : new Set(projects.map((p) => p.id)))}>
            {open.size ? 'Alle einklappen' : 'Alle Phasen anzeigen'}
          </button>
          <span className="spacer" />
          <Segmented value={scale} onChange={setScale} options={[{ value: 'week', label: 'Wochen' }, { value: 'month', label: 'Monate' }, { value: 'quarter', label: 'Quartale' }]} />
        </div>
      </PageHeader>
      <Card padded={false}>
        <Gantt rows={rows} from={range.from} to={range.to} scale={scale} labelWidth={340} labelHeader="Projekt / Leistungsphase" emptyText="Keine Projekte für diese Auswahl" />
        <div className="gantt-legend">
          <span>Projekt aufklappen, um Leistungsphasen per Drag & Drop zu verschieben</span>
          <span><i className="lg-diamond" /> Meilenstein</span>
          <span><i className="lg-diamond done" /> erreicht</span>
          <span><i className="lg-diamond overdue" /> überfällig</span>
          <span><i className="lg-bar tentative" /> Akquise (vorläufig)</span>
        </div>
      </Card>
      {editPhase && <PhaseForm phase={editPhase} projectId={editPhase.projectId} onClose={() => setEditPhase(null)} />}
      {editMs && <MilestoneForm milestone={editMs} projectId={editMs.projectId} onClose={() => setEditMs(null)} />}
    </div>
  );
}
