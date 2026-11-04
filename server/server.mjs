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
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { meetingSignature, normalizeSdkChat, parseMeetingLink } from './meetingSdk.mjs';

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
const REGIE_NAME = 'MeetingBackstage (Regie)';

const PORT = Number(process.env.PORT ?? 4300);
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
  log(`Gespeicherter Stand gefunden (${new Date(saved.savedAt).toLocaleString('de-DE')}).`);
} catch {
  saved = null;
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
  if (!chat) return;
  if (chat.private) {
    log(`Regie: private Nachricht von ${chat.senderName} nicht übernommen.`);
    return;
  }
  if (liveKeys.has(chat.key)) return;
  liveKeys.add(chat.key);
  const message = { key: chat.key, senderName: chat.senderName, text: chat.text, at: chat.at };
  liveChat.push(message);
  if (liveChat.length > 2000) liveKeys.delete(liveChat.shift().key);
  regie.messages += 1;
  broadcast('steuerung', { type: 'live-chat', messages: [message] });
  broadcast('steuerung', { type: 'regie-status', status: regieStatus() });
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
function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!isLocalHost(req.headers.host)) {
    res.writeHead(404).end();
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
    if (rel === 'zoom-meeting.min.js' && SDK_MAIN) rel = SDK_MAIN;
    const file = path.normalize(path.join(SDK_DIST, rel));
    if (!file.startsWith(SDK_DIST + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
      else sendFile(res, file);
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
    sendFile(res, file);
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
  for (const [ws, r] of roles) if (r === role) send(ws, msg);
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
  const role = rolle === 'ausgabe' || rolle === 'regie' ? rolle : 'steuerung';
  roles.set(ws, role);
  if (role === 'ausgabe') {
    if (lastSnapshot) send(ws, { type: 'snapshot', snapshot: lastSnapshot });
  } else if (role === 'steuerung') {
    send(ws, { type: 'hello', saved, ...counts(), watch: watchStatus(), regie: regieStatus() });
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
      case 'save':
        try {
          const savedAt = await writeSave(msg.state);
          send(ws, { type: 'saved', savedAt });
        } catch (e) {
          send(ws, { type: 'error', message: `Speichern fehlgeschlagen: ${e.message}` });
        }
        break;
      case 'regie-leave':
        broadcast('regie', { type: 'regie-leave' });
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
        send(ws, { type: 'regie-join', join });
        log(`Regie: tritt Meeting ${join.meetingNumber} als „${REGIE_NAME}“ bei …`);
        setRegie({ state: 'verbindet', meeting: join.meetingNumber, since: null, error: null });
      } catch (e) {
        send(ws, { type: 'regie-error', message: e.message });
        setRegie({ state: 'fehler', error: e.message });
      }
      break;
    case 'regie-status': {
      if (!REGIE_STATES.has(msg.state)) return;
      const error = msg.state === 'fehler' ? String(msg.error ?? 'Unbekannter Fehler').slice(0, 300) : null;
      if (msg.state !== regie.state || error !== regie.error) {
        log(`Regie: ${msg.state}${error ? ` – ${error}` : ''}`);
        setRegie({ state: msg.state, error, since: msg.state === 'verbunden' ? Date.now() : regie.since });
      }
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
  console.log(`  Steuerung:         ${base}/`);
  console.log(`  OBS-Browserquelle: ${base}/ausgabe.html?grafik=programm`);
  console.log('  Weitere Ausgabe-Adressen stehen in der App unter „Audio & Ausgabe“.');
  const st = regieStatus();
  console.log(
    !st.sdkInstalled
      ? '  Zoom-Live-Chat:    Zoom Meeting SDK fehlt, bitte „npm install“ ausführen'
      : st.missing.length
        ? `  Zoom-Live-Chat:    noch nicht eingerichtet (fehlt in .env.local: ${st.missing.join(', ')})`
        : `  Zoom-Live-Chat:    bereit, Regie-Fenster tritt als „${REGIE_NAME}“ bei`,
  );
  console.log(`  Beenden mit ${process.platform === 'darwin' ? 'ctrl + C' : 'Strg + C'}`);
  console.log('');
});

const shutdown = () => {
  stopWatch(false);
  wss.clients.forEach((ws) => ws.close());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
