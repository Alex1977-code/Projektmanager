// Datumsfunktionen auf Basis von ISO-Strings (YYYY-MM-DD), zeitzonensicher in UTC gerechnet.
const DAY = 86400000;

export const parseISO = (s: string) => Date.parse(s + 'T00:00:00Z');
export const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const addDays = (s: string, n: number) => fromMs(parseISO(s) + n * DAY);
export const diffDays = (a: string, b: string) => Math.round((parseISO(b) - parseISO(a)) / DAY);
export const dayOfWeek = (s: string) => (new Date(parseISO(s)).getUTCDay() + 6) % 7; // 0 = Montag

export const startOfWeek = (s: string) => addDays(s, -dayOfWeek(s));
export const startOfMonth = (s: string) => s.slice(0, 8) + '01';
export function addMonths(s: string, n: number) {
  const d = new Date(parseISO(startOfMonth(s)));
  d.setUTCMonth(d.getUTCMonth() + n);
  return fromMs(d.getTime());
}
export function endOfMonth(s: string) {
  return addDays(addMonths(s, 1), -1);
}

export function isoWeek(s: string): number {
  const d = new Date(parseISO(s));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function weeksBetween(from: string, count: number): string[] {
  const start = startOfWeek(from);
  return Array.from({ length: count }, (_, i) => addDays(start, i * 7));
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const monthShort = (s: string) => MONTHS[Number(s.slice(5, 7)) - 1];
export const monthLong = (s: string) => MONTHS_LONG[Number(s.slice(5, 7)) - 1];
export const weekdayShort = (s: string) => WEEKDAYS[dayOfWeek(s)];

export function fmtDate(s?: string | null): string {
  if (!s) return '–';
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}
export function fmtDateShort(s?: string | null): string {
  if (!s) return '–';
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.`;
}

/** "heute", "morgen", "in 5 Tagen", "vor 3 Tagen" */
export function relDays(s: string, today = todayISO()): string {
  const d = diffDays(today, s);
  if (d === 0) return 'heute';
  if (d === 1) return 'morgen';
  if (d === -1) return 'gestern';
  if (d > 0) return d < 14 ? `in ${d} Tagen` : d < 70 ? `in ${Math.round(d / 7)} Wochen` : `in ${Math.round(d / 30)} Monaten`;
  const a = -d;
  return a < 14 ? `vor ${a} Tagen` : a < 70 ? `vor ${Math.round(a / 7)} Wochen` : `vor ${Math.round(a / 30)} Monaten`;
}

export const maxDate = (a: string, b: string) => (a > b ? a : b);
export const minDate = (a: string, b: string) => (a < b ? a : b);
