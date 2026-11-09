// Anmeldung und Sitzungen.
//
// AUTH_MODE=none    Keine Anmeldung (Demo / Einzelplatz). Benutzerwahl im Browser.
// AUTH_MODE=ldap    Anmeldung mit Windows-Benutzername und Kennwort gegen Active Directory (LDAP/LDAPS).
// AUTH_MODE=header  Windows-Single-Sign-on über einen vorgeschalteten Webserver (IIS, Apache, nginx mit
//                   Kerberos/NTLM), der den angemeldeten Benutzer im Header (Standard: X-Remote-User) übergibt.
//
// Unabhängig vom Modus kann mit ADMIN_PASSWORD ein Notfall-Administrator „admin“ aktiviert werden.
import crypto from 'node:crypto';
import fs from 'node:fs';

export const config = () => ({
  mode: (process.env.AUTH_MODE || 'none').toLowerCase(),
  ldapUrl: process.env.LDAP_URL || '',
  ldapDomain: process.env.LDAP_DOMAIN || '', // z. B. firma.local → Anmeldung als benutzer@firma.local
  ldapBaseDn: process.env.LDAP_BASE_DN || '',
  ldapBindDn: process.env.LDAP_BIND_DN || '', // optionales Dienstkonto für die Benutzersuche
  ldapBindPassword: process.env.LDAP_BIND_PASSWORD || '',
  ldapGroupAdmin: process.env.LDAP_GROUP_ADMIN || '',
  ldapGroupLeitung: process.env.LDAP_GROUP_LEITUNG || '',
  // beliebige Rollen: "controlling=PM-Controlling;extern=PM-Extern" (Rollenschlüssel=AD-Gruppe)
  ldapRoleGroups: process.env.LDAP_ROLE_GROUPS || '',
  ldapCaFile: process.env.LDAP_CA_FILE || '',
  ldapInsecure: process.env.LDAP_TLS_INSECURE === '1',
  header: (process.env.AUTH_HEADER || 'x-remote-user').toLowerCase(),
  trustedProxies: (process.env.TRUSTED_PROXIES || '127.0.0.1,::1,::ffff:127.0.0.1').split(',').map((s) => s.trim()),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionHours: Number(process.env.SESSION_HOURS) || 12,
  cookieSecure: process.env.COOKIE_SECURE === '1',
});

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ROLES = ['admin', 'leitung', 'mitarbeiter'];
export { ANONYMOUS_ADMIN } from './errors.js';

// ------------------------------------------------------------------ Sitzungen
const COOKIE = 'pm_session';
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function createSession(db, user, hours = config().sessionHours) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  db.raw.prepare('INSERT INTO sessions (tokenHash, employeeId, role, username, name, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(hash(token), user.employeeId ?? null, user.role, user.username, user.name, now.toISOString(), new Date(now.getTime() + hours * 3600e3).toISOString());
  db.raw.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(now.toISOString());
  return token;
}

export function getSession(db, token) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = db.raw.prepare('SELECT * FROM sessions WHERE tokenHash = ?').get(hash(token));
  if (!row || row.expiresAt < new Date().toISOString()) return null;
  return { employeeId: row.employeeId, role: row.role, username: row.username, name: row.name };
}

