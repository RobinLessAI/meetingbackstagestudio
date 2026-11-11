// MeetingBackstage Studio – lokaler Server
//
// - liefert die App und die OBS-Ausgabeseiten aus (nur auf diesem Rechner erreichbar)
// - gleicht die Grafiken per WebSocket zwischen Steuerung und OBS-Browserquellen ab
// - speichert den Stand der Veranstaltung in daten/veranstaltung.json
// - beobachtet auf Wunsch den Zoom-Ordner und meldet neu gespeicherte Chat-Dateien
// - stellt das Regie-Fenster bereit, das dem Meeting über das Zoom Meeting SDK
//   als zusätzlicher Teilnehmer beitritt und den Chat live weitergibt
//
// Start: npm start (baut die App und startet den Server)
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { meetingSignature, normalizeAttendees, normalizeSdkChat, parseMeetingLink, spotlightError } from './meetingSdk.mjs';
import { resetAnswers } from './resetAnswers.mjs';
import { createZoomAccount } from './zoomAccount.mjs';
import { createTeamsAccount, createTeamsLive } from './teams.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = process.env.MB_DATA_DIR ? path.resolve(process.env.MB_DATA_DIR) : path.join(ROOT, 'daten');
const SAVE_FILE = path.join(DATA_DIR, 'veranstaltung.json');
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
const ZOOM_REDIRECT_URI = process.env.ZOOM_REDIRECT_URI ?? '';
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
const REGIE_STAND = 5;
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
const HOST = '127.0.0.1';
const MAX_MESSAGE = 8 * 1024 * 1024;
const MAX_CHAT_FILE = 5 * 1024 * 1024;

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

// ------------------------------------------------------------------ Zustand
let lastSnapshot = null;
let saved = null;
try {
  saved = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  // Jeder Neustart beginnt ohne Antworten; Einstellungen und Fragen bleiben.
  if (saved?.state) {
    saved = { savedAt: Date.now(), state: resetAnswers(saved.state) };
    fs.writeFileSync(SAVE_FILE, JSON.stringify(saved));
    log(`Veranstaltung „${saved.state.session?.title ?? ''}“ geladen, Antworten der letzten Sitzung zurückgesetzt.`);
  }
} catch {
  saved = null;
}

// Eigene Vorlagen für das Aussehen (unabhängig von der Veranstaltung)
const TEMPLATE_FILE = path.join(DATA_DIR, 'vorlagen.json');
let templates = [];
try {
  const raw = JSON.parse(fs.readFileSync(TEMPLATE_FILE, 'utf8'));
  if (Array.isArray(raw)) templates = raw;
} catch {
  templates = [];
}

async function writeTemplates(list) {
  // Nur gültige Einträge, höchstens 200, damit die Datei überschaubar bleibt.
  const clean = (Array.isArray(list) ? list : [])
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.kind === 'string' && t.data && typeof t.data === 'object')
    .slice(0, 200)
    .map((t) => ({ id: t.id.slice(0, 64), name: t.name.slice(0, 60), kind: t.kind.slice(0, 20), data: t.data, at: Number(t.at) || Date.now() }));
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${TEMPLATE_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(clean, null, 1));
  await fsp.rename(tmp, TEMPLATE_FILE);
  templates = clean;
}

