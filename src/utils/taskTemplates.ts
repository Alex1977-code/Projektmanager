// Aufgabenvorlagen für Ingenieurbüros im Stahlwasserbau und bei beweglichen Brücken.
// Grundlage: Leistungsbild Ingenieurbauwerke (HOAI § 43, Anlage 12) – fachlich konkretisiert
// für Verschlüsse, Antriebe und Steuerungen – sowie typische Besondere Leistungen.
import type { Employee, ID, Phase, Priority, Project, Task } from '../types';
import { addDays, diffDays } from './date';

export type RoleKey = 'pl' | 'statik' | 'mb' | 'et' | 'cad' | 'ava' | 'bu' | 'kors' | 'hyd';
export type Scope = 'swb' | 'bruecke';

export const ROLE_LABEL: Record<RoleKey, string> = {
  pl: 'Projektleitung', statik: 'Tragwerksplanung', mb: 'Maschinenbau', et: 'E-Technik', cad: 'Konstruktion/CAD',
  ava: 'AVA', bu: 'Bauüberwachung', kors: 'Korrosionsschutz/Schweißtechnik', hyd: 'Wasserbau/Hydraulik',
};

export interface TaskTemplate {
  title: string;
  role: RoleKey;
  hours: number;
  /** Lage des Beginns innerhalb des Zeitfensters (0 = Anfang, 1 = Ende) */
  at: number;
  /** G = Grundleistung, B = Besondere Leistung */
  kind: 'G' | 'B';
  scope?: Scope;
  prio?: Priority;
  note?: string;
}

export interface TemplateGroup {
  key: string;
  /** Leistungsphasen-Kürzel, dem die Gruppe zugeordnet wird (nur bei Phasen-Vorlagen) */
  code?: string;
  title: string;
  items: TaskTemplate[];
}

export interface TemplateSet {
  id: string;
  name: string;
  short: string;
  description: string;
  /** byPhase: Gruppen werden den gleichnamigen Leistungsphasen zugeordnet; window: ein gemeinsames Zeitfenster */
  mode: 'byPhase' | 'window';
  defaultPhase?: { code: string; name: string };
  groups: TemplateGroup[];
}

const g = (title: string, role: RoleKey, hours: number, at: number, extra: Partial<TaskTemplate> = {}): TaskTemplate => ({ title, role, hours, at, kind: 'G', ...extra });
const b = (title: string, role: RoleKey, hours: number, at: number, extra: Partial<TaskTemplate> = {}): TaskTemplate => ({ title, role, hours, at, kind: 'B', ...extra });

