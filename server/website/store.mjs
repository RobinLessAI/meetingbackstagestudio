// Hauptseite: Entwurf, veröffentlichter Stand, frühere Fassungen und hochgeladene Bilder.
//
// Ablage (im Datenordner, Web-Modus):
//   website/entwurf.json          was in der Verwaltung gerade bearbeitet wird (wird laufend gespeichert)
//   website/veroeffentlicht.json  was auf meetingbackstage.de zu sehen ist
//   website/versionen/*.json      die letzten veröffentlichten Fassungen (zum Zurückholen)
//   website/medien/*              hochgeladene Bilder (Dateiname zufällig, Endung nach Dateityp)
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { BLOCK_TYPES, ICONS, cleanHtml, renderPreview, renderSite, safeLink } from './render.mjs';

export const MEDIA_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};
export const MEDIA_MAX = 8 * 1024 * 1024;
const MEDIA_URL = '/_web/medien/';
const KEEP_VERSIONS = 40;
const RESERVED = /^\/(_web|api|assets|zoom-sdk|aktion|sync)(\/|$)/;

export class WebsiteError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ----------------------------------------------------------------- Prüfen und Säubern
const str = (v, max = 400) => String(v ?? '').slice(0, max);
const link = (v) => {
  const s = str(v, 500).trim();
  return s ? safeLink(s) : '';
};
const media = (v) => {
  const s = str(v, 300).trim();
  return s.startsWith(MEDIA_URL) || s.startsWith('/_web/') ? s : '';
};
const btn = (k) => ({ label: str(k?.label, 60), link: link(k?.link) });
const list = (v, fn, max = 60) => (Array.isArray(v) ? v.slice(0, max).map(fn) : []);
const bg = (v, fallback) => (['hell', 'weiss', 'navy'].includes(v) ? v : fallback);
const iconName = (v) => (ICONS.includes(v) ? v : '');

/** Adresse einer Seite: „/“ oder „/teil/“, „/teil/unterteil/“ – nur Kleinbuchstaben, Ziffern und Bindestriche. */
export function normalizePath(raw) {
  let p = String(raw ?? '').trim().toLowerCase();
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  p = p.replace(/\/{2,}/g, '/');
  if (p !== '/' && !/^(\/[a-z0-9]+(-[a-z0-9]+)*)+\/$/.test(p)) {
    throw new WebsiteError(`Die Adresse „${raw}“ ist ungültig. Erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche, z. B. /preise/.`);
  }
  if (RESERVED.test(p)) throw new WebsiteError(`Die Adresse „${p}“ ist für das System reserviert.`);
  return p;
}

