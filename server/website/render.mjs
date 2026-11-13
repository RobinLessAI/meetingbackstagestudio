// Hauptseite (meetingbackstage.de): Inhalt (JSON aus der Verwaltung) → fertige HTML-Seiten.
//
// Aufbau des Inhalts:
//   { site: { …Einstellungen, Navigation, Fuß… }, seiten: [ { pfad, name, titel, beschreibung, bloecke: [ { typ, … } ] } ] }
// Design und Aufbau der Blöcke liegen hier im Code, die Texte und Bilder im Inhalt. Alle Texte werden beim Ausgeben
// maskiert; formatierte Texte (Feld „html“) laufen durch einen strengen Filter (nur Absätze, Überschriften, Listen,
// fett/kursiv, Links …), damit über die Verwaltung kein Skript auf die Seite gelangt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sanitizeHtml from 'sanitize-html';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ASSET_BASE = '/_web';

/** Symbole, die in der Verwaltung zur Auswahl stehen (lucide, wie im Studio). */
export const ICONS = [
  'message-square-quote', 'chart-column', 'map-pin', 'cloud', 'ferris-wheel', 'star', 'hand', 'list-checks',
  'sparkles', 'shield-check', 'circle-check', 'video', 'users', 'presentation', 'monitor-play', 'keyboard',
  'mic', 'heart', 'lightbulb', 'rocket', 'clock', 'calendar', 'globe', 'lock', 'server', 'mail', 'phone',
  'life-buoy', 'book-open', 'graduation-cap', 'briefcase', 'building-2', 'handshake', 'trophy', 'zap',
  'palette', 'settings', 'thumbs-up', 'message-circle', 'smile', 'target', 'layers', 'arrow-right',
  'mouse-pointer-click', 'camera', 'scan-search', 'telescope', 'package', 'focus',
];

export const BLOCK_TYPES = ['buehne', 'seitenkopf', 'karten', 'schritte', 'liste', 'fragen', 'aufruf', 'text', 'bild', 'bildtext'];

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ----------------------------------------------------------------- Filter für Texte und Links
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/|#|\{\{(studio|mail)\}\})/i;

/** Link-Ziel prüfen: nur http(s), mailto, tel, eigene Pfade und Anker. Sonst „#“. */
export function safeLink(href) {
  const v = String(href ?? '').trim();
  return SAFE_LINK.test(v) && !/^\/\//.test(v) ? v : '#';
}

/** Formatierten Text filtern (für Felder aus dem Texteditor). */
export function cleanHtml(html) {
  return sanitizeHtml(String(html ?? ''), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      b: 'strong',
      i: 'em',
      a: (tag, attribs) => {
        const href = safeLink(attribs.href);
        const external = /^https?:\/\//i.test(href);
        return { tagName: 'a', attribs: external ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href } };
      },
    },
  }).trim();
}

/** Text mit *Hervorhebung* (z. B. im Bühnentitel) – alles maskiert, nur *…* wird zu <em>. */
const withEmphasis = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

