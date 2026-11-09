// Diagramme für die Auswertungen: Säulen (gruppiert/gestapelt), Balken, Linie, Fläche, Ring.
// Gestaltung: schmale Marken mit abgerundetem Ende, 2-px-Lücke zwischen Flächen, zurückhaltendes Raster,
// Legende ab zwei Reihen (anklickbar), Wert beim Überfahren; Text immer in Textfarbe, nie in Reihenfarbe.
import { useEffect, useMemo, useRef, useState } from 'react';
import { classNames } from '../utils/format';

export type ChartType = 'saeulen' | 'gestapelt' | 'balken' | 'linie' | 'flaeche' | 'ring';
export interface Series { key: string; label: string; values: number[] }
export interface ChartData { categories: string[]; series: Series[] }

/** Feste Farbreihenfolge (geprüft auf Unterscheidbarkeit, auch bei Farbfehlsichtigkeit). Mehr als 8 Reihen werden zu „Übrige“. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const OTHER_COLOR = '#8a93a3';
const GRID = '#e6e9ef';
const AXIS = '#c5ccd8';
const INK = '#1c2433';
const MUTED = '#5b6678';

/** Auf höchstens `max` Reihen begrenzen; der Rest wird zusammengefasst. */
export function foldSeries(series: Series[], max = 8): Series[] {
  if (series.length <= max) return series;
  const sorted = [...series].sort((a, b) => b.values.reduce((s, v) => s + Math.abs(v), 0) - a.values.reduce((s, v) => s + Math.abs(v), 0));
  const keep = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  return [...series.filter((s) => keep.includes(s)), { key: '__other', label: `Übrige (${rest.length})`, values: rest[0].values.map((_, i) => rest.reduce((s, r) => s + (r.values[i] || 0), 0)) }];
}

/** „Schöne“ Achsenteilung: 0 … max in 4–6 Schritten. */
function niceScale(max: number, min = 0) {
  const span = Math.max(max - Math.min(0, min), 1e-9);
  const raw = span / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || raw;
  const lo = min < 0 ? Math.floor(min / step) * step : 0;
  const hi = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(280, el.clientWidth));
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return { ref, w };
}

/** Säule/Balken mit abgerundetem Datenende, gerade an der Grundlinie. */
function barPath(x: number, y: number, w: number, h: number, dir: 'up' | 'down' | 'right' | 'left', round: boolean) {
  const r = round ? Math.min(4, w / 2, h / 2, dir === 'up' || dir === 'down' ? h : w) : 0;
  if (h <= 0 || w <= 0) return '';
  if (dir === 'up') return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  if (dir === 'down') return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
  if (dir === 'right') return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
}

interface Tip { x: number; y: number; title: string; rows: { color: string; label: string; value: string; strong?: boolean }[] }

