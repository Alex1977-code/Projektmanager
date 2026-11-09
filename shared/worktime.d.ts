export declare function toMin(hhmm: string | null | undefined): number | null;
export declare function fromMin(m: number): string;
export declare function grossMinutes(w: { start?: string | null; end?: string | null } | null | undefined): number;
export declare function netMinutes(w: { start?: string | null; end?: string | null; breakMin?: number | null } | null | undefined): number;
export declare function minBreak(workMinutes: number): number;
export declare function checkDay(
  w: { start?: string | null; end?: string | null; breakMin?: number | null; date: string } | null | undefined,
  prev: { start?: string | null; end?: string | null; date: string } | null | undefined,
  ctx?: { holiday?: string | null },
): { level: 'bad' | 'warn' | 'info'; text: string }[];