function normalizeBlock(b) {
  const typ = BLOCK_TYPES.includes(b?.typ) ? b.typ : null;
  if (!typ) return null;
  const base = { id: str(b.id, 40) || crypto.randomBytes(6).toString('hex'), typ, anker: str(b.anker, 60) };
  switch (typ) {
    case 'buehne':
      return { ...base, kicker: str(b.kicker, 80), titel: str(b.titel, 160), text: str(b.text, 600), knopf1: btn(b.knopf1), knopf2: btn(b.knopf2), hinweis: str(b.hinweis, 160), bild: media(b.bild), bildAlt: str(b.bildAlt, 200) };
    case 'seitenkopf':
      return { ...base, augenbraue: str(b.augenbraue, 60), titel: str(b.titel, 160), text: str(b.text, 600), knopf1: btn(b.knopf1), knopf2: btn(b.knopf2) };
    case 'karten':
      return { ...base, augenbraue: str(b.augenbraue, 60), titel: str(b.titel, 160), text: str(b.text, 600), hintergrund: bg(b.hintergrund, 'hell'), karten: list(b.karten, (k) => ({ icon: iconName(k?.icon), titel: str(k?.titel, 100), text: str(k?.text, 400) })) };
    case 'schritte':
      return { ...base, augenbraue: str(b.augenbraue, 60), titel: str(b.titel, 160), text: str(b.text, 600), hintergrund: bg(b.hintergrund, 'navy'), schritte: list(b.schritte, (s) => ({ titel: str(s?.titel, 120), text: str(s?.text, 600) }), 12) };
    case 'liste':
      return {
        ...base,
        augenbraue: str(b.augenbraue, 60),
        titel: str(b.titel, 160),
        text: str(b.text, 600),
        hintergrund: bg(b.hintergrund, 'weiss'),
        punkte: list(b.punkte, (p) => ({ titel: str(p?.titel, 120), text: str(p?.text, 400) }), 20),
        kasten: { icon: iconName(b.kasten?.icon) || 'shield-check', titel: str(b.kasten?.titel, 100), punkte: list(b.kasten?.punkte, (p) => str(p, 300), 20) },
      };
    case 'fragen':
      return { ...base, augenbraue: str(b.augenbraue, 60), titel: str(b.titel, 160), text: str(b.text, 600), hintergrund: bg(b.hintergrund, 'hell'), fragen: list(b.fragen, (f) => ({ frage: str(f?.frage, 200), antwort: cleanHtml(str(f?.antwort, 6000)) })) };
    case 'aufruf':
      return { ...base, titel: str(b.titel, 160), text: str(b.text, 600), hintergrund: bg(b.hintergrund, 'weiss'), knopf1: btn(b.knopf1), knopf2: btn(b.knopf2) };
    case 'text':
      return { ...base, html: cleanHtml(str(b.html, 200_000)), inhaltsverzeichnis: Boolean(b.inhaltsverzeichnis), hintergrund: bg(b.hintergrund, 'hell') };
    case 'bild':
      return { ...base, bild: media(b.bild), alt: str(b.alt, 200), unterschrift: str(b.unterschrift, 300), breite: b.breite === 'text' ? 'text' : 'voll', hintergrund: bg(b.hintergrund, 'hell') };
    case 'bildtext':
      return { ...base, bild: media(b.bild), alt: str(b.alt, 200), augenbraue: str(b.augenbraue, 60), titel: str(b.titel, 160), html: cleanHtml(str(b.html, 20_000)), bildRechts: Boolean(b.bildRechts), hintergrund: bg(b.hintergrund, 'weiss'), knopf1: btn(b.knopf1) };
    default:
      return null;
  }
}

/** Inhalt aus der Verwaltung prüfen und auf erlaubte Felder bringen. */
export function normalizeContent(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.seiten)) throw new WebsiteError('Ungültiger Inhalt.');
  const s = raw.site ?? {};
  const fav = s.favicon && typeof s.favicon === 'object' ? s.favicon : null;
  const site = {
    name: str(s.name, 80) || 'Website',
    slogan: str(s.slogan, 120),
    startTitel: str(s.startTitel, 120),
    titelVorlage: str(s.titelVorlage, 120).includes('%s') ? str(s.titelVorlage, 120) : '%s',
    beschreibung: str(s.beschreibung, 320),
    kontaktMail: /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(str(s.kontaktMail, 120).trim()) ? str(s.kontaktMail, 120).trim() : '',
    indexieren: s.indexieren !== false,
    favicon: fav ? { svg: media(fav.svg), png32: media(fav.png32), png180: media(fav.png180), png512: media(fav.png512) } : null,
    vorschaubild: media(s.vorschaubild),
    kopfStil: s.kopfStil === 'dunkel' ? 'dunkel' : 'hell',
    logo: media(s.logo),
    logoFuss: media(s.logoFuss),
    navigation: list(s.navigation, (n) => ({ label: str(n?.label, 40), link: link(n?.link) }), 12),
    kopfKnoepfe: list(s.kopfKnoepfe, (k) => ({ label: str(k?.label, 40), link: link(k?.link), stil: k?.stil === 'leise' ? 'leise' : 'primaer' }), 3),
    fussText: str(s.fussText, 300),
    fussLinks: list(s.fussLinks, (n) => ({ label: str(n?.label, 60), link: link(n?.link) }), 16),
    fussKlein: str(s.fussKlein, 400),
  };
  const seen = new Set();
  const seiten = raw.seiten.slice(0, 100).map((p) => {
    const pfad = normalizePath(p?.pfad);
    if (seen.has(pfad)) throw new WebsiteError(`Die Adresse ${pfad} ist doppelt vergeben.`);
    seen.add(pfad);
    return {
      id: str(p.id, 40) || crypto.randomBytes(6).toString('hex'),
      pfad,
      name: str(p.name, 80) || pfad,
      titel: str(p.titel, 120),
      seoTitel: str(p.seoTitel, 120),
      beschreibung: str(p.beschreibung, 320),
      vorschaubild: media(p.vorschaubild),
      indexieren: p.indexieren !== false,
      bloecke: (Array.isArray(p.bloecke) ? p.bloecke.slice(0, 80) : []).map(normalizeBlock).filter(Boolean),
    };
  });
  if (!seen.has('/')) throw new WebsiteError('Die Startseite (Adresse /) darf nicht fehlen.');
  return { version: 1, site, seiten };
}