// ============================================================================ HOAI LPH 1–9
const HOAI: TemplateSet = {
  id: 'hoai',
  name: 'HOAI Objektplanung Ingenieurbauwerke (LPH 1–9)',
  short: 'HOAI-Leistungsphasen',
  description: 'Grundleistungen und typische Besondere Leistungen je Leistungsphase, konkretisiert für Stahlwasserbau (Verschlüsse, Antriebe) und bewegliche Brücken.',
  mode: 'byPhase',
  groups: [
    {
      key: 'lph1', code: 'LPH 1', title: 'LPH 1 Grundlagenermittlung', items: [
        g('Aufgabenstellung und Leistungsumfang mit AG klären (Startgespräch)', 'pl', 8, 0, { prio: 'hoch' }),
        g('Bestandsunterlagen beschaffen und auswerten (Bestandspläne, Statik, Prüfberichte)', 'pl', 16, 0.1),
        g('Ortsbesichtigung mit Fotodokumentation', 'pl', 8, 0.2),
        g('Planungsrandbedingungen ermitteln (Wasserstände, Schifffahrt, Sperrzeiten)', 'pl', 8, 0.3, { scope: 'swb' }),
        g('Planungsrandbedingungen ermitteln (Lichtraum, Straßen- und Schiffsverkehr, Sperrzeiten)', 'pl', 8, 0.3, { scope: 'bruecke' }),
        g('Entscheidungshilfen für weitere Fachbeteiligte (Baugrund, Vermessung, Prüfingenieur)', 'pl', 6, 0.5),
        g('Ergebnisse zusammenfassen und dokumentieren', 'pl', 6, 0.85),
        b('Bestandsaufmaß Stahlbau und Maschinentechnik', 'cad', 24, 0.15),
        b('Nachrechnung des Bestandstragwerks', 'statik', 40, 0.3),
      ],
    },
    {
      key: 'lph2', code: 'LPH 2', title: 'LPH 2 Vorplanung', items: [
        g('Grundlagen analysieren, Zielvorstellungen mit AG abstimmen', 'pl', 8, 0),
        g('Variantenuntersuchung {obj} (Bauart, Antrieb, Bauablauf)', 'pl', 40, 0.1, { prio: 'hoch' }),
        g('Lastannahmen und Vorbemessung Stahltragwerk (DIN 19704)', 'statik', 40, 0.15, { scope: 'swb' }),
        g('Lastannahmen und Vorbemessung Überbau (DIN EN 1991-2 / 1993-2)', 'statik', 40, 0.15, { scope: 'bruecke' }),
        g('Antriebskonzept hydraulisch / elektromechanisch mit Leistungsabschätzung', 'mb', 32, 0.2),
        g('Konzept Energieversorgung, Steuerung und Fernbedienung', 'et', 16, 0.25),
        g('Hydraulische Randbedingungen (Füll-/Entleersystem, Strömungskräfte)', 'hyd', 24, 0.2, { scope: 'swb' }),
        g('Vorentwurfszeichnungen der Varianten', 'cad', 40, 0.35),
        g('Variantenbewertung (Wirtschaftlichkeit, Betrieb, Unterhaltung)', 'pl', 16, 0.6),
        g('Vorabstimmung der Genehmigungsfähigkeit mit Behörden', 'pl', 8, 0.65),
        g('Kostenschätzung und Vergleich mit Finanzierungsrahmen', 'pl', 16, 0.7),
        g('Planungskonzept erläutern (bis zu 2 Termine) und dokumentieren', 'pl', 8, 0.85),
        b('Sperrpausen- und Bauablaufkonzept mit Schifffahrtsverwaltung abstimmen', 'pl', 16, 0.5, { scope: 'swb' }),
        b('Verkehrsführung während der Bauzeit (Straße / Schifffahrt) untersuchen', 'pl', 16, 0.5, { scope: 'bruecke' }),
      ],
    },
    {
      key: 'lph3', code: 'LPH 3', title: 'LPH 3 Entwurfsplanung', items: [
        g('Lastannahmen und Bemessungskonzept festlegen (DIN 19704 / DIN EN 1993)', 'statik', 24, 0, { prio: 'hoch', scope: 'swb' }),
        g('Lastannahmen und Bemessungskonzept festlegen (DIN EN 1991-2 / DIN EN 1993-2)', 'statik', 24, 0, { prio: 'hoch', scope: 'bruecke' }),
        g('Entwurfsstatik {obj} – Berechnung wesentlicher tragender Teile (FEM)', 'statik', 120, 0.1, { prio: 'hoch' }),
        g('Ermüdungsnachweise der maßgebenden Details (DIN EN 1993-1-9)', 'statik', 48, 0.3),
        g('Antrieb, Lagerung und Verriegelung dimensionieren', 'mb', 60, 0.15),
        g('Hydraulikkonzept und Zylinderauslegung', 'mb', 24, 0.25),
        g('Steuerungs- und Sicherheitskonzept mit Risikobeurteilung (EN ISO 13849)', 'et', 40, 0.25),
        g('Entwurfszeichnungen {obj} und Gesamtanlage', 'cad', 80, 0.3),
        g('Korrosionsschutzkonzept nach ZTV-W LB 218', 'kors', 16, 0.4, { scope: 'swb' }),
        g('Korrosionsschutzkonzept nach ZTV-ING Teil 4', 'kors', 16, 0.4, { scope: 'bruecke' }),
        g('Fachplanungen koordinieren und integrieren', 'pl', 16, 0.45),
        g('Erläuterungsbericht zum Entwurf', 'pl', 24, 0.7),
        g('Kostenberechnung und Vergleich mit Kostenschätzung', 'pl', 24, 0.75),
        g('Bauzeiten- und Kostenplan aufstellen', 'pl', 12, 0.8),
        g('Entwurf mit AG und Behörden abstimmen', 'pl', 8, 0.9),
        b('Entwurfsunterlagen nach VV-WSV 2107 (Entwurf-HU) aufstellen', 'pl', 32, 0.7, { scope: 'swb' }),
        b('Bauwerksentwurf nach RE-ING aufstellen', 'pl', 32, 0.7, { scope: 'bruecke' }),
        b('Hydraulische Nachweise / Begleitung von Modellversuchen', 'hyd', 40, 0.3, { scope: 'swb' }),
        b('Dynamische Untersuchung (Schwingungen, Wind, Fußgänger)', 'statik', 40, 0.35, { scope: 'bruecke' }),
      ],
    },
    {
      key: 'lph4', code: 'LPH 4', title: 'LPH 4 Genehmigungsplanung', items: [
        g('Unterlagen für Genehmigungs- bzw. Planfeststellungsverfahren erarbeiten', 'pl', 32, 0, { prio: 'hoch' }),
        g('Bauwerksverzeichnis und Lagepläne aufstellen', 'cad', 16, 0.1),
        g('Grunderwerbsplan und -verzeichnis erstellen', 'cad', 12, 0.2),
        g('Abstimmung mit Behörden und Trägern öffentlicher Belange', 'pl', 12, 0.3),
        g('Planungsunterlagen vervollständigen und anpassen', 'pl', 8, 0.5),
        g('Mitwirkung an Erörterungsterminen (bis zu 4)', 'pl', 16, 0.6),
        g('Stellungnahmen zu Einwendungen mitverfassen', 'pl', 12, 0.75),
      ],
    },
    {
      key: 'lph5', code: 'LPH 5', title: 'LPH 5 Ausführungsplanung', items: [
        g('Ausführungsstatik {obj} (prüffähig)', 'statik', 140, 0, { prio: 'hoch', note: 'Tragwerksplanung – i. d. R. eigenes Leistungsbild (Anlage 14)' }),
        g('Nachweise für Bau-, Montage- und Revisionszustände', 'statik', 40, 0.25),
        g('Ausführungszeichnungen Stahlbau (Übersichten, Schnitte, Details)', 'cad', 160, 0.1, { prio: 'hoch' }),
        g('Ausführungszeichnungen Einbauteile und Massivbauanschlüsse', 'cad', 40, 0.3),
        g('Maschinenbau-Ausführungsplanung (Antrieb, Lager, Verriegelung)', 'mb', 100, 0.1),
        g('Hydraulikschema, Aggregat- und Leitungsplanung', 'mb', 40, 0.3),
        g('E-Technik: Schaltpläne, SPS-Spezifikation, Kabelwege', 'et', 90, 0.15),
        g('Korrosionsschutzplanung (Flächen, Systeme, Schichtdicken)', 'kors', 24, 0.45),
        g('Planlisten, Planfreigabe und Verteilung koordinieren', 'pl', 16, 0.2),
        g('Prüfbemerkungen des Prüfingenieurs einarbeiten', 'statik', 32, 0.7),
        g('Ausführungsplanung während der Bauausführung fortschreiben', 'pl', 16, 0.9),
        b('Schnittstellenliste Stahlbau / Maschinenbau / E-Technik / Massivbau', 'pl', 16, 0.15),
        b('Funktionsbeschreibung der Steuerung (Betriebsarten, Störfälle)', 'et', 24, 0.35),
        b('Revisions- und Wartungskonzept (Zugänglichkeit, Hebezeuge)', 'mb', 16, 0.5),
      ],
    },
    {
      key: 'lph6', code: 'LPH 6', title: 'LPH 6 Vorbereitung der Vergabe', items: [
        g('Mengenermittlung nach Einzelpositionen', 'ava', 40, 0, { prio: 'hoch' }),
        g('Leistungsverzeichnis Stahlwasserbau (StLK-W)', 'ava', 80, 0.1, { scope: 'swb' }),
        g('Leistungsverzeichnis Stahlbau und Brückenausstattung', 'ava', 80, 0.1, { scope: 'bruecke' }),
        g('LV-Beiträge Maschinenbau und Hydraulik', 'mb', 40, 0.15),
        g('LV-Beiträge Elektro- und Steuerungstechnik', 'et', 40, 0.15),
        g('Vertragsbedingungen und Technische Vorbemerkungen (ZTV-Bezüge)', 'ava', 24, 0.4),
        g('Schnittstellen der Leistungsbeschreibungen abstimmen', 'pl', 12, 0.5),
        g('Ausführungsphasen und Sperrzeiten festlegen', 'pl', 8, 0.55),
        g('Bepreistes LV aufstellen und mit Kostenberechnung vergleichen', 'ava', 16, 0.7),
        g('Vergabeunterlagen zusammenstellen', 'ava', 8, 0.9),
      ],
    },
    {
      key: 'lph7', code: 'LPH 7', title: 'LPH 7 Mitwirkung bei der Vergabe', items: [
        g('Angebote einholen und Bieterfragen beantworten', 'ava', 8, 0),
        g('Angebote prüfen und werten, Preisspiegel aufstellen', 'ava', 40, 0.3, { prio: 'hoch' }),
        g('Bietergespräche führen', 'pl', 12, 0.5),
        g('Vergabevorschlag und Dokumentation des Vergabeverfahrens', 'pl', 12, 0.7),
        g('Ausschreibungsergebnis mit Kostenberechnung vergleichen', 'ava', 8, 0.75),
        g('Vertragsunterlagen zusammenstellen, Mitwirkung bei Auftragserteilung', 'ava', 8, 0.9),
        b('Nebenangebote technisch prüfen und werten', 'statik', 24, 0.35),
      ],
    },
    {
      key: 'lph8', code: 'LPH 8', title: 'LPH 8 Bauoberleitung', items: [
        g('Bauanlaufbesprechung und Einweisung der Auftragnehmer', 'pl', 8, 0, { prio: 'hoch' }),
        g('Aufsicht über die örtliche Bauüberwachung, Koordination der Beteiligten', 'bu', 40, 0.05),
        g('Werkstattpläne des AN prüfen und bei der Freigabe mitwirken', 'statik', 60, 0.05, { prio: 'hoch' }),
        g('Terminplan (Balkendiagramm) aufstellen, fortschreiben und überwachen', 'pl', 24, 0.05),
        g('Werksabnahme (FAT) Antriebs- und Hydraulikaggregate', 'mb', 24, 0.35),
        g('Werksabnahme (FAT) Schaltanlage und SPS', 'et', 24, 0.4),
        g('Rechnungsprüfung und Kostenfeststellung', 'pl', 16, 0.5),
        g('Funktionsprüfung und Inbetriebnahme der Gesamtanlage überwachen (SAT)', 'et', 40, 0.8),
        g('Abnahme mit Mängelfeststellung und Abnahmeniederschrift', 'pl', 16, 0.9),
        g('Übergabe des Objekts, Verjährungsfristen auflisten', 'pl', 8, 0.95),
        g('Bestandsunterlagen, Bauablaufdokumentation und Wartungsvorschriften übergeben', 'cad', 16, 0.95),
        b('Örtliche Bauüberwachung (Montage, Aufmaß, Bautagebuch)', 'bu', 160, 0.1),
        b('Fertigungsüberwachung im Herstellerwerk (Schweißen, ZfP)', 'kors', 24, 0.25),
        b('Korrosionsschutzüberwachung und Schichtdickenmessung', 'kors', 24, 0.6),
      ],
    },
    {
      key: 'lph9', code: 'LPH 9', title: 'LPH 9 Objektbetreuung', items: [
        g('Fachliche Bewertung von Gewährleistungsmängeln', 'pl', 8, 0.2),
        g('Objektbegehung zur Mängelfeststellung vor Ablauf der Verjährungsfristen', 'bu', 12, 0.8, { prio: 'hoch' }),
        g('Mitwirkung bei der Freigabe von Sicherheitsleistungen', 'pl', 4, 0.9),
        b('Erste Bauwerksinspektion vorbereiten (VV-WSV 2101)', 'bu', 16, 0.5, { scope: 'swb' }),
        b('Erste Hauptprüfung nach DIN 1076 vorbereiten', 'bu', 16, 0.5, { scope: 'bruecke' }),
      ],
    },
  ],
};

