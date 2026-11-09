# Projektsteuerung – Stahlwasserbau & Bewegliche Brücken

Webbasierte Projektmanagement-Software für ein Ingenieurbüro (ca. 25 Mitarbeitende) mit Schwerpunkt
**Stahlwasserbau** (Schleusentore, Wehrverschlüsse, Sperrwerke) und **beweglichen Brücken**
(Klapp-, Hub-, Drehbrücken). Sie läuft im Büronetz auf einem Server und wird im Browser bedient –
ohne Installation an den Arbeitsplätzen.

## Funktionen

| Bereich | Inhalt |
|---|---|
| **Cockpit** | **Stempeluhr** (Kommen/Gehen mit laufender Arbeitszeit) und **„Zu erledigen“** (Monatsabschlüsse und Urlaubsanträge zur Freigabe, überfällige Rechnungen, eigene fehlende Zeiteinträge – je nach Recht); Kennzahlen, Projektampel (Termine & Kosten), meine Aufgaben, anstehende Meilensteine, Teamauslastung der nächsten 12 Wochen, Kapazitätsengpässe |
| **Projekte** | Projektliste (Tabelle/Kacheln) mit Filtern; Anlage mit automatischer Verteilung der **HOAI-Leistungsphasen** (Termine + Honoraranteile) |
| **Projektdetail** | Übersicht · Terminplan (Gantt) · Aufgaben (Kanban) · Ressourcen · Kosten |
| **Terminplanung** | Rahmenterminplan aller Projekte; Phasen und Aufgaben per **Drag & Drop** verschieben bzw. an den Enden verlängern; Meilensteine; Wochen/Monate/Quartale |
| **Ressourcenplanung** | Wochenraster je Mitarbeiter über alle Projekte, Auslastung in % oder Stunden, Überlastung rot markiert, Stunden direkt im Raster planen |
| **Aufgaben** | Kanban-Board (Offen → In Bearbeitung → **In Prüfung** (4-Augen-Prinzip) → Erledigt) und Listenansicht; Zuweisung, Priorität, Fälligkeit, Aufwand |
| **Aufgabenvorlagen** | Kataloge mit Grund- und Besonderen Leistungen für **HOAI LPH 1–9** (Ingenieurbauwerke, fachlich angepasst an Stahlwasserbau bzw. bewegliche Brücken), **Werkstattplanung erstellen**, **Prüfung der Werkstattplanung des AN / Fertigungsüberwachung / FAT** und **Bauwerksprüfung DIN 1076**; automatische Terminierung in der Leistungsphase und Zuweisung nach Rolle aus dem Projektteam |
| **Protokolle** | Besprechungsprotokolle je Projekt (Planungs-/Baubesprechung, Jour fixe, Werksabnahme, Abnahme …) mit Tagesordnung, Punkten **I / F / A**, Verantwortlichen und Terminen; offene Punkte aus dem Vorgängerprotokoll übernehmen; A-Punkte als Aufgaben anlegen; projektübergreifende Liste offener Punkte; Druck/PDF im Protokolllayout, Verteilung per E-Mail; automatisches Speichern |
| **Abwesenheiten** | Urlaub, Krankheit, Fortbildung, Gleitzeit, Sonderurlaub, Betriebsruhe; Monatskalender fürs Team, Urlaubsanträge mit Genehmigung durch die Leitung, Urlaubskonto (Arbeitstage ohne Feiertage), gesetzliche Feiertage je Bundesland. **Die verfügbare Kapazität wird automatisch reduziert** – in Ressourcenplanung, Cockpit, Engpässen, Team-Auslastung und Wochen-Soll der Zeiterfassung |
| **Rechnungen** | Abschlags-, Teilschluss- und Schlussrechnungen nach **§ 15 HOAI**: Leistungsstand je Leistungsphase (vorbelegt aus dem Fertigstellungsgrad), Besondere Leistungen/Nachträge, Nebenkostenpauschale, Abzug bisheriger Abschläge, USt; fortlaufende Rechnungsnummern erst beim Stellen, danach festgeschrieben (nur Storno); Zahlungseingänge, offene Posten, Überfälligkeit, **Abrechnungsvorschlag** für erbrachte, aber nicht abgerechnete Leistungen; Druck/PDF im Rechnungslayout |
| **Anmeldung** | Anmeldung über **Active Directory** (LDAP/LDAPS) oder **Windows-Single-Sign-on** über den Firmen-Webserver |
| **Rollen & Rechte** | Rechte-Matrix mit 19 Einzelrechten (Projekte, Termine, Ressourcen, Kosten, Rechnungen, Abwesenheiten, Arbeitszeit-Freigabe, Abacus-Export, Einstellungen …); Standardrollen Administration, Projektleitung, Controlling/Buchhaltung, Mitarbeiter/in, Extern; **eigene Rollen** anlegen; **„Ansicht testen“** zeigt die Oberfläche so, wie eine Rolle sie sieht; Zuweisung je Person oder über **AD-Gruppen**; serverseitig durchgesetzt (Stundensätze, Kosten und Rechnungen werden ohne Recht gar nicht ausgeliefert) |
| **Projektzeiten** | Wochenstundenzettel je Projekt und Leistungsphase; geplante Stunden als Vorschlag; **Abgleich mit der Arbeitszeit** (je Tag: gearbeitet / noch nicht verbucht) |
| **Arbeitszeit** | **Stempeluhr** (Kommen/Gehen mit Arbeitsort, auch am Handy) und Monatsliste zum direkten Eintragen; Soll/Ist, Gleitzeitkonto, Gutschrift für Urlaub/Krankheit; Prüfung nach **Arbeitszeitgesetz** (§ 3 max. 10 h, § 4 Pausen 30/45 min – beim Ausstempeln automatisch ergänzt, § 5 Ruhezeit 11 h, § 9 Sonn-/Feiertage); Abgleich mit gebuchten Projektzeiten; **fehlende Tage** (Arbeitstag ohne Eintrag und ohne Abwesenheit) werden markiert und vor dem Einreichen gemeldet; **Monatsabschluss** (einreichen → freigeben/zurückgeben, Sammelfreigabe aller unauffälligen Monate), danach gesperrt; auf dem Handy als Tageskarten ohne seitliches Scrollen |
| **Abacus-Schnittstelle** | Exportdatei (CSV) für **Projektzeiten / Leistungserfassung** (Personalnr., Datum, Abacus-Projektnr., Leistungsart je Leistungsphase, Stunden, Text) und **Arbeitszeiten** (Von/Bis/Pause/Stunden/Absenzcode) – nur freigegebene Monate, Vorschau mit Warnungen (fehlende Personal-/Projektnummern), Exportprotokoll, Kennzeichnung „übergeben“; Spalten, Reihenfolge, Trennzeichen, Dezimal- und Datumsformat, Zeichensatz, Mandant, Leistungsarten und Absenzcodes frei konfigurierbar |
| **Kosten & Controlling** | Budget, Ist-Kosten (Stunden × Verrechnungssatz + Fremdkosten), Leistungswert, CPI, Prognose (Earned-Value-Methode) je Projekt und Phase; CSV-Export für Excel |
| **Team** | Mitarbeitende mit Rolle, Abteilung, Qualifikationen, Verrechnungssatz, Wochenarbeitszeit und Auslastung |

