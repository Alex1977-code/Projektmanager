// Angebotssummen (wie server/offers.js) und Hilfen für Angebotspositionen.
import type { Offer, OfferPosition, Phase } from '../types';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computeOffer(o: Pick<Offer, 'positions' | 'nkPct' | 'discountPct' | 'vatPct'>) {
  const positions = (o.positions || []).map((p) => ({ ...p, amount: p.mode === 'aufwand' ? r2((p.hours || 0) * (p.rate || 0)) : r2(p.amount) }));
  const firm = positions.filter((p) => !p.optional);
  const subtotal = r2(firm.reduce((s, p) => s + p.amount, 0));
  const optionalTotal = r2(positions.filter((p) => p.optional).reduce((s, p) => s + p.amount, 0));
  const nk = r2((subtotal * (o.nkPct || 0)) / 100);
  const discount = r2(((subtotal + nk) * (o.discountPct || 0)) / 100);
  const net = r2(subtotal + nk - discount);
  const vat = r2((net * (o.vatPct || 0)) / 100);
  return { positions, subtotal, optionalTotal, nk, discount, net, vat, gross: r2(net + vat), hours: r2(firm.reduce((s, p) => s + (p.hours || 0), 0)) };
}

export const newKey = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const emptyPosition = (): OfferPosition => ({ key: newKey(), title: '', description: '', phaseCode: '', mode: 'pauschal', hours: 0, rate: 0, amount: 0, optional: false });

/** Positionen aus den Leistungsphasen eines Projekts (Honoraranteile und geplante Stunden). */
export function positionsFromPhases(phases: Phase[]): OfferPosition[] {
  return phases.map((ph) => ({
    key: newKey(), title: `${ph.code || ''} ${ph.name}`.trim(), description: 'Grundleistungen gemäß HOAI', phaseCode: ph.code || '',
    mode: 'pauschal', hours: ph.plannedHours || 0, rate: 0, amount: ph.budget || 0, optional: false,
  }));
}

export const offerLabel = (o: Offer) => `${o.offerNo || 'Entwurf'}${o.revision ? ` (Fassung ${o.revision + 1})` : ''}`;
