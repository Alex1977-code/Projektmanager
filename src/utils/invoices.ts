// Abschlagsrechnungen nach § 15 HOAI – Rechenlogik identisch zum Server (server/billing.js).
import type { Invoice, InvoiceLine, Phase, Project } from '../types';
import type { Index } from './metrics';
import { sum } from './format';
import { todayISO } from './date';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computeInvoice(inv: Pick<Invoice, 'lines' | 'nkPct' | 'vatPct'>, previousNet: number) {
  const lines = inv.lines.map((l) => {
    const fee = r2(l.fee);
    const percent = Math.max(0, Math.min(100, Number(l.percent) || 0));
    return { ...l, fee, percent, amount: r2((fee * percent) / 100) };
  });
  const performance = r2(sum(lines, (l) => l.amount));
  const nk = r2((performance * (inv.nkPct || 0)) / 100);
  const cumulative = r2(performance + nk);
  const net = r2(cumulative - previousNet);
  const vat = r2((net * (inv.vatPct || 0)) / 100);
  return { lines, performance, nk, cumulative, previousNet: r2(previousNet), net, vat, gross: r2(net + vat) };
}

export const activeInvoices = (list: Invoice[]) => list.filter((i) => i.status !== 'storniert');

/** Vorherige (nicht stornierte) Rechnungen eines Projekts vor einer Rechnungsnummer. */
export const previousInvoices = (all: Invoice[], inv: Invoice) => activeInvoices(all).filter((i) => i.projectId === inv.projectId && i.number < inv.number);

/** Positionen einer neuen Abschlagsrechnung: Leistungsphasen mit aktuellem Fertigstellungsgrad + Zusatzpositionen der Vorrechnung. */
export function newInvoiceLines(phases: Phase[], last: Invoice | undefined): InvoiceLine[] {
  const phaseLines: InvoiceLine[] = phases.map((ph) => {
    const prev = last?.lines.find((l) => l.phaseId === ph.id);
    return {
      key: `ph${ph.id}`, phaseId: ph.id, label: `${ph.code || ''} ${ph.name}`.trim(), fee: ph.budget || 0,
      percent: Math.max(prev?.percent || 0, Math.round(ph.progress || 0)),
    };
  });
  const extras = (last?.lines || []).filter((l) => !l.phaseId).map((l) => ({ ...l }));
  return [...phaseLines, ...extras];
}

export interface BillingStatus {
  billedPerformance: number; // abgerechnete Leistung (ohne Nebenkosten)
  billedNet: number; // Summe Rechnungsbeträge netto
  openGross: number; // gestellte, unbezahlte Rechnungen (brutto)
  overdue: number; // Anzahl überfälliger Rechnungen
  paid: number;
  earned: number; // erbrachte Leistung = Σ Phasenhonorar × Fertigstellung
  unbilled: number; // erbracht, aber noch nicht abgerechnet
  last?: Invoice;
}

export function billingStatus(project: Project, idx: Index, today = todayISO()): BillingStatus {
  const invoices = activeInvoices(idx.invoicesByProject.get(project.id) || []).filter((i) => i.status !== 'entwurf');
  const last = invoices[invoices.length - 1];
  const phases = idx.phasesByProject.get(project.id) || [];
  const earned = sum(phases, (ph) => (ph.budget || 0) * ((ph.progress || 0) / 100));
  const billedPerformance = last?.performance || 0;
  return {
    billedPerformance,
    billedNet: sum(invoices, (i) => i.net),
    openGross: sum(invoices.filter((i) => i.status === 'gestellt'), (i) => i.gross - (i.paidAmount || 0)),
    overdue: invoices.filter((i) => i.status === 'gestellt' && i.dueDate && i.dueDate < today).length,
    paid: sum(invoices, (i) => i.paidAmount || 0),
    earned,
    unbilled: Math.max(0, earned - billedPerformance),
    last,
  };
}

export const INVOICE_STATUS_LABEL: Record<Invoice['status'], string> = { entwurf: 'Entwurf', gestellt: 'Gestellt', bezahlt: 'Bezahlt', storniert: 'Storniert' };