// ============================================================================ Werkstattplanung erstellen
const WERKSTATT: TemplateSet = {
  id: 'werkstatt',
  name: 'Werkstattplanung erstellen',
  short: 'Werkstattplanung',
  description: 'Fertigungsgerechte Werkstatt- und Montageplanung für Stahlbau und Maschinentechnik – vom 3D-Modell bis zur Fertigungsfreigabe.',
  mode: 'window',
  defaultPhase: { code: 'WP', name: 'Werkstattplanung' },
  groups: [
    {
      key: 'wp-vorb', title: 'Vorbereitung', items: [
        g('Übernahme der Ausführungsplanung, Kick-off mit Werk und offene Punkte klären', 'pl', 8, 0, { prio: 'hoch' }),
        g('Planliste, Schriftfeld und Revisionierung anlegen', 'cad', 6, 0),
        g('Ausführungsklasse (EXC) und Prüfumfang nach DIN EN 1090-2 übernehmen', 'statik', 8, 0.03),
        g('Schweißkonzept: Nahtarten, Schweißfolge, WPS-Zuordnung', 'kors', 16, 0.08),
        g('Montage- und Transportkonzept (Schüsse, Montagestöße, Anschlagpunkte)', 'pl', 16, 0.12),
      ],
    },
    {
      key: 'wp-modell', title: '3D-Modell & Detaillierung', items: [
        g('3D-Modell Stahlbau aufbauen (Tekla Structures)', 'cad', 80, 0.08, { prio: 'hoch' }),
        g('Anschlüsse und Knoten fertigungsgerecht ausbilden', 'cad', 40, 0.22),
        g('Maschinenbauteile detaillieren (Lager, Bolzen, Antriebskonsolen)', 'mb', 40, 0.22),
        g('Dichtungs- und Führungskonstruktion mit Toleranzen und Passmaßen', 'cad', 16, 0.28, { scope: 'swb' }),
        g('Verriegelungen, Auflager und Fahrbahnübergänge detaillieren', 'cad', 16, 0.28, { scope: 'bruecke' }),
        g('Kabelwege und Einbauteile E-Technik im Stahlbau berücksichtigen', 'et', 16, 0.3),
        g('Kollisionsprüfung Stahlbau / Maschinenbau / Massivbau', 'cad', 8, 0.38),
      ],
    },
    {
      key: 'wp-plaene', title: 'Zeichnungen & Listen', items: [
        g('Übersichts- und Zusammenbauzeichnungen', 'cad', 60, 0.4),
        g('Einzelteilzeichnungen', 'cad', 80, 0.48),
        g('Stücklisten, Schraubenlisten und NC-Daten erzeugen', 'cad', 16, 0.6),
        g('Beschichtungsplan (Flächen, Systeme, Abklebebereiche)', 'kors', 12, 0.55),
        g('Montageanweisung und Montagezeichnungen', 'cad', 24, 0.6),
      ],
    },
    {
      key: 'wp-freigabe', title: 'Prüfung & Freigabe', items: [
        g('Interne Planprüfung gegen Statik und Ausführungsplanung (4-Augen-Prinzip)', 'statik', 24, 0.68, { prio: 'hoch' }),
        g('Einreichung zur Prüfung beim AG bzw. Prüfingenieur', 'pl', 4, 0.75),
        g('Prüfbemerkungen einarbeiten, Revision und Neuverteilung', 'cad', 24, 0.82),
        g('Fertigungsfreigabe an das Werk', 'pl', 4, 0.9, { prio: 'hoch' }),
        b('Bestandspläne (as built) nach Montage', 'cad', 16, 1),
      ],
    },
  ],
};