export function deleteSession(db, token) {
  if (token) db.raw.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(hash(token));
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const sessionToken = (req) => parseCookies(req.headers.cookie)[COOKIE];

export function sessionCookie(token, secure, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

// ------------------------------------------------------------------ Schutz gegen Passwort-Raten
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function checkRateLimit(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, list);
  if (list.length >= MAX_ATTEMPTS) throw new AuthError(429, 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');
}
export const recordFailure = (key) => attempts.set(key, [...(attempts.get(key) || []), Date.now()]);
export const clearFailures = (key) => attempts.delete(key);

// ------------------------------------------------------------------ Benutzerzuordnung
/** „FIRMA\\s.hartmann“ oder „s.hartmann@firma.local“ → „s.hartmann“ */
export function normalizeUsername(u) {
  let s = String(u || '').trim();
  if (s.includes('\\')) s = s.split('\\').pop();
  if (s.includes('@')) s = s.split('@')[0];
  return s.toLowerCase();
}

const groupMatches = (groups, wanted) => {
  if (!wanted) return false;
  const w = wanted.toLowerCase();
  return groups.some((g) => {
    const gl = g.toLowerCase();
    return gl === w || gl.startsWith(`cn=${w},`);
  });
};

/**
 * Ordnet einen Verzeichnisbenutzer einem Mitarbeiterprofil zu (über Anmeldename oder E-Mail).
 * Die Rolle kommt aus AD-Gruppen, sofern konfiguriert, sonst aus dem Mitarbeiterprofil.
 */
export function mapUser(db, { username, email, name, groups = [] }, cfg = config()) {
  const login = normalizeUsername(username);
  const mail = (email || '').toLowerCase();
  const all = db.list('employees');
  const emp = all.find((e) => (e.login || '').toLowerCase() === login) || (mail ? all.find((e) => (e.email || '').toLowerCase() === mail) : undefined);
  if (!emp) throw new AuthError(403, `Für „${login}“ ist kein Mitarbeiterprofil hinterlegt. Bitte wenden Sie sich an die Administration.`);
  if (!emp.active) throw new AuthError(403, 'Dieses Mitarbeiterprofil ist deaktiviert.');
  const known = new Set(db.list('roles').map((r) => r.key).concat(ROLES));
  let role = known.has(emp.appRole) ? emp.appRole : 'mitarbeiter';
  // Rollen aus AD-Gruppen (spezifische Zuordnungen zuerst, dann Administration/Projektleitung)
  const mapping = String(cfg.ldapRoleGroups || '').split(';').map((x) => x.split('=').map((y) => y.trim())).filter((x) => x[0] && x[1]);
  if (cfg.ldapGroupLeitung) mapping.unshift(['leitung', cfg.ldapGroupLeitung]);
  if (cfg.ldapGroupAdmin) mapping.unshift(['admin', cfg.ldapGroupAdmin]);
  if (mapping.length) {
    const hit = mapping.find(([, g]) => groupMatches(groups, g));
    role = hit ? hit[0] : role === 'admin' ? 'mitarbeiter' : role;
  }
  return { employeeId: emp.id, role, username: login, name: emp.name || name || login };
}

// ------------------------------------------------------------------ Active Directory (LDAP)
/**
 * Prüft Benutzername/Kennwort am Active Directory.
 * Variante A (ohne Dienstkonto): Bind direkt als benutzer@domain, danach eigenes Konto lesen.
 * Variante B (mit Dienstkonto): Benutzer suchen, dann mit dessen DN und Kennwort binden.
 * @param {{ ClientClass?: any }} [deps] – für Tests austauschbar
 */
export async function ldapAuthenticate(username, password, cfg = config(), deps = {}) {
  if (!password) throw new AuthError(401, 'Benutzername oder Kennwort ist falsch.');
  const ldap = deps.ClientClass ? { Client: deps.ClientClass, EqualityFilter: deps.EqualityFilter } : await import('ldapts');
  const { Client, EqualityFilter } = ldap;
  const login = normalizeUsername(username);
  if (!/^[a-z0-9._-]{1,64}$/i.test(login)) throw new AuthError(401, 'Benutzername oder Kennwort ist falsch.');
  const tlsOptions = cfg.ldapUrl.startsWith('ldaps://')
    ? { rejectUnauthorized: !cfg.ldapInsecure, ...(cfg.ldapCaFile ? { ca: [fs.readFileSync(cfg.ldapCaFile)] } : {}) }
    : undefined;
  const client = new Client({ url: cfg.ldapUrl, timeout: 8000, connectTimeout: 5000, tlsOptions });
  const filter = new EqualityFilter({ attribute: 'sAMAccountName', value: login }).toString();
  const attributes = ['sAMAccountName', 'displayName', 'mail', 'memberOf', 'userPrincipalName'];
  try {
    let entry;
    if (cfg.ldapBindDn) {
      await client.bind(cfg.ldapBindDn, cfg.ldapBindPassword);
      const { searchEntries } = await client.search(cfg.ldapBaseDn, { scope: 'sub', filter, attributes, sizeLimit: 2 });
      if (searchEntries.length !== 1) throw new AuthError(401, 'Benutzername oder Kennwort ist falsch.');
      entry = searchEntries[0];
      await client.unbind();
      await client.bind(entry.dn, password);
    } else {
      const upn = cfg.ldapDomain ? `${login}@${cfg.ldapDomain}` : login;
      await client.bind(upn, password);
      const { searchEntries } = await client.search(cfg.ldapBaseDn, { scope: 'sub', filter, attributes, sizeLimit: 2 });
      entry = searchEntries[0] || { sAMAccountName: login };
    }
    const groups = [].concat(entry.memberOf || []).map(String);
    return { username: String(entry.sAMAccountName || login), email: entry.mail ? String(entry.mail) : '', name: entry.displayName ? String(entry.displayName) : login, groups };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    const msg = String(err?.message || err);
    if (err?.code === 49 || err?.name === 'InvalidCredentialsError' || /invalid ?credentials|data 52e|data 532|data 533|data 701|data 775/i.test(msg)) {
      throw new AuthError(401, 'Benutzername oder Kennwort ist falsch.');
    }
    console.error('LDAP-Fehler:', msg);
    throw new AuthError(503, 'Der Anmeldeserver (Active Directory) ist nicht erreichbar.');
  } finally {
    try { await client.unbind(); } catch { /* bereits getrennt */ }
  }
}

/** Notfall-Administrator (zeitkonstanter Vergleich). */
export function checkAdminPassword(username, password, cfg = config()) {
  if (!cfg.adminPassword || normalizeUsername(username) !== 'admin') return false;
  const a = Buffer.from(hash(password || ''));
  const b = Buffer.from(hash(cfg.adminPassword));
  return crypto.timingSafeEqual(a, b);
}

export const ADMIN_USER = { employeeId: null, role: 'admin', username: 'admin', name: 'Administrator' };
