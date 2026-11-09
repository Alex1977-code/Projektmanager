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
| **Abwesenheiten** | Urlaub, Krankheit, Fortbildung, Gleitzeit, Sonderurlaub, Betriebsruhe; Monatskalender fürs Team, Urlaubsanträge mit Genehmigung durch die Leitung, Urlaubskonto (Arbeitstage ohne Feiertage), gesetzliche Feiertage je Bundesland. **Die verfügbare Kapazität wird automatisch reduziert** – in Ressourcenplanung, Cockpit, Engpässen, Team-Auslastung und Wochen-Soll der Zeiterfassung |
| **Rechnungen** | Abschlags-, Teilschluss- und Schlussrechnungen nach **§ 15 HOAI**: Leistungsstand je Leistungsphase (vorbelegt aus dem Fertigstellungsgrad), Besondere Leistungen/Nachträge, Nebenkostenpauschale, Abzug bisheriger Abschläge, USt; fortlaufende Rechnungsnummern erst beim Stellen, danach festgeschrieben (nur Storno); Zahlungseingänge, offene Posten, Überfälligkeit, **Abrechnungsvorschlag** für erbrachte, aber nicht abgerechnete Leistungen; Druck/PDF im Rechnungslayout |
| **Anmeldung & Rechte** | Anmeldung über **Active Directory** (LDAP/LDAPS) oder **Windows-Single-Sign-on** über den Firmen-Webserver; Rollen Administration / Projektleitung & Controlling / Mitarbeiter/in, serverseitig durchgesetzt |
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

### Anmeldung mit Active Directory

Standardmäßig läuft die Software **ohne Anmeldung** (`AUTH_MODE=none`, Benutzerwahl im Browser) – für Demo und
Erprobung. Für den Büro-Betrieb eine der beiden AD-Varianten wählen:

**Variante A – Windows-Benutzername und Kennwort (LDAP/LDAPS)**

```bash
AUTH_MODE=ldap
LDAP_URL=ldaps://dc01.firma.local:636      # Domänencontroller (LDAPS empfohlen)
LDAP_DOMAIN=firma.local                    # Anmeldung als benutzer@firma.local
LDAP_BASE_DN=DC=firma,DC=local             # Suchbasis für Benutzerkonten
# optional: Dienstkonto für die Benutzersuche (sonst Suche mit dem Konto des Benutzers)
LDAP_BIND_DN=CN=svc-projektsteuerung,OU=Dienstkonten,DC=firma,DC=local
LDAP_BIND_PASSWORD=…
# optional: Rollen über AD-Gruppen (Name oder vollständiger DN)
LDAP_GROUP_ADMIN=PM-Administration
LDAP_GROUP_LEITUNG=PM-Projektleitung
LDAP_CA_FILE=/etc/ssl/firma-root-ca.pem    # Stammzertifikat der Firmen-CA, falls nötig
```

**Variante B – automatische Windows-Anmeldung (Single Sign-on)**: Ein vorgeschalteter Webserver (IIS mit
„Windows-Authentifizierung“, Apache `mod_auth_gssapi` oder nginx mit SPNEGO) authentifiziert per Kerberos/NTLM und
leitet den Benutzernamen im Header weiter.

```bash
AUTH_MODE=header
AUTH_HEADER=X-Remote-User                  # Header, den der Proxy setzt
TRUSTED_PROXIES=127.0.0.1,::1              # nur von diesen Adressen wird der Header akzeptiert
```

Die Zuordnung zum Mitarbeiterprofil erfolgt über den **Windows-Anmeldenamen** (Team → Mitarbeiter bearbeiten →
„Windows-Anmeldename“, z. B. `s.hartmann`) oder die E-Mail-Adresse. Konten ohne Profil erhalten keinen Zugriff.
Mit `ADMIN_PASSWORD=…` lässt sich zusätzlich ein **Notfall-Administrator** `admin` aktivieren (z. B. für die
Ersteinrichtung oder bei Ausfall des Domänencontrollers).

| Rolle | Rechte |
|---|---|
| Administration | alles, inkl. Einstellungen, Mitarbeiterdaten, Datenexport |
| Projektleitung / Controlling | Projekte, Termine, Ressourcen, Kosten, **Rechnungen**, Genehmigung von Abwesenheiten, Zeiten für andere |
| Mitarbeiter/in | Aufgaben, Protokolle, eigene Zeiterfassung, eigene Urlaubsanträge; Krankheitsgründe von Kolleg/innen werden nicht angezeigt |

Sicherheit: Sitzungen als HttpOnly-Cookie (Standard 12 h, `SESSION_HOURS`), Schutz gegen Cross-Site-Request-Forgery,
Sperre nach 8 Fehlversuchen für 15 Minuten. **Im Betrieb mit Kennwort-Anmeldung die Seite nur per HTTPS bereitstellen**
(z. B. über IIS/nginx als Reverse Proxy) und `COOKIE_SECURE=1` setzen.

### Konfiguration (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3001` | HTTP-Port |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DATA_DIR` | `./data` | Ablageort der Datenbank |
| `DB_FILE` | `$DATA_DIR/projektmanager.db` | Datenbankdatei |
| `NO_SEED` | – | `1` = keine Demodaten anlegen |
| `AUTH_MODE` | `none` | `none`, `ldap` oder `header` (siehe oben) |
| `ADMIN_PASSWORD` | – | aktiviert den Notfall-Administrator `admin` |

**Datensicherung:** Die Datei `data/projektmanager.db` regelmäßig sichern (z. B. nächtliche Kopie) oder in
den Einstellungen einen JSON-Export herunterladen.

## Architektur

```
server/            Node.js-HTTP-Server ohne Framework-Abhängigkeiten
  db.js            Schema, Migration, CRUD (node:sqlite)
  api.js           REST-API, Validierung, Kaskadenlöschung, Auswertungen
  seed.js          realistische Demodaten (relativ zum aktuellen Datum)
  seedProtocols.js Beispielprotokolle
  seedExtra.js     Beispiel-Abwesenheiten und -Rechnungen
  auth.js          Anmeldung (Active Directory, Windows-SSO), Sitzungen
  billing.js       Abschlagsrechnungen nach § 15 HOAI, Abwesenheiten, Rechte
shared/holidays.js Gesetzliche Feiertage je Bundesland (Server und Oberfläche)
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

- Feiertage, die nur in Teilen eines Bundeslandes gelten (z. B. Mariä Himmelfahrt in Teilen Bayerns), sind nicht enthalten
  und können als Abwesenheit „für alle“ eingetragen werden.
- Rechnungen werden im Programm erzeugt und gedruckt; eine Übergabe an die Finanzbuchhaltung (z. B. DATEV) oder
  E-Rechnung (XRechnung/ZUGFeRD) ist nicht enthalten.
- Denkbar: Dokumentenablage je Projekt, E-Mail-Benachrichtigung bei Urlaubsanträgen, XRechnung-Export.
