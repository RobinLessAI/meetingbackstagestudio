// MeetingBackstage Studio – Server
//
// - liefert die App und die OBS-Ausgabeseiten aus
// - gleicht die Grafiken per WebSocket zwischen Steuerung und OBS-Browserquellen ab
// - stellt das Regie-Fenster bereit, das dem Meeting über das Zoom Meeting SDK
//   als zusätzlicher Teilnehmer beitritt und den Chat live weitergibt
// - Zustand und Logik je Konto stecken in server/room.mjs („Raum“)
//
// Lokal (Standard): nur auf diesem Rechner erreichbar, ein Raum, Daten in daten/.
// Web-Modus (MB_WEB=1): Kundenkonten mit Anmeldung (server/accounts.mjs), ein Raum je Konto
// mit eigenem Ordner daten/konten/<id>/, OBS-Adressen und Stream Deck mit geheimem Schlüssel je Konto.
//
// Start: npm start (baut die App und startet den Server)
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { AccountError, createAccounts, createLimiter, MIN_PASSWORD, normalizeEmail, publicUser } from './accounts.mjs';
import { brevoTransport, createMailer, smtpTransport } from './mailer.mjs';
import { createMailTemplates } from './mailTemplates.mjs';
import { createRoom } from './room.mjs';
import { zoomSignatureOk } from './zoomAccount.mjs';
import { ICONS, BLOCK_TYPES } from './website/render.mjs';
import { createWebsite, MEDIA_MAX, MEDIA_TYPES, WebsiteError } from './website/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = process.env.MB_DATA_DIR ? path.resolve(process.env.MB_DATA_DIR) : path.join(ROOT, 'daten');
// Zugangsdaten aus .env.local (wird nicht eingecheckt)
function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* Datei ist optional */
  }
}
loadEnvFile(process.env.MB_ENV_FILE ?? path.join(ROOT, '.env.local'));
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID ?? '';
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET ?? '';
// Für „Meetings aus Zoom“: dieselbe Adresse wie „OAuth Redirect URL“ in der Zoom-App.
// Im Web-Modus ist das automatisch <MB_PUBLIC_URL>/api/zoom/zurueck.
const ZOOM_REDIRECT_URI = process.env.ZOOM_REDIRECT_URI ?? '';
// „Secret Token“ aus der Zoom-App (Features → Access): prüft, dass Ereignisse wirklich von Zoom kommen.
const ZOOM_WEBHOOK_SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '';
// Dateien des Zoom Meeting SDK (Web) aus node_modules, lokal ausgeliefert.
const SDK_DIST = process.env.MB_ZOOM_SDK_DIR
  ? path.resolve(process.env.MB_ZOOM_SDK_DIR)
  : path.join(ROOT, 'node_modules', '@zoom', 'meetingsdk', 'dist');
const SDK_MAIN = (() => {
  try {
    return fs.readdirSync(SDK_DIST).find((f) => /^zoom-meeting-[\d.]+\.min\.js$/.test(f)) ?? null;
  } catch {
    return null;
  }
})();
// Microsoft Teams (optional): Anwendungs-ID und Verzeichnis-ID der eigenen App-Registrierung.
const TEAMS_CLIENT_ID = process.env.TEAMS_CLIENT_ID ?? '';
const TEAMS_TENANT_ID = process.env.TEAMS_TENANT_ID ?? '';
// Feste öffentliche Adresse statt automatischem Tunnel (z. B. eigene ngrok-Domain), optional.
const TEAMS_PUBLIC_URL = process.env.TEAMS_PUBLIC_URL ?? '';
const REGIE_NAME = 'MeetingBackstage (Regie)';
/** Stand des Regie-Fensters; muss mit REGIE_STAND in public/regie.js übereinstimmen. */
const REGIE_STAND = 7;
const SDK_VERSION = SDK_MAIN?.match(/zoom-meeting-([\d.]+)\.min\.js/)?.[1] ?? null;
/** Programmversion und Git-Stand (z. B. „0.1.0 · 6489819“), damit Updates erkennbar sind. */
const APP_VERSION = (() => {
  let version = '';
  try {
    version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version ?? '';
  } catch {
    /* ohne Versionsnummer */
  }
  try {
    const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    const ref = head.startsWith('ref: ') ? head.slice(5) : null;
    let hash = ref ? '' : head;
    if (ref) {
      try {
        hash = fs.readFileSync(path.join(ROOT, '.git', ref), 'utf8').trim();
      } catch {
        const packed = fs.readFileSync(path.join(ROOT, '.git', 'packed-refs'), 'utf8');
        hash = packed.split('\n').find((l) => l.endsWith(` ${ref}`))?.split(' ')[0] ?? '';
      }
    }
    if (hash) version += ` · ${hash.slice(0, 7)}`;
  } catch {
    /* kein Git-Ordner */
  }
  return version || 'unbekannt';
})();

const PORT = Number(process.env.PORT ?? 4300);
// Empfänger für Teams-Benachrichtigungen (nur über den Tunnel erreichbar, getrennt von der App).
const TEAMS_RECEIVER_PORT = Number(process.env.TEAMS_WEBHOOK_PORT ?? PORT + 2);
const MAX_MESSAGE = 8 * 1024 * 1024;