// ============================================================================ Werkstattplanung prüfen
const WERKSTATT_PRUEFUNG: TemplateSet = {
  id: 'werkstatt-pruefung',
  name: 'Prüfung Werkstattplanung & Fertigungsüberwachung',
  short: 'Prüfung Werkstattplanung',
  description: 'Prüfung der vom Auftragnehmer erstellten Werkstattplanung, Fertigungsüberwachung und Werksabnahmen (FAT).',
  mode: 'window',
  defaultPhase: { code: 'LPH 8', name: 'Bauoberleitung' },
  groups: [
    {
      key: 'wpp-pruefung', title: 'Planprüfung', items: [
        g('Planeingangsliste und Prüfstatus (A/B/C) einrichten', 'pl', 6, 0),
        g('Werkstattzeichnungen Stahlbau prüfen (Übereinstimmung mit Ausführungsplanung und Statik)', 'statik', 60, 0.1, { prio: 'hoch' }),
        g('Schweißplan, WPS/WPQR und Prüfplan (ZfP-Umfang) prüfen', 'kors', 16, 0.12),
        g('Maschinenbau-Werkstattzeichnungen und Hydraulikpläne prüfen', 'mb', 24, 0.15),
        g('Schaltpläne und SPS-Programmbeschreibung prüfen', 'et', 24, 0.2),
        g('Beschichtungsplan und Werkstoffzeugnisse (3.1/3.2) prüfen', 'kors', 8, 0.25),
        g('Montagestatik und Montageanweisung des AN prüfen', 'statik', 16, 0.3),
        g('Prüfvermerke ausstellen, Freigabe erteilen bzw. Rücklauf veranlassen', 'statik', 12, 0.38),
      ],
    },
    {
      key: 'wpp-fertigung', title: 'Fertigung & Werksabnahme', items: [
        g('Fertigungsüberwachung im Werk (Schweißnähte, ZfP-Stichproben)', 'kors', 24, 0.5),
        g('Werksabnahme (FAT) Antrieb und Hydraulik', 'mb', 16, 0.65, { prio: 'hoch' }),
        g('Werksabnahme (FAT) Steuerung', 'et', 16, 0.7),
        g('Probezusammenbau / Vormontage abnehmen', 'statik', 8, 0.78),
        g('Leistungserklärung und CE-Kennzeichnung (DIN EN 1090) prüfen', 'pl', 8, 0.9),
      ],
    },
  ],
};

