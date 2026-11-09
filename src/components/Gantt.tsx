import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { addDays, addMonths, diffDays, fmtDate, isoWeek, monthShort, startOfMonth, startOfWeek, todayISO } from '../utils/date';
import { classNames } from '../utils/format';

export type GanttScale = 'week' | 'month' | 'quarter';

export interface GanttBar {
  id: string;
  start: string;
  end: string;
  color: string;
  progress?: number; // 0..1
  label?: string;
  tooltip?: string;
  variant?: 'project' | 'phase' | 'task' | 'summary';
  onClick?: () => void;
  onChange?: (start: string, end: string) => void;
}

export interface GanttMilestone {
  id: string;
  date: string;
  label: string;
  done?: boolean;
  onClick?: () => void;
}

export interface GanttRow {
  id: string;
  label: ReactNode;
  meta?: ReactNode;
  level?: number;
  bars: GanttBar[];
  milestones?: GanttMilestone[];
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}

const PX_PER_DAY: Record<GanttScale, number> = { week: 20, month: 4.4, quarter: 1.5 };
const SNAP: Record<GanttScale, number> = { week: 1, month: 1, quarter: 7 };

interface DragState {
  barId: string;
  mode: 'move' | 'start' | 'end';
  x0: number;
  start: string;
  end: string;
  delta: number;
}