async function writeSave(state) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const payload = { savedAt: Date.now(), state };
  const tmp = `${SAVE_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(payload));
  await fsp.rename(tmp, SAVE_FILE);
  saved = payload;
  return payload.savedAt;
}

// ------------------------------------------- Aktionen für Stream Deck & Co.
// Ein Stream Deck (oder jedes andere Gerät auf diesem Rechner) ruft z. B.
// http://localhost:4300/aktion/karte-anzeigen?schluessel=… auf. Der Schlüssel
// verhindert, dass beliebige Webseiten im Browser Aktionen auslösen.
const ACTION_KEY_FILE = path.join(DATA_DIR, 'aktion-schluessel.txt');
const ACTION_KEY = (() => {
  try {
    const k = fs.readFileSync(ACTION_KEY_FILE, 'utf8').trim();
    if (/^[a-f0-9]{8,}$/.test(k)) return k;
  } catch {
    /* neu erzeugen */
  }
  const k = crypto.randomBytes(5).toString('hex');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ACTION_KEY_FILE, k, { mode: 0o600 });
  } catch {
    /* dann nur für diesen Start gültig */
  }
  return k;
})();

function handleAction(req, res, id) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (url.searchParams.get('schluessel') !== ACTION_KEY) return json(403, { ok: false, fehler: 'Schlüssel fehlt oder ist falsch.' });
  if (!/^[a-z0-9-]{2,40}$/.test(id)) return json(400, { ok: false, fehler: 'Unbekannte Aktion.' });
  // Nur an eine Steuerung schicken (die zuletzt geöffnete), sonst würde doppelt umgeschaltet.
  const target = [...roles.entries()].filter(([, r]) => r === 'steuerung').map(([ws]) => ws).pop();
  if (!target) return json(409, { ok: false, fehler: 'Die Steuerung ist nicht geöffnet. Bitte http://localhost:' + PORT + ' im Browser öffnen.' });
  send(target, { type: 'aktion', id });
  json(200, { ok: true, aktion: id });
}

// --------------------------------------------- Zoom-Konto (eigene Meetings)
const zoomAccount = createZoomAccount({
  clientId: ZOOM_CLIENT_ID,
  clientSecret: ZOOM_CLIENT_SECRET,
  redirectUri: ZOOM_REDIRECT_URI,
  dataDir: DATA_DIR,
  log,
  oauthBase: process.env.MB_ZOOM_OAUTH_BASE,
  apiBase: process.env.MB_ZOOM_API_URL,
});

// ----------------------------------------------- Live-Chat über das Regie-Fenster
const liveChat = []; // zuletzt empfangene Nachrichten, damit eine neu geladene Steuerung nichts verpasst
const liveKeys = new Set();
let regie = { state: 'bereit', meeting: null, since: null, messages: 0, error: null };
let rawLogged = 0;

/** Status für die App, inklusive der Frage, ob alles eingerichtet ist. */
function regieStatus() {
  return {
    ...regie,
    name: REGIE_NAME,
    account: zoomAccount.status(),
    appVersion: APP_VERSION,
    sdkVersion: SDK_VERSION,
    configured: Boolean(ZOOM_CLIENT_ID && ZOOM_CLIENT_SECRET && SDK_MAIN),
    sdkInstalled: Boolean(SDK_MAIN),
    missing: [!ZOOM_CLIENT_ID && 'ZOOM_CLIENT_ID', !ZOOM_CLIENT_SECRET && 'ZOOM_CLIENT_SECRET'].filter(Boolean),
  };
}

function setRegie(patch) {
  regie = { ...regie, ...patch };
  broadcast('steuerung', { type: 'regie-status', status: regieStatus() });
}

function handleRegieChat(data) {
  // Die ersten Nachrichten im Rohformat protokollieren, falls Zoom das Format ändert.
  if (rawLogged < 3) {
    rawLogged += 1;
    log(`Regie: Chat-Rohdaten von Zoom: ${JSON.stringify(data).slice(0, 400)}`);
  }
  const chat = normalizeSdkChat(data);
  if (!chat) {
    // Nicht erkannte Nachrichten immer zeigen, damit sich das Format nachvollziehen lässt.
    log(`Regie: Chat-Nachricht nicht erkannt: ${JSON.stringify(data).slice(0, 400)}`);
    return;
  }
  if (chat.private) {
    log(`Regie: private Nachricht von ${chat.senderName} nicht übernommen.`);
    return;
  }
  if (!pushLive(chat)) return;
  regie.messages += 1;
  broadcast('steuerung', { type: 'regie-status', status: regieStatus() });
}

// ------------------------------------------------ Teilnehmende und Spotlight in Zoom
let zoomPeople = { list: [], spotlight: [], spotlightKnown: false, role: 'unbekannt', at: null };
const handSince = new Map(); // userId -> Zeitpunkt, seit dem die Hand oben ist
let attendeesLogged = false;
let requestSeq = 0;
const pendingRequests = new Map(); // requestId -> { ws, label }

function peopleStatus() {
  return { ...zoomPeople, list: zoomPeople.list.map((u) => ({ ...u, handSince: handSince.get(u.userId) ?? null })) };
}
const broadcastPeople = () => broadcast('steuerung', { type: 'zoom-teilnehmende', status: peopleStatus() });

function handleAttendees(msg) {
  if (!attendeesLogged && Array.isArray(msg.list) && msg.list.length) {
    attendeesLogged = true;
    log(`Regie: Teilnehmende im Rohformat: ${JSON.stringify(msg.list[0]).slice(0, 300)} · Regie: ${JSON.stringify(msg.self ?? null).slice(0, 200)}`);
  }
  const next = normalizeAttendees(msg.list, msg.self, msg.spotlight);
  // Kennt diese SDK-Version keine Spotlight-Liste, die zuletzt bekannte behalten.
  if (!next.spotlightKnown) next.spotlight = zoomPeople.spotlight.filter((id) => next.list.some((u) => u.userId === id));
  const now = Date.now();
  for (const u of next.list) {
    if (u.hand && !handSince.has(u.userId)) handSince.set(u.userId, now);
    if (!u.hand) handSince.delete(u.userId);
  }
  for (const id of [...handSince.keys()]) if (!next.list.some((u) => u.userId === id)) handSince.delete(id);
  zoomPeople = { ...next, at: now };
  broadcastPeople();
}

/** Spotlight in Zoom setzen: ops = [{ operate: 'add' | 'replace' | 'remove', userId }]. */
function sendSpotlight(ws, ops, label) {
  const regieWs = [...roles.entries()].find(([, r]) => r === 'regie')?.[0];
  if (!regieWs || regie.state !== 'verbunden') {
    send(ws, { type: 'zoom-aktion', ok: false, message: 'Die Regie ist nicht im Meeting. Zuerst auf der Seite „Meeting“ beitreten.' });
    return;
  }
  if (zoomPeople.role === 'teilnehmer') {
    send(ws, { type: 'zoom-aktion', ok: false, message: spotlightError('', null, 'teilnehmer') });
    return;
  }
  if (!ops.length) {
    send(ws, { type: 'zoom-aktion', ok: true, message: label });
    return;
  }
  const requestId = `s${++requestSeq}`;
  pendingRequests.set(requestId, { ws, label });
  setTimeout(() => pendingRequests.delete(requestId), 15_000).unref?.();
  send(regieWs, { type: 'regie-spotlight', requestId, ops });
}

/** Neue Live-Nachricht (Zoom oder Teams) an alle Steuerungen; false, wenn schon bekannt. */
function pushLive(chat) {
  if (liveKeys.has(chat.key)) return false;
  liveKeys.add(chat.key);
  const message = { key: chat.key, senderName: chat.senderName, text: chat.text, at: chat.at };
  liveChat.push(message);
  if (liveChat.length > 2000) liveKeys.delete(liveChat.shift().key);
  broadcast('steuerung', { type: 'live-chat', messages: [message] });
  return true;
}

// ------------------------------------------------------------- Microsoft Teams
const teamsAccount = createTeamsAccount({
  clientId: TEAMS_CLIENT_ID,
  tenant: TEAMS_TENANT_ID,
  redirectUri: `http://localhost:${PORT}/teams/anmeldung`,
  dataDir: DATA_DIR,
  log,
  loginBase: process.env.MB_TEAMS_LOGIN_URL,
  graphBase: process.env.MB_TEAMS_GRAPH_URL,
});
const teamsLive = createTeamsLive({
  account: teamsAccount,
  log,
  receiverPort: TEAMS_RECEIVER_PORT,
  publicUrl: TEAMS_PUBLIC_URL,
  onMessage: (m) => pushLive(m),
  onStatus: () => broadcast('steuerung', { type: 'teams-status', status: teamsStatus() }),
});
function teamsStatus() {
  return { ...teamsAccount.status(), live: teamsLive.status() };
}
const broadcastTeams = () => broadcast('steuerung', { type: 'teams-status', status: teamsStatus() });

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

