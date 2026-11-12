// Hauptseite meetingbackstage.de – baut die statischen Seiten nach website/dist.
//
// Aufruf: npm run website   (mb-aktualisieren kopiert website/dist danach nach /var/www/meetingbackstage)
//
// Jede Datei in website/seiten/ beginnt mit einem Kopf aus „schluessel: wert“-Zeilen und einer Zeile „---“:
//   pfad: /hilfe/              Adresse der Seite
//   titel: Hilfe               Titel im Browser-Tab (ohne „ · MeetingBackstage“)
//   beschreibung: …            Text für Suchmaschinen
//   sitemap: nein              (optional) nicht in die Sitemap
// Im Inhalt ersetzt {{icon:name}} ein Symbol aus lucide (z. B. {{icon:map-pin}}), {{studio}} die Studio-Adresse
// und {{mail}} die Kontaktadresse.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(HERE, 'dist');

export const SITE = {
  url: 'https://meetingbackstage.de',
  studio: 'https://studio.meetingbackstage.de',
  mail: 'info@meetingbackstage.de',
  name: 'MeetingBackstage',
};

const NAV = [
  { href: '/#funktionen', label: 'Funktionen' },
  { href: '/#ablauf', label: 'So funktioniert’s' },
  { href: '/#fragen', label: 'Fragen' },
  { href: '/hilfe/', label: 'Hilfe' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lucide-Symbole (dieselbe Symbolsammlung wie im Studio), vorab geladen. */
const ICONS = new Map();
async function loadIcons(names) {
  for (const name of names) {
    if (ICONS.has(name)) continue;
    const file = path.join(ROOT, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons', `${name}.mjs`);
    if (!fs.existsSync(file)) throw new Error(`Symbol „${name}“ gibt es nicht.`);
    const { __iconData } = await import(pathToFileURL(file).href);
    ICONS.set(name, __iconData.node);
  }
}
function icon(name) {
  const inner = ICONS.get(name)
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`)
    .join('');
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const [head, ...rest] = raw.split(/^---\s*$/m);
  const meta = Object.fromEntries(
    head
      .trim()
      .split('\n')
      .map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]),
  );
  const body = rest
    .join('---')
    .replace(/\{\{icon:([a-z0-9-]+)\}\}/g, (_, n) => icon(n))
    .replace(/\{\{studio\}\}/g, SITE.studio)
    .replace(/\{\{mail\}\}/g, SITE.mail);
  return { meta, body };
}

function layout({ meta, body }) {
  const isHome = meta.pfad === '/';
  const title = isHome ? `${SITE.name} – Live-Grafiken und Regie für Zoom-Workshops` : `${meta.titel} · ${SITE.name}`;
  const canonical = `${SITE.url}${meta.pfad === '/404/' ? '/' : meta.pfad}`;
  const ld = isHome
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', name: SITE.name, url: SITE.url, logo: `${SITE.url}/assets/bilder/logo.svg`, slogan: 'Moderieren und inspirieren' },
          {
            '@type': 'SoftwareApplication',
            name: 'MeetingBackstage Studio',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Webbrowser',
            url: SITE.studio,
            description: meta.beschreibung,
            inLanguage: 'de',
          },
        ],
      })}</script>`
    : '';
  const nav = NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join('');
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta.beschreibung)}">
${meta.pfad === '/404/' ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
<meta name="theme-color" content="#11243c">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/bilder/apple-touch-icon.png">
<link rel="preload" href="/assets/schrift/urbanist-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(meta.beschreibung)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE.url}/assets/bilder/vorschau.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${ld}
</head>
<body class="${isHome ? 'is-home' : 'is-page'}">
<a class="skip" href="#inhalt">Zum Inhalt springen</a>
<header class="kopf">
  <div class="wrap kopf__innen">
    <a class="kopf__logo" href="/" aria-label="${SITE.name} – Startseite"><img src="/assets/bilder/logo-weiss.svg" alt="${SITE.name}" width="196" height="40"></a>
    <nav class="kopf__nav" aria-label="Hauptnavigation">${nav}</nav>
    <div class="kopf__aktion">
      <a class="btn btn--leise" href="${SITE.studio}">Anmelden</a>
      <a class="btn btn--primaer" href="${SITE.studio}/?konto=neu">Konto anlegen</a>
    </div>
  </div>
</header>
<main id="inhalt">
${body.trim()}
</main>
<footer class="fuss">
  <div class="wrap fuss__innen">
    <div class="fuss__marke">
      <img src="/assets/bilder/logo-slogan-weiss.svg" alt="${SITE.name} – Moderieren und inspirieren" width="220" height="45">
      <p>Live-Grafiken und Regie für Online-Workshops. Gehostet in Deutschland.</p>
    </div>
    <nav class="fuss__nav" aria-label="Rechtliches und Hilfe">
      <a href="/hilfe/">Hilfe &amp; Support</a>
      <a href="/impressum/">Impressum</a>
      <a href="/datenschutz/">Datenschutz</a>
      <a href="/nutzungsbedingungen/">Nutzungsbedingungen</a>
      <a href="mailto:${SITE.mail}">${SITE.mail}</a>
    </nav>
  </div>
  <div class="wrap fuss__klein">
    <p>© ${new Date().getFullYear()} ${SITE.name}. Zoom ist eine Marke der Zoom Communications, Inc. MeetingBackstage ist ein unabhängiges Angebot und nicht mit Zoom verbunden.</p>
  </div>
</footer>
</body>
</html>
`;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

export async function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(path.join(HERE, 'assets'), path.join(OUT, 'assets'));
  const files = fs.readdirSync(path.join(HERE, 'seiten')).filter((f) => f.endsWith('.html'));
  const names = new Set(files.flatMap((f) => [...fs.readFileSync(path.join(HERE, 'seiten', f), 'utf8').matchAll(/\{\{icon:([a-z0-9-]+)\}\}/g)].map((m) => m[1])));
  await loadIcons(names);
  const pages = files.map((f) => parse(path.join(HERE, 'seiten', f)));
  for (const page of pages) {
    const html = layout(page);
    const target = page.meta.pfad === '/404/' ? path.join(OUT, '404.html') : path.join(OUT, page.meta.pfad, 'index.html');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, html);
  }
  const listed = pages.filter((p) => p.meta.sitemap !== 'nein' && p.meta.pfad !== '/404/');
  fs.writeFileSync(
    path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed
      .map((p) => `  <url><loc>${SITE.url}${p.meta.pfad}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
  );
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
  return pages.map((p) => p.meta.pfad);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = await build();
  console.log(`Hauptseite gebaut: ${built.join(', ')} → website/dist`);
  // Gelb markierte Lücken (Impressum usw.) melden, damit nichts Unfertiges online bleibt
  for (const f of fs.readdirSync(path.join(HERE, 'seiten'))) {
    const n = (fs.readFileSync(path.join(HERE, 'seiten', f), 'utf8').match(/class="luecke"/g) ?? []).length;
    if (n) console.log(`  Hinweis: ${f} hat noch ${n} offene Angabe(n) (gelb markiert).`);
  }
}
