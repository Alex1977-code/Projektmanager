import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSignature, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Card, EmptyState, Field, Kpi, PageHeader } from '../components/ui';
import { OFFER_STATUS_LABEL, type Offer, type OfferStatus } from '../types';
import { addDays, fmtDate, relDays, todayISO } from '../utils/date';
import { classNames, fmtEur, fmtEurCompact, fmtPct, sum } from '../utils/format';
import { offerLabel, positionsFromPhases } from '../utils/offers';

export const OFFER_TONE: Record<OfferStatus, string> = { entwurf: 'slate', versendet: 'blue', beauftragt: 'green', abgelehnt: 'red' };
export function OfferStatusBadge({ offer }: { offer: Offer }) {
  const expired = offer.status === 'versendet' && offer.validUntil && offer.validUntil < todayISO();
  return <span className={classNames('badge', expired ? 'badge-amber' : `badge-${OFFER_TONE[offer.status]}`)}>{expired ? 'Bindefrist abgelaufen' : OFFER_STATUS_LABEL[offer.status]}</span>;
}

/** Kennzahlen der Angebote: offenes Volumen, Auftragsquote nach Anzahl und Wert. */
export function offerStats(offers: Offer[]) {
  const open = offers.filter((o) => o.status === 'versendet');
  const won = offers.filter((o) => o.status === 'beauftragt');
  const lost = offers.filter((o) => o.status === 'abgelehnt');
  const decided = won.length + lost.length;
  const wonNet = sum(won, (o) => o.net);
  const decidedNet = wonNet + sum(lost, (o) => o.net);
  return { open, won, lost, openNet: sum(open, (o) => o.net), wonNet, rateCount: decided ? won.length / decided : null, rateValue: decidedNet ? wonNet / decidedNet : null };
}