// ============================================================================ Bauwerksprüfung
const BAUWERKSPRUEFUNG: TemplateSet = {
  id: 'pruefung',
  name: 'Bauwerksprüfung DIN 1076 / Bauwerksinspektion',
  short: 'Bauwerksprüfung',
  description: 'Haupt- oder einfache Prüfung beweglicher Brücken bzw. Inspektion von Stahlwasserbauten einschließlich Maschinen- und E-Technik.',
  mode: 'window',
  defaultPhase: { code: 'BWP', name: 'Bauwerksprüfung' },
  groups: [
    {
      key: 'bwp', title: 'Prüfung', items: [
        g('Bauwerksbuch und letzte Prüfberichte auswerten', 'pl', 6, 0),
        g('Sperrung, Verkehrssicherung und Zugangstechnik organisieren', 'pl', 4, 0.05),
        g('Handnahe Prüfung Stahlbau und Massivbau', 'bu', 32, 0.3, { prio: 'hoch' }),
        g('Prüfung maschinentechnischer Anlagen (Antrieb, Lager, Bremsen)', 'mb', 16, 0.3),
        g('Prüfung elektrotechnischer Anlagen und Sicherheitseinrichtungen', 'et', 12, 0.3),
        g('Schäden erfassen und bewerten (S/V/D)', 'bu', 16, 0.55),
        g('Prüfbericht mit Zustandsnote erstellen', 'pl', 16, 0.75, { prio: 'hoch' }),
        g('Instandsetzungsempfehlungen und Kostenschätzung', 'pl', 12, 0.9),
      ],
    },
  ],
};

