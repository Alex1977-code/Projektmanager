// Dateien anbieten und Druckfassungen ausgeben – auf dem eigenen Server über den Browser,
// in der veröffentlichten Version über die Download-Funktion (dort ist der Druckdialog gesperrt).
import { IS_HOSTED } from '../hosted';

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function saveFile(filename: string, content: string | Blob, mime = 'text/plain;charset=utf-8'): Promise<boolean> {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  if (IS_HOSTED) {
    const claude = (window as any).claude;
    const downloads = claude?.use ? await claude.use('downloads').catch(() => null) : null;
    if (!downloads) throw new Error('Downloads sind in dieser Ansicht nicht verfügbar.');
    try {
      await downloads.save({ filename, data: blob });
      return true;
    } catch (e: any) {
      if (e?.code === 'declined') return false;
      throw new Error(e?.message || 'Die Datei konnte nicht gespeichert werden.');
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

const FRAMED_PAGE = '@page{size:A4;margin:0}';

/** Eigenständiges HTML-Dokument aus der Druckfassung eines Elements (zum Öffnen und Drucken/als PDF). */
function standaloneHtml(el: Element, title: string, framed: boolean) {
  const css: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of Array.from(rules)) {
      if (r.constructor.name === 'CSSFontFaceRule') continue;
      css.push(r.cssText.replace(/^@media print\b/, '@media all'));
    }
  }
  // mit Standardrahmen: randlos drucken; am Bildschirm als Blatt anzeigen (Folgeseiten-Rahmen nur im Druck)
  const extra = framed
    ? `${FRAMED_PAGE}
body{background:#fff;margin:0;padding:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media screen{body{background:#e6e9ef}.doc-print{width:210mm;min-height:297mm;margin:8mm auto;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.18)}.df-next{display:none!important}}`
    : 'body{background:#fff;margin:0;padding:16mm 14mm;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/</g, '&lt;')}</title>
<style>${css.join('\n')}
${extra}
.print-only{display:block!important}</style></head><body>${el.outerHTML}</body></html>`;
}

/**
 * Drucken (eigener Server) bzw. Druckfassung als HTML-Datei speichern (veröffentlichte Version).
 * `framed`: Dokument mit Standardrahmen – randloser Druck, der Rahmen bringt die Ränder selbst mit.
 */
export async function printOrSave(selector: string, filename: string, title: string, framed = false) {
  if (!IS_HOSTED) {
    if (!framed) { window.print(); return true; }
    const style = document.createElement('style');
    style.textContent = `@media print{${FRAMED_PAGE}}`;
    document.head.appendChild(style);
    document.documentElement.classList.add('print-framed');
    const cleanup = () => { style.remove(); document.documentElement.classList.remove('print-framed'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 60000);
    return true;
  }
  const el = document.querySelector(selector);
  if (!el) return false;
  return saveFile(`${filename}.html`, standaloneHtml(el, title, framed), 'text/html;charset=utf-8');
}

export const PRINT_LABEL = IS_HOSTED ? 'Als Datei speichern' : 'Drucken / PDF';
