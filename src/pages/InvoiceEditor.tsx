import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, CheckCircle2, Loader2, Plus, Printer, Send, Trash2, Undo2, X } from 'lucide-react';
import { useStore } from '../store';
import { printOrSave, PRINT_LABEL } from '../utils/files';
import { useToast } from '../components/Toast';
import { Modal, useConfirm } from '../components/Modal';
import { Card, EmptyState, Field } from '../components/ui';
import { InvoiceStatusBadge } from '../components/Invoices';
import { DocFrame } from '../components/DocFrame';
import type { Invoice, InvoiceLine } from '../types';
import { addDays, fmtDate, todayISO } from '../utils/date';
import { classNames, fmtEur, fmtNum } from '../utils/format';
import { computeInvoice, previousInvoices } from '../utils/invoices';

const eur2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => eur2.format(n || 0);

function NumInput({ value, onChange, disabled, suffix, width = 90, step }: { value: number; onChange: (v: number) => void; disabled?: boolean; suffix?: string; width?: number; step?: number }) {
  const [text, setText] = useState(fmtNum(value, 2));
  useEffect(() => setText(fmtNum(value, 2)), [value]);
  const commit = () => {
    const n = Number(text.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) onChange(step ? Math.round(n / step) * step : n);
    else setText(fmtNum(value, 2));
  };
  return (
    <span className="num-input" style={{ width }}>
      <input value={text} disabled={disabled} inputMode="decimal" onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} onFocus={(e) => e.target.select()} />
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

export function InvoiceEditor() {
  const { id } = useParams();
  const { data, idx, update, remove, can } = useStore();
  const isLead = can('invoices.view');
  const canEdit = can('invoices.edit');
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const stored = data.invoices.find((i) => i.id === Number(id));
  const [draft, setDraft] = useState<Invoice | null>(stored || null);
  const [saving, setSaving] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [payment, setPayment] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const draftRef = useRef(draft);
  const dirty = useRef(false);

  // Gespeicherte Fassung übernehmen, solange keine lokalen Änderungen offen sind
  useEffect(() => { if (stored && !dirty.current) { setDraft(stored); draftRef.current = stored; } }, [stored]);

  const save = useCallback(async () => {
    const d = draftRef.current;
    if (!d || !dirty.current) return;
    dirty.current = false;
    setSaving('saving');
    const row = await update('invoices', d.id, { type: d.type, date: d.date, periodEnd: d.periodEnd, lines: d.lines, nkPct: d.nkPct, vatPct: d.vatPct, note: d.note });
    setSaving(dirty.current ? 'dirty' : row ? 'saved' : 'dirty');
  }, [update]);
  useEffect(() => () => { window.clearTimeout(timer.current); save(); }, [save]);

  const all = data.invoices;
  const prevList = useMemo(() => (draft ? previousInvoices(all, draft) : []), [all, draft]);
  if (!isLead) return <div className="page"><EmptyState title="Kein Zugriff" text="Für Rechnungen fehlt Ihnen die Berechtigung." /></div>;
  if (!draft) return <div className="page"><EmptyState title="Rechnung nicht gefunden" action={<Link className="btn" to="/rechnungen">Zur Übersicht</Link>} /></div>;

  const project = idx.projectById.get(draft.projectId);
  const editable = draft.status === 'entwurf' && canEdit;
  const previousNet = prevList.reduce((s, i) => s + i.net, 0);
  const calc = editable ? computeInvoice(draft, previousNet) : { ...draft, lines: draft.lines.map((l) => ({ ...l, amount: l.amount ?? (l.fee * l.percent) / 100 })) };
  const prev = prevList[prevList.length - 1];
  const prevPct = (l: InvoiceLine) => prev?.lines.find((x) => x.key === l.key)?.percent ?? 0;
  const settings = data.settings;

  const change = (patch: Partial<Invoice>) => {
    setDraft((d) => {
      const next = d ? { ...d, ...patch } : d;
      draftRef.current = next;
      return next;
    });
    dirty.current = true;
    setSaving('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 600);
  };
  const setLine = (key: string, patch: Partial<InvoiceLine>) => change({ lines: draft.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });

  const issue = async () => {
    window.clearTimeout(timer.current);
    await save();
    if (calc.net <= 0 && draft.type !== 'Schlussrechnung') return toast.error('Der Rechnungsbetrag ist nicht positiv – bitte Leistungsstand prüfen.');
    const ok = await confirm({
      title: 'Rechnung stellen?',
      message: <>Die Rechnung wird mit <strong>{money(calc.gross)}</strong> brutto festgeschrieben und erhält eine fortlaufende Rechnungsnummer. Danach sind nur noch Zahlungsangaben änderbar.</>,
      confirmLabel: 'Rechnung stellen',
    });
    if (!ok) return;
    const row = await update('invoices', draft.id, { status: 'gestellt' });
    if (row) toast.success(`Rechnung ${row.invoiceNo} gestellt – fällig am ${fmtDate(row.dueDate)}`);
  };
  const cancel = async () => {
    if (await confirm({ title: 'Rechnung stornieren?', message: <>Rechnung {draft.invoiceNo} wird storniert. Die Nummer bleibt belegt; spätere Entwürfe werden neu berechnet.</>, confirmLabel: 'Stornieren', danger: true })) {
      await update('invoices', draft.id, { status: 'storniert' });
    }
  };
  const del = async () => {
    if (await confirm({ title: 'Entwurf löschen?', message: 'Der Rechnungsentwurf wird gelöscht.', confirmLabel: 'Löschen', danger: true })) {
      dirty.current = false;
      if (await remove('invoices', draft.id)) navigate(`/projekte/${draft.projectId}?tab=rechnungen`);
    }
  };
  const addExtra = () => change({ lines: [...draft.lines, { key: `x${Date.now().toString(36)}`, phaseId: null, label: 'Besondere Leistung / Nachtrag', fee: 0, percent: 0 }] });

  const title = draft.type === 'Abschlagsrechnung' ? `${draft.number}. Abschlagsrechnung` : `${draft.type} (Nr. ${draft.number})`;
  // Platzhalter der Standardtexte aus den Rechnungsstammdaten
  const fill = (t: string) => (t || '').replace(/\{leistungsstand\}/g, fmtDate(draft.periodEnd)).replace(/\{faellig\}/g, fmtDate(draft.dueDate || addDays(draft.date, settings.paymentDays || 30))).replace(/\{rechnungsnummer\}/g, draft.invoiceNo || '');

  return (
    <div className="page">
      <div className="no-print page-header">
        <div className="page-header-main">
          <div>
            <h1><span className="proj-dot lg" style={{ background: project?.color || '#64748b' }} />{title}{draft.invoiceNo && <span className="muted"> · {draft.invoiceNo}</span>}</h1>
            <p className="page-subtitle header-meta">
              <Link to={`/projekte/${draft.projectId}?tab=rechnungen`} className="back-link"><ArrowLeft size={14} /> {project?.number} {project?.name}</Link>
              <InvoiceStatusBadge invoice={draft} />
              {editable && (
                <span className={classNames('save-state', saving)}>
                  {saving === 'saving' ? <><Loader2 size={13} className="spin" /> Speichert …</> : saving === 'dirty' ? 'Ungespeicherte Änderungen' : <><CheckCircle2 size={13} /> Gespeichert</>}
                </span>
              )}
            </p>
          </div>
          <div className="page-actions">
            {editable && <button className="icon-btn" onClick={del} title="Entwurf löschen" aria-label="Entwurf löschen"><Trash2 size={17} /></button>}
            <button className="btn" onClick={() => { save(); printOrSave('.invoice-print', `Rechnung-${draft.invoiceNo || 'Entwurf'}`, `${title} ${draft.invoiceNo || ''}`, true).catch((e) => toast.error((e as Error).message)); }}><Printer size={16} /> {PRINT_LABEL}</button>
            {editable && <button className="btn btn-primary" onClick={issue}><Send size={16} /> Rechnung stellen</button>}
            {draft.status === 'gestellt' && <button className="btn" onClick={cancel}><Undo2 size={16} /> Stornieren</button>}
            {draft.status === 'gestellt' && <button className="btn btn-primary" onClick={() => setPayment(true)}><Banknote size={16} /> Zahlungseingang</button>}
          </div>
        </div>
      </div>

      <div className="invoice-layout no-print">
        <Card title="Leistungsstand nach Leistungsphasen" padded={false}
          subtitle={editable ? 'Leistungsstand je Phase eintragen (vorbelegt mit dem Fertigstellungsgrad aus dem Projekt) – Beträge werden sofort neu berechnet' : 'Festgeschrieben'}
          actions={editable ? <button className="btn btn-sm" onClick={addExtra}><Plus size={14} /> Besondere Leistung / Nachtrag</button> : undefined}>
          <div className="table-wrap">
            <table className="table inv-table">
              <thead>
                <tr>
                  <th>Leistung</th>
                  <th className="num">Honorar</th>
                  <th className="num">bisher</th>
                  <th className="num">Leistungsstand</th>
                  <th className="num">Leistung kumuliert</th>
                  <th className="num">davon neu</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {calc.lines.map((l) => {
                  const ph = l.phaseId ? idx.phaseById.get(l.phaseId) : null;
                  const pp = prevPct(l);
                  const delta = (l.amount ?? 0) - (l.fee * pp) / 100;
                  return (
                    <tr key={l.key}>
                      <td>
                        {l.phaseId || !editable ? <strong>{l.label}</strong> : <input className="inv-label" value={l.label} onChange={(e) => setLine(l.key, { label: e.target.value })} />}
                        {ph && <small>Fertigstellung lt. Projekt: {fmtNum(ph.progress)} %</small>}
                      </td>
                      <td className="num">{l.phaseId || !editable ? fmtEur(l.fee) : <NumInput value={l.fee} onChange={(v) => setLine(l.key, { fee: v })} suffix="€" width={120} />}</td>
                      <td className="num muted">{fmtNum(pp)} %</td>
                      <td className="num">
                        {editable ? <NumInput value={l.percent} onChange={(v) => setLine(l.key, { percent: Math.max(0, Math.min(100, v)) })} suffix="%" step={0.5} /> : `${fmtNum(l.percent, 1)} %`}
                        {editable && l.percent < pp && <small className="text-bad">unter Vorrechnung</small>}
                      </td>
                      <td className="num">{money(l.amount ?? 0)}</td>
                      <td className={classNames('num', delta > 0.005 && 'text-good')}>{delta > 0.005 ? money(delta) : '–'}</td>
                      {editable && <td>{!l.phaseId && <button className="icon-btn" onClick={() => change({ lines: draft.lines.filter((x) => x.key !== l.key) })} aria-label="Position entfernen"><X size={14} /></button>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="stack">
          <Card title="Rechnungsdaten">
            <div className="form-grid">
              <Field label="Art">
                <select value={draft.type} disabled={!editable} onChange={(e) => change({ type: e.target.value as Invoice['type'] })}>
                  <option>Abschlagsrechnung</option>
                  <option>Teilschlussrechnung</option>
                  <option>Schlussrechnung</option>
                </select>
              </Field>
              <Field label="Rechnungsdatum"><input type="date" value={draft.date} disabled={!editable} onChange={(e) => e.target.value && change({ date: e.target.value })} /></Field>
              <Field label="Leistungsstand per"><input type="date" value={draft.periodEnd || ''} disabled={!editable} onChange={(e) => change({ periodEnd: e.target.value || null })} /></Field>
              <Field label="Fällig">
                <input type="date" value={draft.dueDate || (editable ? addDays(draft.date, settings.paymentDays || 30) : '')} disabled />
              </Field>
              <Field label="Nebenkosten (% der Leistung)"><NumInput value={draft.nkPct} disabled={!editable} onChange={(v) => change({ nkPct: v })} suffix="%" width={120} /></Field>
              <Field label="Umsatzsteuer"><NumInput value={draft.vatPct} disabled={!editable} onChange={(v) => change({ vatPct: v })} suffix="%" width={120} /></Field>
              <Field label="Bemerkung (erscheint auf der Rechnung)" span={2}>
                <textarea rows={2} value={draft.note || ''} disabled={!editable} onChange={(e) => change({ note: e.target.value })} />
              </Field>
            </div>
          </Card>
          <Card title="Berechnung">
            <dl className="inv-sum">
              <div><dt>Leistung kumuliert</dt><dd>{money(calc.performance)}</dd></div>
              <div><dt>+ Nebenkosten {fmtNum(draft.nkPct, 1)} %</dt><dd>{money(calc.nk)}</dd></div>
              <div className="sub"><dt>Gesamtleistung netto</dt><dd>{money(calc.cumulative)}</dd></div>
              <div><dt>− bisherige Abschläge ({prevList.length})</dt><dd>{money(-calc.previousNet)}</dd></div>
              <div className="sub"><dt>Rechnungsbetrag netto</dt><dd>{money(calc.net)}</dd></div>
              <div><dt>+ Umsatzsteuer {fmtNum(draft.vatPct)} %</dt><dd>{money(calc.vat)}</dd></div>
              <div className="total"><dt>Rechnungsbetrag brutto</dt><dd>{money(calc.gross)}</dd></div>
            </dl>
            {draft.status === 'bezahlt' && <p className="paid-note"><CheckCircle2 size={15} /> Bezahlt am {fmtDate(draft.paidDate)}: {money(draft.paidAmount || 0)}</p>}
            {project?.budget ? <p className="muted small">Abgerechnet (netto inkl. NK) nach dieser Rechnung: {fmtNum((calc.cumulative / (project.budget * (1 + draft.nkPct / 100))) * 100, 1)} % des Honorars</p> : null}
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------ Druckfassung */}
      <DocFrame className="invoice-print" docLabel={`${title} ${draft.invoiceNo || ''}`.trim()}>
        <div className="dp-sender">{settings.companyName} · {settings.companyAddress.replace(/\n/g, ' · ')}</div>
        <div className="dp-top">
          <div className="dp-recipient"><strong>{project?.client}</strong>{project?.location ? `\n${project.location}` : ''}</div>
          <table className="dp-meta">
            <tbody>
              <tr><th>Rechnungsnummer</th><td>{draft.invoiceNo || 'ENTWURF'}</td></tr>
              <tr><th>Rechnungsdatum</th><td>{fmtDate(draft.date)}</td></tr>
              <tr><th>Projektnummer</th><td>{project?.number}</td></tr>
              <tr><th>Leistungsstand per</th><td>{fmtDate(draft.periodEnd)}</td></tr>
              {settings.taxId && <tr><th>{settings.taxId.split(' ')[0]}</th><td>{settings.taxId.split(' ').slice(1).join(' ')}</td></tr>}
            </tbody>
          </table>
        </div>
        <h2>{title} gemäß § 15 HOAI</h2>
        <p><strong>Projekt: {project?.name}</strong></p>
        <p className="pre">{fill(settings.invoiceIntro)}</p>
        <table className="dp-lines">
          <thead><tr><th>Leistung</th><th className="r">Honorar netto</th><th className="r">Leistungsstand</th><th className="r">Leistung kumuliert</th></tr></thead>
          <tbody>
            {calc.lines.map((l) => (
              <tr key={l.key}><td>{l.label}</td><td className="r">{money(l.fee)}</td><td className="r">{fmtNum(l.percent, 1)} %</td><td className="r">{money(l.amount ?? 0)}</td></tr>
            ))}
          </tbody>
          <tbody className="dp-sums">
            <tr className="dp-sub"><td colSpan={3}>Summe Leistung</td><td className="r">{money(calc.performance)}</td></tr>
            <tr><td colSpan={3}>zzgl. Nebenkostenpauschale {fmtNum(draft.nkPct, 1)} %</td><td className="r">{money(calc.nk)}</td></tr>
            <tr className="dp-sub"><td colSpan={3}>Gesamtleistung netto</td><td className="r">{money(calc.cumulative)}</td></tr>
            {prevList.map((p) => (
              <tr key={p.id}><td colSpan={3}>abzgl. {p.number}. Abschlag, Rechnung {p.invoiceNo} vom {fmtDate(p.date)}</td><td className="r">{money(-p.net)}</td></tr>
            ))}
            <tr className="dp-sub"><td colSpan={3}>Rechnungsbetrag netto</td><td className="r">{money(calc.net)}</td></tr>
            <tr><td colSpan={3}>zzgl. Umsatzsteuer {fmtNum(draft.vatPct)} %</td><td className="r">{money(calc.vat)}</td></tr>
            <tr className="dp-total"><td colSpan={3}>Rechnungsbetrag brutto</td><td className="r">{money(calc.gross)}</td></tr>
          </tbody>
        </table>
        {draft.note && <p className="pre">{draft.note}</p>}
        <p className="pre">{fill(settings.invoiceClosing)}</p>
        {settings.skontoPct > 0 && settings.skontoDays > 0 && <p>Bei Zahlung innerhalb von {settings.skontoDays} Tagen gewähren wir {fmtNum(settings.skontoPct, 1)} % Skonto ({money(calc.gross * (1 - settings.skontoPct / 100))}).</p>}
      </DocFrame>

      {payment && <PaymentDialog invoice={draft} onClose={() => setPayment(false)} />}
    </div>
  );
}

function PaymentDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { update } = useStore();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(invoice.gross);
  const save = async () => {
    const full = amount >= invoice.gross - 0.01;
    const row = await update('invoices', invoice.id, { paidDate: date, paidAmount: amount, status: full ? 'bezahlt' : 'gestellt' });
    if (row) { toast.success(full ? 'Zahlung erfasst – Rechnung bezahlt' : 'Teilzahlung erfasst'); onClose(); }
  };
  return (
    <Modal title="Zahlungseingang erfassen" subtitle={`${invoice.invoiceNo} · offen ${money(invoice.gross)}`} onClose={onClose} width={460}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" onClick={save}>Speichern</button></>}>
      <div className="form-grid">
        <Field label="Zahlungsdatum"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Betrag"><NumInput value={amount} onChange={setAmount} suffix="€" width={160} /></Field>
      </div>
    </Modal>
  );
}