export const TEMPLATE_SETS: TemplateSet[] = [HOAI, WERKSTATT, WERKSTATT_PRUEFUNG, BAUWERKSPRUEFUNG];

// ============================================================================ Hilfsfunktionen

export function scopeOf(project?: Project | null): Scope | null {
  const t = project?.type || '';
  if (/brücke/i.test(t)) return 'bruecke';
  if (/schleuse|wehr|sperrwerk/i.test(t)) return 'swb';
  return null;
}

export function objectNoun(project?: Project | null): string {
  switch (project?.type) {
    case 'Schleuse': return 'Schleusentor';
    case 'Wehr': return 'Wehrverschluss';
    case 'Sperrwerk': return 'Sperrtor';
    case 'Klappbrücke': return 'Brückenklappe';
    case 'Hubbrücke': return 'Hubüberbau';
    case 'Drehbrücke': return 'Drehüberbau';
    default: return 'Stahlbauwerk';
  }
}

/** Rollenschlüssel aus Funktions- und Abteilungsbezeichnung ableiten. */
export function roleKeysOf(e: Employee): RoleKey[] {
  const r = `${e.role || ''} ${e.department || ''}`;
  const keys: RoleKey[] = [];
  if (/projektleit|geschäftsführ/i.test(e.role || '')) keys.push('pl');
  if (/tragwerk|statik/i.test(r)) keys.push('statik');
  if (/maschinenbau/i.test(e.role || '')) keys.push('mb');
  if (/elektro/i.test(e.role || '')) keys.push('et');
  if (/konstrukteur|zeichner|systemplaner|cad/i.test(r)) keys.push('cad');
  if (/ausschreibung|vergabe|ava/i.test(e.role || '')) keys.push('ava');
  if (/bauüberwach|bauleit/i.test(r)) keys.push('bu');
  if (/schweiß|korrosion/i.test(r)) keys.push('kors');
  if (/wasserbau|hydraul/i.test(e.role || '')) keys.push('hyd');
  return keys;
}

