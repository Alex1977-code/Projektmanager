// Auswertungen: Kennzahl, Gruppierung, Aufteilung, Zeitraum und Diagrammart frei wählbar.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AreaChart, BarChart3, BarChartHorizontal, ChartColumnStacked, Download, LineChart, PieChart, Send, Table2 } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { saveFile } from '../utils/files';
import { Card, Kpi, PageHeader } from '../components/ui';
import { ChartView, foldSeries, type ChartData, type ChartType } from '../components/ChartView';
import { ComposeDialog } from './Messages';
import { OFFER_STATUS_LABEL } from '../types';
import { addMonths, monthShort, todayISO } from '../utils/date';
import { classNames, fmtEur, fmtEurCompact, fmtNum } from '../utils/format';

type Measure = 'stunden' | 'personalkosten' | 'planung' | 'umsatz' | 'zahlungen' | 'angebote' | 'fremdkosten';
type Dim = 'monat' | 'projekt' | 'person' | 'abteilung' | 'phase' | 'auftraggeber' | 'status' | 'kategorie' | 'kreditor' | '';
type Period = '12m' | '6m' | 'jahr' | 'vorjahr' | 'alles';
interface Rec { month: string; value: number; projectId?: number | null; employeeId?: number | null; phase?: string; status?: string; category?: string; contactId?: number | null }
interface HoursRow { month: string; employeeId: number; projectId: number; phaseId: number | null; hours: number; cost: number }

const MEASURES: Record<Measure, { label: string; unit: 'h' | '€'; dims: Dim[]; perm?: string; hint: string }> = {
  stunden: { label: 'Gebuchte Stunden', unit: 'h', dims: ['monat', 'projekt', 'person', 'abteilung', 'phase', 'auftraggeber'], hint: 'Projektzeiten aus der Zeiterfassung' },
  personalkosten: { label: 'Personalkosten (Ist)', unit: '€', dims: ['monat', 'projekt', 'person', 'abteilung', 'phase', 'auftraggeber'], perm: 'costs.view', hint: 'Gebuchte Stunden × Verrechnungssatz' },
  planung: { label: 'Geplante Stunden', unit: 'h', dims: ['monat', 'projekt', 'person', 'abteilung'], hint: 'Wochenplanung aus der Ressourcenplanung' },
  umsatz: { label: 'Rechnungen (netto)', unit: '€', dims: ['monat', 'projekt', 'auftraggeber', 'status'], perm: 'invoices.view', hint: 'Gestellte Rechnungen nach Rechnungsdatum' },
  zahlungen: { label: 'Zahlungseingänge', unit: '€', dims: ['monat', 'projekt', 'auftraggeber'], perm: 'invoices.view', hint: 'Bezahlte Beträge nach Zahlungsdatum' },
  angebote: { label: 'Angebotsvolumen (netto)', unit: '€', dims: ['monat', 'status', 'projekt', 'auftraggeber'], perm: 'offers.view', hint: 'Versendete Angebote nach Angebotsdatum' },
  fremdkosten: { label: 'Fremdkosten', unit: '€', dims: ['monat', 'kategorie', 'projekt', 'kreditor'], perm: 'costs.view', hint: 'Angefallene Fremdkosten nach Belegdatum' },
};
const DIM_LABEL: Record<Exclude<Dim, ''>, string> = { monat: 'Monat', projekt: 'Projekt', person: 'Person', abteilung: 'Abteilung', phase: 'Leistungsphase', auftraggeber: 'Auftraggeber', status: 'Status', kategorie: 'Kategorie', kreditor: 'Kreditor' };
const PERIODS: Record<Period, string> = { '12m': 'Letzte 12 Monate', '6m': 'Letzte 6 Monate', jahr: 'Laufendes Jahr', vorjahr: 'Vorjahr', alles: 'Gesamter Zeitraum' };
const TYPES: { id: ChartType; label: string; icon: ReactNode }[] = [
  { id: 'saeulen', label: 'Säulen', icon: <BarChart3 size={16} /> },
  { id: 'gestapelt', label: 'Gestapelt', icon: <ChartColumnStacked size={16} /> },
  { id: 'balken', label: 'Balken', icon: <BarChartHorizontal size={16} /> },
  { id: 'linie', label: 'Linie', icon: <LineChart size={16} /> },
  { id: 'flaeche', label: 'Fläche', icon: <AreaChart size={16} /> },
  { id: 'ring', label: 'Ring', icon: <PieChart size={16} /> },
];
interface Config { m: Measure; x: Exclude<Dim, ''>; s: Dim; p: Period; t: ChartType }
const PRESETS: { title: string; text: string; c: Config }[] = [
  { title: 'Stunden je Monat', text: 'nach Projekt gestapelt', c: { m: 'stunden', x: 'monat', s: 'projekt', p: '12m', t: 'gestapelt' } },
  { title: 'Stunden je Person', text: 'Rangfolge im Zeitraum', c: { m: 'stunden', x: 'person', s: '', p: '6m', t: 'balken' } },
  { title: 'Umsatz je Monat', text: 'gestellte Rechnungen', c: { m: 'umsatz', x: 'monat', s: '', p: '12m', t: 'saeulen' } },
  { title: 'Umsatz nach Auftraggeber', text: 'wer trägt den Umsatz', c: { m: 'umsatz', x: 'auftraggeber', s: '', p: 'alles', t: 'balken' } },
  { title: 'Zahlungseingänge', text: 'Verlauf je Monat', c: { m: 'zahlungen', x: 'monat', s: '', p: '12m', t: 'flaeche' } },
  { title: 'Angebote nach Status', text: 'Anteile am Volumen', c: { m: 'angebote', x: 'status', s: '', p: 'alles', t: 'ring' } },
  { title: 'Personalkosten je Projekt', text: 'nach Leistungsphase', c: { m: 'personalkosten', x: 'projekt', s: 'phase', p: '12m', t: 'gestapelt' } },
  { title: 'Fremdkosten', text: 'Anteile nach Kategorie', c: { m: 'fremdkosten', x: 'kategorie', s: '', p: 'alles', t: 'ring' } },
];

