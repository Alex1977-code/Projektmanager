// Arbeitspakete eines Projekts: Zuordnung zu Angebotspositionen, Plan/Ist, Fortschritt, Prognose.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Package, Plus } from 'lucide-react';
import { useStore } from '../store';
import { useToast } from './Toast';
import { Modal, useConfirm } from './Modal';
import { Avatar, Card, EmptyState, Field, Kpi, NumInput, ProgressBar } from './ui';
import { WP_STATUS, WP_STATUS_LABEL, type Offer, type Project, type WorkPackage, type WpStatus } from '../types';
import type { Index } from '../utils/metrics';
import { classNames, fmtEur, fmtEurSigned, fmtNum, sum } from '../utils/format';
import { fmtDateShort } from '../utils/date';

export interface WpMetrics { hours: number; cost: number; budget: number; ev: number; eac: number; variance: number; hoursLeft: number }

/**
 * Kennzahlen eines Arbeitspakets. Prognose: bei erkennbarem Fortschritt und gebuchten Kosten Hochrechnung
 * (Ist ÷ Fortschritt), sonst Ist + noch nicht erbrachtes Budget.
 */
export function wpMetrics(w: WorkPackage, idx: Index): WpMetrics {
  const a = idx.actualByWp.get(w.id) || { hours: 0, cost: 0 };
  const budget = w.budget || 0;
  const p = Math.max(0, Math.min(100, w.progress || 0)) / 100;
  const ev = budget * p;
  // ohne gebuchte Kosten lässt sich nichts hochrechnen – dann gilt der Plan für den Rest
  const eac = p >= 1 ? a.cost : p >= 0.1 && a.cost > 0 ? a.cost / p : a.cost + Math.max(0, budget - ev);
  return { hours: a.hours, cost: a.cost, budget, ev, eac, variance: budget - eac, hoursLeft: (w.plannedHours || 0) - a.hours };
}

/** Bezeichnung der zugeordneten Angebotsposition, z. B. „AN-2026-003 · 2 LPH 3 Entwurfsplanung“. */
export function positionLabel(w: WorkPackage, offers: Offer[]) {
  const o = offers.find((x) => x.id === w.offerId);
  if (!o) return null;
  const i = o.positions.findIndex((p) => p.key === w.positionKey);
  return i < 0 ? o.offerNo || 'Angebot' : `${o.offerNo || 'Entwurf'} · Pos. ${i + 1} ${o.positions[i].title}`;
}

const TONE: Record<WpStatus, string> = { geplant: 'slate', aktiv: 'blue', abgeschlossen: 'green' };