// Web-Modus (Kundenkonten, öffentlich erreichbar hinter einem Proxy mit https). Lokal bleibt alles wie gehabt.
const WEB = process.env.MB_WEB === '1';
const HOST = process.env.MB_HOST ?? '127.0.0.1';
const PUBLIC_URL = (process.env.MB_PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, '');
const PUBLIC = new URL(PUBLIC_URL);
// Hauptseite (z. B. meetingbackstage.de): MB_MAIN_DOMAIN oder die Studio-Adresse ohne „studio.“
const MAIN_HOST = (process.env.MB_MAIN_DOMAIN || (PUBLIC.hostname.startsWith('studio.') ? PUBLIC.hostname.slice('studio.'.length) : '')).toLowerCase();
const MAIN_URL = MAIN_HOST ? `https://${MAIN_HOST}` : PUBLIC_URL;
const WEBSITE_ASSETS = path.join(ROOT, 'website', 'assets');
const SECURE_COOKIE = PUBLIC.protocol === 'https:';
const TRUST_PROXY = process.env.MB_TRUST_PROXY === '1';
const ADMIN_EMAILS = (process.env.MB_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean);
const COOKIE = 'mb_sitzung';
// E-Mail-Versand (Web-Modus): ohne Schlüssel nur ins Protokoll (Entwicklung).
const MAIL_FROM = process.env.MB_MAIL_FROM ?? 'MeetingBackstage <no-reply@meetingbackstage.de>';
const MAIL_BREVO_KEY = process.env.MB_MAIL_BREVO_KEY ?? '';
// Oder über ein eigenes Postfach (z. B. Hetzner-Webhosting: mail.your-server.de, Port 465).
const SMTP = {
  host: process.env.MB_MAIL_SMTP_HOST ?? '',
  port: Number(process.env.MB_MAIL_SMTP_PORT ?? 465),
  user: process.env.MB_MAIL_SMTP_USER ?? '',
  pass: process.env.MB_MAIL_SMTP_PASS ?? '',
};
const MAIL_VIA = SMTP.host && SMTP.user && SMTP.pass ? 'smtp' : MAIL_BREVO_KEY ? 'brevo' : 'protokoll';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.cur': 'image/x-icon',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

const log = (...args) => console.log(`[${new Date().toLocaleTimeString('de-DE')}]`, ...args);

// ------------------------------------------------------------------ Räume
const CFG = {
  port: PORT,
  zoomClientId: ZOOM_CLIENT_ID,
  zoomClientSecret: ZOOM_CLIENT_SECRET,
  zoomRedirectUri: WEB ? ZOOM_REDIRECT_URI || `${PUBLIC_URL}/api/zoom/zurueck` : ZOOM_REDIRECT_URI,
  zoomOauthBase: process.env.MB_ZOOM_OAUTH_BASE,
  zoomApiBase: process.env.MB_ZOOM_API_URL,
  sdkMain: SDK_MAIN,
  sdkVersion: SDK_VERSION,
  appVersion: APP_VERSION,
  regieName: REGIE_NAME,
  regieStand: REGIE_STAND,
  teamsClientId: TEAMS_CLIENT_ID,
  teamsTenantId: TEAMS_TENANT_ID,
  teamsPublicUrl: TEAMS_PUBLIC_URL,
  teamsReceiverPort: TEAMS_RECEIVER_PORT,
  teamsLoginBase: process.env.MB_TEAMS_LOGIN_URL,
  teamsGraphBase: process.env.MB_TEAMS_GRAPH_URL,
};

// Lokal: ein Raum mit dem bisherigen Datenordner. Web: ein Raum je Konto, erst bei Bedarf angelegt.
const localRoom = WEB ? null : createRoom({ id: 'lokal', dataDir: DATA_DIR, web: false, cfg: CFG, log });
const rooms = new Map(); // Konto-ID -> Raum (nur Web)
const WEB_DIR = path.join(DATA_DIR, 'web');
const accounts = WEB ? createAccounts({ dir: WEB_DIR, adminEmails: ADMIN_EMAILS, log }) : null;
const mailer = WEB
  ? createMailer({
      dir: WEB_DIR,
      log,
      from: MAIL_FROM,
      transport:
        MAIL_VIA === 'smtp'
          ? smtpTransport({ ...SMTP, from: MAIL_FROM })
          : MAIL_VIA === 'brevo'
            ? brevoTransport({ apiKey: MAIL_BREVO_KEY, from: MAIL_FROM, apiUrl: process.env.MB_MAIL_BREVO_URL })
            : null,
    })
  : null;
const website = WEB
  ? createWebsite({
      dir: path.join(DATA_DIR, 'website'),
      seedFile: path.join(ROOT, 'website', 'inhalt-start.json'),
      siteUrl: MAIN_URL,
      studioUrl: PUBLIC_URL,
      log,
    })
  : null;
