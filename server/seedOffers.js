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

/** Kreditoren mit Belegen an den Fremdkosten sowie einige interne Nachrichten. */
export function seedAccounting(db, { today }) {
  const KREDITOREN = {
    Fremdleistung: ['Geotechnik Nord GmbH', 'Hafenstraße 12', '27568', 'Bremerhaven'],
    'Prüfingenieur': ['Prüfingenieure Dr. Albers + Partner', 'Wallring 4', '28195', 'Bremen'],
    Vermessung: ['Vermessungsbüro Tiede', 'Deichweg 21', '26919', 'Brake'],
    Reisekosten: ['Reisestelle (Sammelkreditor)', '', '', ''],
    'Prüfung & Versuche': ['Werkstoffprüfung Küste GmbH', 'Am Dock 7', '26382', 'Wilhelmshaven'],
  };
  const ids = new Map();
  Object.entries(KREDITOREN).forEach(([cat, [name, street, zip, city]], i) => {
    ids.set(cat, insert(db, 'contacts', { kind: 'kreditor', number: String(70001 + i), name, street, zip, city, country: 'DE', paymentDays: 30, active: true }).id);
  });
  let n = 0;
  for (const c of list(db, 'costs')) {
    if (c.status !== 'angefallen' || !ids.has(c.category)) continue;
    n += 1;
    // jede sechste Position bleibt unvollständig – Beispiel für die Warnung bei der Übergabe
    update(db, 'costs', c.id, { kreditorId: ids.get(c.category), docNo: n % 6 === 0 ? null : `ER-${String(c.date || today).slice(0, 4)}-${String(1000 + n)}`, vatPct: 19 });
  }
  const emps = list(db, 'employees');
  const at = (d, h) => `${addDays(today, d)}T${String(h).padStart(2, '0')}:15:00.000Z`;
  if (emps.length > 6) {
    const [gf, pl1, pl2, , , ing] = emps;
    const m1 = insert(db, 'messages', { fromId: gf.id, toIds: [pl1.id, pl2.id], subject: 'Angebotsvolumen 4. Quartal', body: 'Bitte schaut euch die offenen Angebote an – bei zweien läuft die Bindefrist bald ab. Können wir bis Freitag nachfassen?', link: '/controlling?tab=angebote', linkLabel: 'Auswertung Angebote', threadId: null, createdAt: at(-2, 9), readBy: [gf.id], hiddenBy: [] });
    insert(db, 'messages', { fromId: pl2.id, toIds: [gf.id, pl1.id], subject: 'Angebotsvolumen 4. Quartal', body: 'Ich übernehme die Hubbrücke und melde mich nach dem Telefonat.', link: null, linkLabel: null, threadId: m1.id, createdAt: at(-2, 11), readBy: [pl2.id, gf.id], hiddenBy: [] });
    insert(db, 'messages', { fromId: ing.id, toIds: [pl1.id], subject: 'Stunden LPH 3 fast aufgebraucht', body: 'Die Planstunden im Arbeitspaket Berechnung sind zu 95 % verbraucht, es fehlen aber noch die Nachweise für die Riegel. Wie gehen wir vor?', link: '/controlling?tab=arbeitspakete', linkLabel: 'Nachkalkulation', threadId: null, createdAt: at(-1, 14), readBy: [ing.id], hiddenBy: [] });
    insert(db, 'messages', { fromId: pl1.id, toIds: [ing.id], subject: 'Prüfbericht Statik', body: 'Der Prüfbericht liegt im Projektordner. Danke für die schnelle Zuarbeit!', link: null, linkLabel: null, threadId: null, createdAt: at(-5, 16), readBy: [pl1.id, ing.id], hiddenBy: [] });
  }
}