export function ProjectWorkPackages({ project }: { project: Project }) {
  const { data, idx, can, update } = useStore();
  const canEdit = can('projects.edit');
  const seeCosts = can('costs.view');
  const [edit, setEdit] = useState<WorkPackage | 'new' | { offerId: number; positionKey: string; title: string; budget: number; plannedHours: number } | null>(null);
  const wps = idx.wpByProject.get(project.id) || [];
  const offers = data.offers.filter((o) => o.projectId === project.id);
  const rows = wps.map((w) => ({ w, m: wpMetrics(w, idx) }));
  // beauftragte Positionen ohne Arbeitspaket
  const open = offers.filter((o) => o.status === 'beauftragt').flatMap((o) => o.positions.filter((p) => !p.optional && !wps.some((w) => w.offerId === o.id && w.positionKey === p.key)).map((p) => ({ o, p })));
  const tot = { budget: sum(rows, (r) => r.m.budget), cost: sum(rows, (r) => r.m.cost), ev: sum(rows, (r) => r.m.ev), eac: sum(rows, (r) => r.m.eac), plan: sum(wps, (w) => w.plannedHours), hours: sum(rows, (r) => r.m.hours) };

  return (
    <div className="stack">
      {wps.length > 0 && (
        <div className="kpi-grid kpi-grid-4">
          <Kpi label="Arbeitspakete" value={wps.length} sub={`${wps.filter((w) => w.status === 'abgeschlossen').length} abgeschlossen · ${wps.filter((w) => w.status === 'aktiv').length} in Arbeit`} />
          <Kpi label="Stunden Ist / Plan" value={`${fmtNum(tot.hours)} / ${fmtNum(tot.plan)}`} tone={tot.hours > tot.plan && tot.plan > 0 ? 'warn' : 'default'} sub={tot.plan ? `${fmtNum((tot.hours / tot.plan) * 100)} % verbraucht` : undefined} />
          {seeCosts && <Kpi label="Ist-Kosten / Budget" value={fmtEur(tot.cost)} sub={`von ${fmtEur(tot.budget)} · Leistungswert ${fmtEur(tot.ev)}`} />}
          {seeCosts && <Kpi label="Prognose" value={fmtEur(tot.eac)} tone={tot.eac > tot.budget * 1.02 ? 'bad' : 'good'} sub={`${fmtEurSigned(tot.budget - tot.eac)} gegenüber Budget`} />}
        </div>
      )}
      {open.length > 0 && canEdit && (
        <div className="tpl-hint">
          {open.length} beauftragte Angebotsposition(en) ohne Arbeitspaket:{' '}
          {open.slice(0, 4).map(({ o, p }) => <button key={`${o.id}${p.key}`} className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => setEdit({ offerId: o.id, positionKey: p.key, title: p.title, budget: p.amount, plannedHours: p.hours })}><Plus size={13} /> {p.title.slice(0, 32)}</button>)}
        </div>
      )}
      <Card padded={false} title="Arbeitspakete" subtitle="Gliedern das Projekt in abrechenbare Teilleistungen. Zeiten werden in der Projektzeiterfassung direkt auf das Arbeitspaket gebucht."
        actions={canEdit ? <button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}><Plus size={14} /> Arbeitspaket</button> : undefined}>
        {wps.length === 0 ? (
          <EmptyState icon={<Package size={22} />} title="Noch keine Arbeitspakete" text="Arbeitspakete entstehen automatisch, wenn ein Angebot beauftragt wird – oder Sie legen sie hier von Hand an."
            action={can('offers.view') ? <Link className="btn" to="/angebote">Zu den Angeboten</Link> : undefined} />
        ) : (
          <div className="table-wrap">
            <table className="table table-hover wp-table">
              <thead>
                <tr>
                  <th>Nr.</th><th>Arbeitspaket</th><th>Angebotsposition</th><th>Verantw.</th>
                  <th className="num">Std. Ist / Plan</th>{seeCosts && <th className="num">Budget</th>}{seeCosts && <th className="num">Ist-Kosten</th>}
                  <th style={{ width: 150 }}>Fortschritt</th>{seeCosts && <th className="num">Prognose</th>}<th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ w, m }) => {
                  const ph = w.phaseId ? idx.phaseById.get(w.phaseId) : null;
                  const pos = positionLabel(w, offers);
                  const over = seeCosts && m.eac > m.budget * 1.02 && m.budget > 0;
                  return (
                    <tr key={w.id} className={classNames(canEdit && 'clickable')} onClick={() => canEdit && setEdit(w)}>
                      <td className="nowrap"><strong>{w.code}</strong></td>
                      <td><strong>{w.title}</strong><small className="block muted">{ph ? `${ph.code} ${ph.name}` : 'ohne Leistungsphase'}{w.endDate ? ` · bis ${fmtDateShort(w.endDate)}` : ''}</small></td>
                      <td className="wp-pos">{pos ? <span title={pos}>{pos}</span> : <span className="muted">– nicht zugeordnet –</span>}</td>
                      <td><Avatar employee={idx.employeeById.get(w.responsibleId || 0)} size={24} /></td>
                      <td className={classNames('num nowrap', m.hours > (w.plannedHours || 0) && (w.plannedHours || 0) > 0 && 'text-bad')}>{fmtNum(m.hours)} / {fmtNum(w.plannedHours)}</td>
                      {seeCosts && <td className="num nowrap">{fmtEur(m.budget)}</td>}
                      {seeCosts && <td className="num nowrap">{fmtEur(m.cost)}</td>}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="wp-progress">
                          <ProgressBar value={(w.progress || 0) / 100} />
                          {canEdit ? <NumInput value={w.progress || 0} digits={0} width={64} suffix="%" onChange={(v) => update('workPackages', w.id, { progress: Math.max(0, Math.min(100, v)), status: v >= 100 ? 'abgeschlossen' : v > 0 && w.status === 'geplant' ? 'aktiv' : w.status })} label={`Fortschritt ${w.code}`} /> : <span>{fmtNum(w.progress)} %</span>}
                        </div>
                      </td>
                      {seeCosts && <td className={classNames('num nowrap', over && 'text-bad')}>{fmtEur(m.eac)}<small className="block">{fmtEurSigned(m.variance)}</small></td>}
                      <td><span className={`badge badge-${TONE[w.status] || 'slate'}`}>{WP_STATUS_LABEL[w.status] || w.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <WpForm project={project} offers={offers} wp={edit !== 'new' && 'id' in edit ? edit : undefined} defaults={edit !== 'new' && !('id' in edit) ? edit : undefined} onClose={() => setEdit(null)} />}
    </div>
  );
}

