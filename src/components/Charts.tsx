import { useState } from 'react';
import { fmtEur, fmtNum, clamp } from '../utils/format';
import { isoWeek, fmtDateShort } from '../utils/date';

/** Säulendiagramm: geplante Team-Auslastung je Woche mit 100-%-Referenzlinie. */
export function UtilizationChart({ data, height = 200 }: { data: { week: string; planned: number; capacity: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const padL = 40;
  const padB = 26;
  const padT = 10;
  const w = 640;
  const h = height;
  const innerH = h - padB - padT;
  const maxU = Math.max(1.2, ...data.map((d) => (d.capacity ? d.planned / d.capacity : 0)));
  const yMax = Math.ceil(maxU * 10) / 10;
  const slot = (w - padL - 8) / Math.max(1, data.length);
  const barW = Math.min(24, slot * 0.6);
  const y = (u: number) => padT + innerH - (u / yMax) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5].filter((t) => t <= yMax + 0.001);

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Geplante Auslastung des Teams je Kalenderwoche">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - 4} y1={y(t)} y2={y(t)} className={t === 1 ? 'chart-ref' : 'chart-grid'} />
            <text x={padL - 8} y={y(t) + 4} className="chart-axis" textAnchor="end">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {data.map((d, i) => {
          const u = d.capacity ? d.planned / d.capacity : 0;
          const cx = padL + slot * i + slot / 2;
          const top = y(u);
          const bh = Math.max(0, padT + innerH - top);
          const r = Math.min(4, bh);
          const over = u > 1;
          return (
            <g key={d.week} onMouseEnter={() => setHover(i)} className="chart-hit">
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />
              {bh > 0 && (
                <path
                  d={`M${cx - barW / 2},${padT + innerH} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${padT + innerH} Z`}
                  className={over ? 'chart-bar chart-bar-over' : hover === i ? 'chart-bar chart-bar-hover' : 'chart-bar'}
                />
              )}
              <text x={cx} y={h - 8} className="chart-axis" textAnchor="middle">{isoWeek(d.week)}</text>
            </g>
          );
        })}
        <line x1={padL} x2={w - 4} y1={padT + innerH} y2={padT + innerH} className="chart-baseline" />
        <text x={w - 6} y={y(1) - 5} className="chart-axis" textAnchor="end">Kapazität 100 %</text>
      </svg>
      {hover !== null && data[hover] && (
        <div className="chart-tooltip" style={{ left: `${((padL + slot * hover + slot / 2) / w) * 100}%` }}>
          <strong>KW {isoWeek(data[hover].week)}</strong> <span className="muted">ab {fmtDateShort(data[hover].week)}</span>
          <div>Geplant: <b>{fmtNum(data[hover].planned)} h</b></div>
          <div>Kapazität: {fmtNum(data[hover].capacity)} h</div>
          <div>Auslastung: <b>{Math.round((data[hover].planned / Math.max(1, data[hover].capacity)) * 100)} %</b></div>
        </div>
      )}
      <div className="chart-caption">Kalenderwoche</div>
    </div>
  );
}

/**
 * Bullet-Balken: Spur = Budget, Balken = Ist-Kosten, Marke = Prognose (EAC).
 * Der Teil der Ist-Kosten über Budget wird als Überschreitung hervorgehoben.
 */
export function BulletBar({ budget, actual, forecast, scaleMax, height = 10 }: { budget: number; actual: number; forecast?: number; scaleMax?: number; height?: number }) {
  const max = Math.max(scaleMax || 0, budget, actual, forecast || 0, 1);
  const pct = (v: number) => `${clamp(v / max, 0, 1) * 100}%`;
  const inBudget = Math.min(actual, budget);
  const over = Math.max(0, actual - budget);
  return (
    <div className="bullet" style={{ height }} title={`Budget ${fmtEur(budget)} · Ist ${fmtEur(actual)}${forecast !== undefined ? ` · Prognose ${fmtEur(forecast)}` : ''}`}>
      <div className="bullet-track" style={{ width: pct(budget) }} />
      <div className="bullet-actual" style={{ width: pct(inBudget) }} />
      {over > 0 && <div className="bullet-over" style={{ left: `calc(${pct(budget)} + 2px)`, width: `calc(${pct(over)} - 2px)` }} />}
      {forecast !== undefined && <div className={forecast > budget ? 'bullet-forecast bad' : 'bullet-forecast'} style={{ left: pct(forecast) }} />}
    </div>
  );
}

export function BulletLegend() {
  return (
    <div className="legend">
      <span><i className="lg-track" /> Budget</span>
      <span><i className="lg-actual" /> Ist-Kosten</span>
      <span><i className="lg-over" /> Überschreitung</span>
      <span><i className="lg-forecast" /> Prognose (EAC)</span>
    </div>
  );
}
