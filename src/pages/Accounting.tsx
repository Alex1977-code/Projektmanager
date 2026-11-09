// Debitoren und Kreditoren: Stammdaten, offene Posten, Übergabe an die Buchhaltung, Zahlungsabgleich.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Download, Eye, FileUp, Plus, Search } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Modal, useConfirm } from '../components/Modal';
import { saveFile } from '../utils/files';
import { Card, EmptyState, Field, Kpi, PageHeader } from '../components/ui';
import { COST_CATEGORIES, type AccountingConfig, type Contact } from '../types';
import { classNames, fmtEur, fmtEurCompact, fmtNum, sum } from '../utils/format';
import { fmtDate, todayISO } from '../utils/date';

type Tab = 'debitoren' | 'kreditoren' | 'schnittstelle';
const EXPORTS = [
  { id: 'debitorenBelege', label: 'Debitoren-Belege', text: 'gestellte Ausgangsrechnungen' },
  { id: 'kreditorenBelege', label: 'Kreditoren-Belege', text: 'angefallene Fremdkosten mit Beleg' },
  { id: 'debitoren', label: 'Debitoren-Stamm', text: 'Auftraggeber' },
  { id: 'kreditoren', label: 'Kreditoren-Stamm', text: 'Lieferanten' },
] as const;
type ExportType = (typeof EXPORTS)[number]['id'];
interface Preview { filename: string; columns: { key: string; header: string }[]; rows: Record<string, string>[]; count: number; total: number; warnings: string[]; content?: string }
interface PayMatch { invoiceId: number; invoiceNo: string; gross: number; date: string; amount: number; result: string }

export function Accounting() {
  const { can } = useStore();
  const [params, setParams] = useSearchParams();
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'debitoren', label: 'Debitoren', show: true },
    { id: 'kreditoren', label: 'Kreditoren', show: true },
    { id: 'schnittstelle', label: 'Übergabe & Zahlungsabgleich', show: can('accounting.export') },
  ];
  const tab = tabs.find((t) => t.id === params.get('tab') && t.show)?.id || 'debitoren';
  if (!can('invoices.view') && !can('accounting.export')) return <div className="page"><EmptyState title="Kein Zugriff" text="Debitoren und Kreditoren sind für Ihre Rolle nicht freigegeben." /></div>;
  return (
    <div className="page">
      <PageHeader title="Debitoren & Kreditoren" subtitle="Geschäftspartner, offene Posten und Schnittstelle zur Finanzbuchhaltung">
        <nav className="tabs" role="tablist">
          {tabs.filter((t) => t.show).map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={classNames('tab', tab === t.id && 'active')} onClick={() => setParams(t.id === 'debitoren' ? {} : { tab: t.id }, { replace: true })}>{t.label}</button>)}
        </nav>
      </PageHeader>
      {tab === 'debitoren' && <Partners kind="debitor" />}
      {tab === 'kreditoren' && <Partners kind="kreditor" />}
      {tab === 'schnittstelle' && <Interface />}
    </div>
  );
}

