import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Eye, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { useToast } from './Toast';
import { Card, EmptyState, Field, Kpi, Segmented } from './ui';
import type { AbacusColumn, AbacusConfig } from '../types';
import { addMonths, monthLong } from '../utils/date';
import { fmtNum } from '../utils/format';
import { saveFile } from '../utils/files';

type ExportType = 'leistungen' | 'arbeitszeit';

const FIELDS: Record<ExportType, [string, string][]> = {
  leistungen: [
    ['mandant', 'Mandant'], ['personnelNo', 'Personalnummer'], ['employeeName', 'Name'], ['date', 'Datum'],
    ['projectNo', 'Abacus-Projektnummer'], ['projectName', 'Projektbezeichnung'], ['phaseCode', 'Leistungsphase'],
    ['serviceType', 'Leistungsart'], ['hours', 'Stunden'], ['text', 'Buchungstext'],
  ],
  arbeitszeit: [
    ['mandant', 'Mandant'], ['personnelNo', 'Personalnummer'], ['employeeName', 'Name'], ['date', 'Datum'],
    ['start', 'Beginn'], ['end', 'Ende'], ['breakMin', 'Pause (min)'], ['hours', 'Arbeitszeit (h)'],
    ['absence', 'Absenzcode'], ['location', 'Arbeitsort'], ['text', 'Bemerkung'],
  ],
};

interface Preview { filename: string; count: number; hours: number; warnings: string[]; rows: Record<string, string>[]; columns: AbacusColumn[] }
interface LogRow { id: number; type: string; period: string; createdAt: string; count: number; hours: number; filename: string; createdBy: number | null }

