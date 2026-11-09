// Fügt Skript und Stylesheet des Artifact-Builds in eine einzige Seite ein (artifact/projektsteuerung.html).
import fs from 'node:fs';
import path from 'node:path';

const dir = 'dist-artifact';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => fs.readFileSync(path.join(dir, m[1]), 'utf8'));
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => fs.readFileSync(path.join(dir, m[1]), 'utf8'));
if (!js.length) throw new Error('Kein Skript im Build gefunden');
const safeJs = js.join('\n').replace(/<\/script/gi, '<\\/script');
const page = `<title>Projektsteuerung Stahlwasserbau</title>
<meta name="description" content="Projektsteuerung für Stahlwasserbau und bewegliche Brücken">
<style>${css.join('\n')}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`;
fs.mkdirSync('artifact', { recursive: true });
fs.writeFileSync('artifact/projektsteuerung.html', page);
console.log(`artifact/projektsteuerung.html: ${(page.length / 1024 / 1024).toFixed(2)} MB`);