Weitere Komfortfunktionen: Schnellsuche mit <kbd>Strg</kbd>+<kbd>K</kbd>, Schnellanlage von Aufgaben/Projekten,
Benutzerwahl („Angemeldet als“), JSON-Komplettexport, responsives Layout für Tablet und Smartphone, Druckansicht.

## Auf PC und Handy – immer synchron

Es gibt zwei Betriebsarten mit identischem Funktionsumfang der Projektsteuerung:

| | Veröffentlichte Version (claude.ai) | Eigener Server im Büro |
|---|---|---|
| Aufruf | Link auf claude.ai, im Browser oder in der Claude-App | `http://<server>:3001` im Firmennetz (unterwegs per VPN) |
| Daten | gemeinsame Datenbank der Seite auf claude.ai | SQLite-Datei auf dem eigenen Server |
| Zugriff | über „Teilen“ auf claude.ai (Mitwirkende ändern, Betrachter lesen) | Active Directory / Windows-Anmeldung, Rollen |
| Synchronisation | live (Änderungen erscheinen in ca. 1 s auf allen Geräten) | live über Server-Sent Events, beim Zurückkehren in die App zusätzlich Abgleich |
| Ausdrucke | Protokolle/Rechnungen als HTML-Datei speichern, dann drucken | direkt drucken / PDF |

Auf dem Handy lässt sich die Server-Version über „Zum Startbildschirm hinzufügen“ wie eine App installieren
(Web-App-Manifest mit Symbol). Alle Seiten sind für Handybreite ausgelegt.

Die veröffentlichte Version entsteht mit `npm run build:artifact` als eine einzige Datei
(`artifact/projektsteuerung.html`). Sie nutzt dieselbe Geschäftslogik wie der Server (`server/api.js`)
mit einem Speicher im Browser (`server/memoryStore.js`) und gleicht Änderungen über `src/local/sync.ts` ab.
Zeitbuchungen und Wochenplanung werden je Person und Quartal gebündelt, damit die Datenbank auch nach
Jahren unter der Grenze von 25.000 Dokumenten bleibt.

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
LDAP_ROLE_GROUPS=controlling=PM-Controlling;extern=PM-Extern   # weitere/eigene Rollen: Schlüssel=Gruppe
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

