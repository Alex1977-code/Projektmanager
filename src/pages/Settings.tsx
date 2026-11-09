import { useState, type FormEvent } from 'react';
import { Database, Download, Info, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { IS_HOSTED } from '../hosted';
import { useConfirm } from '../components/Modal';
import { saveFile } from '../utils/files';
import { Card, EmptyState, Field, PageHeader } from '../components/ui';
import { fmtNum } from '../utils/format';
import { STATES } from '../../shared/holidays.js';
import type { Settings as SettingsT } from '../types';

const MODE_TEXT: Record<string, string> = {
  none: 'Keine Anmeldung – Benutzerwahl im Browser (nur für Demo/Einzelplatz geeignet)',
  ldap: 'Active Directory (LDAP): Anmeldung mit Windows-Benutzername und Kennwort',
  header: 'Windows-Single-Sign-on über vorgeschalteten Webserver (Kerberos/NTLM)',
};

export function Settings() {
  const { data, saveSettings, isAdmin, authMode, session } = useStore();
  const toast = useToast();
  const [s, setS] = useState<SettingsT>({ ...data.settings });
  const set = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => setS((x) => ({ ...x, [k]: v }));
  const numOf = (v: unknown, d: number) => (Number(String(v).replace(',', '.')) || d);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    saveSettings({ ...s, hoursPerDay: numOf(s.hoursPerDay, 8), nkPct: numOf(s.nkPct, 0), vatPct: numOf(s.vatPct, 19), paymentDays: numOf(s.paymentDays, 30) });
  };
  const exportAll = async () => {
    try {
      const data = await api.get('/api/export');
      await saveFile(`projektmanager-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (!isAdmin) return <div className="page"><EmptyState title="Kein Zugriff" text="Die Einstellungen sind der Administration vorbehalten." /></div>;

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
            <Field label="Name des Ingenieurbüros" span={2}><input value={s.companyName} onChange={(e) => set('companyName', e.target.value)} /></Field>
            <Field label="Regelarbeitszeit pro Tag (h)"><input inputMode="decimal" value={String(s.hoursPerDay)} onChange={(e) => set('hoursPerDay', e.target.value as unknown as number)} /></Field>
            <Field label="Bundesland (gesetzliche Feiertage)">
              <select value={s.state} onChange={(e) => set('state', e.target.value)}>
                {Object.entries(STATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div className="field-span2 form-section">Rechnungsstellung</div>
            <Field label="Anschrift (Briefkopf)" span={2}><textarea rows={2} value={s.companyAddress} onChange={(e) => set('companyAddress', e.target.value)} /></Field>
            <Field label="Bankverbindung"><input value={s.bankDetails} onChange={(e) => set('bankDetails', e.target.value)} /></Field>
            <Field label="USt-IdNr. / Steuernummer"><input value={s.taxId} onChange={(e) => set('taxId', e.target.value)} /></Field>
            <Field label="Nebenkostenpauschale (Standard, %)"><input inputMode="decimal" value={String(s.nkPct)} onChange={(e) => set('nkPct', e.target.value as unknown as number)} /></Field>
            <Field label="Umsatzsteuer (%)"><input inputMode="decimal" value={String(s.vatPct)} onChange={(e) => set('vatPct', e.target.value as unknown as number)} /></Field>
            <Field label="Zahlungsziel (Tage)"><input inputMode="numeric" value={String(s.paymentDays)} onChange={(e) => set('paymentDays', e.target.value as unknown as number)} /></Field>
            <div className="field form-actions"><button className="btn btn-primary" type="submit">Speichern</button></div>
          </form>
        </Card>

        {IS_HOSTED && <HostedDataCard />}

        {!IS_HOSTED && <Card title="Anmeldung und Berechtigungen">
          <div className="settings-row">
            <ShieldCheck size={20} className="muted" />
            <div className="grow">
              <p style={{ margin: '0 0 6px' }}><strong>{MODE_TEXT[authMode]}</strong>{session && <> · angemeldet als <code>{session.username}</code></>}</p>
              <p className="muted small" style={{ margin: 0 }}>
                Die Anmeldeart wird auf dem Server über Umgebungsvariablen festgelegt (<code>AUTH_MODE</code>, <code>LDAP_URL</code> …, siehe README).
                Personen werden über den <em>Windows-Anmeldenamen</em> im Mitarbeiterprofil zugeordnet. Rollen: <strong>Administration</strong> (alles inkl. Einstellungen und Mitarbeiterdaten),
                <strong> Projektleitung/Controlling</strong> (Projekte, Ressourcen, Kosten, Rechnungen, Genehmigungen), <strong>Mitarbeiter/in</strong> (Aufgaben, Protokolle, eigene Zeiten und Urlaubsanträge).
              </p>
            </div>
          </div>
        </Card>}

        <Card title="Datensicherung" subtitle="Vollständiger Export aller Daten als JSON (inkl. Zeitbuchungen)">
          <div className="settings-row">
            <Database size={20} className="muted" />
            <div className="grow">
              <div className="counts">
                {counts.map(([k, v]) => <span key={k}><strong>{fmtNum(v)}</strong> {k}</span>)}
              </div>
              <p className="muted small">Die Datenbank liegt serverseitig in <code>data/projektmanager.db</code> (SQLite). Für eine Sicherung genügt es, diese Datei regelmäßig zu kopieren.</p>
            </div>
            <button className="btn" onClick={exportAll}><Download size={16} /> Export herunterladen</button>
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

/** Veröffentlichte Version: gemeinsame Daten, Zurücksetzen. */
function HostedDataCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const { reload } = useStore();
  const reset = async () => {
    const ok = await confirm({
      title: 'Alle Daten löschen?',
      message: <>Alle Projekte, Aufgaben, Zeiten, Protokolle, Rechnungen und Mitarbeiterdaten werden <strong>auf allen Geräten und für alle Personen</strong> endgültig gelöscht.</>,
      confirmLabel: 'Alles löschen', danger: true,
    });
    if (!ok) return;
    const { resetAll } = await import('../local/backend');
    await resetAll();
    toast.success('Alle Daten wurden gelöscht');
    await reload();
  };
  return (
    <Card title="Gemeinsame Daten" subtitle="Veröffentlichte Version auf claude.ai">
      <div className="settings-row">
        <ShieldCheck size={20} className="muted" />
        <div className="grow">
          <p style={{ margin: '0 0 6px' }}>Alle Daten werden in der gemeinsamen Datenbank dieser Seite gespeichert und sind auf jedem Gerät (PC, Tablet, Handy) sofort aktuell.</p>
          <p className="muted small" style={{ margin: 0 }}>
            Wer die Seite öffnen darf, legen Sie über „Teilen“ auf claude.ai fest: Mitwirkende können Daten ändern, Betrachter nur lesen.
            Die Rollen dieser Software (Administration, Projektleitung, Mitarbeiter) gelten hier nicht – dafür ist die Version auf dem eigenen Server mit Active-Directory-Anmeldung gedacht.
          </p>
        </div>
        <button className="btn btn-ghost-danger" onClick={reset}>Alle Daten löschen</button>
      </div>
    </Card>
  );
}
