// Gesetzliche Feiertage in Deutschland je Bundesland (gemeinsam für Server und Oberfläche).
// Regionale Feiertage, die nur in Teilen eines Landes gelten (z. B. Mariä Himmelfahrt in Teilen Bayerns,
// Fronleichnam in Teilen Sachsens/Thüringens, Augsburger Friedensfest), sind nicht enthalten.

export const STATES = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg',
  HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const utc = (y, m, d) => Date.UTC(y, m - 1, d);

/** Ostersonntag nach der Gaußschen Osterformel (gregorianisch, anonymer Algorithmus). */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(utc(year, month, day));
}

const cache = new Map();

/** @returns {Map<string, string>} Datum (YYYY-MM-DD) → Bezeichnung */
export function holidays(year, state = 'HB') {
  const key = `${year}-${state}`;
  if (cache.has(key)) return cache.get(key);
  const m = new Map();
  const add = (ms, name, states) => { if (!states || states.includes(state)) m.set(iso(ms), name); };
  const easter = Date.parse(easterSunday(year) + 'T00:00:00Z');
  add(utc(year, 1, 1), 'Neujahr');
  add(utc(year, 1, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
  if (year >= 2019) add(utc(year, 3, 8), 'Internationaler Frauentag', year >= 2023 ? ['BE', 'MV'] : ['BE']);
  add(easter - 2 * DAY, 'Karfreitag');
  add(easter + 1 * DAY, 'Ostermontag');
  add(utc(year, 5, 1), 'Tag der Arbeit');
  add(easter + 39 * DAY, 'Christi Himmelfahrt');
  add(easter + 50 * DAY, 'Pfingstmontag');
  add(easter + 60 * DAY, 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
  add(utc(year, 8, 15), 'Mariä Himmelfahrt', ['SL']);
  if (year >= 2019) add(utc(year, 9, 20), 'Weltkindertag', ['TH']);
  add(utc(year, 10, 3), 'Tag der Deutschen Einheit');
  add(utc(year, 10, 31), 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']);
  add(utc(year, 11, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']);
  // Buß- und Bettag: Mittwoch vor dem 23. November
  const nov23 = utc(year, 11, 23);
  const dow = new Date(nov23).getUTCDay(); // 0 = So
  add(nov23 - (((dow + 7 - 3) % 7) || 7) * DAY, 'Buß- und Bettag', ['SN']);
  add(utc(year, 12, 25), '1. Weihnachtstag');
  add(utc(year, 12, 26), '2. Weihnachtstag');
  cache.set(key, m);
  return m;
}

/** Feiertagsbezeichnung oder null */
export function holidayName(date, state = 'HB') {
  return holidays(Number(date.slice(0, 4)), state).get(date) || null;
}