/** Anker-Namen (für Links wie /#funktionen) säubern. */
export const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// ----------------------------------------------------------------- Symbole
const iconCache = new Map();
export async function loadIcons(names) {
  for (const name of names) {
    if (iconCache.has(name) || !ICONS.includes(name)) continue;
    const file = path.join(ROOT, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons', `${name}.mjs`);
    try {
      const { __iconData } = await import(pathToFileURL(file).href);
      iconCache.set(name, __iconData.node);
    } catch {
      iconCache.set(name, null);
    }
  }
}
function icon(name) {
  const nodes = iconCache.get(name);
  if (!nodes) return '';
  const inner = nodes
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`)
    .join('');
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
/** Alle im Inhalt verwendeten Symbole. */
export function usedIcons(content) {
  const out = new Set(['arrow-right', 'sparkles', 'shield-check', 'circle-check']);
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (typeof v.icon === 'string') out.add(v.icon);
      Object.values(v).forEach(walk);
    }
  };
  walk(content);
  return [...out];
}

// ----------------------------------------------------------------- Blöcke
const sectionClass = (b, fallback = 'hell') => {
  const bg = b.hintergrund || fallback;
  return `abschnitt${bg === 'weiss' ? ' abschnitt--weiss' : bg === 'navy' ? ' abschnitt--navy' : ''}`;
};
const anchor = (b) => (b.anker ? ` id="${esc(slug(b.anker))}"` : '');
const button = (k, cls) => (k?.label ? `<a class="btn ${cls}" href="${esc(safeLink(k.link))}">${esc(k.label)}</a>` : '');
const kopfzeile = (b, mitte = false) =>
  b.augenbraue || b.titel || b.text
    ? `<div class="kopfzeile${mitte ? ' kopfzeile--mitte' : ''}">${b.augenbraue ? `<span class="augenbraue">${esc(b.augenbraue)}</span>` : ''}${
        b.titel ? `<h2>${esc(b.titel)}</h2>` : ''
      }${b.text ? `<p>${esc(b.text)}</p>` : ''}</div>`
    : '';
const img = (src, alt, cls = '') => (src ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(safeLink(src))}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '');

/** Schematische Darstellung im Bühnenbereich (wenn kein eigenes Bild gewählt ist). */
const SZENE = `<div class="szene" role="img" aria-label="Schematische Darstellung: Zoom-Meeting mit eingeblendetem Chat-Beitrag und laufender Umfrage">
  <div class="szene__kacheln" aria-hidden="true">
    <div class="szene__kachel szene__kachel--spricht"><span class="szene__name">Moderation</span></div>
    <div class="szene__kachel"><span class="szene__name">Teilnehmer 1</span></div>
    <div class="szene__kachel"><span class="szene__name">Teilnehmerin 2</span></div>
    <div class="szene__kachel"><span class="szene__name">Teilnehmer 3</span></div>
    <div class="szene__kachel"><span class="szene__name">Teilnehmerin 4</span></div>
    <div class="szene__kachel"><span class="szene__name">Teilnehmer 5</span></div>
  </div>
  <div class="szene__highlight" aria-hidden="true"><small>Aus dem Chat</small>Die Breakout-Räume waren für mich der beste Teil – endlich Zeit zum Ausprobieren!<b>Teilnehmerin 2</b></div>
  <div class="szene__umfrage" aria-hidden="true">
    <p>Welches Format hilft euch am meisten?</p>
    <div class="balken"><span>A · Kurze Impulse</span><span>48 %</span><i style="--w: 48%"></i></div>
    <div class="balken"><span>B · Breakouts</span><span>31 %</span><i style="--w: 31%"></i></div>
    <div class="balken"><span>C · Live-Demos</span><span>21 %</span><i style="--w: 21%"></i></div>
  </div>
</div>`;

/** Überschriften im Text mit Ankern versehen und daraus ein Inhaltsverzeichnis bauen. */
function withHeadingAnchors(html) {
  const toc = [];
  const used = new Set();
  const out = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, inner) => {
    const text = inner.replace(/<[^>]+>/g, '');
    let id = slug(text) || 'abschnitt';
    while (used.has(id)) id += '-2';
    used.add(id);
    toc.push({ id, text });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { html: out, toc };
}

const RENDER = {
  buehne: (b) => `<section class="buehne"${anchor(b)}>
  <div class="wrap buehne__innen">
    <div>
      ${b.kicker ? `<span class="buehne__kicker">${icon('sparkles')} ${esc(b.kicker)}</span>` : ''}
      <h1>${withEmphasis(b.titel)}</h1>
      ${b.text ? `<p class="buehne__text">${esc(b.text)}</p>` : ''}
      <div class="buehne__aktion">${b.knopf1?.label ? `<a class="btn btn--primaer btn--gross" href="${esc(safeLink(b.knopf1.link))}">${esc(b.knopf1.label)} ${icon('arrow-right')}</a>` : ''}${button(b.knopf2, 'btn--leise btn--gross')}</div>
      ${b.hinweis ? `<p class="buehne__hinweis">${esc(b.hinweis)}</p>` : ''}
    </div>
    ${b.bild ? `<div class="buehne__bild">${img(b.bild, b.bildAlt)}</div>` : SZENE}
  </div>
</section>`,

  seitenkopf: (b) => `<section class="seitenkopf"${anchor(b)}>
  <div class="wrap">
    ${b.augenbraue ? `<span class="augenbraue augenbraue--hell">${esc(b.augenbraue)}</span>` : ''}
    <h1>${withEmphasis(b.titel)}</h1>
    ${b.text ? `<p>${esc(b.text)}</p>` : ''}
    ${b.knopf1?.label || b.knopf2?.label ? `<div class="buehne__aktion">${button(b.knopf1, 'btn--hell')}${button(b.knopf2, 'btn--leise')}</div>` : ''}
  </div>
</section>`,

  karten: (b) => `<section class="${sectionClass(b)}"${anchor(b)}>
  <div class="wrap">
    ${kopfzeile(b)}
    <div class="karten">${(b.karten ?? [])
      .map((k) => {
        const inner = `${k.icon ? `<div class="karte__icon">${icon(k.icon)}</div>` : ''}${k.hinweis ? `<span class="karte__hinweis">${esc(k.hinweis)}</span>` : ''}<h3>${esc(k.titel)}</h3>${
          k.text ? `<p>${esc(k.text)}</p>` : ''
        }`;
        return k.link
          ? `<a class="karte karte--link" href="${esc(safeLink(k.link))}">${inner}<span class="karte__mehr">Mehr erfahren ${icon('arrow-right')}</span></a>`
          : `<article class="karte">${inner}</article>`;
      })
      .join('')}</div>
  </div>
</section>`,

  schritte: (b) => `<section class="${sectionClass(b, 'navy')}"${anchor(b)}>
  <div class="wrap">
    ${kopfzeile(b)}
    <ol class="schritte">${(b.schritte ?? []).map((s) => `<li><h3>${esc(s.titel)}</h3>${s.text ? `<p>${esc(s.text)}</p>` : ''}</li>`).join('')}</ol>
  </div>
</section>`,

  liste: (b) => `<section class="${sectionClass(b, 'weiss')}"${anchor(b)}>
  <div class="wrap zweispaltig">
    <div>
      ${b.augenbraue ? `<span class="augenbraue">${esc(b.augenbraue)}</span>` : ''}
      ${b.titel ? `<h2>${esc(b.titel)}</h2>` : ''}
      ${b.text ? `<p class="liste__einleitung">${esc(b.text)}</p>` : ''}
      <ul class="liste">${(b.punkte ?? [])
        .map((p) => `<li>${icon('circle-check')}<div><strong>${esc(p.titel)}</strong>${p.text ? `<span>${esc(p.text)}</span>` : ''}</div></li>`)
        .join('')}</ul>
    </div>
    ${
      b.kasten?.titel || b.kasten?.punkte?.length
        ? `<div class="vertrauen"><h3>${icon(b.kasten.icon || 'shield-check')} ${esc(b.kasten.titel)}</h3><ul>${(b.kasten.punkte ?? []).filter((p) => p.trim()).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
        : ''
    }
  </div>
</section>`,

  fragen: (b) => `<section class="${sectionClass(b)}"${anchor(b)}>
  <div class="wrap">
    ${kopfzeile(b, true)}
    <div class="fragen">${(b.fragen ?? [])
      .map((f) => `<details><summary>${esc(f.frage)}</summary><div class="fragen__antwort">${cleanHtml(f.antwort)}</div></details>`)
      .join('')}</div>
  </div>
</section>`,

  aufruf: (b) => `<section class="${sectionClass(b, 'weiss')}"${anchor(b)}>
  <div class="wrap">
    <div class="aufruf">
      <div>${b.titel ? `<h2>${esc(b.titel)}</h2>` : ''}${b.text ? `<p>${esc(b.text)}</p>` : ''}</div>
      <div class="buehne__aktion" style="margin-top:0">${button(b.knopf1, 'btn--hell btn--gross')}${button(b.knopf2, 'btn--leise btn--gross')}</div>
    </div>
  </div>
</section>`,

  text: (b) => {
    const { html, toc } = withHeadingAnchors(cleanHtml(b.html));
    const nav =
      b.inhaltsverzeichnis && toc.length > 1
        ? `<nav class="inhalt-nav" aria-label="Inhalt">${toc.map((t) => `<a href="#${t.id}">${esc(t.text)}</a>`).join('')}</nav>`
        : '';
    return `<div${b.hintergrund === 'weiss' ? ' class="abschnitt--weiss"' : ''}${anchor(b)}><div class="wrap"><article class="text">${nav}${html}</article></div></div>`;
  },

  bild: (b) =>
    b.bild
      ? `<div class="${b.hintergrund === 'weiss' ? 'abschnitt--weiss ' : ''}bildblock"${anchor(b)}><div class="wrap"><figure class="bildblock__figur${b.breite === 'text' ? ' bildblock__figur--schmal' : ''}">${img(b.bild, b.alt)}${
          b.unterschrift ? `<figcaption>${esc(b.unterschrift)}</figcaption>` : ''
        }</figure></div></div>`
      : '',

  bildtext: (b) => `<section class="${sectionClass(b, 'weiss')}"${anchor(b)}>
  <div class="wrap zweispaltig${b.bildRechts ? ' zweispaltig--bild-rechts' : ''}">
    <div class="bildtext__bild">${img(b.bild, b.alt)}</div>
    <div class="bildtext__text">
      ${b.augenbraue ? `<span class="augenbraue">${esc(b.augenbraue)}</span>` : ''}
      ${b.titel ? `<h2>${esc(b.titel)}</h2>` : ''}
      <div class="text text--eingebettet">${cleanHtml(b.html)}</div>
      ${b.knopf1?.label ? `<div class="buehne__aktion">${button(b.knopf1, 'btn--primaer')}</div>` : ''}
    </div>
  </div>
</section>`,
};

// ----------------------------------------------------------------- Seite
const fill = (s, ctx) => String(s).replace(/\{\{studio\}\}/g, ctx.studioUrl).replace(/\{\{mail\}\}/g, ctx.mail).replace(/\{jahr\}/g, String(new Date().getFullYear()));

function pageTitle(site, page) {
  if (page.seoTitel) return page.seoTitel;
  const tpl = site.titelVorlage || '%s';
  return page.pfad === '/' && site.startTitel ? site.startTitel : tpl.replace('%s', page.titel || page.name || '');
}

export function renderPage(content, page, ctx) {
  const site = content.site;
  const title = pageTitle(site, page);
  const description = page.beschreibung || site.beschreibung || '';
  const noindex = !site.indexieren || page.indexieren === false || page.pfad === '/404/' || ctx.vorschau;
  const canonical = `${ctx.siteUrl}${page.pfad === '/404/' ? '/' : page.pfad}`;
  const ogImage = page.vorschaubild || site.vorschaubild;
  const fav = site.favicon ?? {};
  const isHome = page.pfad === '/';
  const ld = isHome
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', name: site.name, url: ctx.siteUrl, logo: `${ctx.siteUrl}${ASSET_BASE}/bilder/logo.svg`, ...(site.slogan ? { slogan: site.slogan } : {}) },
          { '@type': 'WebSite', name: site.name, url: ctx.siteUrl, inLanguage: 'de' },
        ],
      }).replace(/</g, '\\u003c')}</script>`
    : '';
  const abs = (u) => (u && u.startsWith('/') ? `${ctx.siteUrl}${u}` : u);
  const nav = (site.navigation ?? []).map((n) => `<a href="${esc(safeLink(n.link))}">${esc(n.label)}</a>`).join('');
  const headButtons = (site.kopfKnoepfe ?? [])
    .map((k) => `<a class="btn ${k.stil === 'leise' ? 'btn--leise' : 'btn--primaer'}" href="${esc(safeLink(k.link))}">${esc(k.label)}</a>`)
    .join('');
  const footLinks = (site.fussLinks ?? []).map((n) => `<a href="${esc(safeLink(n.link))}">${esc(n.label)}</a>`).join('');
  const body = (page.bloecke ?? []).map((b) => (RENDER[b.typ] ? RENDER[b.typ](b) : '')).join('\n');
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta name="theme-color" content="#11243c">
<link rel="icon" href="${esc(fav.svg || fav.png32 || `${ASSET_BASE}/favicon.svg`)}"${fav.svg || !fav.png32 ? ' type="image/svg+xml"' : ' type="image/png"'}>
${fav.svg && fav.png32 ? `<link rel="icon" href="${esc(fav.png32)}" type="image/png" sizes="32x32">` : ''}
<link rel="apple-touch-icon" href="${esc(fav.png180 || `${ASSET_BASE}/bilder/apple-touch-icon.png`)}">
<link rel="preload" href="${ASSET_BASE}/schrift/urbanist-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${ASSET_BASE}/site.css">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ''}
<meta property="og:url" content="${esc(canonical)}">
${ogImage ? `<meta property="og:image" content="${esc(abs(ogImage))}">` : ''}
<meta name="twitter:card" content="summary_large_image">
${ld}
</head>
<body>
${ctx.vorschau ? '<div class="vorschau-hinweis">Vorschau – so sieht die Seite nach dem Veröffentlichen aus. Links führen zur Vorschau der anderen Seiten.</div>' : ''}
<a class="skip" href="#inhalt">Zum Inhalt springen</a>
<header class="kopf${site.kopfStil === 'dunkel' ? '' : ' kopf--hell'}">
  <div class="wrap kopf__innen">
    <a class="kopf__logo" href="/" aria-label="${esc(site.name)} – Startseite">${
      site.logo
        ? `<img src="${esc(site.logo)}" alt="${esc(site.name)}" width="226" height="46">`
        : // Standard: Logo mit Slogan; auf schmalen Handys ohne Slogan (dort wäre er zu klein zum Lesen)
          `<picture><source media="(max-width: 420px)" srcset="${ASSET_BASE}/bilder/${site.kopfStil === 'dunkel' ? 'logo-weiss' : 'logo'}.svg"><img src="${ASSET_BASE}/bilder/${site.kopfStil === 'dunkel' ? 'logo-slogan-weiss' : 'logo-slogan'}.svg" alt="${esc(site.name)} – ${esc(site.slogan || 'Moderieren und inspirieren')}" width="226" height="46"></picture>`
    }</a>
    <nav class="kopf__nav" aria-label="Hauptnavigation">${nav}</nav>
    <div class="kopf__aktion">${headButtons}</div>
  </div>
</header>
<main id="inhalt">
${body}
</main>
<footer class="fuss">
  <div class="wrap fuss__innen">
    <div class="fuss__marke">
      <img src="${esc(site.logoFuss || `${ASSET_BASE}/bilder/logo-slogan-weiss.svg`)}" alt="${esc(site.name)}" width="220" height="45">
      ${site.fussText ? `<p>${esc(site.fussText)}</p>` : ''}
    </div>
    <nav class="fuss__nav" aria-label="Rechtliches und Hilfe">${footLinks}${site.kontaktMail ? `<a href="mailto:${esc(site.kontaktMail)}">${esc(site.kontaktMail)}</a>` : ''}</nav>
  </div>
  ${site.fussKlein ? `<div class="wrap fuss__klein"><p>${esc(site.fussKlein)}</p></div>` : ''}
</footer>
</body>
</html>
`;
  return fill(html, ctx);
}

