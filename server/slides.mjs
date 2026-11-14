// MeetingBackstage Slides: Folien für OBS, unabhängig von Zoom.
//
// Je Konto (lokal: ein „Konto“) liegt folien.json mit den Folien, der Mediathek und dem Kanal.
// Öffentlich (ohne Anmeldung, für OBS) gibt es pro Folie eine feste, geheime Adresse /s/<key> und je Konto einen
// Kanal /kanal/<key>, der immer die Folie „auf Sendung“ zeigt. Änderungen gehen sofort per Server-Sent Events raus.
// Hochgeladene Bilder und Videos liegen gemeinsam in folien-medien/ unter zufälligen Namen (/m/<name>).
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHRIFTEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'slides', 'schriften.json'), 'utf8')).map((s) => s.name);

export const LIMITS = { bildMax: 15 * 1024 * 1024, videoMax: 200 * 1024 * 1024, kontoMax: 2 * 1024 * 1024 * 1024, folienMax: 200, elementeMax: 120 };
export const MEDIA_TYPES = {
  'image/png': { ext: '.png', typ: 'bild' },
  'image/jpeg': { ext: '.jpg', typ: 'bild' },
  'image/webp': { ext: '.webp', typ: 'bild' },
  'image/gif': { ext: '.gif', typ: 'bild' },
  'image/svg+xml': { ext: '.svg', typ: 'bild' },
  'video/mp4': { ext: '.mp4', typ: 'video' },
  'video/webm': { ext: '.webm', typ: 'video' },
};
export const MEDIA_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const MEDIA_NAME = /^[a-z0-9-]{1,60}\.(png|jpg|webp|gif|svg|mp4|webm)$/;

export class SlideError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ----------------------------------------------------------------- Prüfen und Säubern
const num = (v, min, max, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v).toLowerCase() : d);
const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, max) => String(v ?? '').slice(0, max);
const media = (v) => (typeof v === 'string' && /^\/m\/[a-z0-9-]{1,60}\.(png|jpg|webp|gif|svg|mp4|webm)$/.test(v) ? v : '');
const ANIM = ['keine', 'einblenden', 'von-unten', 'von-oben', 'von-links', 'von-rechts', 'zoom'];
const randomId = (n = 4) => crypto.randomBytes(n).toString('hex');

function normalizeElement(e) {
  const typ = pick(e?.typ, ['text', 'form', 'bild', 'video'], null);
  if (!typ) return null;
  const b = {
    id: /^[\w-]{1,40}$/.test(String(e.id ?? '')) ? String(e.id) : randomId(),
    typ,
    name: str(e.name, 60) || typ,
    x: num(e.x, -4000, 6000, 0),
    y: num(e.y, -4000, 6000, 0),
    w: num(e.w, 2, 8000, 400),
    h: num(e.h, 2, 8000, 200),
    rot: num(e.rot, -360, 360, 0),
    opacity: num(e.opacity, 0, 1, 1),
    hidden: bool(e.hidden),
    locked: bool(e.locked),
    anim: pick(e.anim, ANIM, 'keine'),
    animDauer: num(e.animDauer, 0.1, 5, 0.6),
    animVerz: num(e.animVerz, 0, 30, 0),
  };
  const deko = {
    radius: num(e.radius, 0, 1000, 0),
    borderW: num(e.borderW, 0, 60, 0),
    borderColor: color(e.borderColor, '#ffffff'),
    shadow: bool(e.shadow),
    shadowColor: color(e.shadowColor, '#000000'),
    shadowBlur: num(e.shadowBlur, 0, 120, 20),
  };
  if (typ === 'text') {
    return {
      ...b,
      ...deko,
      text: str(e.text, 4000),
      font: pick(e.font, SCHRIFTEN, 'Barlow'),
      size: num(e.size, 6, 600, 64),
      weight: e.weight === 400 ? 400 : 700,
      italic: bool(e.italic),
      underline: bool(e.underline),
      upper: bool(e.upper),
      color: color(e.color, '#ffffff'),
      align: pick(e.align, ['left', 'center', 'right'], 'left'),
      valign: pick(e.valign, ['top', 'middle', 'bottom'], 'top'),
      lineHeight: num(e.lineHeight, 0.6, 4, 1.2),
      letterSpacing: num(e.letterSpacing, -20, 80, 0),
      bg: color(e.bg, '#11243c'),
      bgOpacity: num(e.bgOpacity, 0, 1, 0),
      pad: num(e.pad, 0, 400, 0),
      outlineW: num(e.outlineW, 0, 30, 0),
      outlineColor: color(e.outlineColor, '#000000'),
    };
  }
  if (typ === 'form') {
    return {
      ...b,
      ...deko,
      form: pick(e.form, ['rechteck', 'ellipse', 'linie'], 'rechteck'),
      fill: color(e.fill, '#026c75'),
      fill2: color(e.fill2, '#11243c'),
      verlauf: bool(e.verlauf),
      winkel: num(e.winkel, 0, 360, 135),
      fillOpacity: num(e.fillOpacity, 0, 1, 1),
    };
  }
  const bild = { ...b, ...deko, src: media(e.src), fit: pick(e.fit, ['cover', 'contain'], 'cover') };
  return typ === 'video' ? { ...bild, loop: bool(e.loop, true), ton: bool(e.ton) } : bild;
}