export function Gantt({ rows, from, to, scale, labelWidth = 300, labelHeader = 'Vorgang', emptyText }: {
  rows: GanttRow[];
  from: string;
  to: string;
  scale: GanttScale;
  labelWidth?: number;
  labelHeader?: ReactNode;
  emptyText?: string;
}) {
  const ppd = PX_PER_DAY[scale];
  const today = todayISO();
  const days = Math.max(1, diffDays(from, to));
  const width = Math.round(days * ppd);
  const x = (d: string) => diffDays(from, d) * ppd;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Zeitachse
  const { top, bottom, weekends } = useMemo(() => {
    const top: { key: string; x: number; w: number; label: string }[] = [];
    const bottom: { key: string; x: number; w: number; label: string; current?: boolean }[] = [];
    const weekends: number[] = [];
    const xx = (d: string) => diffDays(from, d) * ppd;
    const clampW = (a: string, b: string) => Math.max(0, xx(b < to ? b : to) - xx(a > from ? a : from));
    if (scale === 'week') {
      for (let m = startOfMonth(from); m < to; m = addMonths(m, 1)) {
        const next = addMonths(m, 1);
        top.push({ key: m, x: Math.max(0, xx(m)), w: clampW(m, next), label: `${monthShort(m)} ${m.slice(0, 4)}` });
      }
      for (let w = startOfWeek(from); w < to; w = addDays(w, 7)) {
        bottom.push({ key: w, x: Math.max(0, xx(w)), w: clampW(w, addDays(w, 7)), label: `KW ${isoWeek(w)}`, current: today >= w && today < addDays(w, 7) });
        weekends.push(xx(addDays(w, 5)));
      }
    } else if (scale === 'month') {
      for (let y = Number(from.slice(0, 4)); `${y}-01-01` < to; y++) {
        const a = `${y}-01-01`;
        const b = `${y + 1}-01-01`;
        top.push({ key: a, x: Math.max(0, xx(a)), w: clampW(a, b), label: String(y) });
      }
      for (let m = startOfMonth(from); m < to; m = addMonths(m, 1)) {
        bottom.push({ key: m, x: Math.max(0, xx(m)), w: clampW(m, addMonths(m, 1)), label: monthShort(m), current: today.slice(0, 7) === m.slice(0, 7) });
      }
    } else {
      for (let y = Number(from.slice(0, 4)); `${y}-01-01` < to; y++) {
        const a = `${y}-01-01`;
        top.push({ key: a, x: Math.max(0, xx(a)), w: clampW(a, `${y + 1}-01-01`), label: String(y) });
        for (let q = 0; q < 4; q++) {
          const qa = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`;
          const qb = addMonths(qa, 3);
          if (qb <= from || qa >= to) continue;
          bottom.push({ key: qa, x: Math.max(0, xx(qa)), w: clampW(qa, qb), label: `Q${q + 1}`, current: today >= qa && today < qb });
        }
      }
    }
    return { top, bottom, weekends };
  }, [from, to, ppd, scale, today]);

  // beim ersten Rendern / Wechsel der Skala zu "heute" scrollen
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tx = diffDays(from, today) * ppd;
    el.scrollLeft = Math.max(0, tx - (el.clientWidth - labelWidth) * 0.3);
  }, [scale, from, ppd, labelWidth, today]);

  const onPointerDown = (e: RPointerEvent, bar: GanttBar, mode: DragState['mode']) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!bar.onChange) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ barId: bar.id, mode, x0: e.clientX, start: bar.start, end: bar.end, delta: 0 });
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!drag) return;
    const snap = SNAP[scale];
    const delta = Math.round((e.clientX - drag.x0) / ppd / snap) * snap;
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };
  const finishDrag = (bar: GanttBar) => {
    if (!drag) return;
    const { start, end } = previewDates(drag);
    setDrag(null);
    if (drag.delta === 0) bar.onClick?.();
    else bar.onChange?.(start, end);
  };

  function previewDates(d: DragState) {
    if (d.mode === 'move') return { start: addDays(d.start, d.delta), end: addDays(d.end, d.delta) };
    if (d.mode === 'start') {
      const s = addDays(d.start, d.delta);
      return { start: s > d.end ? d.end : s, end: d.end };
    }
    const en = addDays(d.end, d.delta);
    return { start: d.start, end: en < d.start ? d.start : en };
  }

  return (
    <div className={classNames('gantt', drag && 'gantt-dragging')} style={{ ['--label-w' as string]: `${labelWidth}px` }}>
      <div className="gantt-scroll" ref={scrollRef} onPointerMove={onPointerMove}>
        <div className="gantt-inner" style={{ width: width + labelWidth }}>
          {/* Kopfzeile */}
          <div className="gantt-head">
            <div className="gantt-label gantt-label-head">{labelHeader}</div>
            <div className="gantt-timescale" style={{ width }}>
              <div className="gantt-scale-top">
                {top.map((t) => <div key={t.key} className="gantt-tick" style={{ left: t.x, width: t.w }}><span>{t.label}</span></div>)}
              </div>
              <div className="gantt-scale-bottom">
                {bottom.map((t) => <div key={t.key} className={classNames('gantt-tick', t.current && 'current')} style={{ left: t.x, width: t.w }}><span>{t.label}</span></div>)}
              </div>
              {today >= from && today <= to && <div className="gantt-today-head" style={{ left: x(today) }}><span>Heute</span></div>}
            </div>
          </div>

          {/* Zeilen */}
          <div className="gantt-body">
            <div className="gantt-grid" style={{ left: labelWidth, width }} aria-hidden>
              {bottom.map((t) => <div key={t.key} className="gantt-gridline" style={{ left: t.x }} />)}
              {scale === 'week' && weekends.map((wx) => <div key={wx} className="gantt-weekend" style={{ left: wx, width: ppd * 2 }} />)}
              {today >= from && today <= to && (
                <div className="gantt-today" style={{ left: x(today) }} />
              )}
            </div>

            {rows.length === 0 && <div className="gantt-empty">{emptyText || 'Keine Einträge im Zeitraum'}</div>}

            {rows.map((row) => (
              <div key={row.id} className={classNames('gantt-row', `gantt-level-${row.level || 0}`, row.className)}>
                <div className="gantt-label" style={{ paddingLeft: 12 + (row.level || 0) * 18 }}>
                  {row.onToggle ? (
                    <button className="icon-btn gantt-toggle" onClick={row.onToggle} aria-label={row.expanded ? 'Zuklappen' : 'Aufklappen'} aria-expanded={row.expanded}>
                      {row.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  ) : (row.level || 0) > 0 ? <span className="gantt-toggle-spacer" /> : null}
                  <div className="gantt-label-text">{row.label}</div>
                  {row.meta && <div className="gantt-label-meta">{row.meta}</div>}
                </div>
                <div className="gantt-track" style={{ width }}>
                  {row.bars.map((bar) => {
                    const dates = drag && drag.barId === bar.id ? previewDates(drag) : bar;
                    if (dates.end < from || dates.start > to) return null;
                    const left = x(dates.start);
                    const w = Math.max(6, x(addDays(dates.end, 1)) - left);
                    const fitsLabel = bar.label && w > bar.label.length * 6.6 + 18;
                    const editable = !!bar.onChange;
                    return (
                      <div key={bar.id} className="gantt-bar-wrap" style={{ left, width: w }}>
                        <div
                          className={classNames('gantt-bar', `gantt-bar-${bar.variant || 'phase'}`, editable && 'editable', bar.onClick && 'clickable')}
                          style={{ background: bar.color }}
                          title={`${bar.tooltip || bar.label || ''}\n${fmtDate(dates.start)} – ${fmtDate(dates.end)}${bar.progress !== undefined ? `\nFertigstellung: ${Math.round(bar.progress * 100)} %` : ''}`}
                          onPointerDown={(e) => (editable ? onPointerDown(e, bar, 'move') : undefined)}
                          onPointerUp={() => (editable ? finishDrag(bar) : undefined)}
                          onClick={() => (!editable ? bar.onClick?.() : undefined)}
                        >
                          {bar.progress !== undefined && bar.variant !== 'summary' && (
                            <div className="gantt-bar-progress"><i style={{ width: `${Math.min(1, bar.progress) * 100}%` }} /></div>
                          )}
                          {fitsLabel && <span className="gantt-bar-label">{bar.label}</span>}
                          {editable && (
                            <>
                              <span className="gantt-handle gantt-handle-l" onPointerDown={(e) => onPointerDown(e, bar, 'start')} onPointerUp={(e) => { e.stopPropagation(); finishDrag(bar); }} />
                              <span className="gantt-handle gantt-handle-r" onPointerDown={(e) => onPointerDown(e, bar, 'end')} onPointerUp={(e) => { e.stopPropagation(); finishDrag(bar); }} />
                            </>
                          )}
                        </div>
                        {!fitsLabel && bar.label && <span className="gantt-bar-outside">{bar.label}</span>}
                        {drag && drag.barId === bar.id && (
                          <span className="gantt-drag-info">{fmtDate(dates.start)} – {fmtDate(dates.end)}</span>
                        )}
                      </div>
                    );
                  })}
                  {(row.milestones || []).map((m) => {
                    if (m.date < from || m.date > to) return null;
                    const overdue = !m.done && m.date < today;
                    return (
                      <button
                        key={m.id}
                        className={classNames('gantt-milestone', m.done && 'done', overdue && 'overdue')}
                        style={{ left: x(m.date) + ppd / 2 }}
                        title={`${m.label} · ${fmtDate(m.date)}${m.done ? ' (erreicht)' : overdue ? ' (überfällig)' : ''}`}
                        onClick={m.onClick}
                        aria-label={`Meilenstein ${m.label}, ${fmtDate(m.date)}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Zeitfenster passend zur Skala um die Einträge herum. */
export function ganttRange(dates: string[], scale: GanttScale): { from: string; to: string } {
  const today = todayISO();
  const valid = dates.filter(Boolean).sort();
  const min = valid[0] && valid[0] < today ? valid[0] : today;
  const max = valid[valid.length - 1] && valid[valid.length - 1] > today ? valid[valid.length - 1] : today;
  if (scale === 'week') return { from: startOfWeek(addDays(min, -14)), to: addDays(max, 28) };
  if (scale === 'month') return { from: startOfMonth(addMonths(min, -1)), to: addMonths(max, 2) };
  return { from: `${min.slice(0, 4)}-01-01`, to: `${Number(max.slice(0, 4)) + 1}-01-01` };
}