/** Beitrittsdaten für das Regie-Fenster (Signatur wird hier erzeugt, das Geheimnis bleibt lokal). */
function regieJoin(meetingInput, passcodeInput) {
  const st = regieStatus();
  if (!st.sdkInstalled) throw new Error('Das Zoom Meeting SDK fehlt. Bitte im Terminal „npm install“ ausführen und neu starten.');
  if (st.missing.length) throw new Error(`In .env.local fehlt: ${st.missing.join(', ')}.`);
  const { meetingId, passcode } = parseMeetingLink(meetingInput);
  if (!meetingId) throw new Error('Keine gültige Meeting-ID erkannt. Bitte den Zoom-Link oder die 9- bis 11-stellige Nummer einfügen.');
  return {
    sdkKey: ZOOM_CLIENT_ID,
    signature: meetingSignature({ clientId: ZOOM_CLIENT_ID, clientSecret: ZOOM_CLIENT_SECRET, meetingNumber: meetingId }),
    meetingNumber: meetingId,
    passWord: String(passcodeInput ?? '').trim() || passcode,
    userName: REGIE_NAME,
  };
}

/** Nur Anfragen an localhost beantworten (Schutz gegen DNS-Rebinding). */
function isLocalHost(hostHeader) {
  const host = String(hostHeader ?? '').replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
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
  };
  if (!immutable && ext !== '.html' && req?.headers['if-modified-since'] === lastModified) {
    res.writeHead(304, headers).end();
    return;
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!isLocalHost(req.headers.host)) {
    res.writeHead(404).end();
    return;
  }
  if (url.pathname.startsWith('/aktion/') && (req.method === 'GET' || req.method === 'POST')) {
    handleAction(req, res, decodeURIComponent(url.pathname.slice('/aktion/'.length)));
    return;
  }
  if (url.pathname === '/teams/anmelden' && req.method === 'GET') {
    const target = teamsAccount.authorizeUrl();
    if (!target) return teamsCallbackPage(res, false, 'TEAMS_CLIENT_ID fehlt in .env.local. Danach die App neu starten.');
    res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' }).end();
    return;
  }
  if (url.pathname === '/teams/anmeldung' && req.method === 'GET') {
    teamsAccount
      .handleCallback(url.searchParams)
      .then(() => teamsCallbackPage(res, true, 'Deine Teams-Besprechungen erscheinen jetzt in MeetingBackstage.'))
      .catch((e) => teamsCallbackPage(res, false, e.message))
      .finally(broadcastTeams);
    return;
  }
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, ...counts(), savedAt: saved?.savedAt ?? null, regie: regieStatus() }));
    return;
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
const roles = new Map(); // ws -> 'steuerung' | 'ausgabe' | 'regie'

