// Einstellungen: Rechnungsstammdaten, Nummernkreise, Standardtexte, Stundensätze, Standardrahmen.
import { useRef, useState } from 'react';
import { ImageUp, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';
import { useToast } from './Toast';
import { Card, Field } from './ui';
import { frameAssets } from './DocFrame';
import type { Asset, DocFrame, Settings } from '../types';

type SetFn = <K extends keyof Settings>(k: K, v: Settings[K]) => void;
const numStr = (v: unknown) => String(v ?? '');
const asNum = (v: string) => v as unknown as number; // wird beim Speichern in eine Zahl gewandelt

/** Beispielnummer zu einem Nummernkreis, z. B. „RE-{JJJJ}-{NNN}“ → RE-2026-001 */
export function sampleNumber(format: string) {
  const year = String(new Date().getFullYear());
  const fmt = /\{N+\}/.test(format || '') ? format : `${format || ''}{NNN}`;
  return fmt.replace(/\{JJJJ\}/g, year).replace(/\{JJ\}/g, year.slice(2)).replace(/\{(N+)\}/, (_, n: string) => '1'.padStart(n.length, '0'));
}

/** Bild auf Briefbogengröße verkleinern (A4 bei ca. 150 dpi) und als JPEG/PNG-Data-URL liefern. */
async function imageToDataUrl(file: File, maxW: number, maxH: number, keepAlpha: boolean): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Die Datei ist kein lesbares Bild.')); i.src = url; });
    let scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    for (let attempt = 0; attempt < 6; attempt++) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d')!;
      if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      for (const q of keepAlpha ? [1] : [0.85, 0.7, 0.55]) {
        const data = keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
        if (data.length < 230000) return data;
      }
      scale *= 0.8;
    }
    throw new Error('Das Bild lässt sich nicht ausreichend verkleinern.');
  } finally { URL.revokeObjectURL(url); }
}

