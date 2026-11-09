// Standardrahmen für Angebote und Rechnungen: Briefbogen mit abweichender erster Seite.
// Aufbau für den Druck: der Rahmen der Folgeseiten liegt fest auf jeder Seite, der Rahmen der ersten
// Seite deckt ihn auf Seite 1 ab. Eine Tabelle mit Kopf- und Fußzeile hält auf jeder Seite den Platz frei.
import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../store';
import type { Asset, Settings } from '../types';

export function frameAssets(assets: Asset[] | undefined) {
  const by = (k: string) => (assets || []).find((a) => a.key === k)?.data || '';
  return { first: by('frameFirst'), next: by('frameNext'), logo: by('logo') };
}

function Footer({ s }: { s: Settings }) {
  const cols = [
    [s.companyName, ...s.companyAddress.split('\n')],
    [s.companyPhone && `Tel. ${s.companyPhone}`, s.companyEmail, s.companyWeb],
    [s.bankName, ...s.bankDetails.split(/\s+·\s+|\n/)],
    [s.managingDirectors && `Geschäftsführung: ${s.managingDirectors}`, s.registerInfo, s.taxId, s.taxNumber && `St.-Nr. ${s.taxNumber}`],
  ].map((c) => c.filter(Boolean) as string[]).filter((c) => c.length);
  return (
    <div className="df-foot" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
      {cols.map((c, i) => <div key={i}>{c.map((l, j) => <span key={j}>{l}<br /></span>)}</div>)}
    </div>
  );
}

export function DocFrame({ className, children, docLabel }: { className?: string; children: ReactNode; docLabel?: string }) {
  const { data } = useStore();
  const s = data.settings;
  const f = s.docFrame;
  const img = frameAssets(data.assets);
  const useImage = f.mode === 'image' && !!img.first;
  const style = {
    '--df-top-first': `${f.topFirst}mm`, '--df-top-next': `${f.topNext}mm`, '--df-bottom': `${f.bottom}mm`,
    '--df-left': `${f.left}mm`, '--df-right': `${f.right}mm`, '--df-accent': f.accent || '#0b1f3a',
  } as CSSProperties;
  return (
    <article className={`print-only doc-print ${className || ''}`} style={style}>
      <div className="df-next" aria-hidden>
        {useImage ? <img src={img.next || img.first} alt="" /> : (
          <>
            <div className="df-head df-head-next"><strong>{s.companyName}</strong>{docLabel && <span>{docLabel}</span>}</div>
            <Footer s={s} />
          </>
        )}
      </div>
      <div className="df-first" aria-hidden>
        {useImage ? <img src={img.first} alt="" /> : (
          <>
            <div className="df-head df-head-first">
              <div className="df-brand">{img.logo ? <img src={img.logo} alt="" /> : <strong>{s.companyName}</strong>}</div>
              <div className="df-contact">
                {img.logo && <strong>{s.companyName}</strong>}
                {s.companyAddress.split('\n').map((l, i) => <span key={i}>{l}</span>)}
                {s.companyPhone && <span>Tel. {s.companyPhone}</span>}
                {s.companyEmail && <span>{s.companyEmail}</span>}
                {s.companyWeb && <span>{s.companyWeb}</span>}
              </div>
            </div>
            <Footer s={s} />
          </>
        )}
        {f.foldMarks && <><i className="df-mark" style={{ top: '105mm' }} /><i className="df-mark df-mark-hole" style={{ top: '148.5mm' }} /><i className="df-mark" style={{ top: '210mm' }} /></>}
      </div>
      <table className="df-table">
        <thead><tr><td><div className="df-space-top" /></td></tr></thead>
        <tfoot><tr><td><div className="df-space-bottom" /></td></tr></tfoot>
        <tbody><tr><td><div className="df-first-extra" />{children}</td></tr></tbody>
      </table>
    </article>
  );
}