function counts() {
  let steuerungen = 0;
  let ausgaben = 0;
  for (const role of roles.values()) {
    if (role === 'ausgabe') ausgaben++;
    else if (role === 'steuerung') steuerungen++;
  }
  return { steuerungen, ausgaben };
}
const hasRole = (role) => [...roles.values()].includes(role);

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const broadcast = (role, msg) => {
  // Vorschau-Fenster in der App erhalten dasselbe wie OBS-Ausgaben, zählen aber nicht mit.
  for (const [ws, r] of roles) if (r === role || (role === 'ausgabe' && r === 'vorschau')) send(ws, msg);
};
const broadcastCounts = () => broadcast('steuerung', { type: 'clients', ...counts() });

/** Nur Verbindungen von diesem Rechner (oder ohne Origin, z. B. OBS) zulassen. */
function originAllowed(origin) {
  if (!origin || origin === 'null') return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/sync' || !isLocalHost(req.headers.host) || !originAllowed(req.headers.origin)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, url.searchParams.get('rolle')));
});

wss.on('connection', (ws, rolle) => {
  const role = rolle === 'ausgabe' || rolle === 'regie' || rolle === 'vorschau' ? rolle : 'steuerung';
  roles.set(ws, role);
  if (role === 'ausgabe' || role === 'vorschau') {
    if (lastSnapshot) send(ws, { type: 'snapshot', snapshot: lastSnapshot });
  } else if (role === 'steuerung') {
    send(ws, { type: 'hello', saved, ...counts(), watch: watchStatus(), regie: regieStatus(), teams: teamsStatus(), zoomTeilnehmende: peopleStatus(), aktionSchluessel: ACTION_KEY, vorlagen: templates });
    if (liveChat.length) send(ws, { type: 'live-chat', messages: liveChat });
  }
  broadcastCounts();

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (role === 'regie') {
      handleRegieMessage(ws, msg);
      return;
    }
    if (role !== 'steuerung') return;
    switch (msg.type) {
      case 'snapshot':
        lastSnapshot = msg.snapshot;
        broadcast('ausgabe', { type: 'snapshot', snapshot: lastSnapshot });
        break;
      case 'vorlagen':
        try {
          await writeTemplates(msg.vorlagen);
          broadcast('steuerung', { type: 'vorlagen', vorlagen: templates });
        } catch (e) {
          send(ws, { type: 'error', message: `Vorlagen konnten nicht gespeichert werden: ${e.message}` });
        }
        break;
      case 'save':
        try {
          const savedAt = await writeSave(msg.state);
          send(ws, { type: 'saved', savedAt });
        } catch (e) {
          send(ws, { type: 'error', message: `Speichern fehlgeschlagen: ${e.message}` });
        }
        break;
      case 'zoom-auth-url':
        send(ws, { type: 'zoom-auth-url', url: zoomAccount.authorizeUrl() });
        break;
      case 'zoom-connect':
        try {
          await zoomAccount.connect(msg.input);
          send(ws, { type: 'zoom-result', ok: true, message: 'Mit dem Zoom-Konto verbunden.' });
        } catch (e) {
          send(ws, { type: 'zoom-result', ok: false, message: e.message });
        }
        broadcast('steuerung', { type: 'regie-status', status: regieStatus() });
        break;
      case 'zoom-disconnect':
        await zoomAccount.disconnect();
        broadcast('steuerung', { type: 'regie-status', status: regieStatus() });
        break;
      case 'zoom-meetings':
        try {
          send(ws, { type: 'zoom-meetings', ok: true, meetings: await zoomAccount.listMeetings(), at: Date.now() });
        } catch (e) {
          send(ws, { type: 'zoom-meetings', ok: false, error: e.message, meetings: [] });
        }
        break;
      case 'regie-leave':
        broadcast('regie', { type: 'regie-leave' });
        break;
      case 'zoom-spotlight': {
        // Eine Person ins Spotlight (ersetzt) oder dazu (add) oder heraus (remove); userId null = alle heraus.
        const operate = msg.operate === 'add' || msg.operate === 'remove' ? msg.operate : 'replace';
        if (msg.userId === null || msg.userId === undefined) {
          sendSpotlight(ws, zoomPeople.spotlight.map((id) => ({ operate: 'remove', userId: id })), 'Spotlight aufgehoben');
          break;
        }
        const person = zoomPeople.list.find((u) => u.userId === Number(msg.userId));
        if (!person) {
          send(ws, { type: 'zoom-aktion', ok: false, message: 'Diese Person ist nicht mehr im Meeting.' });
          break;
        }
        const label =
          operate === 'remove' ? `${person.name} aus dem Spotlight genommen` : operate === 'add' ? `${person.name} zusätzlich im Spotlight` : `${person.name} im Spotlight`;
        sendSpotlight(ws, [{ operate, userId: person.userId }], label);
        break;
      }
      case 'zoom-teilnehmende-lesen':
        broadcast('regie', { type: 'regie-teilnehmende-lesen' });
        break;
      case 'teams-meetings':
        try {
          send(ws, { type: 'teams-meetings', ok: true, meetings: await teamsAccount.listMeetings(), at: Date.now() });
        } catch (e) {
          send(ws, { type: 'teams-meetings', ok: false, error: e.message, meetings: [] });
        }
        break;
      case 'teams-disconnect':
        await teamsLive.stop();
        await teamsAccount.disconnect();
        broadcastTeams();
        break;
      case 'teams-live-start':
        if (!teamsAccount.status().connected) {
          send(ws, { type: 'error', message: 'Bitte zuerst unter „Aus Microsoft Teams“ mit Microsoft anmelden.' });
          break;
        }
        teamsLive.start(String(msg.link ?? ''), String(msg.topic ?? ''));
        break;
      case 'teams-live-stop':
        await teamsLive.stop();
        break;
      case 'chat-watch':
        startWatch(msg.folder);
        break;
      case 'chat-watch-stop':
        stopWatch();
        break;
    }
  });
  ws.on('close', () => {
    roles.delete(ws);
    if (role === 'regie' && !hasRole('regie')) {
      log('Regie-Fenster geschlossen.');
      setRegie({ state: 'bereit', since: null, error: null });
      zoomPeople = { list: [], spotlight: [], spotlightKnown: false, role: 'unbekannt', at: null };
      handSince.clear();
      broadcastPeople();
    }
    broadcastCounts();
  });
});

