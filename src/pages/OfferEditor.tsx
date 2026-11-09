import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Copy, ListPlus, Loader2, Package, Plus, Printer, Send, Trash2, XCircle } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { printOrSave, PRINT_LABEL } from '../utils/files';
import { useToast } from '../components/Toast';
import { Modal, useConfirm } from '../components/Modal';
import { Card, EmptyState, Field, NumInput } from '../components/ui';
import { DocFrame } from '../components/DocFrame';
import { OfferStatusBadge } from './Offers';
import type { Offer, OfferPosition, WorkPackage } from '../types';
import { fmtDate, todayISO } from '../utils/date';
import { classNames, fmtEur, fmtNum } from '../utils/format';
import { computeOffer, emptyPosition, newKey, offerLabel, positionsFromPhases } from '../utils/offers';

const eur2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const money = (n: number) => eur2.format(n || 0);

export function OfferEditor() {
  const { id } = useParams();
  const { data, idx, update, remove, create, can, reload } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const stored = data.offers.find((o) => o.id === Number(id));
  const [draft, setDraft] = useState<Offer | null>(stored || null);
  const [saving, setSaving] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [accepting, setAccepting] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const draftRef = useRef(draft);
  const dirty = useRef(false);

  useEffect(() => { if (stored && !dirty.current) { setDraft(stored); draftRef.current = stored; } }, [stored]);

  const save = useCallback(async () => {
    const d = draftRef.current;
    if (!d || !dirty.current) return;
    dirty.current = false;
    setSaving('saving');
    const { title, recipient, contact, date, validUntil, intro, closing, positions, nkPct, discountPct, vatPct, note } = d;
    const row = await update('offers', d.id, d.status === 'entwurf' ? { title, recipient, contact, date, validUntil, intro, closing, positions, nkPct, discountPct, vatPct, note } : { note, validUntil });
    setSaving(row && !dirty.current ? 'saved' : 'dirty');
  }, [update]);
  useEffect(() => () => { window.clearTimeout(timer.current); save(); }, [save]);

  if (!can('offers.view')) return <div className="page"><EmptyState title="Kein Zugriff" text="Angebote sind für Ihre Rolle nicht freigegeben." /></div>;
  if (!draft) return <div className="page"><EmptyState title="Angebot nicht gefunden" action={<Link to="/angebote" className="btn">Zur Übersicht</Link>} /></div>;

  const project = idx.projectById.get(draft.projectId);
  const phases = idx.phasesByProject.get(draft.projectId) || [];
  const editable = draft.status === 'entwurf' && can('offers.edit');
  const calc = computeOffer(draft);
  const settings = data.settings;
  const rates = settings.offerRates || [];
  const wps = data.workPackages.filter((w) => w.offerId === draft.id);
  const wpOf = (key: string) => wps.filter((w) => w.positionKey === key);

  const patch = (p: Partial<Offer>) => {
    const next = { ...draft, ...p };
    setDraft(next);
    draftRef.current = next;
    dirty.current = true;
    setSaving('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 900);
  };
  const setPos = (key: string, p: Partial<OfferPosition>) => patch({ positions: draft.positions.map((x) => (x.key === key ? { ...x, ...p } : x)) });
  const move = (i: number, d: -1 | 1) => {
    const list = [...draft.positions];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    patch({ positions: list });
  };

  const send = async () => {
    if (!draft.positions.length) return toast.error('Das Angebot enthält noch keine Positionen.');
    if (!(await confirm({ title: 'Angebot versenden?', message: 'Das Angebot erhält eine fortlaufende Nummer und wird festgeschrieben. Änderungen sind danach nur über eine neue Fassung möglich.', confirmLabel: 'Versenden' }))) return;
    dirty.current = true;
    await save();
    const row = await update('offers', draft.id, { status: 'versendet' });
    if (row) toast.success(`Angebot ${row.offerNo} versendet`);
  };
  const decline = async () => {
    if (!(await confirm({ title: 'Angebot als abgelehnt kennzeichnen?', message: 'Das Angebot bleibt für die Auswertung der Auftragsquote erhalten.', confirmLabel: 'Abgelehnt' }))) return;
    if (await update('offers', draft.id, { status: 'abgelehnt' })) toast.success('Angebot als abgelehnt gekennzeichnet');
  };
  const copy = async () => {
    await save();
    try {
      const row = await create('offers', {
        projectId: draft.projectId, date: todayISO(), title: draft.title, recipient: draft.recipient, contact: draft.contact, intro: draft.intro, closing: draft.closing,
        positions: draft.positions.map((p) => ({ ...p })), nkPct: draft.nkPct, discountPct: draft.discountPct, vatPct: draft.vatPct, revision: (draft.revision || 0) + 1,
      });
      toast.success('Neue Fassung als Entwurf angelegt');
      navigate(`/angebote/${row.id}`);
    } catch { /* gemeldet */ }
  };
  const del = async () => {
    if (!(await confirm({ title: 'Angebot löschen?', message: 'Der Entwurf wird endgültig gelöscht.', confirmLabel: 'Löschen', danger: true }))) return;
    dirty.current = false;
    if (await remove('offers', draft.id)) navigate('/angebote');
  };
  const print = async () => {
    await save();
    printOrSave('.offer-print', `Angebot-${draft.offerNo || 'Entwurf'}`, `Angebot ${draft.offerNo || ''}`, true).catch((e) => toast.error((e as Error).message));
  };
  const fill = (t: string) => (t || '').replace(/\{gueltig\}/g, fmtDate(draft.validUntil));
  let nr = 0;

  return (
    <div className="page">
      <div className="no-print page-header">
        <div className="page-header-main">
          <div>
            <Link to="/angebote" className="back-link"><ArrowLeft size={15} /> Angebote</Link>
            <h1>Angebot {offerLabel(draft)} <OfferStatusBadge offer={draft} /></h1>
            <p className="page-subtitle"><Link to={`/projekte/${project?.id}`}>{project?.number} · {project?.name}</Link>{draft.sentAt && <> · versendet {fmtDate(draft.sentAt)}</>}{draft.decidedAt && <> · entschieden {fmtDate(draft.decidedAt)}</>}</p>
          </div>
          <div className="page-actions">
            <span className={classNames('save-state', saving)}>{saving === 'saving' ? <><Loader2 size={14} className="spin" /> Speichert …</> : saving === 'dirty' ? 'Ungespeichert' : <><CheckCircle2 size={14} /> Gespeichert</>}</span>
            <button className="btn" onClick={print}><Printer size={16} /> {PRINT_LABEL}</button>
            {can('offers.edit') && draft.status === 'entwurf' && <button className="btn btn-primary" onClick={send}><Send size={16} /> Versenden</button>}
            {can('offers.edit') && draft.status === 'versendet' && <button className="btn btn-primary" onClick={() => setAccepting(true)}><CheckCircle2 size={16} /> Beauftragt</button>}
            {can('offers.edit') && draft.status === 'versendet' && <button className="btn" onClick={decline}><XCircle size={16} /> Abgelehnt</button>}
            {can('offers.edit') && draft.status !== 'entwurf' && <button className="btn" onClick={copy} title="Kopie als neuer Entwurf, z. B. für eine überarbeitete Fassung oder einen Nachtrag"><Copy size={16} /> Neue Fassung</button>}
            {can('offers.edit') && (draft.status === 'entwurf' || draft.status === 'abgelehnt') && <button className="btn btn-ghost-danger" onClick={del} aria-label="Angebot löschen"><Trash2 size={16} /></button>}
          </div>
        </div>
      </div>

      <div className="offer-layout no-print">
        <div className="stack">
          <Card title="Kopfdaten">
            <div className="form-grid">
              <Field label="Titel / Betreff" span={2}><input value={draft.title} disabled={!editable} onChange={(e) => patch({ title: e.target.value })} /></Field>
              <Field label="Empfänger (Anschrift)"><textarea rows={4} value={draft.recipient || ''} disabled={!editable} onChange={(e) => patch({ recipient: e.target.value })} placeholder={'Auftraggeber\nStraße\nPLZ Ort'} /></Field>
              <div className="field-stack">
                <Field label="Ansprechpartner"><input value={draft.contact || ''} disabled={!editable} onChange={(e) => patch({ contact: e.target.value })} placeholder="z. H. Frau / Herrn …" /></Field>
                <div className="inline-pair">
                  <Field label="Datum"><input type="date" value={draft.date} disabled={!editable} onChange={(e) => patch({ date: e.target.value })} /></Field>
                  <Field label="Gültig bis"><input type="date" value={draft.validUntil || ''} disabled={!can('offers.edit')} onChange={(e) => patch({ validUntil: e.target.value })} /></Field>
                </div>
              </div>
              <Field label="Einleitung" span={2}><textarea rows={3} value={draft.intro || ''} disabled={!editable} onChange={(e) => patch({ intro: e.target.value })} /></Field>
            </div>
          </Card>

          <Card padded={false} title="Angebotene Leistungen" subtitle="Pauschal (z. B. Honorar je Leistungsphase) oder nach Aufwand (Stunden × Satz). Bedarfspositionen zählen nicht zur Angebotssumme."
            actions={editable ? (
              <div className="row-actions">
                {phases.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => patch({ positions: [...draft.positions, ...positionsFromPhases(phases)] })}><ListPlus size={14} /> Leistungsphasen</button>}
                <button className="btn btn-sm" onClick={() => patch({ positions: [...draft.positions, emptyPosition()] })}><Plus size={14} /> Position</button>
              </div>
            ) : undefined}>
            {draft.positions.length === 0 ? <EmptyState title="Noch keine Positionen" text="Fügen Sie Leistungen hinzu oder übernehmen Sie die Leistungsphasen des Projekts." /> : (
              <div className="offer-positions">
                {calc.positions.map((p, i) => {
                  const linked = wpOf(p.key);
                  return (
                    <div key={p.key} className={classNames('offer-pos', p.optional && 'optional')}>
                      <div className="op-nr">{i + 1}</div>
                      <div className="op-main">
                        <input className="op-title" value={p.title} disabled={!editable} placeholder="Leistung, z. B. LPH 3 Entwurfsplanung" aria-label={`Leistung Position ${i + 1}`} onChange={(e) => setPos(p.key, { title: e.target.value })} />
                        <textarea className="op-desc" rows={1} value={p.description} disabled={!editable} placeholder="Beschreibung (optional)" aria-label={`Beschreibung Position ${i + 1}`} onChange={(e) => setPos(p.key, { description: e.target.value })} />
                        <div className="op-meta">
                          <select value={p.phaseCode} disabled={!editable} onChange={(e) => setPos(p.key, { phaseCode: e.target.value })} aria-label="Leistungsphase" title="Zuordnung zur Leistungsphase des Projekts">
                            <option value="">ohne Leistungsphase</option>
                            {phases.map((ph) => <option key={ph.id} value={ph.code || ''}>{ph.code} {ph.name}</option>)}
                            {p.phaseCode && !phases.some((ph) => ph.code === p.phaseCode) && <option value={p.phaseCode}>{p.phaseCode}</option>}
                          </select>
                          <label className="check-inline"><input type="checkbox" checked={p.optional} disabled={!editable} onChange={(e) => setPos(p.key, { optional: e.target.checked })} /> Bedarfsposition</label>
                          {linked.length > 0 && <span className="op-wp" title={linked.map((w) => `${w.code} ${w.title}`).join('\n')}><Package size={13} /> {linked.map((w) => w.code).join(', ')}</span>}
                        </div>
                      </div>
                      <div className="op-calc">
                        <div className="segmented segmented-sm">
                          <button type="button" className={p.mode === 'pauschal' ? 'active' : ''} disabled={!editable} onClick={() => setPos(p.key, { mode: 'pauschal' })}>Pauschal</button>
                          <button type="button" className={p.mode === 'aufwand' ? 'active' : ''} disabled={!editable} onClick={() => setPos(p.key, { mode: 'aufwand', rate: p.rate || rates[1]?.rate || rates[0]?.rate || 0 })}>Aufwand</button>
                        </div>
                        <div className="op-fields">
                          <label><span>{p.mode === 'aufwand' ? 'Stunden' : 'kalk. Std.'}</span><NumInput value={p.hours} digits={1} disabled={!editable} width={84} suffix="h" onChange={(v) => setPos(p.key, { hours: v })} label={`Stunden Position ${i + 1}`} /></label>
                          {p.mode === 'aufwand' ? (
                            <label><span>Satz</span>
                              <span className="op-rate">
                                <NumInput value={p.rate} disabled={!editable} width={92} suffix="€/h" onChange={(v) => setPos(p.key, { rate: v })} label={`Stundensatz Position ${i + 1}`} />
                                {editable && rates.length > 0 && (
                                  <select value="" onChange={(e) => e.target.value && setPos(p.key, { rate: Number(e.target.value) })} aria-label="Stundensatz wählen" title="Stundensatz aus den Stammdaten">
                                    <option value="">▾</option>
                                    {rates.map((r) => <option key={r.label} value={r.rate}>{r.label} – {fmtNum(r.rate)} €/h</option>)}
                                  </select>
                                )}
                              </span>
                            </label>
                          ) : (
                            <label><span>Honorar</span><NumInput value={p.amount} disabled={!editable} width={130} suffix="€" onChange={(v) => setPos(p.key, { amount: v })} label={`Betrag Position ${i + 1}`} /></label>
                          )}
                        </div>
                        <div className="op-amount">{money(p.amount)}{p.mode === 'pauschal' && p.hours > 0 && <small>≙ {fmtNum(p.amount / p.hours)} €/h</small>}</div>
                      </div>
                      {editable && (
                        <div className="op-actions">
                          <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="nach oben"><ArrowUp size={15} /></button>
                          <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === draft.positions.length - 1} aria-label="nach unten"><ArrowDown size={15} /></button>
                          <button className="icon-btn" onClick={() => patch({ positions: [...draft.positions.slice(0, i + 1), { ...p, key: newKey(), title: `${p.title} (Kopie)` }, ...draft.positions.slice(i + 1)] })} aria-label="Position duplizieren"><Copy size={15} /></button>
                          <button className="icon-btn danger" onClick={() => patch({ positions: draft.positions.filter((x) => x.key !== p.key) })} aria-label="Position löschen"><Trash2 size={15} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Schlusstext und Notiz">
            <div className="form-grid">
              <Field label="Schlusstext" span={2} hint="Platzhalter {gueltig} = Ende der Bindefrist"><textarea rows={5} value={draft.closing || ''} disabled={!editable} onChange={(e) => patch({ closing: e.target.value })} /></Field>
              <Field label="Interne Notiz (wird nicht gedruckt)" span={2}><textarea rows={2} value={draft.note || ''} disabled={!can('offers.edit')} onChange={(e) => patch({ note: e.target.value })} /></Field>
            </div>
          </Card>
        </div>

        <aside className="stack offer-side">
          <Card title="Angebotssumme">
            <table className="sum-table">
              <tbody>
                <tr><td>Summe Leistungen</td><td>{money(calc.subtotal)}</td></tr>
                <tr><td><span className="sum-input">Nebenkosten <NumInput value={draft.nkPct} digits={1} disabled={!editable} width={70} suffix="%" onChange={(v) => patch({ nkPct: v })} label="Nebenkosten in Prozent" /></span></td><td>{money(calc.nk)}</td></tr>
                <tr><td><span className="sum-input">Nachlass <NumInput value={draft.discountPct} digits={1} disabled={!editable} width={70} suffix="%" onChange={(v) => patch({ discountPct: v })} label="Nachlass in Prozent" /></span></td><td>{calc.discount ? money(-calc.discount) : '–'}</td></tr>
                <tr className="sum-strong"><td>Angebotssumme netto</td><td>{money(calc.net)}</td></tr>
                <tr><td><span className="sum-input">Umsatzsteuer <NumInput value={draft.vatPct} digits={1} disabled={!editable} width={70} suffix="%" onChange={(v) => patch({ vatPct: v })} label="Umsatzsteuer in Prozent" /></span></td><td>{money(calc.vat)}</td></tr>
                <tr className="sum-total"><td>Brutto</td><td>{money(calc.gross)}</td></tr>
                {calc.optionalTotal > 0 && <tr className="muted"><td>Bedarfspositionen (netto)</td><td>{money(calc.optionalTotal)}</td></tr>}
              </tbody>
            </table>
          </Card>
          <Card title="Kalkulation" subtitle="intern">
            <dl className="kv">
              <dt>Kalkulierte Stunden</dt><dd>{fmtNum(calc.hours, 1)} h</dd>
              <dt>Ø Erlös je Stunde</dt><dd>{calc.hours ? `${fmtNum(calc.subtotal / calc.hours)} €/h` : '–'}</dd>
              <dt>Projektbudget bisher</dt><dd>{fmtEur(project?.budget)}</dd>
            </dl>
          </Card>
          <Card title="Arbeitspakete" subtitle={wps.length ? `${wps.length} aus diesem Angebot` : undefined}>
            {wps.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Bei der Beauftragung wird je Position ein Arbeitspaket im Projekt angelegt (Budget = Honorar, Planstunden = kalkulierte Stunden).</p> : (
              <ul className="wp-mini">
                {wps.map((w: WorkPackage) => <li key={w.id}><strong>{w.code}</strong> {w.title}<small>{fmtNum(w.progress)} %</small></li>)}
              </ul>
            )}
            {project && <Link to={`/projekte/${project.id}?tab=arbeitspakete`} className="btn btn-sm btn-ghost" style={{ marginTop: 8 }}>Zum Projekt</Link>}
          </Card>
        </aside>
      </div>

      {/* ------------------------------------------------------------ Druckfassung */}
      <DocFrame className="offer-print" docLabel={`Angebot ${draft.offerNo || ''}`.trim()}>
        <div className="dp-sender">{settings.companyName} · {settings.companyAddress.replace(/\n/g, ' · ')}</div>
        <div className="dp-top">
          <div className="dp-recipient">{draft.recipient}{draft.contact ? `\n${draft.contact}` : ''}</div>
          <table className="dp-meta">
            <tbody>
              <tr><th>Angebotsnummer</th><td>{draft.offerNo || 'ENTWURF'}</td></tr>
              <tr><th>Datum</th><td>{fmtDate(draft.date)}</td></tr>
              <tr><th>Projektnummer</th><td>{project?.number}</td></tr>
              {draft.validUntil && <tr><th>Gültig bis</th><td>{fmtDate(draft.validUntil)}</td></tr>}
            </tbody>
          </table>
        </div>
        <h2>Angebot: {draft.title}</h2>
        <p className="pre">{fill(draft.intro)}</p>
        <table className="dp-lines">
          <thead><tr><th className="nr">Pos.</th><th>Leistung</th><th className="r">Menge</th><th className="r">Satz</th><th className="r">Betrag netto</th></tr></thead>
          <tbody>
            {calc.positions.filter((p) => !p.optional).map((p) => (
              <tr key={p.key}>
                <td className="nr">{++nr}</td>
                <td><strong>{p.title}</strong>{p.description && <small>{p.description}</small>}</td>
                <td className="r">{p.mode === 'aufwand' ? `${fmtNum(p.hours, 1)} h` : 'pauschal'}</td>
                <td className="r">{p.mode === 'aufwand' ? money(p.rate) : ''}</td>
                <td className="r">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tbody className="dp-sums">
            <tr className="dp-sub"><td colSpan={4}>Summe Leistungen</td><td className="r">{money(calc.subtotal)}</td></tr>
            {calc.nk > 0 && <tr><td colSpan={4}>zzgl. Nebenkostenpauschale {fmtNum(draft.nkPct, 1)} %</td><td className="r">{money(calc.nk)}</td></tr>}
            {calc.discount > 0 && <tr><td colSpan={4}>abzgl. Nachlass {fmtNum(draft.discountPct, 1)} %</td><td className="r">{money(-calc.discount)}</td></tr>}
            <tr className="dp-sub"><td colSpan={4}>Angebotssumme netto</td><td className="r">{money(calc.net)}</td></tr>
            <tr><td colSpan={4}>zzgl. Umsatzsteuer {fmtNum(draft.vatPct)} %</td><td className="r">{money(calc.vat)}</td></tr>
            <tr className="dp-total"><td colSpan={4}>Angebotssumme brutto</td><td className="r">{money(calc.gross)}</td></tr>
          </tbody>
        </table>
        {calc.positions.some((p) => p.optional) && (
          <>
            <p><strong>Bedarfspositionen</strong> (nicht in der Angebotssumme enthalten, Beauftragung nach Abruf):</p>
            <table className="dp-lines">
              <tbody>
                {calc.positions.filter((p) => p.optional).map((p, i) => (
                  <tr key={p.key} className="dp-opt">
                    <td className="nr">B{i + 1}</td>
                    <td><strong>{p.title}</strong>{p.description && <small>{p.description}</small>}</td>
                    <td className="r">{p.mode === 'aufwand' ? `${fmtNum(p.hours, 1)} h` : 'pauschal'}</td>
                    <td className="r">{p.mode === 'aufwand' ? money(p.rate) : ''}</td>
                    <td className="r">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="dp-sign"><p className="pre">{fill(draft.closing)}</p><p>{settings.companyName}</p></div>
      </DocFrame>

      {accepting && <AcceptDialog offer={draft} onClose={() => setAccepting(false)} onDone={reload} />}
    </div>
  );
}

function AcceptDialog({ offer, onClose, onDone }: { offer: Offer; onClose: () => void; onDone: () => Promise<void> }) {
  const { idx } = useStore();
  const toast = useToast();
  const project = idx.projectById.get(offer.projectId);
  const [date, setDate] = useState(todayISO());
  const [createWp, setCreateWp] = useState(true);
  const [setBudget, setSetBudget] = useState(!project?.budget);
  const [busy, setBusy] = useState(false);
  const firm = offer.positions.filter((p) => !p.optional).length;
  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ workPackages: WorkPackage[] }>('/api/offers/accept', { id: offer.id, decidedAt: date, createWorkPackages: createWp, setBudget });
      await onDone();
      toast.success(`Angebot beauftragt${res.workPackages.length ? ` – ${res.workPackages.length} Arbeitspakete angelegt` : ''}`);
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Angebot beauftragt" subtitle={`${offer.offerNo} · ${fmtEur(offer.net)} netto`} onClose={onClose} width={520}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Beauftragung übernehmen</button></>}>
      <div className="form-grid">
        <Field label="Datum der Beauftragung"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <label className="check-field field-span2"><input type="checkbox" checked={createWp} onChange={(e) => setCreateWp(e.target.checked)} /> Arbeitspakete aus den {firm} Positionen anlegen</label>
        <label className="check-field field-span2"><input type="checkbox" checked={setBudget} onChange={(e) => setSetBudget(e.target.checked)} /> Angebotssumme als Projektbudget übernehmen ({fmtEur(offer.net)}{project?.budget ? `, bisher ${fmtEur(project.budget)}` : ''})</label>
        {project?.status === 'Akquise' && <p className="field-span2 muted small" style={{ margin: 0 }}>Das Projekt wechselt von „Akquise“ zu „Beauftragt“.</p>}
      </div>
    </Modal>
  );
}
