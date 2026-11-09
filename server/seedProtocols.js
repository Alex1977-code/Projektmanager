// Beispiel-Besprechungsprotokolle für die Demodaten. Alle Personen und Firmen sind frei erfunden.
import { insert } from './core.js';

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, n) => iso(Date.parse(s + 'T00:00:00Z') + n * DAY);

let itemCounter = 0;
const top = (text) => ({ id: `s${++itemCounter}`, kind: 'top', text });
const info = (text) => ({ id: `s${++itemCounter}`, kind: 'I', text });
const fest = (text) => ({ id: `s${++itemCounter}`, kind: 'F', text });
const auf = (text, who, dueDate, done = false) => ({
  id: `s${++itemCounter}`, kind: 'A', text, dueDate,
  ...(typeof who === 'number' ? { assigneeId: who } : { responsible: who }), done,
});

/**
 * @param {*} db
 * @param {{ byNumber: Map<string, {project: any, team: number[]}>, emp: (idx:number)=>number, today: string }} ctx
 */
export function seedProtocols(db, { byNumber, emp, today }) {
  const ext = (name, company, present = true) => ({ name, company, present });
  const int = (idx, present = true) => ({ employeeId: emp(idx), present });

  const add = (number, data) => {
    const entry = byNumber.get(number);
    if (!entry) return null;
    return insert(db, 'protocols', { projectId: entry.project.id, status: 'versendet', createdAt: data.date, ...data });
  };

  // --------------------------------------------------- Schleuse Nordhafen
  const tvb = auf('Entwurf Technische Vorbemerkungen für LV Stahlwasserbau vorlegen.', emp(21), addDays(today, -7));
  add('P-2025-012', {
    number: 1, type: 'Planungsbesprechung', title: 'Abstimmung Ausführungsplanung Stemmtore',
    date: addDays(today, -84), time: '10:00', location: 'WSA Nordkanal, Besprechungsraum 2', authorId: emp(1),
    participants: [ext('Hr. Dahlmann', 'WSA Nordkanal (AG)'), ext('Fr. Petersen', 'WSA Nordkanal, Sachbereich 2'), int(1), int(5), int(9), int(11)],
    items: [
      top('Stand der Planung'),
      info('Die Entwurfsplanung wurde vom AG mit Schreiben vom letzten Monat freigegeben. Die Ausführungsplanung LPH 5 läuft.'),
      fest('Torbauart bleibt Riegeltor mit Stemmtorlagerung oben/unten. Die Variante mit Schubstange als Antriebselement wird nicht weiter verfolgt.'),
      top('Tragwerksplanung'),
      fest('Lastfall Schiffsstoß nach DIN 19704-1 wird mit dem vom AG vorgegebenen Bemessungsschiff angesetzt.'),
      auf('Ermüdungsnachweise der Halslager- und Spurlagerdetails vorlegen.', emp(5), addDays(today, -56), true),
      top('Maschinenbau / E-Technik'),
      auf('Hydraulikzylinder: Hubgeschwindigkeit und Endlagendämpfung mit Hersteller abstimmen.', emp(9), addDays(today, -60), true),
      auf('Bestandsunterlagen der vorhandenen Steuerung (Schaltpläne) an IB übergeben.', 'AG (Hr. Dahlmann)', addDays(today, -70), true),
      top('Termine'),
      info('Nächste Planungsbesprechung in ca. 6 Wochen.'),
    ],
    nextDate: addDays(today, -42),
  });
  add('P-2025-012', {
    number: 2, type: 'Planungsbesprechung', title: 'Ausführungsplanung – Prüfbemerkungen und Korrosionsschutz',
    date: addDays(today, -42), time: '09:30', location: 'Videokonferenz', authorId: emp(1),
    participants: [ext('Hr. Dahlmann', 'WSA Nordkanal (AG)'), ext('Dr. Kessler', 'Prüfingenieur'), int(1), int(5), int(19), int(21, false)],
    items: [
      top('Prüfung der Standsicherheitsnachweise'),
      info('Der Prüfingenieur hat den 1. Prüfbericht übergeben (14 Prüfbemerkungen, davon 3 wesentlich).'),
      auf('Prüfbemerkungen 1–14 einarbeiten und Nachtrag zur Statik einreichen.', emp(5), addDays(today, -14), true),
      top('Korrosionsschutz'),
      fest('Beschichtungssystem nach ZTV-W LB 218, Tabelle für Bauteile im Wasserwechselbereich; Sollschichtdicke gemäß Systemblatt.'),
      auf('Korrosionsschutzplan mit Flächenaufstellung erstellen.', emp(19), addDays(today, -21), true),
      top('Ausschreibung'),
      tvb,
    ],
    nextDate: addDays(today, -7),
  });
  add('P-2025-012', {
    number: 3, type: 'Jour fixe', title: 'Jour fixe – Vorbereitung der Vergabe',
    date: addDays(today, -7), time: '14:00', location: 'Büro, Besprechungsraum Weser', authorId: emp(1), status: 'entwurf',
    participants: [ext('Hr. Dahlmann', 'WSA Nordkanal (AG)'), int(1), int(9), int(11), int(21)],
    items: [
      top('Offene Punkte aus Protokoll Nr. 2'),
      { ...auf('Entwurf Technische Vorbemerkungen für LV Stahlwasserbau vorlegen.', emp(21), addDays(today, 7)), carriedFrom: tvb.id },
      top('Leistungsverzeichnisse'),
      info('LV Stahlwasserbau zu ca. 70 % fertiggestellt. LV E-Technik in Bearbeitung.'),
      fest('Die Antriebe werden als eigenes Los ausgeschrieben (Los 2: Maschinen- und Elektrotechnik).'),
      auf('Schnittstellenliste Los 1 / Los 2 erstellen und mit AG abstimmen.', emp(9), addDays(today, 10)),
      auf('Sperrzeitenplan der Schifffahrt für die Montage bereitstellen.', 'AG (Fr. Petersen)', addDays(today, 14)),
      top('Termine'),
      fest('Versand der Vergabeunterlagen spätestens zum geplanten Meilenstein „Zuschlagserteilung“ minus 8 Wochen.'),
    ],
    nextDate: addDays(today, 14),
  });

  // --------------------------------------------------- Klappbrücke Hafenstraße
  add('P-2025-018', {
    number: 1, type: 'Planungsbesprechung', title: 'Antriebskonzept und Kostenentwicklung',
    date: addDays(today, -16), time: '13:00', location: 'Hafengesellschaft Seestadt, Leitwarte', authorId: emp(2),
    participants: [ext('Fr. Brandt', 'Hafengesellschaft Seestadt (AG)'), ext('Hr. Olsen', 'Brückenwärter'), int(2), int(9), int(11), int(7)],
    items: [
      top('Kosten'),
      info('Die aktuellen Ist-Kosten liegen über dem Leistungsstand. Ursache: Mehraufwand Bestandsaufnahme Verriegelung und zusätzliche Varianten Hydraulik.'),
      auf('Nachtragsangebot für zusätzliche Variantenuntersuchung Hydraulik erstellen.', emp(2), addDays(today, -2)),
      top('Antrieb'),
      fest('Hydraulischer Antrieb mit zwei Zylindern je Klappenhälfte; Notbetrieb über Handpumpe.'),
      auf('Sperrzeiten für Probebetrieb mit Hafenbetrieb abstimmen.', 'AG (Fr. Brandt)', addDays(today, 5)),
      top('Steuerung'),
      auf('Funktionsbeschreibung Betriebsarten (Ort / Fern / Hand) vorlegen.', emp(11), addDays(today, 12)),
    ],
    nextDate: addDays(today, 12),
  });

  // --------------------------------------------------- Wehr Steinfurt
  add('P-2026-005', {
    number: 1, type: 'Baubesprechung', title: 'Baubesprechung Nr. 1 – Montage Segment 1',
    date: addDays(today, -21), time: '10:00', location: 'Baustelle Wehr Steinfurt, Baucontainer', authorId: emp(17),
    participants: [ext('Hr. Lindqvist', 'WSA Oberstrom (AG)'), ext('Hr. Bauer', 'Stahlbau Nordwerk GmbH (AN)'), int(1), int(17), int(18)],
    items: [
      top('Bauablauf / Termine'),
      info('Segment 1 ist montiert, Dichtungen eingebaut. Segment 2 im Werk in Fertigung.'),
      auf('Aktualisierten Bauzeitenplan vorlegen.', 'AN (Hr. Bauer)', addDays(today, -14), true),
      top('Technische Klärungen'),
      fest('Toleranz der seitlichen Dichtungsschiene ±2 mm wird bestätigt; Nacharbeit an Achse 3 durch AN.'),
      auf('Aufmaß Nacharbeit Dichtungsschiene prüfen.', emp(18), addDays(today, -7)),
      top('Arbeitssicherheit'),
      info('Absturzsicherung am Wehrsteg wurde nachgerüstet.'),
    ],
    nextDate: addDays(today, -7),
  });
  add('P-2026-005', {
    number: 2, type: 'Werksabnahme / FAT', title: 'Werksabnahme Hydraulikaggregat Segment 2',
    date: addDays(today, -6), time: '08:30', location: 'Herstellerwerk Hydraulik, Prüfstand', authorId: emp(9),
    participants: [ext('Hr. Lindqvist', 'WSA Oberstrom (AG)'), ext('Hr. Wendt', 'Hydraulikhersteller'), int(9), int(11)],
    items: [
      top('Prüfumfang'),
      info('Druckprüfung, Funktionsprüfung Ventile, Geräuschmessung, Sichtprüfung Verrohrung.'),
      top('Prüfergebnisse'),
      fest('Druckprüfung mit 1,5-fachem Betriebsdruck bestanden.'),
      fest('Werksabnahme unter Vorbehalt der Restpunkte erteilt.'),
      top('Mängel / Restpunkte'),
      auf('Kennzeichnung der Messanschlüsse gemäß Hydraulikschema nachrüsten.', 'Hersteller (Hr. Wendt)', addDays(today, 8)),
      auf('Prüfprotokolle und Werkstoffzeugnisse 3.1 nachreichen und prüfen.', emp(9), addDays(today, 10)),
    ],
    nextDate: null,
  });
}