const REGIE_STATES = new Set(['verbindet', 'wartet', 'verbunden', 'fehler', 'bereit']);

function handleRegieMessage(ws, msg) {
  switch (msg.type) {
    case 'regie-hello':
      try {
        const join = regieJoin(msg.meeting, msg.passcode);
        send(ws, { type: 'regie-join', join, version: { app: APP_VERSION, sdk: SDK_VERSION, regieStand: REGIE_STAND } });
        log(`Regie: tritt Meeting ${join.meetingNumber} als „${REGIE_NAME}“ bei …`);
        setRegie({ state: 'verbindet', meeting: join.meetingNumber, since: null, error: null });
      } catch (e) {
        send(ws, { type: 'regie-error', message: e.message, version: { app: APP_VERSION, sdk: SDK_VERSION, regieStand: REGIE_STAND } });
        setRegie({ state: 'fehler', error: e.message });
      }
      break;
    case 'regie-status': {
      if (!REGIE_STATES.has(msg.state)) return;
      const error = msg.state === 'fehler' ? String(msg.error ?? 'Unbekannter Fehler').slice(0, 300) : null;
      if (msg.state !== regie.state || error !== regie.error) {
        log(`Regie: ${msg.state}${error ? ` – ${error}` : ''}`);
        setRegie({ state: msg.state, error, since: msg.state === 'verbunden' ? Date.now() : regie.since });
        if (msg.state === 'bereit' || msg.state === 'fehler') {
          zoomPeople = { list: [], spotlight: [], spotlightKnown: false, role: 'unbekannt', at: null };
          handSince.clear();
          broadcastPeople();
        }
      }
      break;
    }
    case 'regie-teilnehmende':
      handleAttendees(msg);
      break;
    case 'regie-ergebnis': {
      const req = pendingRequests.get(String(msg.requestId ?? ''));
      pendingRequests.delete(String(msg.requestId ?? ''));
      if (!msg.ok) log(`Regie: Spotlight abgelehnt: ${JSON.stringify(msg.raw ?? msg.error).slice(0, 300)}`);
      const result = msg.ok
        ? { type: 'zoom-aktion', ok: true, message: req?.label ?? 'Erledigt' }
        : { type: 'zoom-aktion', ok: false, message: spotlightError(msg.error, msg.code, zoomPeople.role) };
      if (req) send(req.ws, result);
      else broadcast('steuerung', result);
      break;
    }
    case 'regie-chat':
      handleRegieChat(msg.data);
      break;
    case 'regie-log':
      log(`Regie: ${String(msg.text ?? '').slice(0, 400)}`);
      break;
  }
}

