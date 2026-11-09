# Projektsteuerung – Stahlwasserbau & Bewegliche Brücken

Webbasierte Projektmanagement-Software für ein Ingenieurbüro (ca. 25 Mitarbeitende) mit Schwerpunkt
**Stahlwasserbau** (Schleusentore, Wehrverschlüsse, Sperrwerke) und **beweglichen Brücken**
(Klapp-, Hub-, Drehbrücken). Sie läuft im Büronetz auf einem Server und wird im Browser bedient –
ohne Installation an den Arbeitsplätzen.

## Funktionen

| Bereich | Inhalt |
|---|---|
| **Cockpit** | Kennzahlen, Projektampel (Termine & Kosten), meine Aufgaben, anstehende Meilensteine, Teamauslastung der nächsten 12 Wochen, Kapazitätsengpässe |
| **Projekte** | Projektliste (Tabelle/Kacheln) mit Filtern; Anlage mit automatischer Verteilung der **HOAI-Leistungsphasen** (Termine + Honoraranteile) |
| **Projektdetail** | Übersicht · Terminplan (Gantt) · Aufgaben (Kanban) · Ressourcen · Kosten |
| **Terminplanung** | Rahmenterminplan aller Projekte; Phasen und Aufgaben per **Drag & Drop** verschieben bzw. an den Enden verlängern; Meilensteine; Wochen/Monate/Quartale |
| **Ressourcenplanung** | Wochenraster je Mitarbeiter über alle Projekte, Auslastung in % oder Stunden, Überlastung rot markiert, Stunden direkt im Raster planen |
| **Aufgaben** | Kanban-Board (Offen → In Bearbeitung → **In Prüfung** (4-Augen-Prinzip) → Erledigt) und Listenansicht; Zuweisung, Priorität, Fälligkeit, Aufwand |
| **Aufgabenvorlagen** | Kataloge mit Grund- und Besonderen Leistungen für **HOAI LPH 1–9** (Ingenieurbauwerke, fachlich angepasst an Stahlwasserbau bzw. bewegliche Brücken), **Werkstattplanung erstellen**, **Prüfung der Werkstattplanung des AN / Fertigungsüberwachung / FAT** und **Bauwerksprüfung DIN 1076**; automatische Terminierung in der Leistungsphase und Zuweisung nach Rolle aus dem Projektteam |
| **Protokolle** | Besprechungsprotokolle je Projekt (Planungs-/Baubesprechung, Jour fixe, Werksabnahme, Abnahme …) mit Tagesordnung, Punkten **I / F / A**, Verantwortlichen und Terminen; offene Punkte aus dem Vorgängerprotokoll übernehmen; A-Punkte als Aufgaben anlegen; projektübergreifende Liste offener Punkte; Druck/PDF im Protokolllayout, Verteilung per E-Mail; automatisches Speichern |
| **Zeiterfassung** | Wochenstundenzettel je Projekt und Leistungsphase; geplante Stunden als Vorschlag |
| **Kosten & Controlling** | Budget, Ist-Kosten (Stunden × Verrechnungssatz + Fremdkosten), Leistungswert, CPI, Prognose (Earned-Value-Methode) je Projekt und Phase; CSV-Export für Excel |
| **Team** | Mitarbeitende mit Rolle, Abteilung, Qualifikationen, Verrechnungssatz, Wochenarbeitszeit und Auslastung |

Weitere Komfortfunktionen: Schnellsuche mit <kbd>Strg</kbd>+<kbd>K</kbd>, Schnellanlage von Aufgaben/Projekten,
Benutzerwahl („Angemeldet als“), JSON-Komplettexport, responsives Layout für Tablet und Smartphone, Druckansicht.

## Installation

Voraussetzung: **Node.js ab Version 22.5** (nutzt das integrierte SQLite – keine Datenbankinstallation nötig).

```bash
npm install
npm run build     # Frontend bauen
npm start         # Server starten → http://<servername>:3001
```

Beim ersten Start werden Demodaten angelegt (25 Mitarbeitende, 11 Projekte). Für einen leeren Start
`NO_SEED=1 npm start` verwenden; Demodaten neu erzeugen mit `npm run seed`.

### Entwicklung

```bash
npm run dev        # API (Port 3001) + Vite-Dev-Server mit Hot Reload (Port 5173)
npm test           # API-Tests
npm run typecheck  # TypeScript-Prüfung
```

### Konfiguration (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3001` | HTTP-Port |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DATA_DIR` | `./data` | Ablageort der Datenbank |
| `DB_FILE` | `$DATA_DIR/projektmanager.db` | Datenbankdatei |
| `NO_SEED` | – | `1` = keine Demodaten anlegen |

**Datensicherung:** Die Datei `data/projektmanager.db` regelmäßig sichern (z. B. nächtliche Kopie) oder in
den Einstellungen einen JSON-Export herunterladen.

## Architektur

```
server/            Node.js-HTTP-Server ohne Framework-Abhängigkeiten
  db.js            Schema, Migration, CRUD (node:sqlite)
  api.js           REST-API, Validierung, Kaskadenlöschung, Auswertungen
  seed.js          realistische Demodaten (relativ zum aktuellen Datum)
  seedProtocols.js Beispielprotokolle
  api.test.js      Tests (node:test)
src/               React 19 + TypeScript (Vite)
  store.tsx        zentraler Datenzustand mit optimistischen Updates
  utils/metrics.ts Projektkennzahlen (Earned Value, Ampeln)
  utils/taskTemplates.ts  Aufgabenkataloge HOAI / Werkstattplanung / Bauwerksprüfung
  utils/protocols.ts      Nummerierung, offene Punkte, Übernahme in Folgeprotokolle
  components/      Gantt, Kanban, Ressourcenraster, Diagramme, Formulare
  pages/           Cockpit, Projekte, Terminplanung, Ressourcen, Aufgaben, Zeiten, Controlling, Team
```

### Kennzahlenmodell

- **Fertigstellungsgrad** eines Projekts = budgetgewichteter Mittelwert der Phasen-Fertigstellung (Einschätzung der Projektleitung).
- **Ist-Kosten (AC)** = gebuchte Stunden × Verrechnungssatz + angefallene Fremdkosten.
- **Leistungswert (EV)** = Budget × Fertigstellungsgrad; **CPI** = EV / AC.
- **Prognose (EAC)** = AC + (Budget − EV) / CPI.
- **Terminampel**: Ist- gegen Soll-Fertigstellung (linear über die Phasendauer) und überfällige Meilensteine.

## Hinweise / mögliche Erweiterungen

- Die Benutzerwahl ist bewusst ohne Passwort gehalten (Einsatz im geschützten Büronetz).
  Für den Betrieb außerhalb des LAN sollte eine Anmeldung (z. B. Active Directory/LDAP oder SSO) ergänzt werden.
- Denkbar: Abwesenheiten/Urlaub in der Kapazität, Rechnungsstellung nach HOAI-Abschlagsplan, Dokumentenablage je Projekt.