function normalizeHintergrund(h) {
  return {
    typ: pick(h?.typ, ['transparent', 'farbe', 'verlauf', 'bild', 'video'], 'transparent'),
    color: color(h?.color, '#11243c'),
    color2: color(h?.color2, '#026c75'),
    winkel: num(h?.winkel, 0, 360, 135),
    src: media(h?.src),
    fit: pick(h?.fit, ['cover', 'contain'], 'cover'),
    abdunkeln: num(h?.abdunkeln, 0, 0.9, 0),
  };
}

/** Folie aus dem Editor prüfen; ID und geheimer Schlüssel bleiben die vom Server. */
export function normalizeFolie(raw, keep = {}) {
  return {
    id: keep.id ?? randomId(5),
    key: keep.key ?? randomId(12),
    name: str(raw?.name, 80).trim() || 'Folie',
    updatedAt: Date.now(),
    hintergrund: normalizeHintergrund(raw?.hintergrund),
    elemente: (Array.isArray(raw?.elemente) ? raw.elemente.slice(0, LIMITS.elementeMax) : []).map(normalizeElement).filter(Boolean),
  };
}

/** Dateianfang prüfen: passt der Inhalt zum angegebenen Typ? */
function signatureOk(mime, head) {
  const h = head;
  switch (mime) {
    case 'image/png':
      return h.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    case 'image/jpeg':
      return h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
    case 'image/gif':
      return h.subarray(0, 4).toString('latin1') === 'GIF8';
    case 'image/webp':
      return h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'video/mp4':
      return h.subarray(4, 8).toString('latin1') === 'ftyp';
    case 'video/webm':
      return h.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'));
    case 'image/svg+xml':
      return /<svg[\s>]/i.test(h.toString('utf8'));
    default:
      return false;
  }
}