// ------------------------------------------------- Zoom-Ordner beobachten
const DEFAULT_FOLDERS = [
  path.join(os.homedir(), 'Documents', 'Zoom'),
  path.join(os.homedir(), 'Dokumente', 'Zoom'),
  path.join(os.homedir(), 'OneDrive', 'Documents', 'Zoom'),
  path.join(os.homedir(), 'OneDrive', 'Dokumente', 'Zoom'),
];
const CHAT_FILE = /chat.*\.txt$/i;
let watch = null; // { folder, timer, file, mtime, size, error, startedAt }

function watchStatus() {
  return watch
    ? { active: true, folder: watch.folder, file: watch.file, error: watch.error ?? null }
    : { active: false, folder: null, file: null, error: null, suggested: DEFAULT_FOLDERS.find((f) => fs.existsSync(f)) ?? DEFAULT_FOLDERS[0] };
}

async function newestChatFile(folder, depth = 3) {
  let best = null;
  async function walk(dir, level) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && level < depth) await walk(full, level + 1);
      else if (e.isFile() && CHAT_FILE.test(e.name)) {
        const stat = await fsp.stat(full).catch(() => null);
        if (stat && (!best || stat.mtimeMs > best.mtime)) best = { file: full, mtime: stat.mtimeMs, size: stat.size };
      }
    }
  }
  await walk(folder, 0);
  return best;
}