export function AbacusPanel({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const { data, idx, can, saveSettings, reload } = useStore();
  const toast = useToast();
  const [type, setType] = useState<ExportType>('leistungen');
  const [onlyApproved, setOnlyApproved] = useState(data.settings.abacus?.onlyApproved ?? true);
  const [mark, setMark] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);

  const loadLog = useCallback(async () => {
    if (!can('abacus.export')) return;
    try { setLog((await api.get<LogRow[]>('/api/abacusExports')).filter((l) => l.type === 'leistungen' || l.type === 'arbeitszeit')); } catch { /* ohne Protokoll */ }
  }, [can]);
  useEffect(() => { loadLog(); }, [loadLog]);
  useEffect(() => setPreview(null), [type, month, onlyApproved]);

  const run = async (dry: boolean) => {
    setBusy(true);
    try {
      const res = await api.post<Preview & { content?: string }>('/api/abacus/export', { type, month, preview: dry, markExported: mark, config: { onlyApproved } });
      if (dry) setPreview(res);
      else {
        if (!res.count) { toast.error('Keine Datensätze für diesen Zeitraum'); return; }
        await saveFile(res.filename, new Blob([res.content || ''], { type: 'text/csv;charset=utf-8' }));
        toast.success(`${res.count} Datensätze (${fmtNum(res.hours, 1)} h) exportiert: ${res.filename}`);
        setPreview(null);
        loadLog();
        reload();
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const missing = data.employees.filter((e) => e.active && !e.personnelNo);
  const cfg = data.settings.abacus;

  return (
    <>
      {can('abacus.export') ? (
        <>
          <Card title="Übergabe an Abacus" subtitle="Erzeugt eine Importdatei (CSV) nach der unten konfigurierten Vorlage – Projektzeiten für die Leistungserfassung (AbaProject), Arbeitszeiten für HR/Lohn.">
            <div className="abacus-form">
              <Segmented value={type} onChange={setType} options={[{ value: 'leistungen', label: 'Projektzeiten (Leistungen)' }, { value: 'arbeitszeit', label: 'Arbeitszeiten' }]} />
              <div className="week-nav">
                <button className="icon-btn" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))} aria-label="Vormonat"><ChevronLeft size={18} /></button>
                <strong className="week-label month-label">{monthLong(`${month}-01`)} {month.slice(0, 4)}</strong>
                <button className="icon-btn" onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))} aria-label="Folgemonat"><ChevronRight size={18} /></button>
              </div>
              <label className="check-inline"><input type="checkbox" checked={onlyApproved} onChange={(e) => setOnlyApproved(e.target.checked)} /> nur freigegebene Monate</label>
              <label className="check-inline"><input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} /> als „übergeben“ kennzeichnen</label>
              <span className="spacer" />
              <button className="btn" onClick={() => run(true)} disabled={busy}><Eye size={16} /> Vorschau</button>
              <button className="btn btn-primary" onClick={() => run(false)} disabled={busy}><Download size={16} /> Exportdatei erzeugen</button>
            </div>
            {missing.length > 0 && <p className="tpl-hint" style={{ marginTop: 12 }}><AlertTriangle size={14} /> {missing.length} aktive Person(en) ohne Abacus-Personalnummer: {missing.slice(0, 6).map((e) => e.name).join(', ')}{missing.length > 6 ? ' …' : ''} – unter Team → Mitarbeiter bearbeiten ergänzen.</p>}
          </Card>

          {preview && (
            <Card padded={false} title={`Vorschau: ${preview.filename}`} subtitle={`${preview.count} Datensätze · ${fmtNum(preview.hours, 1)} Stunden${preview.count > preview.rows.length ? ` · angezeigt: erste ${preview.rows.length}` : ''}`}>
              {preview.warnings.length > 0 && (
                <ul className="abacus-warn">{preview.warnings.map((w, i) => <li key={i}><AlertTriangle size={14} /> {w}</li>)}</ul>
              )}
              {preview.count === 0 ? <EmptyState title="Keine Datensätze" text="Für diesen Monat gibt es keine (freigegebenen) Zeiten." /> : (
                <div className="table-wrap" style={{ maxHeight: 420 }}>
                  <table className="table abacus-table">
                    <thead><tr>{preview.columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr></thead>
                    <tbody>{preview.rows.map((r, i) => <tr key={i}>{preview.columns.map((c) => <td key={c.key} className={c.key === 'hours' ? 'num' : ''}>{r[c.key]}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <Card padded={false} title="Exportprotokoll">
            {log.length === 0 ? <EmptyState title="Noch keine Übergaben" /> : (
              <table className="table">
                <thead><tr><th>Zeitpunkt</th><th>Art</th><th>Zeitraum</th><th className="num">Datensätze</th><th className="num">Stunden</th><th>Datei</th><th>durch</th></tr></thead>
                <tbody>
                  {log.slice(0, 30).map((l) => (
                    <tr key={l.id}>
                      <td className="nowrap">{new Date(l.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{l.type === 'leistungen' ? 'Projektzeiten' : 'Arbeitszeiten'}</td>
                      <td>{monthLong(`${l.period}-01`)} {l.period.slice(0, 4)}</td>
                      <td className="num">{l.count}</td>
                      <td className="num">{fmtNum(l.hours, 1)}</td>
                      <td className="small mono">{l.filename}</td>
                      <td className="small">{l.createdBy ? idx.employeeById.get(l.createdBy)?.name : 'Administrator'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      ) : null}

      {can('settings.edit') && cfg && <AbacusConfigCard cfg={cfg} onSave={(c) => saveSettings({ abacus: c })} phaseCodes={[...new Set(data.phases.map((p) => p.code || '').filter(Boolean))].sort()} />}
    </>
  );
}

function AbacusConfigCard({ cfg, onSave, phaseCodes }: { cfg: AbacusConfig; onSave: (c: AbacusConfig) => void; phaseCodes: string[] }) {
  const [c, setC] = useState<AbacusConfig>(cfg);
  useEffect(() => setC(cfg), [cfg]);
  const set = <K extends keyof AbacusConfig>(k: K, v: AbacusConfig[K]) => setC((x) => ({ ...x, [k]: v }));
  const codes = [...new Set([...phaseCodes, ...Object.keys(c.serviceTypes || {})])].sort((a, b) => (a.startsWith('LPH') === b.startsWith('LPH') ? a.localeCompare(b, 'de', { numeric: true }) : a.startsWith('LPH') ? -1 : 1));

  const columnEditor = (kind: ExportType) => {
    const key = kind === 'leistungen' ? 'leistungColumns' : 'arbeitszeitColumns';
    const cols = c[key];
    const setCols = (v: AbacusColumn[]) => set(key, v);
    const unused = FIELDS[kind].filter(([k]) => !cols.some((x) => x.key === k));
    return (
      <div className="col-editor">
        {cols.map((col, i) => (
          <div key={col.key} className="col-row">
            <span className="col-no">{i + 1}</span>
            <span className="col-field">{FIELDS[kind].find(([k]) => k === col.key)?.[1] || col.key}</span>
            <input value={col.header} onChange={(e) => setCols(cols.map((x, j) => (j === i ? { ...x, header: e.target.value } : x)))} aria-label="Spaltenüberschrift" />
            <button className="icon-btn" disabled={i === 0} onClick={() => { const n = [...cols]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setCols(n); }} aria-label="nach oben"><ArrowUp size={14} /></button>
            <button className="icon-btn" disabled={i === cols.length - 1} onClick={() => { const n = [...cols]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setCols(n); }} aria-label="nach unten"><ArrowDown size={14} /></button>
            <button className="icon-btn danger" onClick={() => setCols(cols.filter((_, j) => j !== i))} aria-label="Spalte entfernen"><X size={14} /></button>
          </div>
        ))}
        {unused.length > 0 && (
          <label className="rg-add-select">
            <Plus size={14} />
            <select value="" onChange={(e) => { const f = FIELDS[kind].find(([k]) => k === e.target.value); if (f) setCols([...cols, { key: f[0], header: f[1] }]); }}>
              <option value="">Spalte hinzufügen …</option>
              {unused.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        )}
      </div>
    );
  };

  return (
    <Card title="Schnittstelle konfigurieren" subtitle="Die Vorlage muss zur Importdefinition in Ihrer Abacus-Installation passen (Spaltenreihenfolge, Trennzeichen, Codes) – bitte mit dem Abacus-Partner abstimmen."
      actions={<button className="btn btn-sm btn-primary" onClick={() => onSave(c)}>Speichern</button>}>
      <div className="form-grid abacus-cfg">
        <Field label="Mandant"><input value={c.mandant} onChange={(e) => set('mandant', e.target.value)} placeholder="z. B. 1000" /></Field>
        <Field label="Standard-Leistungsart" hint="wenn keine Zuordnung zur Leistungsphase"><input value={c.defaultServiceType} onChange={(e) => set('defaultServiceType', e.target.value)} /></Field>
        <Field label="Trennzeichen">
          <select value={c.separator} onChange={(e) => set('separator', e.target.value)}>
            <option value=";">Semikolon ( ; )</option><option value=",">Komma ( , )</option><option value="\t">Tabulator</option>
          </select>
        </Field>
        <Field label="Dezimaltrennzeichen">
          <select value={c.decimal} onChange={(e) => set('decimal', e.target.value)}><option value=",">Komma (7,50)</option><option value=".">Punkt (7.50)</option></select>
        </Field>
        <Field label="Datumsformat">
          <select value={c.dateFormat} onChange={(e) => set('dateFormat', e.target.value)}><option>DD.MM.YYYY</option><option>YYYY-MM-DD</option><option>DD/MM/YYYY</option><option>YYYYMMDD</option></select>
        </Field>
        <Field label="Zeichenkodierung">
          <select value={c.encoding} onChange={(e) => set('encoding', e.target.value)}><option value="utf-8-bom">UTF-8 mit BOM (Excel-kompatibel)</option><option value="utf-8">UTF-8</option></select>
        </Field>
        <label className="check-field"><input type="checkbox" checked={c.onlyApproved} onChange={(e) => set('onlyApproved', e.target.checked)} /> standardmäßig nur freigegebene Monate</label>
      </div>
      <div className="abacus-grid">
        <div>
          <h4>Leistungsarten je Leistungsphase</h4>
          <div className="map-list">
            {codes.map((code) => (
              <label key={code} className="map-row"><span>{code}</span>
                <input value={c.serviceTypes?.[code] || ''} placeholder={c.defaultServiceType} onChange={(e) => set('serviceTypes', { ...c.serviceTypes, [code]: e.target.value })} />
              </label>
            ))}
          </div>
          <h4>Absenzcodes (Arbeitszeit-Export)</h4>
          <div className="map-list">
            {Object.entries(c.absenceCodes || {}).map(([k, v]) => (
              <label key={k} className="map-row"><span>{k === 'holiday' ? 'Feiertag' : k}</span>
                <input value={v} onChange={(e) => set('absenceCodes', { ...c.absenceCodes, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </div>
        <div>
          <h4>Spalten: Projektzeiten</h4>
          {columnEditor('leistungen')}
          <h4>Spalten: Arbeitszeiten</h4>
          {columnEditor('arbeitszeit')}
        </div>
      </div>
      <Kpi label="Beispielzeile Projektzeiten" value={<code className="abacus-sample">{c.leistungColumns.map((col) => ({ mandant: c.mandant || '1000', personnelNo: '1001', employeeName: 'Max Muster', date: c.dateFormat.replace('YYYY', '2026').replace('MM', '10').replace('DD', '05'), projectNo: '2025012', projectName: 'Schleuse …', phaseCode: 'LPH 3', serviceType: c.serviceTypes?.['LPH 3'] || c.defaultServiceType, hours: `7${c.decimal}50`, text: 'LPH 3 Entwurfsplanung' } as Record<string, string>)[col.key]).join(c.separator === '\\t' ? ' ⇥ ' : c.separator)}</code>} />
    </Card>
  );
}