/** Alle Seiten rendern: Map pfad → HTML, dazu 404, Sitemap und robots.txt. */
export async function renderSite(content, ctx) {
  await loadIcons(usedIcons(content));
  const c = { ...ctx, mail: content.site.kontaktMail || '' };
  const pages = new Map();
  for (const page of content.seiten) pages.set(page.pfad, renderPage(content, page, c));
  const notFoundPage = content.seiten.find((p) => p.pfad === '/404/');
  const notFound = notFoundPage
    ? pages.get('/404/')
    : renderPage(content, { pfad: '/404/', titel: 'Seite nicht gefunden', bloecke: [{ typ: 'seitenkopf', titel: 'Diese Seite gibt es nicht.', knopf1: { label: 'Zur Startseite', link: '/' } }] }, c);
  pages.delete('/404/');
  const listed = content.site.indexieren === false ? [] : content.seiten.filter((p) => p.pfad !== '/404/' && p.indexieren !== false);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed
    .map((p) => `  <url><loc>${esc(ctx.siteUrl + p.pfad)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
  const robots =
    content.site.indexieren === false
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nAllow: /\n\nSitemap: ${ctx.siteUrl}/sitemap.xml\n`;
  return { pages, notFound, sitemap, robots };
}

/** Eine Seite für die Vorschau (Entwurf) rendern; Links auf eigene Seiten führen in die Vorschau. */
export async function renderPreview(content, pfad, ctx) {
  await loadIcons(usedIcons(content));
  const page = content.seiten.find((p) => p.pfad === pfad) ?? content.seiten.find((p) => p.pfad === '/');
  const html = renderPage(content, page, { ...ctx, mail: content.site.kontaktMail || '', vorschau: true });
  // Eigene Seiten-Links auf die Vorschau umbiegen
  return html.replace(/href="(\/[a-z0-9/-]*)(#[^"]*)?"/g, (m, p, hash = '') =>
    content.seiten.some((s) => s.pfad === p) ? `href="${ctx.previewBase}?pfad=${encodeURIComponent(p)}${hash}"` : m,
  );
}

/** Für Hilfsprogramme: Datei lesen, falls vorhanden. */
export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
