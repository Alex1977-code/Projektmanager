import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, LayoutGrid, List, MapPin, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { AmpelBadge, Avatar, EmptyState, PageHeader, ProgressBar, ProjectStatusBadge, Segmented } from '../components/ui';
import { BulletBar } from '../components/Charts';
import { ProjectForm } from '../components/forms';
import { PROJECT_TYPES, type Project } from '../types';
import { projectMetrics } from '../utils/metrics';
import { fmtDate, todayISO } from '../utils/date';
import { fmtEurCompact, fmtPct } from '../utils/format';
import { NARROW, useMediaQuery } from '../utils/useMedia';

type StatusFilter = 'laufend' | 'akquise' | 'abgeschlossen' | 'alle';

function readView(): 'table' | 'cards' {
  try { return (localStorage.getItem('pm.projectsView') as 'table' | 'cards') || 'table'; } catch { return 'table'; }
}

export function Projects() {
  const { data, idx, can } = useStore();
  const isLead = can('projects.edit');
  const seeCosts = can('costs.view');
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('laufend');
  const [type, setType] = useState('');
  const [lead, setLead] = useState('');
  const [savedView, setViewState] = useState<'table' | 'cards'>(readView);
  // Auf dem Handy immer Kacheln – die Tabelle wäre zu breit
  const narrow = useMediaQuery(NARROW);
  const view = narrow ? 'cards' : savedView;
  const [creating, setCreating] = useState(false);
  const today = todayISO();
  const setView = (v: 'table' | 'cards') => {
    setViewState(v);
    try { localStorage.setItem('pm.projectsView', v); } catch { /* ohne Speicher */ }
  };

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.projects.filter((p) => {
      if (status === 'laufend' && !['In Bearbeitung', 'Beauftragt', 'Pausiert'].includes(p.status)) return false;
      if (status === 'akquise' && p.status !== 'Akquise') return false;
      if (status === 'abgeschlossen' && p.status !== 'Abgeschlossen') return false;
      if (type && p.type !== type) return false;
      if (lead && String(p.leadId) !== lead) return false;
      const hay = `${p.number} ${p.name} ${p.client} ${p.location} ${p.type}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }).sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  }, [data.projects, q, status, type, lead]);

  const counts = {
    laufend: data.projects.filter((p) => ['In Bearbeitung', 'Beauftragt', 'Pausiert'].includes(p.status)).length,
    akquise: data.projects.filter((p) => p.status === 'Akquise').length,
    abgeschlossen: data.projects.filter((p) => p.status === 'Abgeschlossen').length,
  };
  const leads = [...new Set(data.projects.map((p) => p.leadId).filter(Boolean))].map((id) => idx.employeeById.get(id!)).filter(Boolean);
  const open = (p: Project) => navigate(`/projekte/${p.id}`);

  return (
    <div className="page">
      <PageHeader title="Projekte" subtitle={`${data.projects.length} Projekte · ${counts.laufend} laufend`}
        actions={isLead ? <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Neues Projekt</button> : undefined}>
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nummer, Bezeichnung, Auftraggeber …" />
          </div>
          <Segmented value={status} onChange={setStatus} options={[
            { value: 'laufend', label: `Laufend (${counts.laufend})` },
            { value: 'akquise', label: `Akquise (${counts.akquise})` },
            { value: 'abgeschlossen', label: `Abgeschlossen (${counts.abgeschlossen})` },
            { value: 'alle', label: 'Alle' },
          ]} />
          <select className="select-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Bauwerkstyp">
            <option value="">Alle Bauwerkstypen</option>
            {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select className="select-sm" value={lead} onChange={(e) => setLead(e.target.value)} aria-label="Projektleitung">
            <option value="">Alle Projektleiter</option>
            {leads.map((e) => <option key={e!.id} value={e!.id}>{e!.name}</option>)}
          </select>
          <span className="spacer" />
          {!narrow && <Segmented value={view} onChange={setView} options={[
            { value: 'table', label: <List size={16} aria-label="Tabelle" /> },
            { value: 'cards', label: <LayoutGrid size={16} aria-label="Kacheln" /> },
          ]} />}
        </div>
      </PageHeader>

      {filtered.length === 0 ? (
        <EmptyState icon={<FolderKanban size={26} />} title="Keine Projekte gefunden" text="Filter anpassen oder ein neues Projekt anlegen."
          action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Neues Projekt</button>} />
      ) : view === 'table' ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Projekt</th>
                  <th>Typ</th>
                  <th>PL</th>
                  <th>Zeitraum</th>
                  {seeCosts && <th className="num">Honorar</th>}
                  <th style={{ width: 140 }}>Fortschritt</th>
                  {seeCosts && <th style={{ width: 150 }}>Kosten</th>}
                  <th>Ampel</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const m = projectMetrics(p, idx, today);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => open(p)}>
                      <td className="mono">{p.number}</td>
                      <td>
                        <div className="proj-cell">
                          <span className="proj-dot" style={{ background: p.color || '#64748b' }} />
                          <div><strong>{p.name}</strong><small>{p.client}{p.location ? ` · ${p.location}` : ''}</small></div>
                        </div>
                      </td>
                      <td>{p.type}</td>
                      <td><Avatar employee={idx.employeeById.get(p.leadId || 0)} size={26} /></td>
                      <td className="nowrap">{fmtDate(p.startDate)}<br /><small className="muted">bis {fmtDate(p.endDate)}</small></td>
                      {seeCosts && <td className="num">{fmtEurCompact(p.budget)}</td>}
                      <td><ProgressBar value={m.progress} marker={m.plannedProgress} /><small className="muted">{fmtPct(m.progress)}</small></td>
                      {seeCosts && <td><BulletBar budget={p.budget || 0} actual={m.actualCost} forecast={m.eac} /><small className="muted">{fmtPct(m.budgetUsed)} verbraucht</small></td>}
                      <td><AmpelBadge value={m.overall} compact /></td>
                      <td><ProjectStatusBadge status={p.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="project-cards">
          {filtered.map((p) => {
            const m = projectMetrics(p, idx, today);
            const lead = idx.employeeById.get(p.leadId || 0);
            return (
              <article key={p.id} className="project-card" onClick={() => open(p)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(p)}>
                <div className="project-card-stripe" style={{ background: p.color || '#64748b' }} />
                <header>
                  <span className="mono muted">{p.number}</span>
                  <ProjectStatusBadge status={p.status} />
                </header>
                <h3>{p.name}</h3>
                <p className="muted small">{p.client}</p>
                <div className="project-card-meta">
                  <span><MapPin size={13} /> {p.location || '–'}</span>
                  <span>{p.type}</span>
                </div>
                <div className="project-card-row">
                  <span className="muted small">Fortschritt</span><strong>{fmtPct(m.progress)}</strong>
                </div>
                <ProgressBar value={m.progress} marker={m.plannedProgress} />
                {seeCosts && <>
                  <div className="project-card-row">
                    <span className="muted small">Kosten / Budget</span><strong>{fmtEurCompact(m.actualCost)} / {fmtEurCompact(p.budget)}</strong>
                  </div>
                  <BulletBar budget={p.budget || 0} actual={m.actualCost} forecast={m.eac} />
                </>}
                <footer>
                  <span className="lead"><Avatar employee={lead} size={24} /> {lead?.name}</span>
                  <AmpelBadge value={m.overall} />
                </footer>
              </article>
            );
          })}
        </div>
      )}
      {creating && <ProjectForm onClose={() => setCreating(false)} onSaved={(p) => navigate(`/projekte/${p.id}`)} />}
    </div>
  );
}