// ----------------------------------------------------------------- Speicher
export function createWebsite({ dir, seedFile, siteUrl, studioUrl, log = () => {} }) {
  const MEDIA_DIR = path.join(dir, 'medien');
  const VERSION_DIR = path.join(dir, 'versionen');
  const DRAFT = path.join(dir, 'entwurf.json');
  const LIVE = path.join(dir, 'veroeffentlicht.json');
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.mkdirSync(VERSION_DIR, { recursive: true });

  const read = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };
  const write = async (file, data) => {
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data));
    await fsp.rename(tmp, file);
  };

  let live = read(LIVE);
  if (!live) {
    // Erster Start: Startinhalt aus dem Repository übernehmen
    live = { content: normalizeContent(read(seedFile)), at: null };
    fs.writeFileSync(LIVE, JSON.stringify(live));
  }
  let draft = read(DRAFT) ?? { content: live.content, at: null };
  let rendered = null;
  const ctx = { siteUrl, studioUrl };

  async function rerender() {
    rendered = await renderSite(live.content, ctx);
  }

  const versions = () =>
    fs
      .readdirSync(VERSION_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .map((f) => ({ id: f.replace(/\.json$/, ''), at: Number(f.split('-')[0]) || null }));

  return {
    ready: rerender(),

    /** Alles für die Verwaltung. */
    state() {
      return {
        entwurf: draft.content,
        entwurfAm: draft.at,
        veroeffentlichtAm: live.at,
        geaendert: JSON.stringify(draft.content) !== JSON.stringify(live.content),
        versionen: versions(),
        medien: this.media(),
      };
    },

    async saveDraft(raw) {
      const content = normalizeContent(raw);
      draft = { content, at: Date.now() };
      await write(DRAFT, draft);
      return { entwurf: content, entwurfAm: draft.at, geaendert: JSON.stringify(content) !== JSON.stringify(live.content) };
    },

    async publish() {
      const content = normalizeContent(draft.content);
      const next = await renderSite(content, ctx); // erst rendern: schlägt das fehl, bleibt alles wie es ist
      const at = Date.now();
      await write(path.join(VERSION_DIR, `${at}-${crypto.randomBytes(3).toString('hex')}.json`), { content, at });
      live = { content, at };
      await write(LIVE, live);
      rendered = next;
      for (const old of versions().slice(KEEP_VERSIONS)) await fsp.rm(path.join(VERSION_DIR, `${old.id}.json`), { force: true });
      log('Website veröffentlicht.');
      return { veroeffentlichtAm: at };
    },

    /** Frühere Fassung als Entwurf zurückholen (wird erst mit „Veröffentlichen“ sichtbar). */
    async restore(id) {
      if (!/^[\w-]+$/.test(String(id))) throw new WebsiteError('Unbekannte Fassung.', 404);
      const v = read(path.join(VERSION_DIR, `${id}.json`));
      if (!v) throw new WebsiteError('Unbekannte Fassung.', 404);
      return this.saveDraft(v.content);
    },

    /** Entwurf verwerfen: zurück auf den veröffentlichten Stand. */
    async discard() {
      return this.saveDraft(live.content);
    },

    preview: (pfad) => renderPreview(draft.content, pfad, { ...ctx, previewBase: '/api/website/vorschau' }),

    /** Öffentliche Anfrage beantworten: { status, body, type } oder null (nicht zuständig). */
    serve(pathname) {
      if (!rendered) return { status: 503, body: 'Einen Moment bitte …', type: 'text/plain; charset=utf-8' };
      if (pathname === '/sitemap.xml') return { status: 200, body: rendered.sitemap, type: 'application/xml; charset=utf-8' };
      if (pathname === '/robots.txt') return { status: 200, body: rendered.robots, type: 'text/plain; charset=utf-8' };
      let p = pathname;
      if (!p.endsWith('/') && !path.extname(p)) {
        if (rendered.pages.has(`${p}/`)) return { status: 301, location: `${p}/` };
      }
      if (p.endsWith('/index.html')) p = p.slice(0, -'index.html'.length);
      const html = rendered.pages.get(p);
      return html ? { status: 200, body: html, type: 'text/html; charset=utf-8' } : { status: 404, body: rendered.notFound, type: 'text/html; charset=utf-8' };
    },

    // ------------------------------------------------------------- Medien
    media() {
      return fs
        .readdirSync(MEDIA_DIR)
        .filter((f) => !f.startsWith('.'))
        .map((f) => {
          const st = fs.statSync(path.join(MEDIA_DIR, f));
          return { name: f, url: `${MEDIA_URL}${f}`, groesse: st.size, at: st.mtimeMs };
        })
        .sort((a, b) => b.at - a.at);
    },

    async addMedia(buffer, mime, originalName = '') {
      const ext = MEDIA_TYPES[mime];
      if (!ext) throw new WebsiteError('Dieses Dateiformat wird nicht unterstützt. Erlaubt: PNG, JPG, WebP, GIF, SVG, ICO.', 415);
      if (!buffer.length) throw new WebsiteError('Die Datei ist leer.');
      if (buffer.length > MEDIA_MAX) throw new WebsiteError('Die Datei ist zu groß (höchstens 8 MB).', 413);
      if (ext === '.svg') {
        const text = buffer.toString('utf8');
        // SVG darf keine Skripte, Ereignisse oder fremden Inhalte enthalten
        if (/<script|on[a-z]+\s*=|javascript:|<foreignObject|<iframe|<embed|<object/i.test(text)) {
          throw new WebsiteError('Diese SVG-Datei enthält aktive Inhalte und wurde abgelehnt.');
        }
      }
      const base = String(originalName)
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      const name = `${base ? `${base}-` : ''}${crypto.randomBytes(4).toString('hex')}${ext}`;
      await fsp.writeFile(path.join(MEDIA_DIR, name), buffer);
      return { name, url: `${MEDIA_URL}${name}` };
    },

    async removeMedia(name) {
      if (!/^[a-z0-9-]+\.(png|jpg|webp|gif|svg|ico)$/.test(String(name))) throw new WebsiteError('Unbekannte Datei.', 404);
      const url = `${MEDIA_URL}${name}`;
      const used = JSON.stringify(draft.content).includes(url) || JSON.stringify(live.content).includes(url);
      if (used) throw new WebsiteError('Das Bild wird noch auf einer Seite verwendet. Erst dort entfernen.', 409);
      await fsp.rm(path.join(MEDIA_DIR, name), { force: true });
    },

    /** Datei für /_web/medien/<name> oder null. */
    mediaFile(name) {
      if (!/^[a-z0-9-]+\.(png|jpg|webp|gif|svg|ico)$/.test(String(name))) return null;
      const file = path.join(MEDIA_DIR, name);
      return fs.existsSync(file) ? file : null;
    },
  };
}
