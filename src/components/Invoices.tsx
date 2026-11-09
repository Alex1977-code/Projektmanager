import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from './Toast';
import { EmptyState } from './ui';
import type { Invoice, Project } from '../types';
import { fmtDate, relDays, todayISO } from '../utils/date';
import { classNames, fmtEur } from '../utils/format';
import { INVOICE_STATUS_LABEL, newInvoiceLines } from '../utils/invoices';

const TONE: Record<Invoice['status'], string> = { entwurf: 'amber', gestellt: 'blue', bezahlt: 'green', storniert: 'slate' };

export function InvoiceStatusBadge({ invoice }: { invoice: Invoice }) {
  const overdue = invoice.status === 'gestellt' && invoice.dueDate && invoice.dueDate < todayISO();
  return <span className={classNames('badge', overdue ? 'badge-red' : `badge-${TONE[invoice.status]}`)}>{overdue ? 'Überfällig' : INVOICE_STATUS_LABEL[invoice.status]}</span>;
}

/** Legt einen Rechnungsentwurf mit aktuellem Leistungsstand an und öffnet ihn. */
export function useCreateInvoice() {
  const { data, idx, create } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  return async (project: Project) => {
    const phases = idx.phasesByProject.get(project.id) || [];
    const all = (idx.invoicesByProject.get(project.id) || []).filter((i) => i.status !== 'storniert');
    if (all.some((i) => i.status === 'entwurf')) {
      const draft = all.find((i) => i.status === 'entwurf')!;
      toast.info('Es gibt bereits einen Rechnungsentwurf für dieses Projekt.');
      navigate(`/rechnungen/${draft.id}`);
      return;
    }
    const last = all[all.length - 1];
    const today = todayISO();
    try {
      const inv = await create('invoices', {
        projectId: project.id, type: 'Abschlagsrechnung', date: today, periodEnd: today,
        lines: newInvoiceLines(phases, last), nkPct: last?.nkPct ?? data.settings.nkPct, vatPct: last?.vatPct ?? data.settings.vatPct,
      });
      navigate(`/rechnungen/${inv.id}`);
    } catch { /* gemeldet */ }
  };
}

export function InvoiceTable({ invoices, showProject }: { invoices: Invoice[]; showProject?: boolean }) {
  const { idx } = useStore();
  const navigate = useNavigate();
  const sorted = [...invoices].sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
  if (!sorted.length) return <EmptyState icon={<FileText size={22} />} title="Noch keine Rechnungen" text="Erstellen Sie die erste Abschlagsrechnung auf Basis des aktuellen Leistungsstands." />;
  return (
    <div className="table-wrap">
      <table className="table table-hover">
        <thead>
          <tr>
            <th>Rechnung</th>
            {showProject && <th>Projekt</th>}
            <th>Datum</th>
            <th className="num">Leistung kumuliert</th>
            <th className="num">Betrag netto</th>
            <th className="num">brutto</th>
            <th>Fällig</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((i) => {
            const p = idx.projectById.get(i.projectId);
            const overdue = i.status === 'gestellt' && i.dueDate && i.dueDate < todayISO();
            return (
              <tr key={i.id} className={classNames('clickable', i.status === 'storniert' && 'row-done')} onClick={() => navigate(`/rechnungen/${i.id}`)}>
                <td><strong>{i.type === 'Abschlagsrechnung' ? `${i.number}. Abschlag` : i.type}</strong><small>{i.invoiceNo || 'ohne Nummer (Entwurf)'}</small></td>
                {showProject && <td><span className="proj-cell-inline"><span className="proj-dot" style={{ background: p?.color || '#64748b' }} />{p?.number}</span><small className="ellipsis" style={{ maxWidth: 240 }}>{p?.client}</small></td>}
                <td className="nowrap">{fmtDate(i.date)}</td>
                <td className="num">{fmtEur(i.cumulative)}</td>
                <td className="num"><strong>{fmtEur(i.net)}</strong></td>
                <td className="num">{fmtEur(i.gross)}</td>
                <td className={classNames('nowrap', overdue && 'text-bad')}>{i.dueDate ? fmtDate(i.dueDate) : '–'}{i.status === 'gestellt' && i.dueDate && <small>{relDays(i.dueDate)}</small>}{i.status === 'bezahlt' && i.paidDate && <small>bezahlt {fmtDate(i.paidDate)}</small>}</td>
                <td><InvoiceStatusBadge invoice={i} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
