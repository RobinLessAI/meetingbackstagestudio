// Hauptseite meetingbackstage.de – Vorschau des Startinhalts als statische Dateien (npm run website).
//
// Im Betrieb wird die Seite nicht mehr hiermit gebaut: Inhalte bearbeitest du in der Verwaltung des Studios
// (Seite „Website“), der Server liefert sie aus. website/inhalt-start.json ist nur der Inhalt beim allerersten Start.
// Dieses Skript schreibt website/dist/, damit man den Startinhalt ohne Server ansehen kann
// (z. B. python3 -m http.server -d website/dist).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_BASE, renderSite } from '../server/website/render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'dist');

const content = JSON.parse(fs.readFileSync(path.join(HERE, 'inhalt-start.json'), 'utf8'));
const site = await renderSite(content, { siteUrl: 'https://meetingbackstage.de', studioUrl: 'https://studio.meetingbackstage.de' });
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(HERE, 'assets'), path.join(OUT, ASSET_BASE.slice(1)), { recursive: true });
for (const [pfad, html] of site.pages) {
  fs.mkdirSync(path.join(OUT, pfad), { recursive: true });
  fs.writeFileSync(path.join(OUT, pfad, 'index.html'), html);
}
fs.writeFileSync(path.join(OUT, '404.html'), site.notFound);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), site.sitemap);
fs.writeFileSync(path.join(OUT, 'robots.txt'), site.robots);
console.log(`Vorschau gebaut: ${[...site.pages.keys()].join(', ')} → website/dist`);