// ============================================================ Stammdaten und offene Posten
function Partners({ kind }: { kind: Contact['kind'] }) {
  const { data, idx, can } = useStore();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Contact | 'new' | null>(null);
  const canEdit = can('accounting.export') || can('invoices.edit');
  const today = todayISO();
  const isDeb = kind === 'debitor';

  const rows = useMemo(() => data.contacts.filter((c) => c.kind === kind).map((c) => {
    if (isDeb) {
      const projects = data.projects.filter((p) => p.debitorId === c.id);
      const inv = data.invoices.filter((i) => projects.some((p) => p.id === i.projectId) && i.status !== 'entwurf' && i.status !== 'storniert');
      const open = inv.filter((i) => i.status === 'gestellt');
      return { c, count: projects.length, volume: sum(inv, (i) => i.net), open: sum(open, (i) => i.gross - (i.paidAmount || 0)), overdue: sum(open.filter((i) => i.dueDate && i.dueDate < today), (i) => i.gross - (i.paidAmount || 0)), incomplete: 0 };
    }
    const costs = data.costs.filter((k) => k.kreditorId === c.id && k.status === 'angefallen');
    return { c, count: costs.length, volume: sum(costs, (k) => k.amount), open: sum(costs.filter((k) => !k.exportedAt), (k) => k.amount), overdue: 0, incomplete: costs.filter((k) => !k.docNo).length };
  }).filter((r) => !q || `${r.c.number} ${r.c.name} ${r.c.city}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(a.c.number).localeCompare(String(b.c.number), 'de', { numeric: true })), [data, kind, isDeb, q, today]);
  const unassigned = isDeb ? data.projects.filter((p) => !p.debitorId && p.status !== 'Abgeschlossen').length : data.costs.filter((k) => k.status === 'angefallen' && !k.kreditorId).length;

  return (
    <>
      <div className="kpi-grid kpi-grid-4">
        <Kpi label={isDeb ? 'Debitoren' : 'Kreditoren'} value={rows.length} sub={`${rows.filter((r) => r.c.active !== false).length} aktiv`} />
        <Kpi label={isDeb ? 'Umsatz (gestellt, netto)' : 'Fremdkosten (netto)'} value={fmtEurCompact(sum(rows, (r) => r.volume))} />
        <Kpi label={isDeb ? 'Offene Posten (brutto)' : 'Noch nicht übergeben'} value={fmtEurCompact(sum(rows, (r) => r.open))} tone={isDeb && sum(rows, (r) => r.overdue) > 0 ? 'warn' : 'default'} sub={isDeb ? `davon überfällig ${fmtEur(sum(rows, (r) => r.overdue))}` : 'an die Buchhaltung'} />
        <Kpi label={isDeb ? 'Projekte ohne Debitor' : 'Kosten ohne Kreditor'} value={unassigned} tone={unassigned ? 'warn' : 'good'} sub={isDeb ? 'Zuordnung im Projekt' : 'Zuordnung bei den Projektkosten'} />
      </div>
      <Card padded={false} title={isDeb ? 'Debitoren (Auftraggeber)' : 'Kreditoren (Lieferanten, Nachunternehmer)'}
        actions={<div className="row-actions"><div className="search-input"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen …" /></div>{canEdit && <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}><Plus size={14} /> {isDeb ? 'Debitor' : 'Kreditor'}</button>}</div>}>
        {rows.length === 0 ? <EmptyState title="Keine Einträge" text={isDeb ? 'Debitoren entstehen automatisch aus den Auftraggebern der Projekte oder werden hier angelegt.' : 'Legen Sie Lieferanten und Nachunternehmer an und ordnen Sie sie den Fremdkosten im Projekt zu.'} /> : (
          <div className="table-wrap">
            <table className="table table-hover">
              <thead><tr><th>Nr.</th><th>Name</th><th>Ort</th><th className="num">Zahlungsziel</th><th className="num">{isDeb ? 'Projekte' : 'Belege'}</th><th className="num">{isDeb ? 'Umsatz netto' : 'Kosten netto'}</th><th className="num">{isDeb ? 'Offene Posten' : 'nicht übergeben'}</th><th /></tr></thead>
              <tbody>
                {rows.map(({ c, count, volume, open, overdue, incomplete }) => (
                  <tr key={c.id} className={classNames(canEdit && 'clickable', c.active === false && 'row-done')} onClick={() => canEdit && setEdit(c)}>
                    <td className="mono"><strong>{c.number}</strong></td>
                    <td><strong>{c.name}</strong>{c.addition && <small className="block muted">{c.addition}</small>}</td>
                    <td>{[c.zip, c.city].filter(Boolean).join(' ') || <span className="muted">–</span>}</td>
                    <td className="num">{c.paymentDays ?? data.settings.paymentDays} Tage</td>
                    <td className="num">{count}{isDeb && count > 0 && <small className="block muted">{data.projects.filter((p) => p.debitorId === c.id).slice(0, 2).map((p) => idx.projectById.get(p.id)?.number).join(', ')}{count > 2 ? ' …' : ''}</small>}</td>
                    <td className="num">{fmtEur(volume)}</td>
                    <td className={classNames('num', overdue > 0 && 'text-bad')}>{open ? fmtEur(open) : '–'}{overdue > 0 && <small className="block">überfällig {fmtEur(overdue)}</small>}</td>
                    <td>{c.active === false ? <span className="badge badge-slate">inaktiv</span> : incomplete > 0 ? <span className="badge badge-amber" title="Kostenpositionen ohne Belegnummer">{incomplete} ohne Beleg-Nr.</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <ContactForm kind={kind} contact={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ContactForm({ kind, contact, onClose }: { kind: Contact['kind']; contact?: Contact; onClose: () => void }) {
  const { data, create, update, remove } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [v, setV] = useState({
    number: contact?.number ?? '', name: contact?.name ?? '', addition: contact?.addition ?? '', street: contact?.street ?? '', zip: contact?.zip ?? '', city: contact?.city ?? '',
    country: contact?.country ?? 'DE', vatId: contact?.vatId ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '', iban: contact?.iban ?? '',
    paymentDays: contact?.paymentDays != null ? String(contact.paymentDays) : '', note: contact?.note ?? '', active: contact?.active !== false,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const label = kind === 'debitor' ? 'Debitor' : 'Kreditor';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return toast.error('Bitte einen Namen angeben');
    const payload = { ...v, name: v.name.trim(), paymentDays: v.paymentDays === '' ? null : Number(v.paymentDays) || 0 };
    try {
      if (contact) await update('contacts', contact.id, payload); else await create('contacts', { ...payload, kind });
      toast.success(`${label} gespeichert`);
      onClose();
    } catch { /* gemeldet */ }
  };
  const del = async () => {
    if (!contact) return;
    if (await confirm({ title: `${label} löschen?`, message: `„${contact.name}“ wird gelöscht. Verwendete Geschäftspartner können nur auf inaktiv gesetzt werden.`, confirmLabel: 'Löschen', danger: true })) {
      if (await remove('contacts', contact.id)) onClose();
    }
  };
  return (
    <Modal title={contact ? `${label} ${contact.number}` : `Neuer ${label}`} onClose={onClose} width={640}
      footer={<>{contact && <button type="button" className="btn btn-ghost-danger" style={{ marginRight: 'auto' }} onClick={del}>Löschen</button>}<button type="button" className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" type="submit" form="contact-form">Speichern</button></>}>
      <form id="contact-form" className="form-grid" onSubmit={submit}>
        <Field label="Name *" span={2}><input value={v.name} onChange={(e) => set('name', e.target.value)} autoFocus required /></Field>
        <Field label={`${label}ennummer`} hint={contact ? undefined : 'leer = nächste freie Nummer'}><input value={v.number} onChange={(e) => set('number', e.target.value)} placeholder="automatisch" /></Field>
        <Field label="Zusatz / Abteilung"><input value={v.addition} onChange={(e) => set('addition', e.target.value)} /></Field>
        <Field label="Straße" span={2}><input value={v.street} onChange={(e) => set('street', e.target.value)} /></Field>
        <Field label="PLZ"><input value={v.zip} onChange={(e) => set('zip', e.target.value)} /></Field>
        <Field label="Ort"><input value={v.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="Land"><input value={v.country} onChange={(e) => set('country', e.target.value)} /></Field>
        <Field label="USt-IdNr."><input value={v.vatId} onChange={(e) => set('vatId', e.target.value)} /></Field>
        <Field label="E-Mail"><input value={v.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Telefon"><input value={v.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        {kind === 'kreditor' && <Field label="IBAN" span={2}><input value={v.iban} onChange={(e) => set('iban', e.target.value)} /></Field>}
        <Field label="Zahlungsziel (Tage)" hint={`leer = Standard (${data.settings.paymentDays})`}><input inputMode="numeric" value={v.paymentDays} onChange={(e) => set('paymentDays', e.target.value)} /></Field>
        <label className="check-field"><input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} /> aktiv</label>
        <Field label="Notiz" span={2}><textarea rows={2} value={v.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

// ============================================================ Übergabe und Zahlungsabgleich
function Interface() {
  const { data, saveSettings, reload } = useStore();
  const toast = useToast();
  const [type, setType] = useState<ExportType>('debitorenBelege');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyNew, setOnlyNew] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [log, setLog] = useState<{ id: number; type: string; period: string; createdAt: string; count: number; hours: number; filename: string; createdBy: number | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const isDocs = type.endsWith('Belege');
  const loadLog = () => api.get<typeof log>('/api/abacusExports').then((l) => setLog(l.filter((x) => EXPORTS.some((e) => e.id === x.type)))).catch(() => {});
  useEffect(() => { loadLog(); }, []);
  useEffect(() => setPreview(null), [type, from, to, onlyNew]);

  const run = async (dry: boolean) => {
    setBusy(true);
    try {
      const res = await api.post<Preview>('/api/accounting/export', { type, from: isDocs ? from || undefined : undefined, to: isDocs ? to || undefined : undefined, onlyNew, preview: dry });
      if (dry) { setPreview(res); return; }
      if (!res.count) { toast.info('Es gibt keine Datensätze zu übergeben.'); return; }
      const ok = await saveFile(res.filename, res.content || '', 'text/csv;charset=utf-8');
      if (ok) toast.success(`${res.count} Datensätze übergeben (${res.filename})`);
      setPreview(null);
      await reload();
      loadLog();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <Card title="Übergabe an die Buchhaltung" subtitle="Erzeugt eine Importdatei (CSV). Bereits übergebene Belege werden gekennzeichnet und nicht erneut ausgegeben.">
        <div className="exp-types" role="radiogroup" aria-label="Was soll übergeben werden?">
          {EXPORTS.map((e) => <button key={e.id} type="button" role="radio" aria-checked={type === e.id} className={classNames('exp-type', type === e.id && 'active')} onClick={() => setType(e.id)}><strong>{e.label}</strong><small>{e.text}</small></button>)}
        </div>
        <div className="abacus-form" style={{ marginTop: 14 }}>
          {isDocs && <label className="inline-field">Belegdatum von <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>}
          {isDocs && <label className="inline-field">bis <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>}
          {isDocs && <label className="check-inline"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> nur noch nicht übergebene</label>}
          <span className="spacer" />
          <button className="btn" disabled={busy} onClick={() => run(true)}><Eye size={16} /> Vorschau</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => run(false)}><Download size={16} /> Exportdatei erzeugen</button>
        </div>
      </Card>

      {preview && (
        <Card padded={false} title={`Vorschau: ${preview.filename}`} subtitle={`${preview.count} Datensätze${isDocs ? ` · ${fmtEur(preview.total)} brutto` : ''}${preview.count > 200 ? ' · angezeigt: erste 200' : ''}`}>
          {preview.warnings.length > 0 && <ul className="abacus-warn">{preview.warnings.map((w) => <li key={w}><AlertTriangle size={14} /> {w}</li>)}</ul>}
          {preview.rows.length === 0 ? <EmptyState title="Keine Datensätze" text="Für diese Auswahl gibt es nichts zu übergeben." /> : (
            <div className="table-wrap abacus-preview">
              <table className="table abacus-table">
                <thead><tr>{preview.columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr></thead>
                <tbody>{preview.rows.map((r, i) => <tr key={i}>{preview.columns.map((c) => <td key={c.key} className={['net', 'vat', 'gross'].includes(c.key) ? 'num' : ''}>{r[c.key]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <PaymentImport />

      <Card padded={false} title="Übergabeprotokoll">
        {log.length === 0 ? <EmptyState title="Noch keine Übergaben" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Zeitpunkt</th><th>Art</th><th>Zeitraum</th><th className="num">Datensätze</th><th className="num">Betrag brutto</th><th>Datei</th></tr></thead>
              <tbody>{log.slice(0, 20).map((l) => <tr key={l.id}><td className="nowrap">{fmtDate(l.createdAt.slice(0, 10))} {l.createdAt.slice(11, 16)}</td><td>{EXPORTS.find((e) => e.id === l.type)?.label}</td><td>{l.period}</td><td className="num">{l.count}</td><td className="num">{l.type.endsWith('Belege') ? fmtEur(l.hours) : '–'}</td><td className="mono small">{l.filename}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>

      <AccountConfig config={data.settings.accounting} onSave={(accounting) => saveSettings({ accounting })} />
    </>
  );
}

function PaymentImport() {
  const { reload } = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [res, setRes] = useState<{ matches: PayMatch[]; unmatched: number } | null>(null);
  const check = async (t: string, apply = false) => {
    try {
      const r = await api.post<{ matches: PayMatch[]; unmatched: number; applied: number }>('/api/accounting/payments', { text: t, apply });
      if (apply) { toast.success(`${r.applied} Zahlungseingänge übernommen`); setRes(null); setText(''); await reload(); } else setRes(r);
    } catch (e) { toast.error((e as Error).message); setRes(null); }
  };
  const load = async (file?: File) => { if (!file) return; const t = await file.text(); setText(t); check(t); if (input.current) input.current.value = ''; };
  const usable = res?.matches.filter((m) => m.result === 'bezahlt' || m.result === 'Teilzahlung').length || 0;
  return (
    <Card padded={false} title="Zahlungsabgleich" subtitle="Zahlungseingänge aus der Buchhaltung einlesen (CSV mit Rechnungsnummer, Datum und Betrag – Spaltenreihenfolge beliebig)"
      actions={<><button className="btn btn-sm" onClick={() => input.current?.click()}><FileUp size={14} /> Datei wählen</button><input ref={input} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => load(e.target.files?.[0])} /></>}>
      {!res ? <p className="muted small" style={{ margin: 0, padding: '14px 18px' }}>Die Datei wird zunächst nur geprüft. Erkannte Rechnungen werden angezeigt und erst nach Bestätigung als bezahlt gekennzeichnet.</p> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Rechnung</th><th>Zahlungsdatum</th><th className="num">Betrag</th><th className="num">Rechnungsbetrag</th><th>Ergebnis</th></tr></thead>
              <tbody>{res.matches.map((m) => <tr key={m.invoiceId}><td><strong>{m.invoiceNo}</strong></td><td>{fmtDate(m.date)}</td><td className="num">{fmtNum(m.amount, 2)} €</td><td className="num">{fmtNum(m.gross, 2)} €</td><td><span className={`badge badge-${m.result === 'bezahlt' ? 'green' : m.result === 'Teilzahlung' ? 'amber' : 'slate'}`}>{m.result}</span></td></tr>)}</tbody>
            </table>
          </div>
          <div className="pay-actions">
            <span className="muted small">{res.matches.length} Rechnung(en) erkannt{res.unmatched ? ` · ${res.unmatched} Zeile(n) ohne bekannte Rechnungsnummer` : ''}</span>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => { setRes(null); setText(''); }}>Verwerfen</button>
            <button className="btn btn-sm btn-primary" disabled={!usable} onClick={() => check(text, true)}>{usable} Zahlung(en) übernehmen</button>
          </div>
        </>
      )}
    </Card>
  );
}

function AccountConfig({ config, onSave }: { config: AccountingConfig; onSave: (c: AccountingConfig) => void }) {
  const [c, setC] = useState<AccountingConfig>({ ...config, expenseAccounts: { ...(config?.expenseAccounts || {}) } });
  const set = <K extends keyof AccountingConfig>(k: K, v: AccountingConfig[K]) => setC((x) => ({ ...x, [k]: v }));
  return (
    <Card title="Konten und Nummernkreise" subtitle="Müssen zum Kontenplan Ihrer Buchhaltung passen. Trennzeichen, Datumsformat, Zeichensatz und Mandant gelten wie unter Arbeitszeit → Abacus-Export."
      actions={<button className="btn btn-sm btn-primary" onClick={() => onSave({ ...c, debitorStart: Number(c.debitorStart) || 10000, kreditorStart: Number(c.kreditorStart) || 70000 })}>Speichern</button>}>
      <div className="form-grid form-grid-3">
        <Field label="Sammelkonto Debitoren"><input value={c.debitorAccount} onChange={(e) => set('debitorAccount', e.target.value)} /></Field>
        <Field label="Erlöskonto"><input value={c.revenueAccount} onChange={(e) => set('revenueAccount', e.target.value)} /></Field>
        <Field label="Steuercode Umsatzsteuer"><input value={c.vatCode} onChange={(e) => set('vatCode', e.target.value)} /></Field>
        <Field label="Sammelkonto Kreditoren"><input value={c.kreditorAccount} onChange={(e) => set('kreditorAccount', e.target.value)} /></Field>
        <Field label="Aufwandskonto (Standard)"><input value={c.defaultExpenseAccount} onChange={(e) => set('defaultExpenseAccount', e.target.value)} /></Field>
        <Field label="Steuercode Vorsteuer"><input value={c.inputVatCode} onChange={(e) => set('inputVatCode', e.target.value)} /></Field>
        <Field label="Debitorennummern ab"><input inputMode="numeric" value={String(c.debitorStart)} onChange={(e) => set('debitorStart', e.target.value as unknown as number)} /></Field>
        <Field label="Kreditorennummern ab"><input inputMode="numeric" value={String(c.kreditorStart)} onChange={(e) => set('kreditorStart', e.target.value as unknown as number)} /></Field>
      </div>
      <div className="form-section" style={{ margin: '14px 0 8px' }}>Aufwandskonto je Kostenkategorie</div>
      <div className="map-grid">
        {COST_CATEGORIES.map((cat) => <label key={cat} className="map-row"><span>{cat}</span><input value={c.expenseAccounts[cat] || ''} placeholder={c.defaultExpenseAccount} onChange={(e) => set('expenseAccounts', { ...c.expenseAccounts, [cat]: e.target.value })} /></label>)}
      </div>
    </Card>
  );
}