| Standardrolle | Rechte (unter **Rollen & Rechte** anpassbar) |
|---|---|
| Administration | immer alle Rechte |
| Projektleitung | Projekte, Termine, Aufgaben, Protokolle, Ressourcen, Abwesenheiten genehmigen, Zeiten aller, Arbeitszeit freigeben, Kosten, Rechnungen |
| Controlling / Buchhaltung | Kosten, Rechnungen, Zeiten aller, Arbeitszeit freigeben, **Abacus-Export**, Abwesenheiten genehmigen, Aufgaben/Protokolle |
| Mitarbeiter/in | Aufgaben und Protokolle bearbeiten; eigene Projekt- und Arbeitszeiten, eigene Urlaubsanträge; keine Stundensätze/Kosten/Rechnungen; Krankheitsgründe von Kolleg/innen werden nicht angezeigt |
| Extern | nur lesen, eigene Zeiten |

Die Rolle kommt aus dem Mitarbeiterprofil („Berechtigung“) oder – vorrangig – aus den AD-Gruppen. Nur wer das Recht
„Rollen & Rechte verwalten“ hat, darf Rollen zuweisen. **Ohne Anmeldung (`AUTH_MODE=none`, veröffentlichte Version)
haben alle Personen alle Rechte.**

### Arbeitszeit und Abacus

1. Mitarbeitende stempeln (oder tragen Beginn/Ende/Pause ein) und reichen den Monat ein.
2. Projektleitung/Controlling gibt unter **Arbeitszeit → Freigaben** frei oder gibt zurück; freigegebene Monate sind gesperrt.
3. Controlling erzeugt unter **Arbeitszeit → Abacus-Export** die Importdatei für den Vormonat und liest sie in Abacus ein
   (Leistungserfassung AbaProject bzw. Lohn/HR).

Die Vorlage der Exportdatei muss zur **Importdefinition Ihrer Abacus-Installation** passen – Spalten, Reihenfolge,
Trennzeichen, Datumsformat sowie die Codes für Leistungsarten und Absenzen sind deshalb unter „Schnittstelle
konfigurieren“ einstellbar (mit Beispielzeile). Voraussetzung: **Personalnummer** je Mitarbeiter/in (Team) und
**Abacus-Projektnummer** je Projekt (Projekt bearbeiten); fehlende Nummern werden in der Vorschau gemeldet.
Eine direkte Online-Verbindung (Abacus REST-API) ist nicht enthalten.

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
  core.js          Schema und Datenzugriff (ohne Node-Abhängigkeiten, auch im Browser)
  db.js            SQLite-Speicher (node:sqlite), Migration
  memoryStore.js   Speicher im Browser mit Änderungsprotokoll (veröffentlichte Version)
  api.js           REST-API, Validierung, Kaskadenlöschung, Auswertungen
  seed.js          realistische Demodaten (relativ zum aktuellen Datum)
  seedProtocols.js Beispielprotokolle
  seedExtra.js     Beispiel-Abwesenheiten und -Rechnungen
  auth.js          Anmeldung (Active Directory, Windows-SSO), Sitzungen
  billing.js       Abschlagsrechnungen nach § 15 HOAI, Abwesenheiten
  worktime.js      Arbeitszeit, Monatsabschluss, Rollen, Abacus-Export
shared/holidays.js Gesetzliche Feiertage je Bundesland (Server und Oberfläche)
shared/permissions.js  Rechte und Standardrollen
shared/worktime.js Arbeitszeitgesetz-Prüfungen
  api.test.js      Tests (node:test) – laufen gegen SQLite und den Browser-Speicher
src/               React 19 + TypeScript (Vite)
  store.tsx        zentraler Datenzustand mit optimistischen Updates und Live-Aktualisierung
  local/           Browser-Backend und Synchronisation der veröffentlichten Version
  utils/metrics.ts Projektkennzahlen (Earned Value, Ampeln)
  utils/taskTemplates.ts  Aufgabenkataloge HOAI / Werkstattplanung / Bauwerksprüfung
  utils/protocols.ts      Nummerierung, offene Punkte, Übernahme in Folgeprotokolle
  components/      Gantt, Kanban, Ressourcenraster, Diagramme, Formulare
  pages/           Cockpit, Projekte, Terminplanung, Ressourcen, Aufgaben, Zeiten, Arbeitszeit, Controlling, Team, Rollen
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
- Denkbar: Dokumentenablage je Projekt, E-Mail-Benachrichtigung bei Urlaubsanträgen, XRechnung-Export,
  direkte Abacus-Anbindung über die Abacus REST-API (statt Dateiübergabe).
