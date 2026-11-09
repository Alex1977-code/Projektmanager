import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Download } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from '../components/Toast';
import { saveFile } from '../utils/files';
import { AmpelBadge, Avatar, Card, Kpi, PageHeader, Segmented } from '../components/ui';
import { BulletBar, BulletLegend } from '../components/Charts';
import { projectMetrics, type ProjectMetrics } from '../utils/metrics';
import { classNames, fmtEur, fmtEurCompact, fmtEurSigned, fmtNum, fmtPct, sum } from '../utils/format';
import { todayISO } from '../utils/date';
import type { Project } from '../types';

type SortKey = 'number' | 'budget' | 'actualCost' | 'budgetUsed' | 'progress' | 'cpi' | 'eac' | 'variance';

export function Controlling() {
  const { data, idx } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [scope, setScope] = useState<'laufend' | 'alle'>('laufend');
  const [sortKey, setSortKey] = useState<SortKey>('variance');
  const [asc, setAsc] = useState(true);
  const today = todayISO();

  const rows = useMemo(() => {
    const list = data.projects
      .filter((p) => p.status !== 'Akquise')
      .filter((p) => scope === 'alle' || p.status !== 'Abgeschlossen')
      .map((p) => ({ p, m: projectMetrics(p, idx, today) }));
    const val = (r: { p: Project; m: ProjectMetrics }) => (sortKey === 'number' ? r.p.number || '' : sortKey === 'cpi' ? r.m.cpi ?? 99 : r.m[sortKey]);
    return list.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return asc ? c : -c;
    });
  }, [data.projects, idx, today, scope, sortKey, asc]);

  const tot = {
    budget: sum(rows, (r) => r.m.budget),
    actual: sum(rows, (r) => r.m.actualCost),
    ev: sum(rows, (r) => r.m.earnedValue),
    eac: sum(rows, (r) => r.m.eac),
    hours: sum(rows, (r) => r.m.actualHours),
  };
  const negative = rows.filter((r) => r.m.variance < 0);
  const scaleMax = Math.max(...rows.map((r) => Math.max(r.m.budget, r.m.eac, r.m.actualCost)), 1);

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setAsc(!asc);
    else { setSortKey(k); setAsc(k === 'number'); }
  };
  const Th = ({ k, children, className }: { k: SortKey; children: ReactNode; className?: string }) => (
    <th className={classNames('sortable', className)} onClick={() => sortBy(k)} aria-sort={sortKey === k ? (asc ? 'ascending' : 'descending') : 'none'}>
      {children}{sortKey === k && (asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </th>
  );

  const exportCsv = () => {
    const n = (v: number | null) => (v === null ? '' : v.toFixed(2).replace('.', ','));
    const header = ['Projektnummer', 'Projekt', 'Auftraggeber', 'Projektleitung', 'Status', 'Budget', 'Ist-Stunden', 'Ist-Personalkosten', 'Ist-Fremdkosten', 'Ist gesamt', 'Fertigstellung %', 'Leistungswert', 'CPI', 'Prognose', 'Abweichung'];
    const lines = rows.map(({ p, m }) => [
      p.number, p.name, p.client, idx.employeeById.get(p.leadId || 0)?.name, p.status, n(m.budget), n(m.actualHours), n(m.laborCost), n(m.extCost), n(m.actualCost),
      n(m.progress * 100), n(m.earnedValue), n(m.cpi), n(m.eac), n(m.variance),
    ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'));
    const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    saveFile(`controlling-${today}.csv`, blob).catch((e) => toast.error((e as Error).message));
  };

  return (
    <div className="page">
      <PageHeader title="Kosten & Controlling" subtitle="Budget, Ist-Kosten und Prognose aller Projekte nach Earned-Value-Methode"
        actions={<button className="btn" onClick={exportCsv}><Download size={16} /> CSV-Export (Excel)</button>}>
        <div className="toolbar">
          <Segmented value={scope} onChange={setScope} options={[{ value: 'laufend', label: 'Laufende Projekte' }, { value: 'alle', label: 'inkl. abgeschlossene' }]} />
          <span className="spacer" />
          <BulletLegend />
        </div>
      </PageHeader>

      <div className="kpi-grid">
        <Kpi label="Budget gesamt" value={fmtEurCompact(tot.budget)} sub={`${rows.length} Projekte`} />
        <Kpi label="Ist-Kosten" value={fmtEurCompact(tot.actual)} sub={`${fmtPct(tot.actual / Math.max(1, tot.budget))} des Budgets · ${fmtNum(tot.hours)} h`} />
        <Kpi label="Leistungswert (EV)" value={fmtEurCompact(tot.ev)} sub={`CPI Portfolio ${fmtNum(tot.ev / Math.max(1, tot.actual), 2)}`} />
        <Kpi label="Prognose Gesamtkosten" value={fmtEurCompact(tot.eac)} sub={`${tot.budget - tot.eac >= 0 ? 'Reserve' : 'Überschreitung'} ${fmtEurCompact(Math.abs(tot.budget - tot.eac))}`}
          tone={tot.eac > tot.budget ? 'bad' : 'good'} />
        <Kpi label="Projekte mit Unterdeckung" value={negative.length} tone={negative.length ? 'warn' : 'good'} sub={negative.length ? `Summe ${fmtEurCompact(sum(negative, (r) => r.m.variance))}` : 'keine'} />
      </div>

      <Card padded={false}>
        <div className="table-wrap">
          <table className="table table-hover">
            <thead>
              <tr>
                <Th k="number">Projekt</Th>
                <th>PL</th>
                <Th k="budget" className="num">Budget</Th>
                <Th k="actualCost" className="num">Ist-Kosten</Th>
                <Th k="budgetUsed" className="num">Verbrauch</Th>
                <Th k="progress" className="num">Fertig</Th>
                <Th k="cpi" className="num">CPI</Th>
                <Th k="eac" className="num">Prognose</Th>
                <Th k="variance" className="num">Abweichung</Th>
                <th style={{ width: 180 }}>Budget / Ist / Prognose</th>
                <th>Ampel</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, m }) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/projekte/${p.id}?tab=kosten`)}>
                  <td>
                    <div className="proj-cell">
                      <span className="proj-dot" style={{ background: p.color || '#64748b' }} />
                      <div><strong>{p.number}</strong><small className="ellipsis" style={{ maxWidth: 280 }}>{p.name}</small></div>
                    </div>
                  </td>
                  <td><Avatar employee={idx.employeeById.get(p.leadId || 0)} size={24} /></td>
                  <td className="num">{fmtEur(m.budget)}</td>
                  <td className="num">{fmtEur(m.actualCost)}</td>
                  <td className="num">{fmtPct(m.budgetUsed)}</td>
                  <td className="num">{fmtPct(m.progress)}</td>
                  <td className={classNames('num', m.cpi !== null && m.cpi < 0.9 && 'text-bad')}>{m.cpi ? fmtNum(m.cpi, 2) : '–'}</td>
                  <td className="num">{fmtEur(m.eac)}</td>
                  <td className={classNames('num', m.variance < 0 ? 'text-bad' : 'text-good')}><strong>{fmtEurSigned(m.variance)}</strong></td>
                  <td><BulletBar budget={m.budget} actual={m.actualCost} forecast={m.eac} scaleMax={scaleMax} /></td>
                  <td><AmpelBadge value={m.costStatus} compact /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}><strong>Summe</strong></td>
                <td className="num"><strong>{fmtEur(tot.budget)}</strong></td>
                <td className="num"><strong>{fmtEur(tot.actual)}</strong></td>
                <td className="num">{fmtPct(tot.actual / Math.max(1, tot.budget))}</td>
                <td className="num">{fmtPct(tot.ev / Math.max(1, tot.budget))}</td>
                <td className="num">{fmtNum(tot.ev / Math.max(1, tot.actual), 2)}</td>
                <td className="num"><strong>{fmtEur(tot.eac)}</strong></td>
                <td className={classNames('num', tot.budget - tot.eac < 0 ? 'text-bad' : 'text-good')}><strong>{fmtEurSigned(tot.budget - tot.eac)}</strong></td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="footnote">
        <strong>Methodik:</strong> Ist-Kosten = gebuchte Stunden × Verrechnungssatz + angefallene Fremdkosten. Leistungswert (EV) = Budget × Fertigstellungsgrad
        (budgetgewichtet über die Leistungsphasen). CPI = EV / Ist-Kosten. Prognose (EAC) = Ist-Kosten + (Budget − EV) / CPI.
      </p>
    </div>
  );
}
