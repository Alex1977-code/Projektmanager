// Demodaten für ein Ingenieurbüro (Stahlwasserbau & bewegliche Brücken, 25 Mitarbeitende).
// Alle Termine werden relativ zum aktuellen Datum erzeugt, damit die Demo immer "lebt".
// Alle Namen von Personen, Auftraggebern und Bauwerken sind frei erfunden.
import { insert, list, transaction, setSettings } from './core.js';
import { seedProtocols } from './seedProtocols.js';
import { availability, buildAbsences, seedInvoices, seedWorktimes } from './seedExtra.js';
import { DEFAULT_ROLES } from '../shared/permissions.js';

// ---------------------------------------------------------------- Hilfsfunktionen
function mulberry32(seed) {
  return function rand() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const parse = (s) => Date.parse(s + 'T00:00:00Z');
const addDays = (s, n) => iso(parse(s) + n * DAY);
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
function mondayOf(s) {
  const d = new Date(parse(s));
  const dow = (d.getUTCDay() + 6) % 7;
  return iso(parse(s) - dow * DAY);
}
const round = (n, step) => Math.round(n / step) * step;

// HOAI § 47 Ingenieurbauwerke – Leistungsphasen und Bewertung
const HOAI = [
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

// ---------------------------------------------------------------- Mitarbeitende
const COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#059669', '#4f46e5', '#0d9488', '#b45309', '#be123c'];

const EMPLOYEES = [
  ['Thomas Berger', 'TB', 'Dr.-Ing.', 'Geschäftsführer', 'Geschäftsführung', 150, 40, ['gf', 'pl'], ['Stahlwasserbau', 'Prüfingenieur', 'DIN 19704']],
  ['Sabine Hartmann', 'SH', 'Dipl.-Ing.', 'Projektleiterin', 'Stahlwasserbau', 128, 40, ['pl'], ['Schleusentore', 'Wehrverschlüsse', 'Projektsteuerung']],
  ['Michael Krüger', 'MK', 'Dipl.-Ing.', 'Projektleiter', 'Bewegliche Brücken', 128, 40, ['pl'], ['Klappbrücken', 'Hubbrücken', 'DIN 1076']],
  ['Julia Neumann', 'JN', 'M.Sc.', 'Projektleiterin', 'Bewegliche Brücken', 118, 38, ['pl'], ['Brückenbau', 'Variantenstudien', 'BIM-Koordination']],
  ['Frank Wagner', 'FW', 'Dipl.-Ing.', 'Projektleiter', 'Maschinen- & E-Technik', 122, 40, ['pl'], ['Antriebstechnik', 'Hydraulik', 'Inbetriebnahme']],
  ['Katrin Schulz', 'KS', 'Dr.-Ing.', 'Tragwerksplanerin', 'Stahlwasserbau', 118, 40, ['statik'], ['FEM (ANSYS/RFEM)', 'Ermüdung', 'DIN EN 1993']],
  ['Lukas Becker', 'LB', 'M.Sc.', 'Tragwerksplaner', 'Stahlwasserbau', 98, 40, ['statik'], ['Stahlbau', 'RFEM', 'Schweißnahtnachweise']],
  ['Anna Hoffmann', 'AH', 'M.Sc.', 'Tragwerksplanerin', 'Bewegliche Brücken', 98, 40, ['statik'], ['Brückenstatik', 'SOFiSTiK', 'Lager & Fugen']],
  ['Jonas Richter', 'JR', 'B.Eng.', 'Tragwerksplaner', 'Bewegliche Brücken', 88, 40, ['statik'], ['Stahlbau', 'Bemessung', 'Dynamik']],
  ['Peter Klein', 'PK', 'Dipl.-Ing.', 'Maschinenbauingenieur', 'Maschinen- & E-Technik', 108, 40, ['mb'], ['Hydraulikzylinder', 'Getriebe', 'DIN 19704-2']],
  ['Lea Wolf', 'LW', 'M.Sc.', 'Maschinenbauingenieurin', 'Maschinen- & E-Technik', 92, 40, ['mb'], ['Antriebsauslegung', 'Seilwinden', 'Inventor']],
  ['Stefan Schröder', 'SS', 'Dipl.-Ing.', 'Elektroingenieur', 'Maschinen- & E-Technik', 108, 40, ['et'], ['SPS (S7)', 'Funktionale Sicherheit', 'EN ISO 13849']],
  ['Tim Zimmermann', 'TZ', 'B.Eng.', 'Elektroingenieur', 'Maschinen- & E-Technik', 88, 40, ['et'], ['EPLAN', 'Schaltanlagen', 'Fernwirktechnik']],
  ['Markus Braun', 'MB', '', 'Konstrukteur', 'Konstruktion & CAD', 82, 40, ['cad'], ['Tekla Structures', 'Stahlbauzeichnungen']],
  ['Nicole Krause', 'NK', '', 'Technische Zeichnerin', 'Konstruktion & CAD', 72, 32, ['cad'], ['AutoCAD', 'Bestandspläne']],
  ['Daniel Lange', 'DL', '', 'Konstrukteur', 'Konstruktion & CAD', 78, 40, ['cad'], ['Tekla Structures', 'Revit']],
  ['Sandra Meier', 'SM', '', 'Technische Systemplanerin', 'Konstruktion & CAD', 72, 40, ['cad'], ['Allplan', 'Bewehrungspläne']],
  ['Ralf Schmitt', 'RS', 'Dipl.-Ing.', 'Bauüberwacher', 'Bauüberwachung', 102, 40, ['bu'], ['Bauoberleitung', 'Stahlwasserbau-Montage', 'SiGeKo']],
  ['Kevin Fischer', 'KF', 'B.Eng.', 'Bauüberwacher', 'Bauüberwachung', 86, 40, ['bu'], ['Bauwerksprüfung DIN 1076', 'Aufmaß']],
  ['Sophie Weber', 'SW', 'M.Sc.', 'Schweißfachingenieurin', 'Stahlwasserbau', 96, 40, ['kors'], ['Korrosionsschutz ZTV-W LB 218', 'Schweißaufsicht']],
  ['Felix Hahn', 'FH', 'M.Sc.', 'Wasserbauingenieur', 'Stahlwasserbau', 96, 40, ['hyd'], ['Hydraulische Berechnungen', 'Füllsysteme', 'CFD']],
  ['Andrea Vogel', 'AV', 'Dipl.-Ing.', 'Ausschreibung & Vergabe', 'Projektsteuerung', 96, 36, ['ava'], ['VOB/A', 'AVA (California)', 'Kostenermittlung']],
  ['Christian Koch', 'CK', '', 'Maschinenbaukonstrukteur', 'Konstruktion & CAD', 78, 40, ['mb', 'cad'], ['Inventor', 'Maschinenbauzeichnungen']],
  ['Laura Schäfer', 'LS', '', 'Werkstudentin Statik', 'Stahlwasserbau', 45, 20, ['statik'], ['RFEM', 'Python']],
  ['Petra Jung', 'PJ', '', 'Projektassistenz & Controlling', 'Projektsteuerung', 62, 30, ['office'], ['Controlling', 'Rechnungsstellung']],
];

// ---------------------------------------------------------------- Projekte
// Indizes beziehen sich auf EMPLOYEES. Wochenangaben relativ zur aktuellen Woche.
const PROJECTS = [
  {
    number: 'P-2025-012', name: 'Schleuse Nordhafen – Ersatzneubau Stemmtore Unterhaupt', client: 'WSA Nordkanal',
    type: 'Schleuse', location: 'Nordhafen', lead: 1, status: 'In Bearbeitung', priority: 'hoch',
    start: -62, end: 44, phases: [0, 1, 2, 3, 4, 5, 6, 7], budget: 1240000, overrun: 1.07,
    team: [1, 5, 6, 9, 11, 13, 14, 19, 21, 20], obj: 'Stemmtor',
    description: 'Ersatzneubau der Stemmtore am Unterhaupt inkl. Antriebe, Steuerung und Revisionsverschlüsse. Planung nach DIN 19704, Korrosionsschutz nach ZTV-W LB 218.',
  },
  {
    number: 'P-2025-018', name: 'Klappbrücke Hafenstraße – Instandsetzung Antrieb & Steuerung', client: 'Hafengesellschaft Seestadt mbH',
    type: 'Klappbrücke', location: 'Seestadt', lead: 2, status: 'In Bearbeitung', priority: 'hoch',
    start: -34, end: 30, phases: [1, 2, 4, 5, 6, 7], budget: 485000, overrun: 1.36,
    team: [2, 7, 9, 10, 11, 12, 15, 17], obj: 'Brückenklappe',
    description: 'Erneuerung des hydraulischen Klappenantriebs, Austausch der Steuerung (SPS) und Instandsetzung der Verriegelungen bei laufendem Hafenbetrieb.',
  },
  {
    number: 'P-2026-003', name: 'Hubbrücke Lindenau – Neubau Kanalquerung', client: 'Stadt Lindenau, Tiefbauamt',
    type: 'Hubbrücke', location: 'Lindenau', lead: 3, status: 'In Bearbeitung', priority: 'mittel',
    start: -22, end: 74, phases: [0, 1, 2, 3, 4, 5, 6], budget: 960000, overrun: 0.94,
    team: [3, 5, 8, 10, 12, 13, 16, 20, 21, 23], obj: 'Hubüberbau',
    description: 'Neubau einer Hubbrücke (Spannweite 42 m) mit Seilwindenantrieb und Gegengewichten über den Lindenauer Kanal.',
  },
  {
    number: 'P-2026-005', name: 'Wehr Steinfurt – Erneuerung Segmentverschlüsse', client: 'WSA Oberstrom',
    type: 'Wehr', location: 'Steinfurt', lead: 1, status: 'In Bearbeitung', priority: 'mittel',
    start: -44, end: 26, phases: [2, 4, 5, 6, 7], budget: 720000, overrun: 1.0,
    team: [1, 6, 7, 22, 9, 11, 14, 19, 17, 18], obj: 'Segmentverschluss',
    description: 'Erneuerung von drei Segmentverschlüssen mit aufgesetzten Fischbauchklappen einschließlich Hydraulikantrieben.',
  },
  {
    number: 'P-2026-009', name: 'Sturmflutsperrwerk Marschtief – Sanierung Hubtor', client: 'Landesbetrieb Küstenschutz Nord',
    type: 'Sperrwerk', location: 'Marschtief', lead: 4, status: 'In Bearbeitung', priority: 'hoch',
    start: -13, end: 52, phases: [0, 1, 2, 3, 4], budget: 540000, overrun: 1.13,
    team: [4, 5, 8, 9, 22, 12, 15, 19, 20], obj: 'Hubtor',
    description: 'Sanierung des Hubtors inkl. Dichtungen, Führungen und Korrosionsschutz; Variantenuntersuchung Ersatz der Seilantriebe.',
  },
  {
    number: 'P-2026-011', name: 'Drehbrücke Alter Hafen – Bauwerksprüfung & Instandsetzungskonzept', client: 'Stadtwerke Seestadt',
    type: 'Drehbrücke', location: 'Seestadt', lead: 2, status: 'In Bearbeitung', priority: 'niedrig',
    start: -6, end: 9, phases: [0, 1, 2], budget: 86000, overrun: 1.0,
    team: [2, 18, 7, 10, 16], obj: 'Drehüberbau',
    description: 'Hauptprüfung nach DIN 1076 einschließlich maschinen- und elektrotechnischer Anlagen, Schadensbewertung und Instandsetzungskonzept.',
  },
  {
    number: 'P-2026-014', name: 'Schleuse Bergheim – Hubtor Oberhaupt (Ausführungsplanung)', client: 'WSA Nordkanal',
    type: 'Schleuse', location: 'Bergheim', lead: 4, status: 'In Bearbeitung', priority: 'mittel',
    start: -9, end: 36, phases: [4, 5, 6], budget: 380000, overrun: 0.9,
    team: [4, 6, 8, 22, 10, 12, 13, 14, 21], obj: 'Hubtor',
    description: 'Ausführungsplanung und Ausschreibung des Hubtors am Oberhaupt einschließlich Hubwerk und Steuerung.',
  },
  {
    number: 'P-2026-017', name: 'Rollklappbrücke Werftkanal – Machbarkeitsstudie', client: 'Werft- und Hafenentwicklung GmbH',
    type: 'Klappbrücke', location: 'Werfthafen', lead: 3, status: 'Beauftragt', priority: 'mittel',
    start: 2, end: 15, phases: [0, 1], budget: 64000, overrun: 1.0,
    team: [3, 23, 15, 20], obj: 'Rollklappe',
    description: 'Machbarkeitsstudie mit Variantenvergleich (Rollklappe / Hubbrücke) inkl. Kostenschätzung und Terminrahmen.',
  },
  {
    number: 'P-2024-021', name: 'Schleuse Kesselbrück – Revisionsverschlüsse', client: 'WSA Oberstrom',
    type: 'Schleuse', location: 'Kesselbrück', lead: 1, status: 'Abgeschlossen', priority: 'niedrig',
    start: -92, end: -8, phases: [2, 4, 5, 6, 7], budget: 310000, overrun: 0.97,
    team: [1, 7, 22, 14, 17], obj: 'Revisionsverschluss',
    description: 'Planung und Bauoberleitung für Dammtafeln und Revisionsverschlüsse am Ober- und Unterhaupt.',
  },
  {
    number: 'P-2027-001', name: 'Hubtorschleuse Ostkanal – Objektplanung LPH 1–4', client: 'Neubauamt Ostkanal',
    type: 'Schleuse', location: 'Ostkanal', lead: 0, status: 'Akquise', priority: 'hoch',
    start: 10, end: 104, phases: [0, 1, 2, 3], budget: 1100000, overrun: 1.0,
    team: [0, 1], obj: 'Hubtor',
    description: 'Angebotsphase: Objekt- und Tragwerksplanung für eine neue Schleuse mit Hubtoren. Angebotsabgabe in 3 Wochen.',
  },
  {
    number: 'P-2026-020', name: 'Hubbrücke Mühlenkanal – Steuerungsertüchtigung', client: 'Kreis Marschland',
    type: 'Hubbrücke', location: 'Mühlenkanal', lead: 2, status: 'In Bearbeitung', priority: 'mittel',
    start: -17, end: 21, phases: [2, 4, 5, 6, 7], budget: 210000, overrun: 1.16,
    team: [2, 11, 12, 16, 18], obj: 'Hubüberbau',
    description: 'Ertüchtigung der Steuerung nach EN ISO 13849, Fernbedienung aus der Leitzentrale, Videoüberwachung.',
  },
];

// Aufgabenvorlagen je Leistungsphase: [Titel, Rolle, Stunden]
const TASKS = {
  0: [['Bestandsunterlagen sichten und auswerten', 'pl', 24], ['Ortsbesichtigung mit Fotodokumentation', 'pl', 12], ['Bestandsaufmaß Stahlbau koordinieren', 'cad', 16]],
  1: [['Variantenuntersuchung {obj}', 'pl', 40], ['Vorbemessung Stahltragwerk', 'statik', 48], ['Antriebskonzept hydraulisch / elektromechanisch', 'mb', 32], ['Kostenschätzung erstellen', 'pl', 16]],
  2: [['Lastannahmen nach DIN 19704 / DIN EN 1991', 'statik', 24], ['Statische Berechnung {obj} (FEM)', 'statik', 120], ['Ermüdungsnachweise DIN EN 1993-1-9', 'statik', 56], ['Entwurfszeichnungen {obj}', 'cad', 80], ['Dimensionierung Antrieb und Lagerung', 'mb', 60], ['Steuerungs- und Sicherheitskonzept', 'et', 40], ['Korrosionsschutzkonzept', 'kors', 24], ['Kostenberechnung', 'pl', 24]],
  3: [['Genehmigungsunterlagen zusammenstellen', 'pl', 32], ['Abstimmung mit Genehmigungsbehörde', 'pl', 12]],
  4: [['Ausführungsstatik {obj}', 'statik', 140], ['Ausführungszeichnungen Stahlbau', 'cad', 160], ['Maschinenbau-Ausführungsplanung Antrieb', 'mb', 100], ['E-Technik: Schaltpläne und SPS-Spezifikation', 'et', 90], ['Hydraulikschema und Zylinderauslegung', 'mb', 40], ['Prüfbemerkungen Prüfingenieur einarbeiten', 'statik', 32]],
  5: [['Leistungsverzeichnis Stahl- und Maschinenbau', 'ava', 80], ['LV Elektro- und Steuerungstechnik', 'et', 40], ['Technische Vorbemerkungen / ZTV-W-Bezüge', 'ava', 24]],
  6: [['Angebotsprüfung und Preisspiegel', 'ava', 40], ['Vergabevorschlag erstellen', 'pl', 12]],
  7: [['Werkstattzeichnungen prüfen und freigeben', 'statik', 60], ['Werksabnahme Antriebsaggregat', 'mb', 24], ['Montageüberwachung Baustelle', 'bu', 120], ['Korrosionsschutz-Abnahme', 'kors', 24], ['Inbetriebnahme und Funktionsprüfung', 'et', 40], ['Bautagebuch und Aufmaßprüfung', 'bu', 48]],
  8: [['Mängelbegehung vor Ablauf der Gewährleistung', 'bu', 12], ['Bestandsdokumentation übergeben', 'cad', 16]],
};

const COST_TEMPLATES = [
  ['Fremdleistung', 'Baugrund- und Bestandsgutachten', 18000, 0.15],
  ['Prüfingenieur', 'Prüfung der Standsicherheitsnachweise', 24000, 0.55],
  ['Vermessung', 'Bestandsvermessung (Vermessungsbüro)', 9500, 0.08],
  ['Reisekosten', 'Baustellen- und Abstimmungstermine', 3200, 0.5],
  ['Prüfung & Versuche', 'Werkstoffprüfung / Schichtdickenmessung', 4800, 0.8],
];

const PROJECT_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#ea580c', '#db2777', '#4f46e5', '#0d9488', '#64748b', '#b45309', '#be123c'];

// ---------------------------------------------------------------- Generator
export function seed(db, todayIso = new Date().toISOString().slice(0, 10)) {
  const rand = mulberry32(20261109);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const thisMonday = mondayOf(todayIso);

  transaction(db, () => {
    setSettings(db, { companyName: 'Ingenieurbüro Stahlwasserbau & Bewegliche Brücken' });
    DEFAULT_ROLES.forEach((r, i) => insert(db, 'roles', { ...r, sort: i }));

    const emps = EMPLOYEES.map((e, i) => {
      const [name, short, title, role, department, hourlyRate, weeklyHours, keys, skills] = e;
      const email = name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(' ', '.') + '@ib-beispiel.de';
      const row = insert(db, 'employees', {
        name, short, title, role, department, hourlyRate, weeklyHours, skills, email,
        phone: `+49 421 55 60-${String(100 + i * 3)}`, color: COLORS[i % COLORS.length], active: true,
        login: email.split('@')[0].replace(/^(\w)\w*\./, '$1.'),
        appRole: i === 0 ? 'admin' : keys.includes('pl') ? 'leitung' : keys.includes('office') ? 'controlling' : name === 'Laura Schäfer' ? 'extern' : 'mitarbeiter',
        vacationDays: weeklyHours >= 30 ? 30 : 15,
        personnelNo: String(1001 + i),
      });
      return { ...row, keys };
    });

    // Abwesenheiten (eigener Zufallsgenerator, damit die übrigen Demodaten stabil bleiben)
    const absences = buildAbsences(todayIso, mulberry32(4711), EMPLOYEES.length);
    for (const a of absences) {
      insert(db, 'absences', {
        employeeId: a.emp === null ? null : emps[a.emp].id, type: a.type, startDate: a.start, endDate: a.end,
        halfDay: !!a.halfDay, status: a.status, note: a.note, createdBy: a.emp === null ? emps[0].id : emps[a.emp].id,
        decidedBy: a.status === 'genehmigt' ? emps[0].id : null,
      });
    }
    const invoiceProjects = [];

    const memberFor = (team, key, leadIdx) => {
      const cands = team.filter((i) => EMPLOYEES[i][7].includes(key));
      return emps[cands.length ? pick(cands) : leadIdx].id;
    };

    // Wochenauslastung je Mitarbeiter sammeln, um realistische Planungen zu erzeugen
    const projectWeeks = []; // {pIdx, weekStart, team}
    const byNumber = new Map();

    PROJECTS.forEach((p, pIdx) => {
      const startDate = addDays(thisMonday, p.start * 7);
      const endDate = addDays(thisMonday, p.end * 7 - 3);
      const project = insert(db, 'projects', {
        number: p.number, name: p.name, client: p.client, type: p.type, location: p.location,
        leadId: emps[p.lead].id, status: p.status, priority: p.priority, startDate, endDate,
        budget: p.budget, description: p.description, color: PROJECT_COLORS[pIdx % PROJECT_COLORS.length],
        extNo: p.number.replace('P-', '').replace('-', ''),
      });
      byNumber.set(p.number, { project, team: p.team });

      // Leistungsphasen über die Projektlaufzeit verteilen (mit leichter Überlappung)
      const total = diffDays(startDate, endDate);
      const wsum = p.phases.reduce((s, i) => s + HOAI[i].weight, 0);
      const ssum = p.phases.reduce((s, i) => s + HOAI[i].share, 0);
      let cursor = 0;
      const phases = p.phases.map((hi, k) => {
        const h = HOAI[hi];
        const len = Math.max(7, Math.round((total * h.weight) / wsum));
        const s = addDays(startDate, Math.max(0, cursor - (k > 0 ? 7 : 0)));
        const e = k === p.phases.length - 1 ? endDate : addDays(startDate, cursor + len);
        cursor += len;
        const budget = round((p.budget * h.share) / ssum, 100);
        let progress;
        if (p.status === 'Abgeschlossen') progress = 100;
        else if (p.status === 'Akquise' || s > todayIso) progress = 0;
        else if (e < todayIso) progress = 100;
        else {
          const f = diffDays(s, todayIso) / Math.max(1, diffDays(s, e));
          progress = Math.max(5, Math.min(95, round(f * 100 * (0.85 + rand() * 0.25), 5)));
        }
        const phase = insert(db, 'phases', {
          projectId: project.id, code: h.code, name: h.name, startDate: s, endDate: e,
          budget, plannedHours: round((budget * 0.8) / 98, 10), progress, sort: k,
        });
        return { ...phase, hi };
      });
      invoiceProjects.push({ project, phases });

      // Meilensteine
      const ms = [['Auftragserteilung', startDate]];
      for (const ph of phases) {
        if (ph.hi === 2) ms.push(['Abgabe Entwurfsplanung', ph.endDate]);
        if (ph.hi === 3) ms.push(['Einreichung Genehmigung', ph.endDate]);
        if (ph.hi === 4) ms.push(['Freigabe Ausführungsplanung', ph.endDate]);
        if (ph.hi === 6) ms.push(['Zuschlagserteilung', ph.endDate]);
        if (ph.hi === 7) { ms.push(['Baubeginn Montage', addDays(ph.startDate, 21)]); ms.push(['Abnahme', ph.endDate]); }
        if (ph.hi === 1 && p.phases.length <= 2) ms.push(['Abschlussbericht Studie', ph.endDate]);
      }
      if (p.status === 'Akquise') ms.splice(0, ms.length, ['Angebotsabgabe', addDays(thisMonday, 18)], ['Bietergespräch', addDays(thisMonday, 32)]);
      for (const [name, date] of ms) {
        insert(db, 'milestones', { projectId: project.id, name, date, done: date < todayIso && p.status !== 'Akquise' });
      }

      // Aufgaben
      if (p.status !== 'Akquise') {
        for (const ph of phases) {
          const tpl = TASKS[ph.hi];
          const phaseLen = diffDays(ph.startDate, ph.endDate);
          tpl.slice(0, 6).forEach(([title, key, hours], ti) => {
            const offs = Math.round((phaseLen * (ti + 1)) / (tpl.length + 1));
            const dueDate = addDays(ph.startDate, Math.min(phaseLen, offs + 10));
            const startDate2 = addDays(ph.startDate, Math.max(0, offs - Math.round(hours / 6)));
            let status = 'offen';
            if (ph.progress >= 100) status = 'erledigt';
            else if (ph.progress > 0) {
              const r = rand();
              if (dueDate < todayIso) status = r < 0.6 ? 'erledigt' : r < 0.8 ? 'pruefung' : 'in_arbeit';
              else if (startDate2 <= todayIso) status = r < 0.55 ? 'in_arbeit' : r < 0.75 ? 'pruefung' : 'offen';
            }
            insert(db, 'tasks', {
              projectId: project.id, phaseId: ph.id, title: title.replace('{obj}', p.obj),
              description: '', assigneeId: memberFor(p.team, key, p.lead), status,
              priority: hours >= 100 || ti === 0 ? 'hoch' : rand() < 0.3 ? 'niedrig' : 'mittel',
              estimatedHours: hours, startDate: startDate2, dueDate, createdAt: ph.startDate, sort: ti,
            });
          });
        }
      }

      // Fremdkosten
      if (p.status !== 'Akquise') {
        COST_TEMPLATES.forEach(([category, description, amount, at], ci) => {
          if (p.budget < 150000 && ci % 2 === 1) return;
          const date = addDays(startDate, Math.round(total * at));
          const scale = Math.max(0.35, p.budget / 800000);
          const phase = phases.find((ph) => ph.startDate <= date && ph.endDate >= date) || phases[0];
          insert(db, 'costs', {
            projectId: project.id, phaseId: phase.id, date, category, description,
            amount: round(amount * scale, 50), status: date <= todayIso ? 'angefallen' : 'geplant',
          });
        });
      }

      // Ist-Stunden (Zeitbuchungen) je Phase rückwirkend erzeugen
      if (p.status !== 'Akquise') {
        for (const ph of phases) {
          if (ph.progress <= 0) continue;
          const actualHours = ph.plannedHours * (ph.progress / 100) * p.overrun * (0.94 + rand() * 0.12);
          const to = ph.endDate < todayIso ? ph.endDate : addDays(todayIso, -1);
          const weeks = [];
          for (let w = mondayOf(ph.startDate); w <= to; w = addDays(w, 7)) weeks.push(w);
          if (!weeks.length) continue;
          const perWeek = actualHours / weeks.length;
          const members = p.team.filter((i) => !EMPLOYEES[i][7].includes('gf'));
          const weights = members.map((i) => (i === p.lead ? 1.6 : 1));
          const wsum2 = weights.reduce((a, b) => a + b, 0);
          for (const w of weeks) {
            members.forEach((mi, k) => {
              const h = (perWeek * weights[k]) / wsum2;
              if (h < 0.5) return;
              const recent = diffDays(w, todayIso) <= 28;
              if (recent) {
                // Tagesgenau buchen (Mo–Fr, nicht in der Zukunft)
                const days = [0, 1, 2, 3, 4].map((d) => addDays(w, d)).filter((d) => d < todayIso);
                if (!days.length) return;
                const perDay = h / days.length;
                for (const d of days) {
                  const hh = round(perDay * (0.7 + rand() * 0.6), 0.5);
                  if (hh > 0) insert(db, 'timeEntries', { employeeId: emps[mi].id, projectId: project.id, phaseId: ph.id, date: d, hours: hh, note: '' });
                }
              } else {
                insert(db, 'timeEntries', {
                  employeeId: emps[mi].id, projectId: project.id, phaseId: ph.id,
                  date: addDays(w, 4), hours: round(h, 0.5), note: 'Wochenbuchung',
                });
              }
            });
          }
        }
      }

      // aktive Wochen für die Ressourcenplanung merken
      if (!['Abgeschlossen'].includes(p.status)) {
        for (let w = -4; w <= 26; w++) {
          const ws = addDays(thisMonday, w * 7);
          if (ws < mondayOf(startDate) || ws > endDate) continue;
          if (p.status === 'Akquise') continue;
          projectWeeks.push({ projectId: project.id, weekStart: ws, team: p.team, lead: p.lead, w });
        }
      }
    });

    seedProtocols(db, { byNumber, emp: (i) => emps[i].id, today: todayIso });
    seedWorktimes(db, { emps, today: todayIso, rand: mulberry32(2024) });
    seedInvoices(db, { projects: invoiceProjects, today: todayIso, rand: mulberry32(815), authorOf: (pr) => pr.leadId });

    // Ressourcenplanung: Kapazität jedes Mitarbeiters je Woche auf seine Projekte verteilen
    const empWeeks = new Map();
    for (const pw of projectWeeks) {
      for (const mi of pw.team) {
        const key = `${mi}|${pw.weekStart}`;
        if (!empWeeks.has(key)) empWeeks.set(key, { mi, weekStart: pw.weekStart, w: pw.w, projects: [] });
        empWeeks.get(key).projects.push({ projectId: pw.projectId, lead: pw.lead === mi });
      }
    }
    const utilBias = EMPLOYEES.map(() => 0.72 + rand() * 0.38); // einige Personen sind überplant
    for (const { mi, weekStart, w, projects } of empWeeks.values()) {
      const cap = EMPLOYEES[mi][6];
      const horizon = w > 10 ? Math.max(0.35, 1 - (w - 10) * 0.05) : 1; // Planung wird nach hinten dünner
      const target = cap * availability(absences, mi, weekStart) * utilBias[mi] * horizon * (0.92 + rand() * 0.16) * (EMPLOYEES[mi][7].includes('gf') ? 0.4 : 1);
      const weights = projects.map((p) => (p.lead ? 1.5 : 1));
      const ws = weights.reduce((a, b) => a + b, 0);
      projects.forEach((p, k) => {
        const hours = round((target * weights[k]) / ws, 2);
        if (hours > 0) insert(db, 'allocations', { employeeId: emps[mi].id, projectId: p.projectId, weekStart, hours });
      });
    }
  });
}

export function seedIfEmpty(db) {
  if (list(db, 'employees').length === 0) {
    seed(db);
    console.log('Demodaten wurden angelegt.');
  }
}

/** Standardrollen nachrüsten (bestehende Datenbanken aus älteren Versionen). */
export function ensureDefaults(db) {
  if (list(db, 'roles').length === 0) {
    DEFAULT_ROLES.forEach((r, i) => insert(db, 'roles', { ...r, sort: i }));
    return true;
  }
  return false;
}