function WpForm({ project, offers, wp, defaults, onClose }: { project: Project; offers: Offer[]; wp?: WorkPackage; defaults?: Partial<WorkPackage>; onClose: () => void }) {
  const { data, idx, create, update, remove, can } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const base = wp || defaults || {};
  const [v, setV] = useState({
    code: base.code ?? '', title: base.title ?? '', description: base.description ?? '',
    link: base.offerId && base.positionKey ? `${base.offerId}|${base.positionKey}` : '',
    phaseId: base.phaseId ? String(base.phaseId) : '', responsibleId: String(base.responsibleId ?? project.leadId ?? ''),
    plannedHours: base.plannedHours ?? 0, budget: base.budget ?? 0, startDate: base.startDate ?? '', endDate: base.endDate ?? '',
    status: (base.status ?? 'geplant') as WpStatus, progress: base.progress ?? 0,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const phases = idx.phasesByProject.get(project.id) || [];
  const seeCosts = can('costs.view');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.title.trim()) return toast.error('Bitte eine Bezeichnung angeben');
    if (v.startDate && v.endDate && v.endDate < v.startDate) return toast.error('Das Ende liegt vor dem Beginn');
    const [offerId, positionKey] = v.link ? v.link.split('|') : [null, null];
    const payload: Partial<WorkPackage> = {
      title: v.title.trim(), description: v.description, offerId: offerId ? Number(offerId) : null, positionKey: positionKey || null,
      phaseId: v.phaseId ? Number(v.phaseId) : null, responsibleId: v.responsibleId ? Number(v.responsibleId) : null,
      plannedHours: Number(v.plannedHours) || 0, startDate: v.startDate || null, endDate: v.endDate || null, status: v.status, progress: Number(v.progress) || 0,
      ...(seeCosts ? { budget: Number(v.budget) || 0 } : {}), ...(v.code.trim() ? { code: v.code.trim() } : {}),
    };
    try {
      if (wp) await update('workPackages', wp.id, payload); else await create('workPackages', { ...payload, projectId: project.id });
      toast.success(wp ? 'Arbeitspaket gespeichert' : 'Arbeitspaket angelegt');
      onClose();
    } catch { /* gemeldet */ }
  };
  const del = async () => {
    if (!wp) return;
    if (await confirm({ title: `${wp.code} löschen?`, message: 'Das Arbeitspaket wird gelöscht. Gebuchte Stunden und Aufgaben bleiben im Projekt erhalten, verlieren aber die Zuordnung.', confirmLabel: 'Löschen', danger: true })) {
      if (await remove('workPackages', wp.id)) onClose();
    }
  };
  // Angebotsposition wählen → Budget und Stunden vorschlagen
  const pickPosition = (link: string) => {
    set('link', link);
    const [oid, key] = link.split('|');
    const pos = offers.find((o) => o.id === Number(oid))?.positions.find((p) => p.key === key);
    if (pos && !wp) setV((x) => ({ ...x, link, title: x.title || pos.title, budget: x.budget || pos.amount, plannedHours: x.plannedHours || pos.hours, phaseId: x.phaseId || String(phases.find((ph) => ph.code === pos.phaseCode)?.id ?? '') }));
  };
  return (
    <Modal title={wp ? `Arbeitspaket ${wp.code}` : 'Neues Arbeitspaket'} onClose={onClose} width={680}
      footer={<>{wp && <button type="button" className="btn btn-ghost-danger" style={{ marginRight: 'auto' }} onClick={del}>Löschen</button>}<button type="button" className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" type="submit" form="wp-form">{wp ? 'Speichern' : 'Anlegen'}</button></>}>
      <form id="wp-form" className="form-grid" onSubmit={submit}>
        <Field label="Bezeichnung *" span={2}><input value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Statische Berechnung Stemmtor" autoFocus required /></Field>
        <Field label="Zugeordnete Angebotsposition" span={2} hint="Verknüpft das Arbeitspaket mit der angebotenen Leistung – Grundlage der Nachkalkulation.">
          <select value={v.link} onChange={(e) => pickPosition(e.target.value)}>
            <option value="">– keine Zuordnung –</option>
            {offers.map((o) => (
              <optgroup key={o.id} label={`${o.offerNo || 'Entwurf'} · ${o.title}`}>
                {o.positions.map((p, i) => <option key={p.key} value={`${o.id}|${p.key}`}>Pos. {i + 1} · {p.title}{p.optional ? ' (Bedarf)' : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Leistungsphase">
          <select value={v.phaseId} onChange={(e) => set('phaseId', e.target.value)}>
            <option value="">– ohne –</option>
            {phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.code} {ph.name}</option>)}
          </select>
        </Field>
        <Field label="Verantwortlich">
          <select value={v.responsibleId} onChange={(e) => set('responsibleId', e.target.value)}>
            <option value="">– offen –</option>
            {data.employees.filter((e) => e.active || String(e.id) === v.responsibleId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Planstunden"><NumInput value={v.plannedHours} digits={1} width="100%" suffix="h" onChange={(n) => set('plannedHours', n)} /></Field>
        {seeCosts && <Field label="Budget (netto)"><NumInput value={v.budget || 0} width="100%" suffix="€" onChange={(n) => set('budget', n)} /></Field>}
        <Field label="Beginn"><input type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Ende"><input type="date" value={v.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Status">
          <select value={v.status} onChange={(e) => set('status', e.target.value as WpStatus)}>{WP_STATUS.map((s) => <option key={s} value={s}>{WP_STATUS_LABEL[s]}</option>)}</select>
        </Field>
        <Field label="Fortschritt"><NumInput value={v.progress} digits={0} width="100%" suffix="%" onChange={(n) => set('progress', Math.max(0, Math.min(100, n)))} /></Field>
        <Field label="Nummer"><input value={v.code} onChange={(e) => set('code', e.target.value)} placeholder="automatisch (AP n)" /></Field>
        <Field label="Beschreibung" span={2}><textarea rows={2} value={v.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
