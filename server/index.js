// HTTP-Server: stellt die REST-API unter /api bereit und liefert im Produktivbetrieb
// das gebaute Frontend (dist/) aus.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, DB_FILE } from './db.js';
import { handle, ApiError } from './api.js';
import { seedIfEmpty, ensureDefaults } from './seed.js';
import * as auth from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const db = openDb();
if (process.env.NO_SEED !== '1') seedIfEmpty(db);
ensureDefaults(db);
const authCfg = auth.config();
if (!['none', 'ldap', 'header'].includes(authCfg.mode)) throw new Error(`Unbekannter AUTH_MODE: ${authCfg.mode}`);
if (authCfg.mode === 'ldap' && (!authCfg.ldapUrl || !authCfg.ldapBaseDn)) throw new Error('AUTH_MODE=ldap erfordert LDAP_URL und LDAP_BASE_DN');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 5 * 1024 * 1024) { reject(new ApiError(413, 'Anfrage zu groß')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new ApiError(400, 'Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('API läuft. Frontend im Entwicklungsmodus über "npm run dev" (Port 5173) oder vorher "npm run build" ausführen.');
    return;
  }
  let file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html'); // SPA-Fallback
  const ext = path.extname(file);
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const clientIp = (req) => req.socket.remoteAddress || '';

// ------------------------------------------------------------------ Live-Aktualisierung (Server-Sent Events)
// Nach jeder Änderung erhalten alle offenen Fenster (PC, Handy, Tablet) ein Signal und laden neu.
const listeners = new Set();
let dataVersion = 0;
function broadcast(by) {
  dataVersion++;
  const msg = `data: ${JSON.stringify({ v: dataVersion, by })}\n\n`;
  for (const res of listeners) res.write(msg);
}
setInterval(() => { for (const res of listeners) res.write(': ping\n\n'); }, 25000).unref();
function openEvents(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 3000\ndata: ${JSON.stringify({ v: dataVersion, by: 'server' })}\n\n`);
  listeners.add(res);
  req.on('close', () => listeners.delete(res));
}

/** Angemeldeten Benutzer ermitteln: Sitzungs-Cookie, sonst (Modus header) Windows-Anmeldung des Proxys. */
function resolveUser(req) {
  if (authCfg.mode === 'none') return auth.ANONYMOUS_ADMIN;
  const s = auth.getSession(db, auth.sessionToken(req));
  if (s) return s;
  if (authCfg.mode === 'header' && authCfg.trustedProxies.includes(clientIp(req))) {
    const remote = req.headers[authCfg.header];
    if (remote) return auth.mapUser(db, { username: String(remote) }, authCfg);
  }
  return null;
}

async function handleAuth(req, res, action) {
  const secure = authCfg.cookieSecure || req.headers['x-forwarded-proto'] === 'https';
  if (action === 'me' && req.method === 'GET') {
    let user = null;
    let error = null;
    try { user = authCfg.mode === 'none' ? null : resolveUser(req); } catch (e) { error = e.message; }
    return sendJson(res, 200, { mode: authCfg.mode, user, error, adminLogin: !!authCfg.adminPassword });
  }
  if (action === 'login' && req.method === 'POST') {
    const body = (await readBody(req)) || {};
    const username = String(body.username || '').slice(0, 128);
    const key = `${clientIp(req)}|${auth.normalizeUsername(username)}`;
    auth.checkRateLimit(key);
    let user;
    try {
      if (auth.checkAdminPassword(username, body.password, authCfg)) user = auth.ADMIN_USER;
      else if (authCfg.adminPassword && auth.normalizeUsername(username) === 'admin') throw new auth.AuthError(401, 'Benutzername oder Kennwort ist falsch.');
      else if (authCfg.mode === 'ldap') user = auth.mapUser(db, await auth.ldapAuthenticate(username, String(body.password || ''), authCfg), authCfg);
      else if (authCfg.mode === 'header') throw new auth.AuthError(400, 'Die Anmeldung erfolgt automatisch über Windows. Bitte die Seite über den Firmen-Webserver aufrufen.');
      else throw new auth.AuthError(400, 'Die Anmeldung ist nicht aktiviert (AUTH_MODE=none).');
    } catch (e) {
      if (e.status === 401) auth.recordFailure(key);
      throw e;
    }
    auth.clearFailures(key);
    const token = auth.createSession(db, user, authCfg.sessionHours);
    res.setHeader('Set-Cookie', auth.sessionCookie(token, secure, authCfg.sessionHours * 3600));
    console.log(`Anmeldung: ${user.username} (${user.role}) von ${clientIp(req)}`);
    return sendJson(res, 200, { user });
  }
  if (action === 'logout' && req.method === 'POST') {
    auth.deleteSession(db, auth.sessionToken(req));
    res.setHeader('Set-Cookie', auth.sessionCookie('', secure, 0));
    return sendJson(res, 200, { ok: true });
  }
  throw new ApiError(404, 'Unbekannte Anmeldefunktion');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api')) return serveStatic(req, res, url.pathname);
  try {
    const write = !['GET', 'HEAD'].includes(req.method);
    // Schutz gegen Cross-Site-Request-Forgery: Schreibzugriffe nur mit eigenem Header (setzt die App)
    if (write && authCfg.mode !== 'none' && req.headers['x-requested-with'] !== 'projektmanager') {
      throw new ApiError(403, 'Anfrage abgelehnt (fehlender Sicherheitsheader).');
    }
    if (url.pathname.startsWith('/api/auth/')) return await handleAuth(req, res, url.pathname.slice('/api/auth/'.length));
    const user = url.pathname === '/api/health' ? auth.ANONYMOUS_ADMIN : resolveUser(req);
    if (!user) return sendJson(res, 401, { error: 'Bitte melden Sie sich an.', login: true });
    if (url.pathname === '/api/events' && req.method === 'GET') return openEvents(req, res);
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : undefined;
    const query = Object.fromEntries(url.searchParams);
    const result = await handle(db, req.method, url.pathname, query, body, user);
    if (url.pathname === '/api/export') {
      res.setHeader('Content-Disposition', `attachment; filename="projektmanager-export-${new Date().toISOString().slice(0, 10)}.json"`);
    }
    sendJson(res, req.method === 'POST' ? 201 : 200, result);
    if (write) broadcast(String(req.headers['x-client-id'] || ''));
  } catch (err) {
    const status = err instanceof ApiError || err instanceof auth.AuthError ? err.status : 500;
    if (status === 500) console.error(err);
    sendJson(res, status, { error: status === 500 ? 'Interner Serverfehler' : err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Projektmanager-API läuft auf http://localhost:${PORT}  (Datenbank: ${DB_FILE}, Anmeldung: ${authCfg.mode})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(); db.close(); process.exit(0); });
}
