// Beispieldaten: Angebote mit Positionen, daraus abgeleitete Arbeitspakete und zugeordnete Zeiten.
import { list, insert, update } from './core.js';
import { computeOffer } from './offers.js';

const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const round = (n, step) => Math.round(n / step) * step;

export function seedOffers(db, { today, rand }) {
  const projects = list(db, 'projects');
  const settings = { nkPct: 5, vatPct: 19 };
  const perYear = new Map();
  const no = (date) => { const y = date.slice(0, 4); perYear.set(y, (perYear.get(y) || 0) + 1); return `AN-${y}-${String(perYear.get(y)).padStart(3, '0')}`; };
  const intro = 'Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage. Für die nachfolgend beschriebenen Ingenieurleistungen unterbreiten wir Ihnen folgendes Angebot:';
  const closing = 'Die Abrechnung erfolgt nach Leistungsfortschritt durch Abschlagsrechnungen. Es gelten die Regelungen der HOAI in der jeweils gültigen Fassung.\n\nMit freundlichen Grüßen';

  const fromPhases = (project) => list(db, 'phases', { projectId: project.id }).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((ph, i) => ({
    key: `p${i + 1}`, title: `${ph.code} ${ph.name}`.trim(), description: 'Grundleistungen gemäß HOAI, Leistungsbild Ingenieurbauwerke', phaseCode: ph.code || '',
    mode: 'pauschal', hours: ph.plannedHours || 0, rate: 0, amount: ph.budget || 0, optional: false, _phase: ph,
  }));

  // 1) beauftragte Angebote für laufende Projekte – mit Arbeitspaketen und zugeordneten Zeiten
  const running = projects.filter((p) => p.status === 'In Bearbeitung').slice(0, 3);
  for (const project of running) {
    const positions = fromPhases(project);
    if (!positions.length) continue;
    positions.push({ key: 'bl1', title: 'Besondere Leistung: Bestandsaufnahme und Vermessung vor Ort', description: 'Abrechnung nach Aufwand, Obergrenze laut Angebot', phaseCode: '', mode: 'aufwand', hours: 60, rate: 115, amount: 0, optional: false });
    positions.push({ key: 'opt1', title: 'Bedarfsposition: Teilnahme an zusätzlichen Abstimmungsterminen', description: 'je Termin inkl. Vor- und Nachbereitung', phaseCode: '', mode: 'aufwand', hours: 8, rate: 135, amount: 0, optional: true });
    const date = addDays(project.startDate || today, -35);
    const base = { projectId: project.id, title: `Ingenieurleistungen ${project.name}`, recipient: `${project.client || ''}\n${project.location || ''}`.trim(), contact: '', date, validUntil: addDays(date, 60), intro, closing, positions: positions.map(({ _phase, ...p }) => p), nkPct: settings.nkPct, discountPct: 0, vatPct: settings.vatPct, revision: 0, note: '', createdBy: project.leadId };
    const offer = insert(db, 'offers', { ...base, ...computeOffer(base), status: 'beauftragt', offerNo: no(date), sentAt: date, decidedAt: addDays(date, 21) });

    let n = 0;
    const entries = list(db, 'timeEntries', { projectId: project.id });
    for (const pos of positions) {
      if (pos.optional) continue;
      const ph = pos._phase;
      // größere Leistungsphasen in zwei Arbeitspakete teilen
      const parts = ph && (ph.budget || 0) > 60000 ? [['Berechnung und Nachweise', 0.55], ['Planunterlagen und Dokumentation', 0.45]] : [[null, 1]];
      const created = parts.map(([suffix, share]) => {
        n += 1;
        const progress = ph ? Math.max(0, Math.min(100, round((ph.progress || 0) + (suffix ? (rand() - 0.5) * 16 : 0), 5))) : pos.key === 'bl1' ? 40 : 0;
        return insert(db, 'workPackages', {
          projectId: project.id, offerId: offer.id, positionKey: pos.key, code: `AP ${n}`, title: suffix ? `${pos.title} – ${suffix}` : pos.title,
          description: '', phaseId: ph?.id ?? null, responsibleId: project.leadId, plannedHours: round((pos.hours || 0) * share, 1), budget: Math.round((pos.mode === 'aufwand' ? pos.hours * pos.rate : pos.amount) * share),
          startDate: ph?.startDate ?? null, endDate: ph?.endDate ?? null, status: progress >= 100 ? 'abgeschlossen' : progress > 0 ? 'aktiv' : 'geplant', progress, sort: n,
        });
      });
      // gebuchte Stunden der Leistungsphase den Arbeitspaketen zuordnen
      if (ph) entries.filter((e) => e.phaseId === ph.id).forEach((e, i) => update(db, 'timeEntries', e.id, { workPackageId: created[created.length > 1 && i % 9 >= 5 ? 1 : 0].id }));
    }
  }

  // 2) offene und abgelehnte Angebote (Akquise)
  const akquise = projects.filter((p) => p.status === 'Akquise');
  for (const project of akquise) {
    const positions = fromPhases(project).map(({ _phase, ...p }) => p);
    const date = addDays(today, -12);
    const base = { projectId: project.id, title: `Ingenieurleistungen ${project.name}`, recipient: `${project.client || ''}\n${project.location || ''}`.trim(), contact: '', date, validUntil: addDays(date, 60), intro, closing,
      positions: positions.length ? positions : [{ key: 'p1', title: 'Objektplanung LPH 1–3', description: '', phaseCode: '', mode: 'pauschal', hours: 420, rate: 0, amount: 48000, optional: false }],
      nkPct: settings.nkPct, discountPct: 0, vatPct: settings.vatPct, revision: 0, note: '', createdBy: project.leadId };
    insert(db, 'offers', { ...base, ...computeOffer(base), status: 'versendet', offerNo: no(date), sentAt: date, decidedAt: null });
  }
  const other = projects.filter((p) => p.status === 'In Bearbeitung').slice(3, 5);
  other.forEach((project, i) => {
    const date = addDays(today, -80 - i * 40);
    const base = { projectId: project.id, title: i ? 'Nachtrag: Erweiterte Zustandsbewertung Antriebstechnik' : 'Nachtrag: Variantenuntersuchung Korrosionsschutz', recipient: project.client || '', contact: '', date, validUntil: addDays(date, 45), intro, closing,
      positions: [{ key: 'p1', title: i ? 'Zustandsbewertung Antriebe und Lager' : 'Variantenuntersuchung Korrosionsschutzsysteme', description: 'Abrechnung nach Aufwand', phaseCode: '', mode: 'aufwand', hours: 90 + i * 40, rate: 115, amount: 0, optional: false }],
      nkPct: settings.nkPct, discountPct: 0, vatPct: settings.vatPct, revision: 0, note: i ? 'Auftraggeber vergibt die Leistung intern.' : '', createdBy: project.leadId };
    insert(db, 'offers', { ...base, ...computeOffer(base), status: i ? 'abgelehnt' : 'versendet', offerNo: no(date), sentAt: date, decidedAt: i ? addDays(date, 30) : null });
  });
}
