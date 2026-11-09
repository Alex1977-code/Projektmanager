// HTTP-Server: stellt die REST-API unter /api bereit und liefert im Produktivbetrieb
// das gebaute Frontend (dist/) aus.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, DB_FILE } from './db.js';
import { handle, ApiError } from './api.js';
import { seedIfEmpty } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const db = openDb();
if (process.env.NO_SEED !== '1') seedIfEmpty(db);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api')) return serveStatic(req, res, url.pathname);
  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : undefined;
    const query = Object.fromEntries(url.searchParams);
    const result = await handle(db, req.method, url.pathname, query, body);
    if (url.pathname === '/api/export') {
      res.setHeader('Content-Disposition', `attachment; filename="projektmanager-export-${new Date().toISOString().slice(0, 10)}.json"`);
    }
    sendJson(res, req.method === 'POST' ? 201 : 200, result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    if (status === 500) console.error(err);
    sendJson(res, status, { error: status === 500 ? 'Interner Serverfehler' : err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Projektmanager-API läuft auf http://localhost:${PORT}  (Datenbank: ${DB_FILE})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(); db.close(); process.exit(0); });
}
