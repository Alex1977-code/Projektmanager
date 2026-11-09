const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export const fmtEur = (n?: number | null) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : eur0.format(n));

/** Kompakte Darstellung: 1,24 Mio. € / 485 T€ */
export function fmtEurCompact(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} Mio. €`;
  if (a >= 10_000) return `${num0.format(n / 1000)} T€`;
  return eur0.format(n);
}

export const fmtHours = (n?: number | null) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : `${num1.format(n)} h`);
export const fmtNum = (n?: number | null, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n) ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: digits });
export const fmtPct = (n?: number | null, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n) ? '–' : `${(n * 100).toLocaleString('de-DE', { maximumFractionDigits: digits })} %`;

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function sum<T>(arr: T[], f: (x: T) => number | null | undefined): number {
  let s = 0;
  for (const x of arr) s += f(x) || 0;
  return s;
}

export function groupBy<T, K extends string | number>(arr: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function classNames(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/** Betrag mit Vorzeichen: +1.234 € / −2.598 € / 0 € */
export function fmtEurSigned(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  if (Math.abs(n) < 0.5) return eur0.format(0);
  return (n > 0 ? '+' : '−') + eur0.format(Math.abs(n));
}
