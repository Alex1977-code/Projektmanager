// Controlling-Werkzeuge: Nachkalkulation je Arbeitspaket, Angebots-Pipeline, Stundensätze und Produktivität.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { useToast } from './Toast';
import { saveFile } from '../utils/files';
import { Avatar, Card, EmptyState, Kpi, ProgressBar } from './ui';
import { wpMetrics, type WpMetrics } from './WorkPackages';
import { OfferStatusBadge, offerStats } from '../pages/Offers';
import { OFFER_STATUS_LABEL, type Offer, type OfferStatus, type TimeEntry, type WorkPackage, type Worktime } from '../types';
import { projectMetrics } from '../utils/metrics';
import { addMonths, endOfMonth, fmtDate, monthLong, relDays, todayISO } from '../utils/date';
import { classNames, fmtEur, fmtEurCompact, fmtEurSigned, fmtNum, fmtPct, sum } from '../utils/format';
import { netMinutes } from '../../shared/worktime.js';

const csvNum = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

// ============================================================ Nachkalkulation je Arbeitspaket
interface Group { key: string; label: string; offered: number | null; offer?: Offer; rows: { w: WorkPackage; m: WpMetrics }[] }

export function WpControlling() {
  const { data, idx } = useStore();
  const toast = useToast();
  const projects = data.projects.filter((p) => (idx.wpByProject.get(p.id) || []).length > 0);
  const [pid, setPid] = useState<number | null>(null);

  const overview = useMemo(() => projects.map((p) => {
    const wps = idx.wpByProject.get(p.id) || [];
    const ms = wps.map((w) => wpMetrics(w, idx));
    const offered = sum(data.offers.filter((o) => o.projectId === p.id && o.status === 'beauftragt'), (o) => o.subtotal);
    const budget = sum(ms, (m) => m.budget);
    const base = offered || budget;
    const eac = sum(ms, (m) => m.eac);
    return { p, n: wps.length, offered, budget, cost: sum(ms, (m) => m.cost), ev: sum(ms, (m) => m.ev), eac, margin: base - eac, marginPct: base ? (base - eac) / base : null };
  }).sort((a, b) => a.margin - b.margin), [projects, idx, data.offers]);

  const project = projects.find((p) => p.id === pid) || overview[0]?.p;
  const groups = useMemo<Group[]>(() => {
    if (!project) return [];
    const wps = idx.wpByProject.get(project.id) || [];
    const out: Group[] = [];
    for (const o of data.offers.filter((x) => x.projectId === project.id)) {
      o.positions.forEach((pos, i) => {
        const rows = wps.filter((w) => w.offerId === o.id && w.positionKey === pos.key).map((w) => ({ w, m: wpMetrics(w, idx) }));
        if (rows.length || (o.status === 'beauftragt' && !pos.optional)) out.push({ key: `${o.id}|${pos.key}`, label: `${o.offerNo || 'Entwurf'} · Pos. ${i + 1} ${pos.title}`, offered: pos.amount, offer: o, rows });
      });
    }
    const free = wps.filter((w) => !out.some((g) => g.rows.some((r) => r.w.id === w.id))).map((w) => ({ w, m: wpMetrics(w, idx) }));
    if (free.length) out.push({ key: 'frei', label: 'Ohne Angebotsposition', offered: null, rows: free });
    return out;
  }, [project, idx, data.offers]);

  if (!projects.length) return <Card><EmptyState title="Noch keine Arbeitspakete" text="Arbeitspakete entstehen bei der Beauftragung eines Angebots oder im Projekt unter „Arbeitspakete“. Danach zeigt diese Auswertung je angebotener Leistung Plan, Ist und Prognose." /></Card>;

  const all = overview.reduce((t, r) => ({ offered: t.offered + (r.offered || r.budget), cost: t.cost + r.cost, eac: t.eac + r.eac, ev: t.ev + r.ev }), { offered: 0, cost: 0, eac: 0, ev: 0 });
  const exportCsv = async () => {
    const lines = [['Projekt', 'Angebotsposition', 'Arbeitspaket', 'Angebot', 'Budget', 'Plan-Std', 'Ist-Std', 'Ist-Kosten', 'Fortschritt %', 'Leistungswert', 'Prognose', 'Abweichung'].join(';')];
    for (const g of groups) for (const { w, m } of g.rows) lines.push([project!.number, g.label, `${w.code} ${w.title}`, g.offered === null ? '' : csvNum(g.offered), csvNum(m.budget), csvNum(w.plannedHours || 0), csvNum(m.hours), csvNum(m.cost), csvNum(w.progress || 0), csvNum(m.ev), csvNum(m.eac), csvNum(m.variance)].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';'));
    try { await saveFile(`nachkalkulation-${project!.number}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8'); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <div className="kpi-grid kpi-grid-4">
        <Kpi label="Auftragswert (mit Arbeitspaketen)" value={fmtEurCompact(all.offered)} sub={`${overview.length} Projekt(e)`} />
        <Kpi label="Ist-Kosten" value={fmtEurCompact(all.cost)} sub={`Leistungswert ${fmtEurCompact(all.ev)}`} tone={all.cost > all.ev * 1.05 ? 'warn' : 'default'} />
        <Kpi label="Prognose Gesamtkosten" value={fmtEurCompact(all.eac)} sub="Hochrechnung aus Ist und Fortschritt" />
        <Kpi label="Erwarteter Deckungsbeitrag" value={fmtEurCompact(all.offered - all.eac)} tone={all.offered - all.eac < 0 ? 'bad' : 'good'} sub={all.offered ? `${fmtPct((all.offered - all.eac) / all.offered)} vom Auftragswert` : undefined} />
      </div>

      <Card padded={false} title="Projekte im Vergleich" subtitle="Angebot gegen Prognose – sortiert nach Deckungsbeitrag. Zeile anklicken für die Arbeitspakete.">
        <div className="table-wrap">
          <table className="table table-hover">
            <thead><tr><th>Projekt</th><th className="num">AP</th><th className="num">Auftragswert</th><th className="num">Ist-Kosten</th><th className="num">Leistungswert</th><th className="num">Prognose</th><th className="num">Deckungsbeitrag</th><th className="num">Marge</th></tr></thead>
            <tbody>
              {overview.map((r) => (
                <tr key={r.p.id} className={classNames('clickable', project?.id === r.p.id && 'row-selected')} onClick={() => setPid(r.p.id)}>
                  <td className="ctl-name"><span className="proj-dot" style={{ background: r.p.color || '#64748b' }} /> <strong>{r.p.number}</strong> {r.p.name}</td>
                  <td className="num">{r.n}</td>
                  <td className="num">{fmtEur(r.offered || r.budget)}</td>
                  <td className="num">{fmtEur(r.cost)}</td>
                  <td className="num">{fmtEur(r.ev)}</td>
                  <td className="num">{fmtEur(r.eac)}</td>
                  <td className={classNames('num', r.margin < 0 ? 'text-bad' : 'text-good')}><strong>{fmtEurSigned(r.margin)}</strong></td>
                  <td className={classNames('num', (r.marginPct ?? 0) < 0 && 'text-bad')}>{r.marginPct === null ? '–' : fmtPct(r.marginPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {project && (
        <Card padded={false} title={`Nachkalkulation ${project.number} · ${project.name}`} subtitle="Je angebotener Leistung: zugeordnete Arbeitspakete mit Plan, Ist und Prognose"
          actions={<button className="btn btn-sm" onClick={exportCsv}><Download size={14} /> CSV</button>}>
          <div className="table-wrap">
            <table className="table nk-table">
              <thead><tr><th>Angebotsposition / Arbeitspaket</th><th className="num">Angebot / Budget</th><th className="num">Std. Ist / Plan</th><th className="num">Ist-Kosten</th><th style={{ width: 130 }}>Fortschritt</th><th className="num">Leistungswert</th><th className="num">Prognose</th><th className="num">Abweichung</th></tr></thead>
              <tbody>
                {groups.map((g) => {
                  const eac = sum(g.rows, (r) => r.m.eac);
                  const base = g.offered ?? sum(g.rows, (r) => r.m.budget);
                  return (
                    <Fragment key={g.key}>
                      <tr className="nk-group">
                        <td><strong>{g.label}</strong>{g.offer && g.offer.status !== 'beauftragt' && <> <OfferStatusBadge offer={g.offer} /></>}</td>
                        <td className="num"><strong>{fmtEur(base)}</strong></td>
                        <td className="num">{fmtNum(sum(g.rows, (r) => r.m.hours))} / {fmtNum(sum(g.rows, (r) => r.w.plannedHours))}</td>
                        <td className="num">{fmtEur(sum(g.rows, (r) => r.m.cost))}</td>
                        <td />
                        <td className="num">{fmtEur(sum(g.rows, (r) => r.m.ev))}</td>
                        <td className="num">{g.rows.length ? fmtEur(eac) : '–'}</td>
                        <td className={classNames('num', base - eac < 0 ? 'text-bad' : 'text-good')}><strong>{g.rows.length ? fmtEurSigned(base - eac) : '–'}</strong></td>
                      </tr>
                      {g.rows.length === 0 && <tr className="nk-row"><td colSpan={8} className="muted">Noch kein Arbeitspaket zugeordnet.</td></tr>}
                      {g.rows.map(({ w, m }) => (
                        <tr key={w.id} className="nk-row">
                          <td><span className="ts-wp">{w.code}</span> {w.title}</td>
                          <td className="num">{fmtEur(m.budget)}</td>
                          <td className={classNames('num', m.hours > (w.plannedHours || 0) && (w.plannedHours || 0) > 0 && 'text-bad')}>{fmtNum(m.hours)} / {fmtNum(w.plannedHours)}</td>
                          <td className="num">{fmtEur(m.cost)}</td>
                          <td><div className="wp-progress"><ProgressBar value={(w.progress || 0) / 100} /><span className="small">{fmtNum(w.progress)} %</span></div></td>
                          <td className="num">{fmtEur(m.ev)}</td>
                          <td className="num">{fmtEur(m.eac)}</td>
                          <td className={classNames('num', m.variance < 0 ? 'text-bad' : 'text-good')}>{fmtEurSigned(m.variance)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="footnote">Ist-Kosten = gebuchte Stunden × Verrechnungssatz. Leistungswert = Budget × Fortschritt. Prognose = Ist-Kosten ÷ Fortschritt (ab 10 % Fortschritt), davor Ist-Kosten + noch offenes Budget. Deckungsbeitrag = Auftragswert − Prognose.</p>
    </>
  );
}

// ============================================================ Angebots-Pipeline
export function OfferControlling() {
  const { data, idx } = useStore();
  const navigate = useNavigate();
  const today = todayISO();
  const stats = useMemo(() => offerStats(data.offers), [data.offers]);
  const byStatus = (Object.keys(OFFER_STATUS_LABEL) as OfferStatus[]).map((s) => ({ s, list: data.offers.filter((o) => o.status === s) }));
  const maxNet = Math.max(1, ...byStatus.map((b) => sum(b.list, (o) => o.net)));
  const years = [...new Set(data.offers.map((o) => o.date.slice(0, 4)))].sort().reverse();
  const durations = data.offers.filter((o) => o.sentAt && o.decidedAt).map((o) => (Date.parse(o.decidedAt!) - Date.parse(o.sentAt!)) / 86400000);

  if (!data.offers.length) return <Card><EmptyState title="Noch keine Angebote" text="Sobald Angebote angelegt sind, zeigt diese Auswertung offenes Volumen, Auftragsquote und Bindefristen." /></Card>;
  return (
    <>
      <div className="kpi-grid kpi-grid-4">
        <Kpi label="Offenes Angebotsvolumen" value={fmtEurCompact(stats.openNet)} sub={`${stats.open.length} Angebot(e) in Entscheidung`} />
        <Kpi label="Auftragsquote (Anzahl)" value={stats.rateCount === null ? '–' : fmtPct(stats.rateCount)} sub={`${stats.won.length} beauftragt · ${stats.lost.length} abgelehnt`} tone={stats.rateCount !== null && stats.rateCount < 0.3 ? 'warn' : 'default'} />
        <Kpi label="Auftragsquote (Wert)" value={stats.rateValue === null ? '–' : fmtPct(stats.rateValue)} sub={`beauftragt ${fmtEurCompact(stats.wonNet)}`} />
        <Kpi label="Ø Dauer bis Entscheidung" value={durations.length ? `${fmtNum(sum(durations, (d) => d) / durations.length)} Tage` : '–'} sub="vom Versand bis zur Entscheidung" />
      </div>
      <div className="dash-grid">
        <Card title="Angebote nach Status" subtitle="Anzahl und Netto-Volumen">
          <div className="funnel">
            {byStatus.map(({ s, list }) => (
              <div key={s} className="funnel-row">
                <span>{OFFER_STATUS_LABEL[s]}</span>
                <div className="funnel-bar"><i className={`funnel-${s}`} style={{ width: `${(sum(list, (o) => o.net) / maxNet) * 100}%` }} /></div>
                <strong>{fmtEurCompact(sum(list, (o) => o.net))}</strong>
                <small>{list.length}</small>
              </div>
            ))}
          </div>
        </Card>
        <Card padded={false} title="Nach Jahr" className="span-2">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Jahr</th><th className="num">Angebote</th><th className="num">Volumen</th><th className="num">Beauftragt</th><th className="num">Abgelehnt</th><th className="num">Offen</th><th className="num">Quote (Wert)</th></tr></thead>
              <tbody>
                {years.map((y) => {
                  const st = offerStats(data.offers.filter((o) => o.date.startsWith(y) && o.status !== 'entwurf'));
                  const total = st.openNet + st.wonNet + sum(st.lost, (o) => o.net);
                  return <tr key={y}><td><strong>{y}</strong></td><td className="num">{st.open.length + st.won.length + st.lost.length}</td><td className="num">{fmtEur(total)}</td><td className="num text-good">{fmtEur(st.wonNet)}</td><td className="num">{fmtEur(sum(st.lost, (o) => o.net))}</td><td className="num">{fmtEur(st.openNet)}</td><td className="num">{st.rateValue === null ? '–' : fmtPct(st.rateValue)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card padded={false} title="Offene Angebote" subtitle="Sortiert nach Ende der Bindefrist – rechtzeitig nachfassen">
        {stats.open.length === 0 ? <EmptyState title="Keine offenen Angebote" /> : (
          <div className="table-wrap">
            <table className="table table-hover">
              <thead><tr><th>Nr.</th><th>Angebot / Projekt</th><th>Versendet</th><th>Gültig bis</th><th className="num">Netto</th><th className="num">Std.</th></tr></thead>
              <tbody>
                {[...stats.open].sort((a, b) => (a.validUntil || '9').localeCompare(b.validUntil || '9')).map((o) => {
                  const p = idx.projectById.get(o.projectId);
                  const late = o.validUntil && o.validUntil < today;
                  return (
                    <tr key={o.id} className="clickable" onClick={() => navigate(`/angebote/${o.id}`)}>
                      <td className="nowrap"><strong>{o.offerNo}</strong></td>
                      <td>{o.title}<small className="block muted">{p?.number} · {p?.name}</small></td>
                      <td className="nowrap">{fmtDate(o.sentAt)}</td>
                      <td className={classNames('nowrap', late && 'text-bad')}>{fmtDate(o.validUntil)}{o.validUntil && <small className="block">{relDays(o.validUntil)}</small>}</td>
                      <td className="num"><strong>{fmtEur(o.net)}</strong></td>
                      <td className="num">{fmtNum(o.hours)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ============================================================ Stundensätze und Produktivität
export function RateControlling() {
  const { data, idx, can } = useStore();
  const today = todayISO();
  const [month, setMonth] = useState(() => addMonths(`${today.slice(0, 7)}-01`, -1).slice(0, 7));
  const [wt, setWt] = useState<Worktime[] | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const seeAll = can('time.all');

  const load = useCallback(async () => {
    if (!seeAll) return;
    try {
      const [w, t] = await Promise.all([
        api.get<Worktime[]>(`/api/worktimes?all=1&month=${month}`),
        api.get<TimeEntry[]>(`/api/timeEntries?from=${month}-01&to=${endOfMonth(`${month}-01`)}`),
      ]);
      setWt(w); setEntries(t);
    } catch { setWt([]); }
  }, [month, seeAll]);
  useEffect(() => { load(); }, [load]);

  const rates = useMemo(() => data.projects.filter((p) => p.status !== 'Akquise').map((p) => {
    const m = projectMetrics(p, idx, today);
    const calc = m.plannedHours > 0 ? m.budget / m.plannedHours : null;
    const real = m.actualHours > 0 ? m.earnedValue / m.actualHours : null;
    return { p, m, calc, real, delta: calc !== null && real !== null ? real - calc : null };
  }).filter((r) => r.m.actualHours > 0).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)), [data.projects, idx, today]);
  const totH = sum(rates, (r) => r.m.actualHours);
  const avgReal = totH ? sum(rates, (r) => r.m.earnedValue) / totH : null;
  const totPlan = sum(rates, (r) => r.m.plannedHours);
  const avgCalc = totPlan ? sum(rates, (r) => r.m.budget) / totPlan : null;

  const people = useMemo(() => data.employees.filter((e) => e.active).map((e) => {
    const work = sum((wt || []).filter((w) => w.employeeId === e.id), (w) => netMinutes(w)) / 60;
    const proj = sum(entries.filter((t) => t.employeeId === e.id), (t) => t.hours);
    return { e, work, proj, ratio: work > 0 ? proj / work : null };
  }).filter((r) => r.work > 0 || r.proj > 0).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)), [data.employees, wt, entries]);
  const totWork = sum(people, (r) => r.work);
  const totProj = sum(people, (r) => r.proj);

  return (
    <>
      <div className="kpi-grid kpi-grid-4">
        <Kpi label="Erzielter Stundensatz" value={avgReal === null ? '–' : `${fmtNum(avgReal)} €/h`} sub="Leistungswert ÷ gebuchte Stunden" tone={avgReal !== null && avgCalc !== null && avgReal < avgCalc * 0.9 ? 'warn' : 'good'} />
        <Kpi label="Kalkulierter Stundensatz" value={avgCalc === null ? '–' : `${fmtNum(avgCalc)} €/h`} sub="Honorar ÷ geplante Stunden" />
        <Kpi label={`Produktivität ${monthLong(`${month}-01`)}`} value={totWork ? fmtPct(totProj / totWork) : '–'} sub={seeAll ? `${fmtNum(totProj)} von ${fmtNum(totWork)} h auf Projekte gebucht` : 'nur mit Recht „Zeiten anderer einsehen“'} tone={totWork && totProj / totWork < 0.7 ? 'warn' : 'default'} />
        <Kpi label="Nicht verbuchte Stunden" value={totWork ? `${fmtNum(Math.max(0, totWork - totProj))} h` : '–'} sub="Arbeitszeit ohne Projektzuordnung" />
      </div>
      <Card padded={false} title="Stundensätze je Projekt" subtitle="Erzielter Satz = Leistungswert (Honorar × Fertigstellung) ÷ gebuchte Stunden. Liegt er unter dem kalkulierten Satz, wird mehr Zeit verbraucht als honoriert.">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Projekt</th><th className="num">Honorar</th><th className="num">Std. Plan</th><th className="num">Std. Ist</th><th className="num">Fertig</th><th className="num">kalkuliert</th><th className="num">erzielt</th><th className="num">Differenz</th></tr></thead>
            <tbody>
              {rates.map(({ p, m, calc, real, delta }) => (
                <tr key={p.id}>
                  <td className="ctl-name"><span className="proj-dot" style={{ background: p.color || '#64748b' }} /> <strong>{p.number}</strong> {p.name}</td>
                  <td className="num">{fmtEur(m.budget)}</td>
                  <td className="num">{fmtNum(m.plannedHours)}</td>
                  <td className="num">{fmtNum(m.actualHours)}</td>
                  <td className="num">{fmtPct(m.progress)}</td>
                  <td className="num">{calc === null ? '–' : `${fmtNum(calc)} €/h`}</td>
                  <td className="num"><strong>{real === null ? '–' : `${fmtNum(real)} €/h`}</strong></td>
                  <td className={classNames('num', delta !== null && delta < 0 ? 'text-bad' : 'text-good')}>{delta === null ? '–' : `${delta > 0 ? '+' : '−'}${fmtNum(Math.abs(delta))} €/h`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {seeAll && (
        <Card padded={false} title="Produktivität je Person" subtitle="Anteil der Arbeitszeit (Kommen/Gehen), der auf Projekte gebucht wurde"
          actions={<div className="week-nav"><button className="icon-btn" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))} aria-label="Vormonat"><ChevronLeft size={18} /></button><strong className="week-label month-label">{monthLong(`${month}-01`)} {month.slice(0, 4)}</strong><button className="icon-btn" onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))} aria-label="Folgemonat"><ChevronRight size={18} /></button></div>}>
          {people.length === 0 ? <EmptyState title="Keine Zeiten in diesem Monat" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Person</th><th className="num">Arbeitszeit</th><th className="num">Projektstunden</th><th className="num">nicht verbucht</th><th style={{ width: 220 }}>Produktivität</th></tr></thead>
                <tbody>
                  {people.map(({ e, work, proj, ratio }) => (
                    <tr key={e.id}>
                      <td><span className="person-cell"><Avatar employee={e} size={24} /> {e.name}</span></td>
                      <td className="num">{fmtNum(work, 1)} h</td>
                      <td className="num">{fmtNum(proj, 1)} h</td>
                      <td className={classNames('num', work - proj > 16 && 'text-warn')}>{fmtNum(Math.max(0, work - proj), 1)} h</td>
                      <td><div className="wp-progress"><ProgressBar value={ratio ?? 0} tone={ratio !== null && ratio < 0.6 ? 'amber' : 'green'} /><span className="small">{ratio === null ? '–' : fmtPct(ratio)}</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