function AssetSlot({ label, hint, slot, asset, maxW, maxH, keepAlpha }: { label: string; hint: string; slot: Asset['key']; asset?: Asset; maxW: number; maxH: number; keepAlpha?: boolean }) {
  const { reload } = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.type === 'application/pdf') { toast.error('Bitte den Briefbogen als Bild (PNG oder JPG) speichern – PDF-Dateien können nicht eingelesen werden.'); return; }
    setBusy(true);
    try {
      const data = await imageToDataUrl(file, maxW, maxH, !!keepAlpha);
      await api.put(`/api/assets/${slot}`, { data, name: file.name });
      await reload();
      toast.success(`${label} gespeichert`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const clear = async () => { try { await api.del(`/api/assets/${slot}`); await reload(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <div className="asset-slot">
      <div className={`asset-thumb asset-${slot}`}>{asset ? <img src={asset.data} alt={label} /> : <span>kein Bild</span>}</div>
      <div className="asset-info">
        <strong>{label}</strong>
        <small>{asset ? asset.name : hint}</small>
        <div className="row-actions">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}><ImageUp size={14} /> {asset ? 'Ersetzen' : 'Bild wählen'}</button>
          {asset && <button type="button" className="btn btn-sm btn-ghost" onClick={clear}><X size={14} /> Entfernen</button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
    </div>
  );
}

/** Schematische Vorschau: Blatt mit Rahmen und dem freigehaltenen Textbereich. */
function PagePreview({ title, frame, top, image, first, company }: { title: string; frame: DocFrame; top: number; image: string; first: boolean; company: string }) {
  const pct = (mm: number, of: number) => `${(Math.max(0, Number(mm) || 0) / of) * 100}%`;
  return (
    <figure className="frame-preview">
      <div className="frame-sheet">
        {image ? <img src={image} alt="" /> : (
          <>
            <div className={first ? 'fp-head fp-head-first' : 'fp-head'} style={{ borderColor: frame.accent, color: frame.accent, left: pct(frame.left, 210), right: pct(frame.right, 210) }}>{company}</div>
            <div className="fp-foot" style={{ borderColor: frame.accent, left: pct(frame.left, 210), right: pct(frame.right, 210) }}><i /><i /><i /><i /></div>
          </>
        )}
        <div className="fp-text" style={{ top: pct(top, 297), bottom: pct(frame.bottom, 297), left: pct(frame.left, 210), right: pct(frame.right, 210) }}><span>Textbereich</span></div>
      </div>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

export function MasterData({ s, set }: { s: Settings; set: SetFn }) {
  const { data } = useStore();
  const img = frameAssets(data.assets);
  const asset = (k: Asset['key']) => data.assets.find((a) => a.key === k);
  const f = s.docFrame;
  const setFrame = <K extends keyof DocFrame>(k: K, v: DocFrame[K]) => set('docFrame', { ...f, [k]: v });
  const rates = s.offerRates || [];
  const setRate = (i: number, patch: Partial<{ label: string; rate: number }>) => set('offerRates', rates.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = <button className="btn btn-primary" type="submit">Speichern</button>;

  return (
    <>
      <Card title="Rechnungsstammdaten" subtitle="Erscheinen im Briefkopf und in der Fußzeile von Angeboten und Rechnungen" actions={save}>
        <div className="form-grid">
          <Field label="Anschrift" span={2}><textarea rows={2} value={s.companyAddress} onChange={(e) => set('companyAddress', e.target.value)} /></Field>
          <Field label="Telefon"><input value={s.companyPhone} onChange={(e) => set('companyPhone', e.target.value)} placeholder="0421 123456-0" /></Field>
          <Field label="E-Mail"><input value={s.companyEmail} onChange={(e) => set('companyEmail', e.target.value)} placeholder="info@buero.de" /></Field>
          <Field label="Internet"><input value={s.companyWeb} onChange={(e) => set('companyWeb', e.target.value)} placeholder="www.buero.de" /></Field>
          <Field label="Geschäftsführung"><input value={s.managingDirectors} onChange={(e) => set('managingDirectors', e.target.value)} placeholder="Dipl.-Ing. …" /></Field>
          <Field label="Handelsregister"><input value={s.registerInfo} onChange={(e) => set('registerInfo', e.target.value)} placeholder="Amtsgericht Bremen, HRB 12345" /></Field>
          <Field label="USt-IdNr."><input value={s.taxId} onChange={(e) => set('taxId', e.target.value)} /></Field>
          <Field label="Steuernummer"><input value={s.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} /></Field>
          <Field label="Bank"><input value={s.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Sparkasse …" /></Field>
          <Field label="IBAN · BIC" span={2}><input value={s.bankDetails} onChange={(e) => set('bankDetails', e.target.value)} /></Field>
          <div className="field-span2 form-section">Konditionen</div>
          <Field label="Zahlungsziel (Tage)"><input inputMode="numeric" value={numStr(s.paymentDays)} onChange={(e) => set('paymentDays', asNum(e.target.value))} /></Field>
          <Field label="Umsatzsteuer (%)"><input inputMode="decimal" value={numStr(s.vatPct)} onChange={(e) => set('vatPct', asNum(e.target.value))} /></Field>
          <Field label="Nebenkostenpauschale (Standard, %)"><input inputMode="decimal" value={numStr(s.nkPct)} onChange={(e) => set('nkPct', asNum(e.target.value))} /></Field>
          <Field label="Skonto (% / Tage, 0 = keins)">
            <div className="inline-pair">
              <input inputMode="decimal" value={numStr(s.skontoPct)} onChange={(e) => set('skontoPct', asNum(e.target.value))} aria-label="Skonto in Prozent" />
              <input inputMode="numeric" value={numStr(s.skontoDays)} onChange={(e) => set('skontoDays', asNum(e.target.value))} aria-label="Skontofrist in Tagen" />
            </div>
          </Field>
          <Field label="Bindefrist Angebote (Tage)"><input inputMode="numeric" value={numStr(s.offerValidDays)} onChange={(e) => set('offerValidDays', asNum(e.target.value))} /></Field>
        </div>
      </Card>

      <Card title="Nummernkreise und Standardtexte" subtitle="Platzhalter: {JJJJ} Jahr, {JJ} Jahr zweistellig, {NNN} laufende Nummer je Jahr (Anzahl N = Stellen)" actions={save}>
        <div className="form-grid">
          <Field label="Rechnungsnummer" hint={`nächste z. B. ${sampleNumber(s.invoiceNoFormat)}`}><input value={s.invoiceNoFormat} onChange={(e) => set('invoiceNoFormat', e.target.value)} /></Field>
          <Field label="Angebotsnummer" hint={`nächste z. B. ${sampleNumber(s.offerNoFormat)}`}><input value={s.offerNoFormat} onChange={(e) => set('offerNoFormat', e.target.value)} /></Field>
          <Field label="Rechnung – Einleitung" span={2} hint="Platzhalter: {leistungsstand}"><textarea rows={2} value={s.invoiceIntro} onChange={(e) => set('invoiceIntro', e.target.value)} /></Field>
          <Field label="Rechnung – Schlusstext" span={2} hint="Platzhalter: {faellig}, {rechnungsnummer}"><textarea rows={2} value={s.invoiceClosing} onChange={(e) => set('invoiceClosing', e.target.value)} /></Field>
          <Field label="Angebot – Einleitung (Vorbelegung)" span={2}><textarea rows={3} value={s.offerIntro} onChange={(e) => set('offerIntro', e.target.value)} /></Field>
          <Field label="Angebot – Schlusstext (Vorbelegung)" span={2} hint="Platzhalter: {gueltig}"><textarea rows={4} value={s.offerClosing} onChange={(e) => set('offerClosing', e.target.value)} /></Field>
          <div className="field-span2 form-section">Stundensätze für Angebote (Positionen nach Aufwand)</div>
          <div className="field-span2 rate-list">
            {rates.map((r, i) => (
              <div key={i} className="rate-row">
                <input value={r.label} onChange={(e) => setRate(i, { label: e.target.value })} aria-label="Bezeichnung" placeholder="Bezeichnung" />
                <input inputMode="decimal" value={numStr(r.rate)} onChange={(e) => setRate(i, { rate: asNum(e.target.value) })} aria-label="Stundensatz" />
                <span className="muted">€/h</span>
                <button type="button" className="icon-btn" onClick={() => set('offerRates', rates.filter((_, j) => j !== i))} aria-label="Stundensatz entfernen"><Trash2 size={15} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('offerRates', [...rates, { label: '', rate: 0 }])}><Plus size={14} /> Stundensatz</button>
          </div>
        </div>
      </Card>

      <Card title="Standardrahmen (Briefbogen)" subtitle="Rahmen für Angebote und Rechnungen – die erste Seite kann anders aussehen als die Folgeseiten" actions={save}>
        <div className="frame-layout">
          <div className="form-grid">
            <div className="field field-span2">
              <span className="field-label">Rahmen</span>
              <div className="segmented" role="group" aria-label="Rahmen">
                <button type="button" className={f.mode === 'generated' ? 'active' : ''} onClick={() => setFrame('mode', 'generated')}>Aus Stammdaten erzeugen</button>
                <button type="button" className={f.mode === 'image' ? 'active' : ''} onClick={() => setFrame('mode', 'image')}>Eigener Briefbogen (Bild)</button>
              </div>
            </div>
            {f.mode === 'image' ? (
              <div className="field-span2 asset-list">
                <AssetSlot slot="frameFirst" label="Erste Seite" hint="A4-Briefbogen als PNG oder JPG (ganze Seite)" asset={asset('frameFirst')} maxW={1240} maxH={1754} />
                <AssetSlot slot="frameNext" label="Folgeseiten" hint="leer = wie erste Seite" asset={asset('frameNext')} maxW={1240} maxH={1754} />
              </div>
            ) : (
              <>
                <div className="field-span2 asset-list">
                  <AssetSlot slot="logo" label="Logo (optional)" hint="erscheint im Kopf der ersten Seite" asset={asset('logo')} maxW={640} maxH={240} keepAlpha />
                </div>
                <Field label="Akzentfarbe"><input type="color" value={f.accent || '#0b1f3a'} onChange={(e) => setFrame('accent', e.target.value)} /></Field>
              </>
            )}
            <div className="field-span2 form-section">Textbereich (Abstände in mm vom Blattrand)</div>
            <Field label="oben – erste Seite"><input inputMode="decimal" value={numStr(f.topFirst)} onChange={(e) => setFrame('topFirst', asNum(e.target.value))} /></Field>
            <Field label="oben – Folgeseiten"><input inputMode="decimal" value={numStr(f.topNext)} onChange={(e) => setFrame('topNext', asNum(e.target.value))} /></Field>
            <Field label="unten"><input inputMode="decimal" value={numStr(f.bottom)} onChange={(e) => setFrame('bottom', asNum(e.target.value))} /></Field>
            <Field label="links / rechts">
              <div className="inline-pair">
                <input inputMode="decimal" value={numStr(f.left)} onChange={(e) => setFrame('left', asNum(e.target.value))} aria-label="Rand links" />
                <input inputMode="decimal" value={numStr(f.right)} onChange={(e) => setFrame('right', asNum(e.target.value))} aria-label="Rand rechts" />
              </div>
            </Field>
            <label className="check-field field-span2"><input type="checkbox" checked={!!f.foldMarks} onChange={(e) => setFrame('foldMarks', e.target.checked)} /> Falz- und Lochmarken auf der ersten Seite</label>
          </div>
          <div className="frame-previews">
            <PagePreview title="Erste Seite" frame={f} top={f.topFirst} first image={f.mode === 'image' ? img.first : ''} company={s.companyName} />
            <PagePreview title="Folgeseiten" frame={f} top={f.topNext} first={false} image={f.mode === 'image' ? img.next || img.first : ''} company={s.companyName} />
          </div>
        </div>
        <p className="footnote">Das Anschriftenfeld sitzt am Beginn des Textbereichs der ersten Seite; bei 45 mm passt es in Fensterumschläge (DIN 5008, Form B). Beim Drucken im Browser „Ränder: keine“ und „Hintergrundgrafiken“ wählen.</p>
      </Card>
    </>
  );
}