export function ChartView({ data, type, format, axisFormat, height = 340, ariaLabel }: { data: ChartData; type: ChartType; format: (n: number) => string; axisFormat?: (n: number) => string; height?: number; ariaLabel: string }) {
  const { ref, w } = useWidth();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const all = useMemo(() => foldSeries(data.series), [data.series]);
  // Farbe folgt der Reihe, nicht ihrer Position – ausgeblendete Reihen verschieben nichts
  const colorOf = useMemo(() => new Map(all.map((s, i) => [s.key, s.key === '__other' ? OTHER_COLOR : SERIES_COLORS[i % SERIES_COLORS.length]])), [all]);
  const series = all.filter((s) => !hidden.has(s.key));
  const cats = data.categories;
  const axisFmt = axisFormat || format;
  const single = all.length === 1;
  const toggle = (key: string) => setHidden((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else if (n.size < all.length - 1) n.add(key); return n; });
  const empty = !cats.length || !all.length || all.every((s) => s.values.every((v) => !v));

  const legend = !single && (
    <div className="viz-legend" role="list">
      {all.map((s) => (
        <button key={s.key} type="button" role="listitem" className={classNames('viz-legend-item', hidden.has(s.key) && 'off')} onClick={() => toggle(s.key)} title={hidden.has(s.key) ? 'Reihe einblenden' : 'Reihe ausblenden'} aria-pressed={!hidden.has(s.key)}>
          <i style={{ background: colorOf.get(s.key) }} />{s.label}
        </button>
      ))}
    </div>
  );
  const tooltip = tip && (
    <div className="viz-tip" style={{ left: Math.min(Math.max(tip.x, 90), w - 90), top: tip.y }} role="status">
      <strong>{tip.title}</strong>
      {tip.rows.map((r, i) => <div key={i} className={r.strong ? 'strong' : ''}><i style={{ background: r.color }} /><span>{r.label}</span><b>{r.value}</b></div>)}
    </div>
  );

  if (empty) return <div ref={ref} className="viz-empty">Für diese Auswahl liegen keine Werte vor.</div>;

  // ------------------------------------------------------------------ Ring
  if (type === 'ring') {
    // Anteile: bei einer Reihe je Kategorie, sonst je Reihe (Summe über alle Kategorien)
    const parts = (single ? cats.map((c, i) => ({ key: c, label: c, value: Math.max(0, all[0].values[i] || 0) })) : all.map((s) => ({ key: s.key, label: s.label, value: Math.max(0, s.values.reduce((a, b) => a + b, 0)) })));
    let shown = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
    if (shown.length > 8) shown = [...shown.slice(0, 7), { key: '__other', label: `Übrige (${shown.length - 7})`, value: shown.slice(7).reduce((s, p) => s + p.value, 0) }];
    const visible = shown.filter((p) => !hidden.has(p.key));
    const total = visible.reduce((s, p) => s + p.value, 0) || 1;
    const size = Math.min(height, 300);
    const R = size / 2 - 6;
    const r0 = R * 0.62;
    let a0 = -Math.PI / 2;
    const col = (key: string) => (key === '__other' ? OTHER_COLOR : SERIES_COLORS[shown.findIndex((p) => p.key === key) % SERIES_COLORS.length]);
    const arcs = visible.map((p) => {
      const a1 = a0 + (p.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const pt = (a: number, r: number) => `${size / 2 + r * Math.cos(a)},${size / 2 + r * Math.sin(a)}`;
      const d = visible.length === 1
        ? `M${pt(-Math.PI / 2, R)}A${R},${R} 0 1 1 ${pt(Math.PI / 2, R)}A${R},${R} 0 1 1 ${pt(-Math.PI / 2, R)}M${pt(-Math.PI / 2, r0)}A${r0},${r0} 0 1 0 ${pt(Math.PI / 2, r0)}A${r0},${r0} 0 1 0 ${pt(-Math.PI / 2, r0)}Z`
        : `M${pt(a0, R)}A${R},${R} 0 ${large} 1 ${pt(a1, R)}L${pt(a1, r0)}A${r0},${r0} 0 ${large} 0 ${pt(a0, r0)}Z`;
      const mid = (a0 + a1) / 2;
      a0 = a1;
      return { p, d, mid };
    });
    return (
      <div ref={ref} className="viz viz-ring" onMouseLeave={() => setTip(null)}>
        <svg width={size} height={size} role="img" aria-label={ariaLabel}>
          {arcs.map(({ p, d, mid }) => (
            <path key={p.key} d={d} fill={col(p.key)} fillRule="evenodd" stroke="#fff" strokeWidth={2} tabIndex={0}
              onMouseMove={() => setTip({ x: size / 2 + (R + 10) * Math.cos(mid), y: size / 2 + R * 0.8 * Math.sin(mid), title: p.label, rows: [{ color: col(p.key), label: `${Math.round((p.value / total) * 1000) / 10} %`, value: format(p.value) }] })}
              onFocus={() => setTip({ x: size / 2, y: size / 2, title: p.label, rows: [{ color: col(p.key), label: `${Math.round((p.value / total) * 1000) / 10} %`, value: format(p.value) }] })} onBlur={() => setTip(null)} />
          ))}
          <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize="20" fontWeight="700" fill={INK}>{format(total)}</text>
          <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="12" fill={MUTED}>gesamt</text>
        </svg>
        <div className="viz-legend viz-legend-col" role="list">
          {shown.map((p) => (
            <button key={p.key} type="button" role="listitem" className={classNames('viz-legend-item', hidden.has(p.key) && 'off')} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(p.key)) n.delete(p.key); else if (visible.length > 1) n.add(p.key); return n; })} aria-pressed={!hidden.has(p.key)}>
              <i style={{ background: col(p.key) }} /><span>{p.label}</span><b>{format(p.value)}</b><em>{hidden.has(p.key) ? '' : `${Math.round((p.value / total) * 100)} %`}</em>
            </button>
          ))}
        </div>
        {tooltip}
      </div>
    );
  }

  const stacked = type === 'gestapelt' || type === 'flaeche';
  const stackTotals = cats.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i] || 0), 0));
  const allVals = series.flatMap((s) => s.values);
  const max = stacked ? Math.max(...stackTotals, 0) : Math.max(...allVals, 0);
  const min = stacked ? 0 : Math.min(...allVals, 0);
  const scale = niceScale(max, min);
  const tipRows = (i: number) => {
    const rows = [...series].reverse().map((s) => ({ color: colorOf.get(s.key)!, label: s.label, value: format(s.values[i] || 0) }));
    if (series.length > 1 && (stacked || type === 'saeulen')) rows.push({ color: 'transparent', label: 'Summe', value: format(series.reduce((a, s) => a + (s.values[i] || 0), 0)), strong: true } as Tip['rows'][number]);
    return single ? [{ color: colorOf.get(series[0].key)!, label: series[0].label, value: format(series[0].values[i] || 0) }] : rows;
  };

  // ------------------------------------------------------------------ Balken (waagerecht)
  if (type === 'balken') {
    const rowH = Math.max(26, Math.min(40, 14 * series.length + 12));
    const labelW = Math.min(220, Math.max(90, ...cats.map((c) => c.length * 6.4)));
    const m = { l: labelW + 10, r: 64, t: 8, b: 26 };
    const H = m.t + m.b + rowH * cats.length;
    const iw = w - m.l - m.r;
    const x = (v: number) => m.l + ((v - scale.lo) / (scale.hi - scale.lo)) * iw;
    const bh = Math.min(20, (rowH - 8) / series.length - (series.length > 1 ? 2 : 0));
    return (
      <div ref={ref} className="viz" onMouseLeave={() => { setTip(null); setHover(null); }}>
        {legend}
        <svg width={w} height={H} role="img" aria-label={ariaLabel}>
          {scale.ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} stroke={t === 0 ? AXIS : GRID} /><text x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill={MUTED}>{axisFmt(t)}</text></g>)}
          {cats.map((c, i) => {
            const y0 = m.t + i * rowH;
            const block = series.length * bh + (series.length - 1) * 2;
            return (
              <g key={c + i} onMouseMove={() => { setHover(i); setTip({ x: Math.min(w - 100, x(Math.max(...series.map((s) => s.values[i] || 0), 0)) + 20), y: y0 + rowH / 2, title: c, rows: tipRows(i) }); }}>
                <rect x={0} y={y0} width={w} height={rowH} fill={hover === i ? '#f3f5f9' : 'transparent'} />
                <text x={m.l - 10} y={y0 + rowH / 2 + 4} textAnchor="end" fontSize="12" fill={INK}>{c.length > 34 ? c.slice(0, 33) + '…' : c}</text>
                {series.map((s, k) => {
                  const v = s.values[i] || 0;
                  const y = y0 + (rowH - block) / 2 + k * (bh + 2);
                  const x0 = x(0);
                  return <path key={s.key} d={v >= 0 ? barPath(x0, y, x(v) - x0, bh, 'right', true) : barPath(x(v), y, x0 - x(v), bh, 'left', true)} fill={colorOf.get(s.key)} />;
                })}
                {single && <text x={x(Math.max(series[0].values[i] || 0, 0)) + 6} y={y0 + rowH / 2 + 4} fontSize="11.5" fill={INK}>{format(series[0].values[i] || 0)}</text>}
              </g>
            );
          })}
        </svg>
        {tooltip}
      </div>
    );
  }

  // ------------------------------------------------------------------ Säulen, Linie, Fläche
  const m = { l: 58, r: type === 'linie' || type === 'flaeche' ? 18 : 12, t: 14, b: 34 };
  const H = height;
  const iw = w - m.l - m.r;
  const ih = H - m.t - m.b;
  const y = (v: number) => m.t + ih - ((v - scale.lo) / (scale.hi - scale.lo)) * ih;
  const band = iw / cats.length;
  const cx = (i: number) => m.l + band * (i + 0.5);
  const every = Math.max(1, Math.ceil((cats.length * 62) / iw)); // Beschriftung ausdünnen statt drehen
  const lineLike = type === 'linie' || type === 'flaeche';
  const grouped = type === 'saeulen';
  const groupW = Math.min(band - 8, grouped ? series.length * 26 : 26);
  const bw = grouped ? Math.max(3, Math.min(24, (groupW - (series.length - 1) * 2) / series.length)) : Math.max(4, Math.min(24, band - 8));

  let cum = cats.map(() => 0);
  const areaLayers = stacked && type === 'flaeche' ? series.map((s) => { const base = [...cum]; cum = cum.map((c, i) => c + Math.max(0, s.values[i] || 0)); return { s, base, top: [...cum] }; }) : [];

  return (
    <div ref={ref} className="viz" onMouseLeave={() => { setTip(null); setHover(null); }}>
      {legend}
      <svg width={w} height={H} role="img" aria-label={ariaLabel}>
        {scale.ticks.map((t) => <g key={t}><line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} /><text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{axisFmt(t)}</text></g>)}
        {cats.map((c, i) => (i % every === 0 ? <text key={c + i} x={cx(i)} y={H - 12} textAnchor="middle" fontSize="11" fill={MUTED}>{c.length > 14 ? c.slice(0, 13) + '…' : c}</text> : null))}
        {hover !== null && (lineLike ? <line x1={cx(hover)} x2={cx(hover)} y1={m.t} y2={m.t + ih} stroke={AXIS} /> : <rect x={m.l + band * hover} y={m.t} width={band} height={ih} fill="#f1f4f9" />)}

        {!lineLike && cats.map((_, i) => {
          if (grouped) {
            const total = series.length * bw + (series.length - 1) * 2;
            return series.map((s, k) => {
              const v = s.values[i] || 0;
              const x0 = cx(i) - total / 2 + k * (bw + 2);
              return <path key={s.key + i} d={v >= 0 ? barPath(x0, y(v), bw, y(0) - y(v), 'up', true) : barPath(x0, y(0), bw, y(v) - y(0), 'down', true)} fill={colorOf.get(s.key)} />;
            });
          }
          let acc = 0;
          const top = [...series].reverse().find((s) => (s.values[i] || 0) > 0)?.key;
          return series.map((s) => {
            const v = Math.max(0, s.values[i] || 0);
            if (!v) return null;
            const y1 = y(acc + v);
            const h = Math.max(0, y(acc) - y1 - (acc > 0 ? 2 : 0)); // 2-px-Lücke zwischen den Abschnitten
            acc += v;
            return <path key={s.key + i} d={barPath(cx(i) - bw / 2, y1, bw, h, 'up', s.key === top)} fill={colorOf.get(s.key)} />;
          });
        })}

        {type === 'flaeche' && areaLayers.map(({ s, base, top }) => (
          <path key={s.key} d={`M${top.map((v, i) => `${cx(i)},${y(v)}`).join('L')}L${[...base].reverse().map((v, i) => `${cx(base.length - 1 - i)},${y(v)}`).join('L')}Z`} fill={colorOf.get(s.key)} fillOpacity={0.12} />
        ))}
        {lineLike && (type === 'flaeche' ? areaLayers.map((l) => ({ s: l.s, pts: l.top })) : series.map((s) => ({ s, pts: s.values.map((v) => v || 0) }))).map(({ s, pts }) => (
          <g key={s.key}>
            <path d={`M${pts.map((v, i) => `${cx(i)},${y(v)}`).join('L')}`} fill="none" stroke={colorOf.get(s.key)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {(cats.length <= 16 || hover !== null) && pts.map((v, i) => ((cats.length <= 16 || i === hover) ? <circle key={i} cx={cx(i)} cy={y(v)} r={i === hover ? 5 : 4} fill={colorOf.get(s.key)} stroke="#fff" strokeWidth={2} /> : null))}
          </g>
        ))}
        {/* Werte nur sparsam direkt beschriften: bei einer Reihe und wenigen Kategorien */}
        {single && !lineLike && cats.length <= 14 && series[0].values.map((v, i) => (v ? <text key={i} x={cx(i)} y={(v >= 0 ? y(v) : y(0)) - 6} textAnchor="middle" fontSize="11" fill={INK}>{axisFmt(v)}</text> : null))}
        {/* Trefferflächen: ganze Spalte */}
        {cats.map((c, i) => (
          <rect key={c + i} x={m.l + band * i} y={m.t} width={band} height={ih + 20} fill="transparent" tabIndex={0} aria-label={`${c}: ${series.map((s) => `${s.label} ${format(s.values[i] || 0)}`).join(', ')}`}
            onMouseMove={() => { setHover(i); setTip({ x: cx(i), y: Math.max(m.t, y(stacked ? stackTotals[i] : Math.max(...series.map((s) => s.values[i] || 0), 0)) - 10), title: c, rows: tipRows(i) }); }}
            onFocus={() => { setHover(i); setTip({ x: cx(i), y: m.t + 10, title: c, rows: tipRows(i) }); }} onBlur={() => { setHover(null); setTip(null); }} />
        ))}
      </svg>
      {tooltip}
    </div>
  );
}