export interface PlannedTask {
  key: string;
  group: string;
  template: TaskTemplate;
  title: string;
  phaseId: ID | null;
  startDate: string;
  dueDate: string;
  assigneeId: ID | null;
  exists: boolean;
}

/**
 * Plant Aufgaben aus einer Vorlage: Terminierung innerhalb des Zeitfensters
 * (Phase oder frei gewählt) und Vorschlag der Zuständigen nach Rolle –
 * bevorzugt aus dem Projektteam, Projektleitung für PL-Aufgaben.
 */
export function planTemplate(opts: {
  set: TemplateSet;
  project: Project;
  phases: Phase[];
  existingTasks: Task[];
  employees: Employee[];
  teamIds: Set<ID>;
  window?: { start: string; end: string; phaseId: ID | null };
}): PlannedTask[] {
  const { set, project, phases, existingTasks, employees, teamIds, window } = opts;
  const scope = scopeOf(project);
  const noun = objectNoun(project);
  const existing = new Set(existingTasks.map((t) => t.title.trim().toLowerCase()));
  const active = employees.filter((e) => e.active);
  const rr = new Map<RoleKey, number>();

  const pick = (role: RoleKey): ID | null => {
    if (role === 'pl' && project.leadId) return project.leadId;
    const withRole = active.filter((e) => roleKeysOf(e).includes(role) && !/geschäftsführ/i.test(e.role || ''));
    const inTeam = withRole.filter((e) => teamIds.has(e.id));
    const pool = inTeam.length ? inTeam : withRole;
    if (!pool.length) return project.leadId ?? null;
    const n = rr.get(role) ?? 0;
    rr.set(role, n + 1);
    return pool[n % pool.length].id;
  };

  const out: PlannedTask[] = [];
  for (const grp of set.groups) {
    let start: string | null = null;
    let end: string | null = null;
    let phaseId: ID | null = null;
    if (set.mode === 'byPhase') {
      const ph = phases.find((p) => (p.code || '').replace(/\s+/g, ' ').toUpperCase() === grp.code);
      if (!ph) continue;
      start = ph.startDate;
      end = ph.endDate;
      phaseId = ph.id;
    } else if (window) {
      start = window.start;
      end = window.end;
      phaseId = window.phaseId;
    }
    if (!start || !end) continue;
    const len = Math.max(1, diffDays(start, end));
    grp.items.forEach((tpl, i) => {
      if (tpl.scope && scope && tpl.scope !== scope) return;
      const title = tpl.title.replace('{obj}', noun);
      // Dauer: ca. 6 produktive Stunden je Arbeitstag, mindestens eine Woche
      const dur = Math.min(len, Math.max(5, Math.round((tpl.hours / 6) * 1.4)));
      let s = addDays(start!, Math.round(len * tpl.at));
      if (diffDays(s, end!) < dur) s = addDays(end!, -dur);
      if (s < start!) s = start!;
      const due = addDays(s, dur);
      out.push({
        key: `${grp.key}-${i}`, group: grp.key, template: tpl, title, phaseId,
        startDate: s, dueDate: due > end! ? end! : due,
        assigneeId: pick(tpl.role),
        exists: existing.has(title.trim().toLowerCase()),
      });
    });
  }
  return out;
}