const monthsBetween = (from: string, to: string) => { const out: string[] = []; for (let m = from; m <= to; m = addMonths(`${m}-01`, 1).slice(0, 7)) out.push(m); return out; };
const monthLabel = (m: string) => `${monthShort(`${m}-01`)} ${m.slice(2, 4)}`;

export function Reports() {
  const { data, idx, can, me } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const allowed = (Object.keys(MEASURES) as Measure[]).filter((k) => !MEASURES[k].perm || can(MEASURES[k].perm!));
  const cfg: Config = useMemo(() => {
    // ohne Auswahl: erste Vorlage (Stunden je Monat nach Projekt)
    if (!params.has('m') && allowed.includes(PRESETS[0].c.m)) return PRESETS[0].c;
    const m = allowed.includes(params.get('m') as Measure) ? (params.get('m') as Measure) : allowed[0];
    const dims = MEASURES[m].dims;
    const x = (dims.includes(params.get('x') as Dim) ? params.get('x') : dims[0]) as Exclude<Dim, ''>;
    const s = (params.get('s') && dims.includes(params.get('s') as Dim) && params.get('s') !== x ? params.get('s') : '') as Dim;
    const p = ((params.get('p') || '') in PERIODS ? params.get('p') : '12m') as Period;
    const t = (TYPES.some((y) => y.id === params.get('t')) ? params.get('t') : x === 'monat' ? (s ? 'gestapelt' : 'saeulen') : 'balken') as ChartType;
    return { m, x, s, p, t };
  }, [params, allowed]);
  const set = (patch: Partial<Config>) => {
    const next = { ...cfg, ...patch };
    const dims = MEASURES[next.m].dims;
    if (!dims.includes(next.x)) next.x = dims[0] as Exclude<Dim, ''>;
    if (next.s === next.x || (next.s && !dims.includes(next.s))) next.s = '';
    // Diagrammart passend zur Auswahl vorschlagen, wenn sie nicht ausdrücklich gewählt wurde
    if (!patch.t) {
      if (next.x !== 'monat' && (next.t === 'linie' || next.t === 'flaeche')) next.t = 'balken';
      if (next.x === 'monat' && (next.t === 'balken' || next.t === 'ring')) next.t = next.s ? 'gestapelt' : 'saeulen';
      if (patch.s !== undefined && next.t === 'saeulen' && next.s) next.t = 'gestapelt';
      if (patch.s === '' && next.t === 'gestapelt') next.t = 'saeulen';
    }
    setParams({ m: next.m, x: next.x, ...(next.s ? { s: next.s } : {}), p: next.p, t: next.t }, { replace: true });
  };
  const [showTable, setShowTable] = useState(false);
  const [sending, setSending] = useState(false);
  const [hours, setHours] = useState<HoursRow[] | null>(null);

  const thisMonth = today.slice(0, 7);
  const [from, to] = useMemo<[string, string]>(() => {
    const y = Number(today.slice(0, 4));
    if (cfg.p === '6m') return [addMonths(`${thisMonth}-01`, -5).slice(0, 7), thisMonth];
    if (cfg.p === 'jahr') return [`${y}-01`, thisMonth];
    if (cfg.p === 'vorjahr') return [`${y - 1}-01`, `${y - 1}-12`];
    if (cfg.p === 'alles') return ['2000-01', '2099-12'];
    return [addMonths(`${thisMonth}-01`, -11).slice(0, 7), thisMonth];
  }, [cfg.p, today, thisMonth]);

  const needsHours = cfg.m === 'stunden' || cfg.m === 'personalkosten';
  useEffect(() => {
    if (!needsHours) return;
    let off = false;
    setHours(null);
    api.get<HoursRow[]>(`/api/reports/hours?from=${from}-01&to=${to}-31`).then((r) => { if (!off) setHours(r); }).catch((e) => { if (!off) { setHours([]); toast.error((e as Error).message); } });
    return () => { off = true; };
  }, [needsHours, from, to, toast]);

  // ---- Datensätze der gewählten Kennzahl
  const records = useMemo<Rec[]>(() => {
    const inP = (m?: string | null) => !!m && m >= from && m <= to;
    const deb = (pid: number) => idx.projectById.get(pid)?.debitorId ?? null;
    switch (cfg.m) {
      case 'stunden': case 'personalkosten':
        return (hours || []).map((r) => ({ month: r.month, value: cfg.m === 'stunden' ? r.hours : r.cost, projectId: r.projectId, employeeId: r.employeeId, phase: r.phaseId ? idx.phaseById.get(r.phaseId)?.code || 'ohne Phase' : 'ohne Phase', contactId: deb(r.projectId) }));
      case 'planung':
        return data.allocations.filter((a) => inP(a.weekStart.slice(0, 7))).map((a) => ({ month: a.weekStart.slice(0, 7), value: a.hours, projectId: a.projectId, employeeId: a.employeeId }));
      case 'umsatz':
        return data.invoices.filter((i) => i.status !== 'entwurf' && i.status !== 'storniert' && inP(i.date.slice(0, 7))).map((i) => ({ month: i.date.slice(0, 7), value: i.net, projectId: i.projectId, contactId: deb(i.projectId), status: i.status === 'bezahlt' ? 'Bezahlt' : i.dueDate && i.dueDate < today ? 'Überfällig' : 'Offen' }));
      case 'zahlungen':
        return data.invoices.filter((i) => i.paidDate && i.paidAmount && inP(i.paidDate.slice(0, 7))).map((i) => ({ month: i.paidDate!.slice(0, 7), value: i.paidAmount!, projectId: i.projectId, contactId: deb(i.projectId) }));
      case 'angebote':
        return data.offers.filter((o) => o.status !== 'entwurf' && inP(o.date.slice(0, 7))).map((o) => ({ month: o.date.slice(0, 7), value: o.net, projectId: o.projectId, contactId: deb(o.projectId), status: OFFER_STATUS_LABEL[o.status] }));
      case 'fremdkosten':
        return data.costs.filter((c) => c.status === 'angefallen' && c.date && inP(c.date.slice(0, 7))).map((c) => ({ month: c.date!.slice(0, 7), value: c.amount, projectId: c.projectId, category: c.category || 'Sonstiges', contactId: c.kreditorId ?? null }));
    }
  }, [cfg.m, hours, data, idx, from, to, today]);

  const labelOf = (r: Rec, d: Dim): string => {
    const contact = (id?: number | null) => data.contacts.find((c) => c.id === id)?.name;
    switch (d) {
      case 'monat': return r.month;
      case 'projekt': return idx.projectById.get(r.projectId || 0)?.number || 'ohne Projekt';
      case 'person': return idx.employeeById.get(r.employeeId || 0)?.name || 'unbekannt';
      case 'abteilung': return idx.employeeById.get(r.employeeId || 0)?.department || 'ohne Abteilung';
      case 'phase': return r.phase || 'ohne Phase';
      case 'auftraggeber': return contact(r.contactId) || idx.projectById.get(r.projectId || 0)?.client || 'ohne Auftraggeber';
      case 'kreditor': return contact(r.contactId) || 'ohne Kreditor';
      case 'status': return r.status || '–';
      case 'kategorie': return r.category || 'Sonstiges';
      default: return '';
    }
  };

  // ---- Verdichten zu Kategorien × Reihen
  const chart = useMemo<ChartData & { total: number }>(() => {
    const totals = new Map<string, number>();
    for (const r of records) totals.set(labelOf(r, cfg.x), (totals.get(labelOf(r, cfg.x)) || 0) + r.value);
    let cats: string[];
    if (cfg.x === 'monat') {
      const ms = [...totals.keys()].sort();
      cats = ms.length ? monthsBetween(cfg.p === 'alles' ? ms[0] : from, cfg.p === 'alles' ? ms[ms.length - 1] : to) : [];
    } else {
      cats = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      if (cfg.x === 'phase') cats.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
      if (cats.length > 14) cats = cats.slice(0, 14); // die größten 14 – Rest steht in der Tabelle/CSV
    }
    const pos = new Map(cats.map((c, i) => [c, i]));
    const bySeries = new Map<string, number[]>();
    for (const r of records) {
      const i = pos.get(labelOf(r, cfg.x));
      if (i === undefined) continue;
      const key = cfg.s ? labelOf(r, cfg.s) : MEASURES[cfg.m].label;
      if (!bySeries.has(key)) bySeries.set(key, cats.map(() => 0));
      bySeries.get(key)![i] += r.value;
    }
    const series = [...bySeries.entries()].map(([label, values]) => ({ key: label, label, values: values.map((v) => Math.round(v * 100) / 100) }))
      .sort((a, b) => (cfg.s === 'phase' ? a.label.localeCompare(b.label, 'de', { numeric: true }) : b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0)));
    return { categories: cfg.x === 'monat' ? cats.map(monthLabel) : cats, series, total: records.reduce((s, r) => s + r.value, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, cfg.x, cfg.s, cfg.m, cfg.p, from, to]);

  const unit = MEASURES[cfg.m].unit;
  const fmt = (n: number) => (unit === '€' ? fmtEur(n) : `${fmtNum(n, n % 1 ? 1 : 0)} h`);
  const axisFmt = (n: number) => (unit === '€' ? (Math.abs(n) >= 10000 ? fmtEurCompact(n) : fmtEur(n)) : fmtNum(n));
  const title = `${MEASURES[cfg.m].label} je ${DIM_LABEL[cfg.x]}${cfg.s ? ` nach ${DIM_LABEL[cfg.s]}` : ''}`;
  const catTotals = chart.categories.map((_, i) => chart.series.reduce((s, x) => s + (x.values[i] || 0), 0));
  const maxI = catTotals.indexOf(Math.max(...catTotals, 0));
  const loading = needsHours && hours === null;
  const typeOk = (t: ChartType) => (t === 'linie' || t === 'flaeche' ? cfg.x === 'monat' : t === 'gestapelt' ? !!cfg.s : true);

  const exportCsv = async () => {
    const head = [DIM_LABEL[cfg.x], ...chart.series.map((s) => s.label), ...(chart.series.length > 1 ? ['Summe'] : [])];
    const n = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
    const lines = chart.categories.map((c, i) => [c, ...chart.series.map((s) => n(s.values[i] || 0)), ...(chart.series.length > 1 ? [n(catTotals[i])] : [])]);
    const csv = '﻿' + [head, ...lines].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    try { await saveFile(`auswertung-${cfg.m}-${cfg.x}-${today}.csv`, csv, 'text/csv;charset=utf-8'); } catch (e) { toast.error((e as Error).message); }
  };
  const tableSeries = showTable ? chart.series : foldSeries(chart.series);

  return (
    <div className="page">
      <PageHeader title="Auswertungen" subtitle="Kennzahl wählen, gruppieren, aufteilen – das Diagramm passt sich sofort an" />

      <div className="preset-row" role="list" aria-label="Vorlagen">
        {PRESETS.filter((p) => allowed.includes(p.c.m)).map((p) => {
          const active = p.c.m === cfg.m && p.c.x === cfg.x && p.c.s === cfg.s && p.c.t === cfg.t;
          return (
            <button key={p.title} type="button" role="listitem" className={classNames('preset', active && 'active')} onClick={() => setParams({ m: p.c.m, x: p.c.x, ...(p.c.s ? { s: p.c.s } : {}), p: p.c.p, t: p.c.t }, { replace: true })}>
              <span className="preset-icon">{TYPES.find((t) => t.id === p.c.t)?.icon}</span>
              <span><strong>{p.title}</strong><small>{p.text}</small></span>
            </button>
          );
        })}
      </div>

      <div className="report-controls">
        <label><span>Kennzahl</span>
          <select value={cfg.m} onChange={(e) => set({ m: e.target.value as Measure })}>{allowed.map((k) => <option key={k} value={k}>{MEASURES[k].label}</option>)}</select>
        </label>
        <label><span>Gruppiert nach</span>
          <select value={cfg.x} onChange={(e) => set({ x: e.target.value as Exclude<Dim, ''> })}>{MEASURES[cfg.m].dims.map((d) => <option key={d} value={d}>{DIM_LABEL[d as Exclude<Dim, ''>]}</option>)}</select>
        </label>
        <label><span>Aufgeteilt nach</span>
          <select value={cfg.s} onChange={(e) => set({ s: e.target.value as Dim })}>
            <option value="">– nicht aufteilen –</option>
            {MEASURES[cfg.m].dims.filter((d) => d !== cfg.x && d !== 'monat').map((d) => <option key={d} value={d}>{DIM_LABEL[d as Exclude<Dim, ''>]}</option>)}
          </select>
        </label>
        <label><span>Zeitraum</span>
          <select value={cfg.p} onChange={(e) => set({ p: e.target.value as Period })}>{(Object.keys(PERIODS) as Period[]).map((p) => <option key={p} value={p}>{PERIODS[p]}</option>)}</select>
        </label>
        <div className="report-types" role="group" aria-label="Diagrammart">
          <span>Diagrammart</span>
          <div className="segmented">
            {TYPES.map((t) => <button key={t.id} type="button" className={cfg.t === t.id ? 'active' : ''} disabled={!typeOk(t.id)} onClick={() => set({ t: t.id })} title={typeOk(t.id) ? t.label : t.id === 'gestapelt' ? 'Gestapelt braucht eine Aufteilung' : 'Nur bei Gruppierung nach Monat'} aria-label={t.label} aria-pressed={cfg.t === t.id}>{t.icon}<em>{t.label}</em></button>)}
          </div>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-4">
        <Kpi label="Summe im Zeitraum" value={unit === '€' ? fmtEurCompact(chart.total) : `${fmtNum(chart.total)} h`} sub={PERIODS[cfg.p]} />
        <Kpi label={`Ø je ${DIM_LABEL[cfg.x]}`} value={chart.categories.length ? fmt(chart.total / chart.categories.length) : '–'} sub={`${chart.categories.length} ${cfg.x === 'monat' ? 'Monate' : 'Einträge'}`} />
        <Kpi label="Höchster Wert" value={chart.categories.length ? fmt(catTotals[maxI] || 0) : '–'} sub={chart.categories[maxI] || undefined} />
        <Kpi label={cfg.s ? DIM_LABEL[cfg.s] : 'Datengrundlage'} value={cfg.s ? chart.series.length : records.length} sub={cfg.s ? (chart.series[0] ? `größter Anteil: ${chart.series[0].label}` : undefined) : MEASURES[cfg.m].hint} />
      </div>

      <Card title={title} subtitle={`${PERIODS[cfg.p]} · ${MEASURES[cfg.m].hint}${!can('time.all') && needsHours ? ' · nur Ihre eigenen Zeiten' : ''}`}
        actions={
          <div className="row-actions">
            <button className={classNames('btn btn-sm', showTable && 'btn-active')} onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}><Table2 size={14} /> Tabelle</button>
            <button className="btn btn-sm" onClick={exportCsv}><Download size={14} /> CSV</button>
            {me && <button className="btn btn-sm btn-primary" onClick={() => setSending(true)}><Send size={14} /> Senden</button>}
          </div>
        }>
        {loading ? <div className="viz-empty">Daten werden geladen …</div> : <ChartView data={chart} type={cfg.t} format={fmt} axisFormat={axisFmt} ariaLabel={title} />}
        {showTable && !loading && (
          <div className="table-wrap report-table">
            <table className="table">
              <thead><tr><th>{DIM_LABEL[cfg.x]}</th>{tableSeries.map((s) => <th key={s.key} className="num">{s.label}</th>)}{tableSeries.length > 1 && <th className="num">Summe</th>}</tr></thead>
              <tbody>
                {chart.categories.map((c, i) => <tr key={c + i}><td>{c}</td>{tableSeries.map((s) => <td key={s.key} className="num">{s.values[i] ? fmt(s.values[i]) : '–'}</td>)}{tableSeries.length > 1 && <td className="num"><strong>{fmt(catTotals[i])}</strong></td>}</tr>)}
              </tbody>
              <tfoot><tr><td><strong>Summe</strong></td>{tableSeries.map((s) => <td key={s.key} className="num"><strong>{fmt(s.values.reduce((a, b) => a + b, 0))}</strong></td>)}{tableSeries.length > 1 && <td className="num"><strong>{fmt(catTotals.reduce((a, b) => a + b, 0))}</strong></td>}</tr></tfoot>
            </table>
          </div>
        )}
      </Card>
      {sending && <ComposeDialog onClose={() => setSending(false)} defaults={{ subject: `Auswertung: ${title}`, body: `Bitte ansehen: ${title} (${PERIODS[cfg.p]}), Summe ${fmt(chart.total)}.`, link: `/auswertungen?${params.toString() || `m=${cfg.m}&x=${cfg.x}${cfg.s ? `&s=${cfg.s}` : ''}&p=${cfg.p}&t=${cfg.t}`}`, linkLabel: title }} />}
    </div>
  );
}
