import { addDays, diffDays } from './date';

/** Leistungsphasen nach HOAI (Ingenieurbauwerke) mit Bewertung in % und Gewichtung für die Dauer. */
export const HOAI_PHASES = [
  { code: 'LPH 1', name: 'Grundlagenermittlung', share: 2, weight: 2 },
  { code: 'LPH 2', name: 'Vorplanung', share: 20, weight: 6 },
  { code: 'LPH 3', name: 'Entwurfsplanung', share: 25, weight: 9 },
  { code: 'LPH 4', name: 'Genehmigungsplanung', share: 5, weight: 4 },
  { code: 'LPH 5', name: 'Ausführungsplanung', share: 15, weight: 10 },
  { code: 'LPH 6', name: 'Vorbereitung der Vergabe', share: 13, weight: 4 },
  { code: 'LPH 7', name: 'Mitwirkung bei der Vergabe', share: 4, weight: 3 },
  { code: 'LPH 8', name: 'Bauoberleitung', share: 15, weight: 18 },
  { code: 'LPH 9', name: 'Objektbetreuung', share: 1, weight: 3 },
];

/** Verteilt die gewählten Leistungsphasen über den Projektzeitraum und das Honorar. */
export function planPhases(selected: number[], startDate: string, endDate: string, budget: number, avgRate = 98) {
  const sel = [...selected].sort((a, b) => a - b);
  const total = Math.max(7, diffDays(startDate, endDate));
  const wsum = sel.reduce((s, i) => s + HOAI_PHASES[i].weight, 0) || 1;
  const ssum = sel.reduce((s, i) => s + HOAI_PHASES[i].share, 0) || 1;
  let cursor = 0;
  return sel.map((i, k) => {
    const h = HOAI_PHASES[i];
    const len = Math.max(5, Math.round((total * h.weight) / wsum));
    const s = addDays(startDate, cursor);
    const e = k === sel.length - 1 ? endDate : addDays(startDate, Math.min(total, cursor + len - 1));
    cursor += len;
    const phaseBudget = Math.round((budget * h.share) / ssum / 100) * 100;
    return {
      code: h.code, name: h.name, startDate: s, endDate: e < s ? s : e, budget: phaseBudget,
      plannedHours: Math.round((phaseBudget * 0.8) / avgRate / 10) * 10, progress: 0, sort: k,
    };
  });
}