export function Offers() {
  const { data, idx, can } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OfferStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const today = todayISO();
  const stats = useMemo(() => offerStats(data.offers), [data.offers]);

  if (!can('offers.view')) return <div className="page"><EmptyState title="Kein Zugriff" text="Angebote sind für Ihre Rolle nicht freigegeben." /></div>;

  const rows = data.offers
    .filter((o) => !status || o.status === status)
    .filter((o) => { const p = idx.projectById.get(o.projectId); return !q || `${o.offerNo} ${o.title} ${o.recipient} ${p?.number} ${p?.name}`.toLowerCase().includes(q.toLowerCase()); })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const expiring = stats.open.filter((o) => o.validUntil && o.validUntil <= addDays(today, 14)).length;

  return (
    <div className="page">
      <PageHeader title="Angebote" subtitle="Angebote mit Leistungspositionen – bei Beauftragung entstehen daraus die Arbeitspakete des Projekts"
        actions={can('offers.edit') ? <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Neues Angebot</button> : undefined}>
        <div className="toolbar">
          <div className="search-input"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Angebote durchsuchen …" /></div>
          <select className="select-sm" value={status} onChange={(e) => setStatus(e.target.value as OfferStatus | '')} aria-label="Status">
            <option value="">Alle Status</option>
            {Object.entries(OFFER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </PageHeader>

      <div className="kpi-grid kpi-grid-4">
        <Kpi label="Offene Angebote" value={fmtEurCompact(stats.openNet)} sub={`${stats.open.length} versendet, Entscheidung offen`} />
        <Kpi label="Beauftragt" value={fmtEurCompact(stats.wonNet)} tone="good" sub={`${stats.won.length} Angebot(e)`} />
        <Kpi label="Auftragsquote" value={stats.rateCount === null ? '–' : fmtPct(stats.rateCount)} sub={stats.rateValue === null ? 'noch keine Entscheidungen' : `nach Wert ${fmtPct(stats.rateValue)}`} />
        <Kpi label="Bindefrist endet" value={expiring} tone={expiring ? 'warn' : 'default'} sub="in den nächsten 14 Tagen oder abgelaufen" />
      </div>

      <Card padded={false}>
        {rows.length === 0 ? <EmptyState icon={<FileSignature size={22} />} title="Keine Angebote" text="Legen Sie ein Angebot an – die Leistungsphasen des Projekts lassen sich als Positionen übernehmen." /> : (
          <div className="table-wrap">
            <table className="table table-hover">
              <thead><tr><th>Nr.</th><th>Datum</th><th>Angebot / Projekt</th><th>Empfänger</th><th className="num">Netto</th><th className="num">Std.</th><th>Status</th><th>Gültig bis</th></tr></thead>
              <tbody>
                {rows.map((o) => {
                  const p = idx.projectById.get(o.projectId);
                  return (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/angebote/${o.id}`)}>
                      <td className="nowrap"><strong>{offerLabel(o)}</strong></td>
                      <td className="nowrap">{fmtDate(o.date)}</td>
                      <td><strong>{o.title || 'Ohne Titel'}</strong><small className="block muted"><span className="proj-dot" style={{ background: p?.color || '#64748b' }} /> {p?.number} · {p?.name}</small></td>
                      <td>{(o.recipient || '').split('\n')[0] || <span className="muted">–</span>}</td>
                      <td className="num"><strong>{fmtEur(o.net)}</strong></td>
                      <td className="num">{o.hours ? Math.round(o.hours) : '–'}</td>
                      <td><OfferStatusBadge offer={o} /></td>
                      <td className="nowrap">{o.status === 'versendet' && o.validUntil ? <>{fmtDate(o.validUntil)}<small className="block muted">{relDays(o.validUntil)}</small></> : o.decidedAt ? <span className="muted">entschieden {fmtDate(o.decidedAt)}</span> : fmtDate(o.validUntil)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && <NewOfferDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

export function NewOfferDialog({ onClose, projectId }: { onClose: () => void; projectId?: number }) {
  const { data, idx, create } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [pid, setPid] = useState(projectId ? String(projectId) : '');
  const [title, setTitle] = useState('');
  const [fromPhases, setFromPhases] = useState(true);
  const project = pid ? idx.projectById.get(Number(pid)) : undefined;
  const phases = project ? idx.phasesByProject.get(project.id) || [] : [];
  const submit = async () => {
    if (!project) return toast.error('Bitte ein Projekt wählen');
    try {
      const row = await create('offers', {
        projectId: project.id, date: todayISO(), title: title.trim() || `Ingenieurleistungen ${project.name}`,
        recipient: [project.client, project.location].filter(Boolean).join('\n'),
        positions: fromPhases ? positionsFromPhases(phases) : [],
      });
      onClose();
      navigate(`/angebote/${row.id}`);
    } catch { /* gemeldet */ }
  };
  return (
    <Modal title="Neues Angebot" onClose={onClose} width={520}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" onClick={submit}>Angebot anlegen</button></>}>
      <div className="form-grid">
        <Field label="Projekt *" span={2} hint="Für eine neue Anfrage zuerst ein Projekt mit Status „Akquise“ anlegen.">
          <select value={pid} onChange={(e) => setPid(e.target.value)} autoFocus>
            <option value="">– wählen –</option>
            {[...data.projects].sort((a, b) => (a.status === 'Akquise' ? 0 : 1) - (b.status === 'Akquise' ? 0 : 1) || (b.number || '').localeCompare(a.number || '')).map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}{p.status === 'Akquise' ? ' (Akquise)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Titel" span={2}><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={project ? `Ingenieurleistungen ${project.name}` : 'z. B. Nachtrag Nr. 1'} /></Field>
        <label className="check-field field-span2"><input type="checkbox" checked={fromPhases} onChange={(e) => setFromPhases(e.target.checked)} /> Leistungsphasen des Projekts als Positionen übernehmen{project ? ` (${phases.length})` : ''}</label>
      </div>
    </Modal>
  );
}