// E-Mail-Vorlagen (bearbeitbar unter Website → E-Mail-Vorlagen)
const mailTemplates = WEB
  ? createMailTemplates({
      file: path.join(WEB_DIR, 'mail-vorlagen.json'),
      logoUrl: `${MAIN_URL}/_web/bilder/mail-logo.png`,
      baseVars: { studio: PUBLIC_URL, website: MAIN_URL },
    })
  : null;
/** Mail nach Vorlage verschicken. */
const sendMail = (id, to, vars) => mailer.send({ to, ...mailTemplates.render(id, { email: to, ...vars }) });

const accountDir = (id) => path.join(DATA_DIR, 'konten', id.replace(/[^a-f0-9-]/gi, ''));

function roomFor(user) {
  let room = rooms.get(user.id);
  if (!room) {
    room = createRoom({
      id: user.id,
      dataDir: accountDir(user.id),
      web: true,
      cfg: CFG,
      log,
      keys: { actionKey: user.actionKey, outputKey: user.outputKey },
      renewKeys: () => accounts.renewKeys(user.id),
    });
    rooms.set(user.id, room);
  }
  return room;
}

/** Konto gesperrt, zurückgesetzt oder gelöscht: alle Fenster sofort trennen. */
async function closeRoom(id, reason) {
  const room = rooms.get(id);
  if (!room) return;
  room.kick(4001, reason);
  await room.close();
  rooms.delete(id);
}

// ------------------------------------------------------------------ Hilfen
/** Nur Anfragen an die eigene Adresse beantworten (Schutz gegen DNS-Rebinding). */
function isLocalHost(hostHeader) {
  const host = String(hostHeader ?? '').replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}
function hostAllowed(hostHeader) {
  if (isLocalHost(hostHeader)) return true;
  const host = String(hostHeader ?? '').toLowerCase();
  return WEB && (host === PUBLIC.host.toLowerCase() || isMainHost(host));
}
/** Anfrage an die Hauptseite (meetingbackstage.de, www.meetingbackstage.de)? */
function isMainHost(hostHeader) {
  const host = String(hostHeader ?? '').toLowerCase().replace(/:\d+$/, '');
  return Boolean(MAIN_HOST) && (host === MAIN_HOST || host === `www.${MAIN_HOST}`);
}
/** Verbindungen nur von dieser Seite (oder ohne Origin, z. B. OBS, Stream Deck). */
function originAllowed(origin) {
  if (!origin || origin === 'null') return true;
  try {
    const o = new URL(origin);
    if (WEB && o.origin === PUBLIC.origin) return true;
    return ['localhost', '127.0.0.1', '[::1]'].includes(o.hostname) && (!WEB || isLocalHost(PUBLIC.host));
  } catch {
    return false;
  }
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const sessionCookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;
const clientIp = (req) =>
  (TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';
const sessionUser = (req) => (WEB ? accounts.session(cookies(req)[COOKIE]) : null);

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new AccountError('gross', 'Anfrage zu groß.', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new AccountError('json', 'Ungültige Anfrage.'));
      }
    });
    req.on('error', reject);
  });
}

// ------------------------------------------------- Stream Deck & Co.
// Ein Stream Deck ruft z. B. /aktion/karte-anzeigen?schluessel=… auf. Der Schlüssel verhindert, dass beliebige
// Webseiten Aktionen auslösen, und bestimmt im Web-Modus das Konto.
function handleAction(req, res, id) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const key = url.searchParams.get('schluessel') ?? '';
  let room = null;
  if (WEB) {
    const user = accounts.byActionKey(key);
    if (user?.status === 'aktiv') room = roomFor(user);
  } else if (key === localRoom.actionKey) room = localRoom;
  if (!room) return json(res, 403, { ok: false, fehler: 'Schlüssel fehlt oder ist falsch.' });
  const r = room.action(id);
  json(res, r.status, r.body);
}

// ------------------------------------------------------------- Konten (Web)
const loginLimiter = createLimiter({ max: 8, windowMs: 15 * 60_000 });
const ipLimiter = createLimiter({ max: 20, windowMs: 60 * 60_000 });

async function notifyAdmins(id, vars) {
  for (const u of accounts.list()) if (u.admin && u.status === 'aktiv') await mailer.send({ to: u.email, ...mailTemplates.render(id, vars) }).catch(() => {});
}

