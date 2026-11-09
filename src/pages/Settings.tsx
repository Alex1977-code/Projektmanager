import { useState, type FormEvent } from 'react';
import { Database, Download, Info } from 'lucide-react';
import { useStore } from '../store';
import { Card, Field, PageHeader } from '../components/ui';
import { fmtNum } from '../utils/format';

export function Settings() {
  const { data, saveSettings } = useStore();
  const [companyName, setCompanyName] = useState(data.settings.companyName);
  const [hoursPerDay, setHoursPerDay] = useState(String(data.settings.hoursPerDay));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    saveSettings({ companyName, hoursPerDay: Number(hoursPerDay.replace(',', '.')) || 8 });
  };

  const counts: [string, number][] = [
    ['Projekte', data.projects.length], ['Leistungsphasen', data.phases.length], ['Aufgaben', data.tasks.length],
    ['Meilensteine', data.milestones.length], ['Mitarbeitende', data.employees.length], ['Wochenplanungen', data.allocations.length],
    ['Kostenpositionen', data.costs.length], ['Gebuchte Stunden', Math.round(data.summary.byPhase.reduce((s, r) => s + r.hours, 0))],
  ];

  return (
    <div className="page page-narrow">
      <PageHeader title="Einstellungen" subtitle="Büro-Stammdaten, Datensicherung und Systeminformationen" />
      <div className="stack">
        <Card title="Büro">
          <form className="form-grid" onSubmit={submit}>
            <Field label="Name des Ingenieurbüros" span={2}><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></Field>
            <Field label="Regelarbeitszeit pro Tag (h)"><input inputMode="decimal" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)} /></Field>
            <div className="field form-actions"><button className="btn btn-primary" type="submit">Speichern</button></div>
          </form>
        </Card>

        <Card title="Datensicherung" subtitle="Vollständiger Export aller Daten als JSON (inkl. Zeitbuchungen)">
          <div className="settings-row">
            <Database size={20} className="muted" />
            <div className="grow">
              <div className="counts">
                {counts.map(([k, v]) => <span key={k}><strong>{fmtNum(v)}</strong> {k}</span>)}
              </div>
              <p className="muted small">Die Datenbank liegt serverseitig in <code>data/projektmanager.db</code> (SQLite). Für eine Sicherung genügt es, diese Datei regelmäßig zu kopieren.</p>
            </div>
            <a className="btn" href="/api/export" download><Download size={16} /> Export herunterladen</a>
          </div>
        </Card>

        <Card title="Hinweise zur Bedienung">
          <ul className="help-list">
            <li><Info size={15} /> <span><kbd>Strg</kbd> + <kbd>K</kbd> öffnet die Schnellsuche für Projekte, Aufgaben und Personen.</span></li>
            <li><Info size={15} /> <span>Im <strong>Terminplan</strong> lassen sich Leistungsphasen und Aufgaben per Drag &amp; Drop verschieben und an den Enden verlängern.</span></li>
            <li><Info size={15} /> <span>In der <strong>Ressourcenplanung</strong> eine Person aufklappen und Wochenstunden je Projekt eintragen – Überlastungen werden rot markiert.</span></li>
            <li><Info size={15} /> <span>Aufgaben im <strong>Board</strong> zwischen den Spalten ziehen. „In Prüfung“ bildet das 4-Augen-Prinzip für statische Berechnungen und Pläne ab.</span></li>
            <li><Info size={15} /> <span>Ist-Kosten entstehen aus der <strong>Zeiterfassung</strong> (Stunden × Verrechnungssatz) und den erfassten Fremdkosten.</span></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