// ----------------------------------------------------------------- Speicher für alle Konten
export function createSlides({ dataDir, ownerDir, owners = () => [], log = () => {} }) {
  const MEDIA_DIR = path.join(dataDir, 'folien-medien');
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const data = new Map(); // owner -> { folien, medien, kanal }
  const slideIndex = new Map(); // key -> { owner, id }
  const channelIndex = new Map(); // key -> owner
  const subscribers = new Map(); // 's:<key>' | 'k:<key>' -> Set<res>

  const fileOf = (owner) => path.join(ownerDir(owner), 'folien.json');

  function load(owner) {
    if (data.has(owner)) return data.get(owner);
    let d = null;
    try {
      d = JSON.parse(fs.readFileSync(fileOf(owner), 'utf8'));
    } catch {
      d = null;
    }
    const folien = (d?.folien ?? []).map((f) => ({ ...normalizeFolie(f, { id: f.id, key: f.key }), updatedAt: f.updatedAt ?? Date.now() }));
    const medien = (d?.medien ?? []).filter((m) => MEDIA_NAME.test(m?.name ?? ''));
    const kanal = { key: d?.kanal?.key ?? randomId(12), liveId: d?.kanal?.liveId ?? null };
    const entry = { folien, medien, kanal };
    data.set(owner, entry);
    if (!d) save(owner).catch(() => {}); // neuer Kanal-Schlüssel: sofort festhalten
    for (const f of folien) slideIndex.set(f.key, { owner, id: f.id });
    channelIndex.set(kanal.key, owner);
    return entry;
  }
  for (const o of owners()) {
    try {
      if (fs.existsSync(fileOf(o))) load(o);
    } catch (e) {
      log(`Folien von ${o} nicht lesbar: ${e.message}`);
    }
  }

  const writing = new Map();
  function save(owner) {
    const d = data.get(owner);
    const json = JSON.stringify(d);
    const prev = writing.get(owner) ?? Promise.resolve();
    const next = prev.then(async () => {
      await fsp.mkdir(ownerDir(owner), { recursive: true });
      const tmp = `${fileOf(owner)}.tmp`;
      await fsp.writeFile(tmp, json, { mode: 0o600 });
      await fsp.rename(tmp, fileOf(owner));
    });
    writing.set(owner, next.catch(() => {}));
    return next;
  }

  // ------------------------------------------------------------- Live-Aktualisierung (SSE)
  function push(channel, payload) {
    const set = subscribers.get(channel);
    if (!set) return;
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) res.write(msg);
  }
  function notify(owner, folie) {
    const d = load(owner);
    if (folie) push(`s:${folie.key}`, { folie });
    const live = d.folien.find((f) => f.id === d.kanal.liveId) ?? null;
    if (!folie || folie.id === d.kanal.liveId) push(`k:${d.kanal.key}`, { folie: live });
  }
  setInterval(() => {
    for (const set of subscribers.values()) for (const res of set) res.write(': ping\n\n');
  }, 25_000).unref();

  const used = (owner) => load(owner).medien.reduce((s, m) => s + (m.groesse || 0), 0);
  const findFolie = (owner, id) => {
    const f = load(owner).folien.find((x) => x.id === id);
    if (!f) throw new SlideError('Folie nicht gefunden.', 404);
    return f;
  };

  return {
    LIMITS,

    state(owner, basis) {
      const d = load(owner);
      return {
        folien: d.folien,
        medien: d.medien,
        kanal: d.kanal,
        speicher: { belegt: used(owner), max: LIMITS.kontoMax, bildMax: LIMITS.bildMax, videoMax: LIMITS.videoMax },
        basis,
      };
    },

    async create(owner, raw) {
      const d = load(owner);
      if (d.folien.length >= LIMITS.folienMax) throw new SlideError(`Höchstens ${LIMITS.folienMax} Folien.`);
      const f = normalizeFolie(raw);
      d.folien.push(f);
      slideIndex.set(f.key, { owner, id: f.id });
      await save(owner);
      return f;
    },

    async update(owner, id, raw) {
      const d = load(owner);
      const old = findFolie(owner, id);
      const f = normalizeFolie(raw, { id: old.id, key: old.key });
      d.folien = d.folien.map((x) => (x.id === id ? f : x));
      await save(owner);
      notify(owner, f);
      return f;
    },

    async duplicate(owner, id) {
      const src = findFolie(owner, id);
      return this.create(owner, { ...structuredClone(src), name: `${src.name} (Kopie)` });
    },

    async remove(owner, id) {
      const d = load(owner);
      const f = findFolie(owner, id);
      d.folien = d.folien.filter((x) => x.id !== id);
      slideIndex.delete(f.key);
      push(`s:${f.key}`, { folie: null });
      if (d.kanal.liveId === id) d.kanal.liveId = null;
      await save(owner);
      notify(owner, null);
    },

    /** Neue geheime Adresse für eine Folie (alte OBS-Adresse zeigt danach nichts mehr). */
    async renewKey(owner, id) {
      const f = findFolie(owner, id);
      push(`s:${f.key}`, { folie: null });
      slideIndex.delete(f.key);
      f.key = randomId(12);
      slideIndex.set(f.key, { owner, id: f.id });
      await save(owner);
      return f;
    },

    async setLive(owner, id) {
      const d = load(owner);
      if (id) findFolie(owner, id);
      d.kanal.liveId = id || null;
      await save(owner);
      notify(owner, null);
      return d.kanal;
    },

    // ------------------------------------------------------------- Medien
    /** Upload als Datenstrom direkt auf die Platte, mit Grenzen und Prüfung des Dateityps. */
    async addMedia(owner, req, mime, original = '') {
      const type = MEDIA_TYPES[mime];
      if (!type) throw new SlideError('Dieses Format wird nicht unterstützt. Bilder: PNG, JPG, WebP, GIF, SVG. Videos: MP4, WebM.', 415);
      const max = type.typ === 'video' ? LIMITS.videoMax : LIMITS.bildMax;
      const len = Number(req.headers['content-length'] ?? 0);
      if (len > max) throw new SlideError(`Die Datei ist zu groß (höchstens ${Math.round(max / 1024 / 1024)} MB).`, 413);
      const free = LIMITS.kontoMax - used(owner);
      if (len > free) throw new SlideError('Dein Speicher für Folien ist voll (2 GB). Bitte nicht mehr benötigte Medien löschen.', 413);
      const base = String(original).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
      const name = `${base ? `${base}-` : ''}${randomId(8)}${type.ext}`;
      const file = path.join(MEDIA_DIR, name);
      const tmp = `${file}.teil`;
      const out = fs.createWriteStream(tmp, { mode: 0o644 });
      let size = 0;
      let head = Buffer.alloc(0);
      try {
        await new Promise((resolve, reject) => {
          req.on('data', (chunk) => {
            size += chunk.length;
            if (head.length < 4096) head = Buffer.concat([head, chunk]).subarray(0, 4096);
            if (size > max || size > free) {
              req.destroy();
              reject(new SlideError(size > free ? 'Dein Speicher für Folien ist voll (2 GB).' : `Die Datei ist zu groß (höchstens ${Math.round(max / 1024 / 1024)} MB).`, 413));
              return;
            }
            if (!out.write(chunk)) {
              req.pause();
              out.once('drain', () => req.resume());
            }
          });
          req.on('end', resolve);
          req.on('error', reject);
          out.on('error', reject);
        });
        await new Promise((r) => out.end(r));
        if (!size) throw new SlideError('Die Datei ist leer.');
        if (!signatureOk(mime, head)) throw new SlideError('Der Inhalt der Datei passt nicht zum Dateityp.', 415);
        if (mime === 'image/svg+xml') {
          const text = await fsp.readFile(tmp, 'utf8');
          if (/<script|on[a-z]+\s*=|javascript:|<foreignObject|<iframe|<embed|<object/i.test(text)) {
            throw new SlideError('Diese SVG-Datei enthält aktive Inhalte und wurde abgelehnt.');
          }
        }
        await fsp.rename(tmp, file);
      } catch (e) {
        out.destroy();
        await fsp.rm(tmp, { force: true });
        throw e;
      }
      const m = { name, url: `/m/${name}`, typ: type.typ, groesse: size, original: str(original, 120), at: Date.now() };
      load(owner).medien.unshift(m);
      await save(owner);
      log(`Folien: ${type.typ} hochgeladen (${Math.round(size / 1024)} KB)`);
      return m;
    },

    async removeMedia(owner, name) {
      const d = load(owner);
      const m = d.medien.find((x) => x.name === name);
      if (!m) throw new SlideError('Datei nicht gefunden.', 404);
      if (JSON.stringify(d.folien).includes(m.url)) throw new SlideError('Die Datei wird noch auf einer Folie verwendet. Erst dort entfernen.', 409);
      d.medien = d.medien.filter((x) => x.name !== name);
      await fsp.rm(path.join(MEDIA_DIR, name), { force: true });
      await save(owner);
    },

    /** Alle Daten eines Kontos entfernen (beim Löschen des Kontos). */
    async removeOwner(owner) {
      const d = load(owner);
      for (const m of d.medien) await fsp.rm(path.join(MEDIA_DIR, m.name), { force: true });
      for (const f of d.folien) slideIndex.delete(f.key);
      channelIndex.delete(d.kanal.key);
      data.delete(owner);
    },

    mediaFile(name) {
      if (!MEDIA_NAME.test(String(name))) return null;
      const file = path.join(MEDIA_DIR, name);
      return fs.existsSync(file) ? file : null;
    },

    // ------------------------------------------------------------- Öffentlich (OBS)
    bySlideKey(key) {
      const hit = slideIndex.get(String(key));
      if (!hit) return null;
      return load(hit.owner).folien.find((f) => f.id === hit.id) ?? null;
    },
    /** Kanal: { folie } (folie = null, wenn nichts auf Sendung) oder null, wenn der Schlüssel unbekannt ist. */
    byChannelKey(key) {
      const owner = channelIndex.get(String(key));
      if (!owner) return null;
      const d = load(owner);
      return { folie: d.folien.find((f) => f.id === d.kanal.liveId) ?? null };
    },
    subscribe(kind, key, res) {
      const channel = `${kind}:${key}`;
      if (!subscribers.has(channel)) subscribers.set(channel, new Set());
      subscribers.get(channel).add(res);
      res.on('close', () => {
        subscribers.get(channel)?.delete(res);
        if (!subscribers.get(channel)?.size) subscribers.delete(channel);
      });
    },
  };
}