async function handleAccountApi(req, res, url) {
  const route = url.pathname;
  try {
    if (route === '/api/modus') return json(res, 200, { web: WEB, minPasswort: MIN_PASSWORD, hauptseite: MAIN_HOST ? MAIN_URL : null });
    if (route === '/api/konto/bestaetigen' && req.method === 'GET') {
      try {
        const user = await accounts.verifyEmail(url.searchParams.get('token') ?? '');
        if (user.status === 'wartet') await notifyAdmins('neuesKonto', { email: user.email, name: user.name ?? '', link: `${PUBLIC_URL}/#verwaltung` });
        res.writeHead(302, { Location: `/?hinweis=${user.status === 'aktiv' ? 'bestaetigt' : 'wartet'}`, 'Cache-Control': 'no-store' }).end();
      } catch {
        res.writeHead(302, { Location: '/?hinweis=link-ungueltig', 'Cache-Control': 'no-store' }).end();
      }
      return;
    }
    if (route === '/api/konto/ich' && req.method === 'GET') {
      const user = sessionUser(req);
      return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { user: null });
    }
    if (req.method !== 'POST') return json(res, 405, { fehler: 'Methode nicht erlaubt.' });
    // Schutz gegen fremde Seiten: nur JSON und nur von dieser Adresse.
    if (!originAllowed(req.headers.origin) || !String(req.headers['content-type'] ?? '').includes('application/json')) {
      return json(res, 403, { fehler: 'Anfrage abgelehnt.' });
    }
    const body = await readJson(req);
    const ip = clientIp(req);

    switch (route) {
      case '/api/konto/registrieren': {
        if (!ipLimiter.take(`reg:${ip}`)) return json(res, 429, { fehler: 'Zu viele Versuche. Bitte später erneut versuchen.' });
        const r = await accounts.register({ email: body.email, password: body.passwort, name: body.name });
        if (r.verifyToken) {
          try {
            await sendMail('bestaetigen', normalizeEmail(body.email), { name: String(body.name ?? '').trim(), link: `${PUBLIC_URL}/api/konto/bestaetigen?token=${r.verifyToken}` });
          } catch (e) {
            log(`Bestätigungs-Mail nicht gesendet: ${e.message}`);
            return json(res, 502, { fehler: 'Das Konto ist angelegt, aber die Bestätigungs-Mail konnte nicht gesendet werden. Bitte später erneut „Konto anlegen“ mit denselben Daten versuchen.' });
          }
        }
        return json(res, 200, { ok: true });
      }
      case '/api/konto/anmelden': {
        const key = `login:${ip}:${normalizeEmail(body.email)}`;
        if (!loginLimiter.take(key)) return json(res, 429, { fehler: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' });
        const { token, user } = await accounts.login({ email: body.email, password: body.passwort });
        loginLimiter.reset(key);
        return json(res, 200, { user }, { 'Set-Cookie': sessionCookie(token, 30 * 86400) });
      }
      case '/api/konto/abmelden':
        await accounts.logout(cookies(req)[COOKIE]);
        return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
      case '/api/konto/passwort-vergessen': {
        if (!ipLimiter.take(`reset:${ip}`)) return json(res, 429, { fehler: 'Zu viele Versuche. Bitte später erneut versuchen.' });
        const r = await accounts.requestReset(body.email);
        if (r) {
          try {
            await sendMail('passwort', r.user.email, { name: r.user.name ?? '', link: `${PUBLIC_URL}/?passwort=${r.token}` });
          } catch (e) {
            log(`Passwort-Mail nicht gesendet: ${e.message}`);
            return json(res, 502, { fehler: 'Die E-Mail konnte gerade nicht gesendet werden. Bitte später erneut versuchen.' });
          }
        }
        return json(res, 200, { ok: true }); // gleiche Antwort, ob es die Adresse gibt oder nicht
      }
      case '/api/konto/passwort-neu': {
        const user = await accounts.resetPassword(body.token, body.passwort);
        await closeRoom(user.id, 'Passwort geändert');
        return json(res, 200, { ok: true });
      }
      case '/api/konto/passwort-aendern': {
        const user = sessionUser(req);
        if (!user) return json(res, 401, { fehler: 'Bitte anmelden.' });
        await accounts.changePassword(user.id, body.alt, body.neu);
        return json(res, 200, { ok: true });
      }
      case '/api/verwaltung/konten': {
        const user = sessionUser(req);
        if (!user?.admin) return json(res, 403, { fehler: 'Nur für die Verwaltung.' });
        const list = accounts.list().map((u) => ({ ...u, online: rooms.get(u.id)?.counts() ?? null }));
        return json(res, 200, { konten: list });
      }
      case '/api/verwaltung/konto': {
        const user = sessionUser(req);
        if (!user?.admin) return json(res, 403, { fehler: 'Nur für die Verwaltung.' });
        const target = accounts.get(String(body.id ?? ''));
        if (!target) return json(res, 404, { fehler: 'Konto nicht gefunden.' });
        if (target.id === user.id) return json(res, 400, { fehler: 'Das eigene Konto lässt sich hier nicht ändern.' });
        if (body.aktion === 'freischalten' || body.aktion === 'entsperren') {
          const wasWaiting = target.status === 'wartet';
          await accounts.setStatus(target.id, 'aktiv');
          if (wasWaiting) await sendMail('freigeschaltet', target.email, { name: target.name ?? '', link: PUBLIC_URL }).catch(() => {});
        } else if (body.aktion === 'sperren') {
          await accounts.setStatus(target.id, 'gesperrt');
          await closeRoom(target.id, 'Konto gesperrt');
        } else if (body.aktion === 'loeschen') {
          // Verbindung zu Zoom zurückziehen, bevor die Daten verschwinden
          await roomFor(target).zoomDisconnect().catch(() => {});
          await closeRoom(target.id, 'Konto gelöscht');
          await accounts.remove(target.id);
          await fsp.rm(accountDir(target.id), { recursive: true, force: true });
        } else return json(res, 400, { fehler: 'Unbekannte Aktion.' });
        return json(res, 200, { ok: true });
      }
      default:
        return json(res, 404, { fehler: 'Nicht gefunden.' });
    }
  } catch (e) {
    if (e instanceof AccountError) return json(res, e.status, { fehler: e.message, code: e.code });
    log(`Fehler bei ${route}: ${e.message}`);
    return json(res, 500, { fehler: 'Interner Fehler. Bitte später erneut versuchen.' });
  }
}

// -------------------------------------------------------------- Auslieferung
const ASSETS_DIR = path.join(DIST, 'assets') + path.sep;

/**
 * Nur gebaute Dateien mit Prüfsumme im Namen (dist/assets) dürfen lange im Browser bleiben.
 * Alles andere (Regie-Fenster, Zoom SDK) wird bei jedem Laden auf Änderungen geprüft,
 * damit ein Update sofort wirkt.
 */
function sendFile(res, file, req) {
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const lastModified = stat.mtime.toUTCString();
  const immutable = file.startsWith(ASSETS_DIR);
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Last-Modified': lastModified,
    'X-Content-Type-Options': 'nosniff',
    // Adressen mit Schlüsseln nicht an fremde Seiten weitergeben; Einbetten nur durch die eigene Seite.
    'Referrer-Policy': 'same-origin',
    ...(ext === '.html' ? { 'X-Frame-Options': 'SAMEORIGIN' } : {}),
  };
  if (!immutable && ext !== '.html' && req?.headers['if-modified-since'] === lastModified) {
    res.writeHead(304, headers).end();
    return;
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

/** Kleine Seite nach der Microsoft-Anmeldung (im Browser-Tab). */
function teamsCallbackPage(res, ok, text) {
  res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  const safe = String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  res.end(`<!doctype html><meta charset="utf-8"><title>MeetingBackstage · Teams</title>
<body style="font:16px system-ui,sans-serif;background:#16181d;color:#eee;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:480px;text-align:center"><h1 style="font-size:22px">${ok ? 'Mit Microsoft Teams verbunden' : 'Anmeldung nicht möglich'}</h1>
<p>${safe}</p><p style="opacity:.7">Du kannst diesen Tab schließen und zu MeetingBackstage zurückkehren.</p></div>
${ok ? '<script>setTimeout(()=>window.close(),1500)</script>' : ''}</body>`);
}

// ------------------------------------------------------------- Zoom (Web)
// 1. /api/zoom/verbinden      angemeldet → weiter zu Zoom „Erlauben“ (mit einmaligem state)
// 2. /api/zoom/zurueck        Zoom leitet mit ?code=…&state=… zurück → Anmeldung im Raum speichern
// 3. /api/zoom/ereignis       Zoom meldet z. B. „App entfernt“ → Anmeldung dieses Zoom-Kontos löschen
const zoomStates = new Map(); // state -> { userId, exp }

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' }).end();
}

function readRaw(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('zu groß'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Konten, deren gespeicherte Zoom-Anmeldung zu diesem Zoom-Benutzer gehört. */
function accountsWithZoomUser(zoomUserId) {
  const out = [];
  for (const u of accounts.list()) {
    const room = rooms.get(u.id);
    let id = room ? room.zoomUserId() : null;
    if (!room) {
      try {
        id = JSON.parse(fs.readFileSync(path.join(accountDir(u.id), 'zoom-anmeldung.json'), 'utf8')).zoomUserId ?? null;
      } catch {
        id = null;
      }
    }
    if (id && id === zoomUserId) out.push(u);
  }
  return out;
}

async function handleZoomApi(req, res, url) {
  const route = url.pathname;
  try {
    if (route === '/api/zoom/verbinden' && req.method === 'GET') {
      const user = sessionUser(req);
      if (!user || user.status !== 'aktiv') return redirect(res, '/');
      const state = crypto.randomBytes(24).toString('base64url');
      const now = Date.now();
      for (const [k, v] of zoomStates) if (v.exp < now) zoomStates.delete(k);
      if (zoomStates.size > 5000) zoomStates.clear();
      zoomStates.set(state, { userId: user.id, exp: now + 10 * 60_000 });
      const target = roomFor(user).zoomAuthorizeUrl(state);
      return target ? redirect(res, target) : redirect(res, '/?zoom=fehler');
    }

    if (route === '/api/zoom/zurueck' && req.method === 'GET') {
      const state = url.searchParams.get('state') ?? '';
      const entry = zoomStates.get(state);
      zoomStates.delete(state);
      const user = sessionUser(req);
      // Nur zurück in das Konto, das die Verbindung gestartet hat (und nur innerhalb von 10 Minuten).
      if (!entry || entry.exp < Date.now() || !user || user.id !== entry.userId || user.status !== 'aktiv') {
        return redirect(res, '/?zoom=abgelaufen');
      }
      if (url.searchParams.get('error') || !url.searchParams.get('code')) return redirect(res, '/?zoom=abgebrochen');
      try {
        await roomFor(user).zoomConnectCode(url.searchParams.get('code'));
        return redirect(res, '/?zoom=verbunden');
      } catch (e) {
        log(`Zoom-Verbindung für ein Konto fehlgeschlagen: ${e.message}`);
        return redirect(res, '/?zoom=fehler');
      }
    }

    if (route === '/api/zoom/ereignis' && req.method === 'POST') {
      const raw = await readRaw(req);
      if (!zoomSignatureOk(ZOOM_WEBHOOK_SECRET, req.headers, raw)) return json(res, 401, { fehler: 'Signatur ungültig.' });
      const body = JSON.parse(raw);
      if (body.event === 'endpoint.url_validation') {
        const plainToken = String(body.payload?.plainToken ?? '');
        const encryptedToken = crypto.createHmac('sha256', ZOOM_WEBHOOK_SECRET).update(plainToken).digest('hex');
        return json(res, 200, { plainToken, encryptedToken });
      }
      if (body.event === 'app_deauthorized') {
        const zoomUserId = String(body.payload?.user_id ?? '');
        const hits = zoomUserId ? accountsWithZoomUser(zoomUserId) : [];
        for (const u of hits) {
          const room = rooms.get(u.id);
          if (room) await room.zoomForget();
          else await fsp.rm(path.join(accountDir(u.id), 'zoom-anmeldung.json'), { force: true });
        }
        log(`Zoom: App wurde von einem Zoom-Konto entfernt, Anmeldung bei ${hits.length} Konto/Konten gelöscht.`);
      }
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { fehler: 'Nicht gefunden.' });
  } catch (e) {
    log(`Zoom-Schnittstelle: ${e.message}`);
    if (!res.headersSent) json(res, 400, { fehler: 'Ungültige Anfrage.' });
  }
}

// ------------------------------------------------------------- Hauptseite (Web)
/** Dateien der Hauptseite: /_web/medien/… (hochgeladen) und /_web/… (Schrift, Logos, Stil aus website/assets). */
function serveWebFile(req, res, url) {
  const rel = decodeURIComponent(url.pathname.slice('/_web/'.length));
  if (rel.startsWith('medien/')) {
    const file = website?.mediaFile(rel.slice('medien/'.length));
    if (!file) return res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': ext === '.webp' ? 'image/webp' : (MIME[ext] ?? 'application/octet-stream'),
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      // Hochgeladene Dateien nie als aktive Inhalte ausführen (wichtig für SVG)
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    fs.createReadStream(file).pipe(res);
    return;
  }
  const file = path.normalize(path.join(WEBSITE_ASSETS, rel));
  if (!file.startsWith(WEBSITE_ASSETS + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
  }
  sendFile(res, file, req);
}

/** Öffentliche Hauptseite ausliefern. */
async function serveWebsite(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  const host = String(req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
  if (host === `www.${MAIN_HOST}`) return res.writeHead(301, { Location: `${MAIN_URL}${url.pathname}${url.search}` }).end();
  await website.ready;
  const r = website.serve(decodeURIComponent(url.pathname));
  if (r.location) return res.writeHead(r.status, { Location: r.location }).end();
  res.writeHead(r.status, {
    'Content-Type': r.type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(req.method === 'HEAD' ? undefined : r.body);
}

/** Verwaltung der Hauptseite (nur Konten mit Verwaltungsrechten). */
async function handleWebsiteApi(req, res, url) {
  const route = url.pathname;
  try {
    const user = sessionUser(req);
    if (!user?.admin || user.status !== 'aktiv') return json(res, 403, { fehler: 'Nur für die Verwaltung.' });
    if (req.method !== 'GET' && !originAllowed(req.headers.origin)) return json(res, 403, { fehler: 'Anfrage abgelehnt.' });
    const needJson = () => {
      if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new WebsiteError('Anfrage abgelehnt.', 403);
    };
    await website.ready;

    if (route === '/api/website' && req.method === 'GET') {
      return json(res, 200, { ...website.state(), symbole: ICONS, blocktypen: BLOCK_TYPES, siteUrl: MAIN_URL, studioUrl: PUBLIC_URL, medienMax: MEDIA_MAX });
    }
    // ----- E-Mail-Vorlagen
    if (route === '/api/website/mails' && req.method === 'GET') return json(res, 200, mailTemplates.state());
    if (route === '/api/website/mails' && req.method === 'PUT') {
      needJson();
      await mailTemplates.save(await readJson(req, 512 * 1024));
      return json(res, 200, mailTemplates.state());
    }
    if (route === '/api/website/mails/vorschau' && req.method === 'POST') {
      needJson();
      const body = await readJson(req, 512 * 1024);
      const id = String(body.id ?? '');
      const vars = mailTemplates.sampleVars(id, { name: user.name || 'Anna Beispiel', email: user.email });
      return json(res, 200, mailTemplates.render(id, vars, body.vorlage ?? null, body.fuss ?? null));
    }
    if (route === '/api/website/mails/test' && req.method === 'POST') {
      needJson();
      const body = await readJson(req, 512 * 1024);
      const id = String(body.id ?? '');
      const vars = mailTemplates.sampleVars(id, { name: user.name || '', email: user.email });
      const mail = mailTemplates.render(id, vars, body.vorlage ?? null, body.fuss ?? null);
      try {
        await mailer.send({ to: user.email, ...mail, subject: `[Test] ${mail.subject}` });
      } catch (e) {
        throw new WebsiteError(`Testmail nicht gesendet: ${e.message}`, 502);
      }
      return json(res, 200, { ok: true, an: user.email });
    }
    if (route === '/api/website/vorschau' && req.method === 'GET') {
      const html = await website.preview(url.searchParams.get('pfad') ?? '/');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(html);
    }
    if (route === '/api/website/entwurf' && req.method === 'PUT') {
      needJson();
      return json(res, 200, await website.saveDraft(await readJson(req, 4 * 1024 * 1024)));
    }
    if (route === '/api/website/veroeffentlichen' && req.method === 'POST') {
      needJson();
      const r = await website.publish();
      return json(res, 200, { ...r, ...website.state() });
    }
    if (route === '/api/website/verwerfen' && req.method === 'POST') {
      needJson();
      await website.discard();
      return json(res, 200, website.state());
    }
    if (route === '/api/website/wiederherstellen' && req.method === 'POST') {
      needJson();
      const body = await readJson(req);
      await website.restore(body.id);
      return json(res, 200, website.state());
    }
    if (route === '/api/website/medien' && req.method === 'POST') {
      const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (!MEDIA_TYPES[mime]) throw new WebsiteError('Dieses Dateiformat wird nicht unterstützt. Erlaubt: PNG, JPG, WebP, GIF, SVG, ICO.', 415);
      const chunks = [];
      let size = 0;
      await new Promise((resolve, reject) => {
        req.on('data', (c) => {
          size += c.length;
          if (size > MEDIA_MAX) {
            reject(new WebsiteError('Die Datei ist zu groß (höchstens 8 MB).', 413));
            req.destroy();
          } else chunks.push(c);
        });
        req.on('end', resolve);
        req.on('error', reject);
      });
      let original = '';
      try {
        original = decodeURIComponent(String(req.headers['x-dateiname'] ?? ''));
      } catch {
        original = '';
      }
      const r = await website.addMedia(Buffer.concat(chunks), mime, original);
      return json(res, 200, { ...r, medien: website.media() });
    }
    if (route.startsWith('/api/website/medien/') && req.method === 'DELETE') {
      await website.removeMedia(decodeURIComponent(route.slice('/api/website/medien/'.length)));
      return json(res, 200, { medien: website.media() });
    }
    return json(res, 404, { fehler: 'Nicht gefunden.' });
  } catch (e) {
    if (e instanceof WebsiteError || e instanceof AccountError) return json(res, e.status ?? 400, { fehler: e.message });
    log(`Website-Verwaltung: ${e.message}`);
    if (!res.headersSent) json(res, 500, { fehler: 'Speichern nicht möglich. Bitte erneut versuchen.' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!hostAllowed(req.headers.host)) {
    res.writeHead(404).end();
    return;
  }
  if (url.pathname.startsWith('/_web/') && (req.method === 'GET' || req.method === 'HEAD')) {
    serveWebFile(req, res, url);
    return;
  }
  if (WEB && isMainHost(req.headers.host)) {
    serveWebsite(req, res, url).catch((e) => {
      log(`Hauptseite: ${e.message}`);
      if (!res.headersSent) res.writeHead(500).end();
    });
    return;
  }
  if (WEB && (url.pathname === '/api/website' || url.pathname.startsWith('/api/website/'))) {
    handleWebsiteApi(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/aktion/') && (req.method === 'GET' || req.method === 'POST')) {
    handleAction(req, res, decodeURIComponent(url.pathname.slice('/aktion/'.length)));
    return;
  }
  if (WEB && (url.pathname.startsWith('/api/konto/') || url.pathname.startsWith('/api/verwaltung/') || url.pathname === '/api/modus')) {
    handleAccountApi(req, res, url);
    return;
  }
  if (WEB && url.pathname.startsWith('/api/zoom/')) {
    handleZoomApi(req, res, url);
    return;
  }
  if (!WEB && url.pathname === '/api/modus') return json(res, 200, { web: false });
  if (!WEB && url.pathname === '/teams/anmelden' && req.method === 'GET') {
    const target = localRoom.teamsAccount.authorizeUrl();
    if (!target) return teamsCallbackPage(res, false, 'TEAMS_CLIENT_ID fehlt in .env.local. Danach die App neu starten.');
    res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' }).end();
    return;
  }
  if (!WEB && url.pathname === '/teams/anmeldung' && req.method === 'GET') {
    localRoom.teamsAccount
      .handleCallback(url.searchParams)
      .then(() => teamsCallbackPage(res, true, 'Deine Teams-Besprechungen erscheinen jetzt in MeetingBackstage.'))
      .catch((e) => teamsCallbackPage(res, false, e.message))
      .finally(localRoom.broadcastTeams);
    return;
  }
  if (url.pathname === '/api/status') {
    // Im Web-Modus nur ein Lebenszeichen (für die Ausfall-Überwachung), keine Daten.
    if (WEB) return json(res, 200, { ok: true, version: APP_VERSION });
    return json(res, 200, { ok: true, ...localRoom.counts(), savedAt: localRoom.savedAt(), regie: localRoom.regieStatus() });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  // Zoom Meeting SDK aus node_modules (zoom-meeting.min.js zeigt auf die installierte Version).
  if (url.pathname.startsWith('/zoom-sdk/')) {
    let rel = decodeURIComponent(url.pathname.slice('/zoom-sdk/'.length));
    // /zoom-sdk/<version>/… : Versionsnummer im Pfad, damit nach einem Update nichts Altes aus dem Browser-Cache kommt.
    if (SDK_VERSION && rel.startsWith(`${SDK_VERSION}/`)) rel = rel.slice(SDK_VERSION.length + 1);
    if (rel === 'zoom-meeting.min.js' && SDK_MAIN) rel = SDK_MAIN;
    const file = path.normalize(path.join(SDK_DIST, rel));
    if (!file.startsWith(SDK_DIST + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
      else sendFile(res, file, req);
    });
    return;
  }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Die App ist noch nicht gebaut. Bitte „npm start“ verwenden (baut und startet) oder „npm run build“ ausführen.');
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  if (pathname === '/ausgabe') pathname = '/ausgabe.html';
  if (pathname === '/regie') pathname = '/regie.html';
  const file = path.normalize(path.join(DIST, pathname));
  if (!file.startsWith(DIST + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
      return;
    }
    sendFile(res, file, req);
  });
});

// ------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });

function refuse(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/sync' || !hostAllowed(req.headers.host) || !originAllowed(req.headers.origin)) {
    socket.destroy();
    return;
  }
  const rolle = url.searchParams.get('rolle');
  let room = localRoom;
  let extra = {};
  if (WEB) {
    // Steuerung, Regie und Vorschau brauchen die Anmeldung; OBS-Quellen den geheimen Schlüssel ihrer Adresse.
    const fromKey = rolle === 'ausgabe' || rolle === 'vorschau' ? accounts.byOutputKey(url.searchParams.get('k') ?? '') : null;
    const user = (fromKey?.status === 'aktiv' ? fromKey : null) ?? sessionUser(req);
    if (!user) return refuse(socket, 401, 'Unauthorized');
    room = roomFor(user);
    extra = { konto: publicUser(user) };
  }
  wss.handleUpgrade(req, socket, head, (ws) => room.attach(ws, rolle, extra));
});

// ------------------------------------------------------------------ Start
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist belegt. Läuft MeetingBackstage Studio schon? Sonst mit PORT=4301 npm start einen anderen Port wählen.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const base = WEB ? PUBLIC_URL : `http://localhost:${PORT}`;
  console.log('');
  console.log(`  MeetingBackstage Studio läuft${WEB ? ' im Web-Modus (Kundenkonten)' : ''}`);
  console.log(`  Version:           ${APP_VERSION}${SDK_VERSION ? ` · Zoom SDK ${SDK_VERSION}` : ''}`);
  console.log(`  Steuerung:         ${base}/`);
  if (WEB) {
    console.log(`  Konten:            ${accounts.count()} · Verwaltung: ${ADMIN_EMAILS.length ? ADMIN_EMAILS.join(', ') : 'keine (MB_ADMIN_EMAILS setzen)'}`);
    console.log(
      MAIL_VIA === 'smtp'
        ? `  E-Mails:           Versand über ${SMTP.host} als ${MAIL_FROM}`
        : MAIL_VIA === 'brevo'
          ? `  E-Mails:           Versand über Brevo als ${MAIL_FROM}`
          : `  E-Mails:           ohne Versanddienst, stehen in ${path.join(WEB_DIR, 'mails.log')}`,
    );
    if (MAIL_VIA === 'brevo' && !MAIL_BREVO_KEY.startsWith('xkeysib-')) {
      console.log('  WARNUNG:           MB_MAIL_BREVO_KEY sieht nicht wie ein Brevo-API-Schlüssel aus (beginnt nicht mit „xkeysib-“). Mails werden fehlschlagen.');
    }
  } else {
    console.log(`  OBS-Browserquelle: ${base}/ausgabe.html?grafik=programm`);
    console.log('  Weitere Ausgabe-Adressen stehen in der App unter „OBS-Ausgabe“.');
  }
  const st = localRoom?.regieStatus() ?? null;
  if (st) {
    console.log(
      !st.sdkInstalled
        ? '  Zoom-Live-Chat:    Zoom Meeting SDK fehlt, bitte „npm install“ ausführen'
        : st.missing.length
          ? `  Zoom-Live-Chat:    noch nicht eingerichtet (fehlt in .env.local: ${st.missing.join(', ')})`
          : `  Zoom-Live-Chat:    bereit, Regie-Fenster tritt als „${REGIE_NAME}“ bei`,
    );
    if (TEAMS_CLIENT_ID) console.log('  Teams-Live-Chat:   eingerichtet (Anmeldung in der App unter „Meeting“)');
  }
  console.log(`  Beenden mit ${process.platform === 'darwin' ? 'ctrl + C' : 'Strg + C'}`);
  console.log('');
});

const shutdown = () => {
  localRoom?.close();
  for (const room of rooms.values()) room.close();
  wss.clients.forEach((ws) => ws.close());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
