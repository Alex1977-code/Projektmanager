// Start der veröffentlichten Version: Verbindung zur gemeinsamen Datenbank, bei leerem Bestand Auswahl
// zwischen Beispieldaten und leerem Start. Danach zeigt ein Hinweis in der Kopfzeile den Sync-Status.
import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, CloudOff, Database, Loader2, RefreshCw, Sparkles, WifiOff } from 'lucide-react';
import { onSyncStatus, ready, seedDemo, syncBusy, type SyncStatus } from './backend';
import { setSettingsFirstRun } from './firstRun';

export function HostedGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'connecting' | 'empty' | 'seeding' | 'ready'>('connecting');
  const [status, setStatus] = useState<SyncStatus>({ state: 'connecting' });

  useEffect(() => onSyncStatus(setStatus), []);
  useEffect(() => {
    ready().then((r) => setState(r.empty ? 'empty' : 'ready'));
  }, []);
  const startDemo = async () => {
    setState('seeding');
    await seedDemo();
    // warten, bis alles gespeichert ist (oder ohne gemeinsame Datenbank sofort weiter)
    for (let i = 0; i < 600 && syncBusy(); i++) await new Promise((r) => setTimeout(r, 250));
    setState('ready');
  };

  if (state === 'ready') return <>{children}</>;
  return (
    <div className="login-screen">
      <div className="login-card hosted-card">
        <div className="login-brand">
          <svg viewBox="0 0 32 32" width="44" height="44" aria-hidden><rect width="32" height="32" rx="8" fill="#0b1f3a" /><path d="M5 21h22M8 21V12m16 9V12M8 12l8-5 8 5" stroke="#38bdf8" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 25.5c3 0 3-1.6 5.5-1.6S13 25.5 16 25.5s3-1.6 5.5-1.6 2.5 1.6 5.5 1.6" stroke="#7dd3fc" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
          <div>
            <h1>Projektsteuerung</h1>
            <p>Stahlwasserbau &amp; Bewegliche Brücken</p>
          </div>
        </div>
        {state === 'connecting' && (
          <p className="hosted-line"><Loader2 size={16} className="spin" /> Verbindung zur gemeinsamen Datenbank wird hergestellt …</p>
        )}
        {state === 'empty' && (
          <>
            <p className="login-hint"><Database size={16} /> <span>
              Noch keine Daten vorhanden. Alles, was Sie hier erfassen, wird gemeinsam gespeichert und ist auf allen Geräten
              (PC, Tablet, Handy) und für alle Personen mit Zugriff auf diese Seite sofort sichtbar.
            </span></p>
            {status.state === 'local' && <p className="login-error"><CloudOff size={15} /> {status.reason}</p>}
            <button className="btn btn-primary login-btn" onClick={startDemo}>
              <Sparkles size={16} /> Mit Beispieldaten ausprobieren
            </button>
            <button className="btn login-btn" onClick={async () => { await setSettingsFirstRun(); setState('ready'); }}>
              Leer beginnen und eigene Daten erfassen
            </button>
            <p className="muted small" style={{ margin: 0 }}>Beispieldaten lassen sich später unter Einstellungen wieder vollständig löschen.</p>
          </>
        )}
        {state === 'seeding' && (
          <>
            <p className="hosted-line"><Loader2 size={16} className="spin" /> Beispieldaten werden angelegt und gespeichert …</p>
            {status.state === 'saving' && status.total ? (
              <div className="progress" style={{ height: 8 }}><div className="progress-fill progress-blue" style={{ width: `${Math.round((1 - status.pending / status.total) * 100)}%` }} /></div>
            ) : null}
            <p className="muted small" style={{ margin: 0 }}>Das dauert beim ersten Mal etwa eine Minute.</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Statusanzeige in der Kopfzeile. */
export function SyncChip() {
  const [s, setS] = useState<SyncStatus>({ state: 'connecting' });
  useEffect(() => onSyncStatus(setS), []);
  const map: Record<SyncStatus['state'], { icon: ReactNode; text: string; tone: string }> = {
    connecting: { icon: <Loader2 size={14} className="spin" />, text: 'Verbinde …', tone: 'muted' },
    synced: { icon: <CheckCircle2 size={14} />, text: 'Synchronisiert', tone: 'good' },
    saving: { icon: <RefreshCw size={14} className="spin" />, text: 'Speichert …', tone: 'muted' },
    local: { icon: <WifiOff size={14} />, text: 'Nur dieses Gerät', tone: 'warn' },
    readonly: { icon: <CloudOff size={14} />, text: 'Nur Lesezugriff', tone: 'warn' },
    error: { icon: <CloudOff size={14} />, text: 'Nicht gespeichert', tone: 'bad' },
  };
  const m = map[s.state];
  const title = s.state === 'error' ? s.message : s.state === 'local' ? s.reason : s.state === 'readonly'
    ? 'Sie haben auf diese Seite nur Lesezugriff. Änderungen werden nicht gespeichert.'
    : s.state === 'saving' ? `${s.pending} Änderung(en) werden gespeichert` : 'Alle Änderungen sind auf allen Geräten verfügbar';
  return <span className={`sync-chip sync-${m.tone}`} title={title}>{m.icon}<span>{m.text}</span></span>;
}
