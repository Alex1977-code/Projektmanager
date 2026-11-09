import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { Card, Kpi, PageHeader, Segmented } from '../components/ui';
import { NewProtocolDialog, OpenPointsTable, ProtocolTable, useTasksById } from '../components/Protocols';
import { PROTOCOL_TYPES } from '../types';
import { openPoints } from '../utils/protocols';
import { todayISO } from '../utils/date';

export function Protocols() {
  const { data, me } = useStore();
  const tasksById = useTasksById();
  const [creating, setCreating] = useState(false);
  const [project, setProject] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const today = todayISO();
  const [scope, setScope] = useState<'mine' | 'all'>(() => (openPoints(data.protocols, tasksById).some((o) => o.item.assigneeId === me?.id) ? 'mine' : 'all'));

  const protocols = useMemo(() => data.protocols.filter((p) => {
    if (project && String(p.projectId) !== project) return false;
    if (type && p.type !== type) return false;
    if (q) {
      const hay = `${p.title} ${p.type} ${p.location} ${p.items.map((i) => i.text).join(' ')}`.toLowerCase();
      if (!q.toLowerCase().split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  }), [data.protocols, project, type, q]);

  const allOpen = openPoints(protocols, tasksById);
  const mineOpen = allOpen.filter((o) => o.item.assigneeId === me?.id);
  const overdue = allOpen.filter((o) => o.item.dueDate && o.item.dueDate < today);
  const drafts = protocols.filter((p) => p.status === 'entwurf').length;

  return (
    <div className="page">
      <PageHeader title="Protokolle" subtitle="Besprechungsprotokolle aller Projekte und offene Punkte"
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Neues Protokoll</button>}>
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="In Protokollen suchen …" />
          </div>
          <select className="select-sm" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Projekt">
            <option value="">Alle Projekte</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
          </select>
          <select className="select-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Besprechungsart">
            <option value="">Alle Besprechungsarten</option>
            {PROTOCOL_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </PageHeader>

      <div className="kpi-grid kpi-grid-4">
        <Kpi label="Protokolle" value={protocols.length} sub={`${drafts} im Entwurf`} />
        <Kpi label="Offene Punkte" value={allOpen.length} sub="Aufgaben (A) aus Protokollen" />
        <Kpi label="Davon überfällig" value={overdue.length} tone={overdue.length ? 'warn' : 'good'} sub="Termin überschritten" />
        <Kpi label="Meine offenen Punkte" value={mineOpen.length} sub={me?.name} />
      </div>

      <Card title="Offene Punkte" subtitle="Häkchen markiert den Punkt als erledigt – bei verknüpfter Aufgabe wird diese abgeschlossen" padded={false}
        actions={<Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: 'Meine' }, { value: 'all', label: 'Alle' }]} />}>
        <OpenPointsTable protocols={protocols} showProject onlyEmployee={scope === 'mine' ? me?.id : null} />
      </Card>

      <Card title="Protokolle" padded={false}>
        <ProtocolTable protocols={protocols} showProject />
      </Card>
      {creating && <NewProtocolDialog projectId={project ? Number(project) : undefined} onClose={() => setCreating(false)} />}
    </div>
  );
}