function startWatch(folderInput) {
  stopWatch(false);
  const folder = folderInput?.trim()
    ? path.resolve(folderInput.trim().replace(/^~(?=$|[\\/])/, os.homedir()))
    : (DEFAULT_FOLDERS.find((f) => fs.existsSync(f)) ?? DEFAULT_FOLDERS[0]);
  if (!fs.existsSync(folder)) {
    const error = `Ordner nicht gefunden: ${folder}`;
    broadcast('steuerung', { type: 'watch-status', active: false, folder, file: null, error });
    log(error);
    return;
  }
  watch = { folder, timer: null, file: null, mtime: 0, size: -1, error: null, startedAt: Date.now() };
  log(`Beobachte Zoom-Chats in ${folder}`);
  const tick = async () => {
    if (!watch) return;
    const found = await newestChatFile(watch.folder);
    // Nur Dateien berücksichtigen, die in den letzten 12 Stunden gespeichert wurden.
    if (!found || Date.now() - found.mtime > 12 * 3600_000) return;
    if (found.file === watch.file && found.mtime === watch.mtime && found.size === watch.size) return;
    if (found.size > MAX_CHAT_FILE) {
      watch.error = `Chat-Datei ist zu groß (${Math.round(found.size / 1024)} KB).`;
      broadcast('steuerung', { type: 'watch-status', ...watchStatus() });
      return;
    }
    const content = await fsp.readFile(found.file, 'utf8').catch(() => null);
    if (content === null || !watch) return;
    Object.assign(watch, { file: found.file, mtime: found.mtime, size: found.size, error: null });
    broadcast('steuerung', {
      type: 'chat-file',
      file: path.relative(watch.folder, found.file),
      mtime: found.mtime,
      content,
    });
    broadcast('steuerung', { type: 'watch-status', ...watchStatus() });
    log(`Chat-Datei übertragen: ${path.relative(watch.folder, found.file)}`);
  };
  watch.timer = setInterval(tick, 2000);
  tick();
  broadcast('steuerung', { type: 'watch-status', ...watchStatus() });
}

function stopWatch(announce = true) {
  if (watch?.timer) clearInterval(watch.timer);
  watch = null;
  if (announce) broadcast('steuerung', { type: 'watch-status', ...watchStatus() });
}

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
  const base = `http://localhost:${PORT}`;
  console.log('');
  console.log('  MeetingBackstage Studio läuft');
  console.log(`  Version:           ${APP_VERSION}${SDK_VERSION ? ` · Zoom SDK ${SDK_VERSION}` : ''}`);
  console.log(`  Steuerung:         ${base}/`);
  console.log(`  OBS-Browserquelle: ${base}/ausgabe.html?grafik=programm`);
  console.log('  Weitere Ausgabe-Adressen stehen in der App unter „OBS-Ausgabe“.');
  const st = regieStatus();
  console.log(
    !st.sdkInstalled
      ? '  Zoom-Live-Chat:    Zoom Meeting SDK fehlt, bitte „npm install“ ausführen'
      : st.missing.length
        ? `  Zoom-Live-Chat:    noch nicht eingerichtet (fehlt in .env.local: ${st.missing.join(', ')})`
        : `  Zoom-Live-Chat:    bereit, Regie-Fenster tritt als „${REGIE_NAME}“ bei`,
  );
  if (TEAMS_CLIENT_ID) console.log('  Teams-Live-Chat:   eingerichtet (Anmeldung in der App unter „Meeting“)');
  console.log(`  Beenden mit ${process.platform === 'darwin' ? 'ctrl + C' : 'Strg + C'}`);
  console.log('');
});

const shutdown = () => {
  stopWatch(false);
  teamsLive.close().catch(() => {});
  wss.clients.forEach((ws) => ws.close());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
