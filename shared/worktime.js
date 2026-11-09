// Arbeitszeit: Berechnung und Prüfung nach Arbeitszeitgesetz (ArbZG) – gemeinsam für Server und Oberfläche.

/** "07:45" → 465 */
export function toMin(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
/** 465 → "07:45" */
export const fromMin = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

/** Anwesenheit brutto in Minuten (über Mitternacht möglich). */
export function grossMinutes(w) {
  const s = toMin(w?.start);
  const e = toMin(w?.end);
  if (s === null || e === null) return 0;
  return e >= s ? e - s : e + 1440 - s;
}

/** Arbeitszeit netto in Minuten (abzüglich Pause). */
export function netMinutes(w) {
  return Math.max(0, grossMinutes(w) - (Number(w?.breakMin) || 0));
}

/** Gesetzliche Mindestpause (§ 4 ArbZG) für eine Arbeitszeit in Minuten. */
export function minBreak(workMinutes) {
  if (workMinutes > 540) return 45;
  if (workMinutes > 360) return 30;
  return 0;
}

/**
 * Prüfungen eines Arbeitstags.
 * @param {{start?:string,end?:string,breakMin?:number,date:string}} w
 * @param {{end?:string,date:string}|null} prev  Vortag (für die Ruhezeit)
 * @param {{holiday?:string|null}} [ctx]
 * @returns {{level:'bad'|'warn'|'info', text:string}[]}
 */
export function checkDay(w, prev, ctx = {}) {
  const out = [];
  if (!w || !w.start) return out;
  if (!w.end) return [{ level: 'info', text: 'Arbeitszeit läuft (noch kein Ende erfasst)' }];
  const net = netMinutes(w);
  const brk = Number(w.breakMin) || 0;
  if (net > 600) out.push({ level: 'bad', text: 'Mehr als 10 Stunden Arbeitszeit (§ 3 ArbZG)' });
  else if (net > 480) out.push({ level: 'info', text: 'Über 8 Stunden – Ausgleich im 6-Monats-Schnitt (§ 3 ArbZG)' });
  const need = minBreak(net); // Pausenpflicht richtet sich nach der Arbeitszeit ohne Pausen
  if (brk < need) out.push({ level: 'bad', text: `Pause ${brk} min – mindestens ${need} min vorgeschrieben (§ 4 ArbZG)` });
  if (prev && prev.end && prev.date) {
    const dayDiff = Math.round((Date.parse(w.date + 'T00:00:00Z') - Date.parse(prev.date + 'T00:00:00Z')) / 86400000);
    if (dayDiff === 1) {
      const pe = toMin(prev.end);
      const ps = toMin(prev.start);
      const prevEndAbs = pe !== null && ps !== null && pe < ps ? pe + 1440 : pe; // Vortag über Mitternacht
      const rest = 1440 + toMin(w.start) - prevEndAbs;
      if (rest < 660) out.push({ level: 'bad', text: `Ruhezeit nur ${Math.floor(rest / 60)} h ${rest % 60} min – mindestens 11 Stunden (§ 5 ArbZG)` });
    }
  }
  const dow = new Date(w.date + 'T00:00:00Z').getUTCDay();
  if (dow === 0) out.push({ level: 'warn', text: 'Sonntagsarbeit (§ 9 ArbZG) – Ersatzruhetag erforderlich' });
  else if (ctx.holiday) out.push({ level: 'warn', text: `Arbeit am Feiertag (${ctx.holiday}, § 9 ArbZG)` });
  return out;
}
