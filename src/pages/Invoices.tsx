import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2 } from 'lucide-react';
import { useStore } from '../store';
import { Card, EmptyState, Kpi, PageHeader, ProgressBar, Segmented } from '../components/ui';
import { InvoiceTable, useCreateInvoice } from '../components/Invoices';
import { billingStatus } from '../utils/invoices';
import { isActiveProject } from '../utils/metrics';
import { todayISO } from '../utils/date';
import { fmtEur, fmtEurCompact, fmtPct, sum } from '../utils/format';

export function Invoices() {
  const { data, idx, isLead } = useStore();
  const createInvoice = useCreateInvoice();
  const today = todayISO();
  const year = today.slice(0, 4);
  const [filter, setFilter] = useState<'offen' | 'jahr' | 'alle'>('offen');

  const rows = useMemo(() => data.projects.filter((p) => isActiveProject(p) || (idx.invoicesByProject.get(p.id) || []).length)
    .map((p) => ({ p, b: billingStatus(p, idx, today) })), [data.projects, idx, today]);
  const suggestions = rows.filter((r) => isActiveProject(r.p) && r.b.unbilled >= 5000).sort((a, b) => b.b.unbilled - a.b.unbilled);

  if (!isLead) return <div className="page"><EmptyState title="Kein Zugriff" text="Rechnungen sind der Projektleitung vorbehalten." /></div>;

  const issued = data.invoices.filter((i) => i.status !== 'entwurf' && i.status !== 'storniert');
  const revenueYear = sum(issued.filter((i) => i.date.startsWith(year)), (i) => i.net);
  const open = issued.filter((i) => i.status === 'gestellt');
  const overdue = open.filter((i) => i.dueDate && i.dueDate < today);
  const unbilled = sum(rows.filter((r) => isActiveProject(r.p)), (r) => r.b.unbilled);
  const shown = filter === 'offen' ? data.invoices.filter((i) => i.status === 'gestellt' || i.status === 'entwurf')
    : filter === 'jahr' ? data.invoices.filter((i) => i.date.startsWith(year)) : data.invoices;

  return (
    <div className="page">
      <PageHeader title="Rechnungen" subtitle="Abschlags- und Schlussrechnungen nach § 15 HOAI – Rechnungsausgang, offene Posten und noch nicht abgerechnete Leistungen" />
      <div className="kpi-grid kpi-grid-4">
        <Kpi label={`Rechnungsausgang ${year} (netto)`} value={fmtEurCompact(revenueYear)} sub={`${issued.filter((i) => i.date.startsWith(year)).length} Rechnungen`} />
        <Kpi label="Offene Posten (brutto)" value={fmtEurCompact(sum(open, (i) => i.gross - (i.paidAmount || 0)))} sub={`${open.length} Rechnungen offen`} />
        <Kpi label="Überfällig" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} sub={overdue.length ? fmtEur(sum(overdue, (i) => i.gross)) : 'keine'} />
        <Kpi label="Erbracht, nicht abgerechnet" value={fmtEurCompact(unbilled)} sub="Leistungsstand laufender Projekte abzüglich Abrechnung" tone={unbilled > 100000 ? 'warn' : 'default'} />
      </div>

      <Card title="Abrechnungsvorschlag" subtitle="Projekte, bei denen erbrachte Leistung noch nicht abgerechnet ist (ab 5.000 €)" padded={false}>
        {suggestions.length === 0 ? <EmptyState title="Alles abgerechnet" text="Für keines der laufenden Projekte steht eine Abschlagsrechnung an." /> : (
          <div className="table-wrap">
            <table className="table table-hover">
              <thead><tr><th>Projekt</th><th className="num">Honorar</th><th className="num">Leistung erbracht</th><th className="num">abgerechnet</th><th className="num">offen abzurechnen</th><th style={{ width: 160 }}>Abrechnungsstand</th><th>Letzte Rechnung</th><th /></tr></thead>
              <tbody>
                {suggestions.map(({ p, b }) => (
                  <tr key={p.id}>
                    <td><Link to={`/projekte/${p.id}?tab=rechnungen`} className="proj-cell"><span className="proj-dot" style={{ background: p.color || '#64748b' }} /><div><strong>{p.number}</strong><small className="ellipsis" style={{ maxWidth: 230 }}>{p.name}</small></div></Link></td>
                    <td className="num">{fmtEurCompact(p.budget)}</td>
                    <td className="num">{fmtEur(b.earned)}</td>
                    <td className="num">{fmtEur(b.billedPerformance)}</td>
                    <td className="num"><strong>{fmtEur(b.unbilled)}</strong></td>
                    <td><ProgressBar value={b.billedPerformance / Math.max(1, p.budget || 1)} marker={b.earned / Math.max(1, p.budget || 1)} /><small className="muted">{fmtPct(b.billedPerformance / Math.max(1, p.budget || 1))} abgerechnet</small></td>
                    <td className="small">{b.last ? `${b.last.invoiceNo} · ${b.last.date.split('-').reverse().join('.')}` : 'noch keine'}</td>
                    <td><button className="btn btn-sm btn-primary" onClick={() => createInvoice(p)} title="Abschlagsrechnung mit aktuellem Leistungsstand erstellen"><FilePlus2 size={14} /> Abschlag</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Rechnungen" padded={false} actions={<Segmented value={filter} onChange={setFilter} options={[{ value: 'offen', label: 'Offen & Entwürfe' }, { value: 'jahr', label: year }, { value: 'alle', label: 'Alle' }]} />}>
        <InvoiceTable invoices={shown} showProject />
      </Card>
    </div>
  );
}
