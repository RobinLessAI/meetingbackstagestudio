// MeetingBackstage Studio – lokaler Server
//
// - liefert die App und die OBS-Ausgabeseiten aus (nur auf diesem Rechner erreichbar)
// - gleicht die Grafiken per WebSocket zwischen Steuerung und OBS-Browserquellen ab
// - speichert den Stand der Veranstaltung in daten/veranstaltung.json
// - beobachtet auf Wunsch den Zoom-Ordner und meldet neu gespeicherte Chat-Dateien
//
// Start: npm start (baut die App und startet den Server)
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRtms, urlValidationResponse, verifyWebhook } from './rtms.mjs';

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
const ZOOM_WEBHOOK_SECRET_TOKEN = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '';

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

// ----------------------------------------------------- Live-Chat aus Zoom
const liveChat = []; // zuletzt empfangene Nachrichten, damit eine neu geladene Steuerung nichts verpasst
const rtms = createRtms({
  clientId: ZOOM_CLIENT_ID,
  clientSecret: ZOOM_CLIENT_SECRET,
  log,
  onChat: (chat) => {
    const message = {
      key: `rtms:${chat.streamId}:${chat.seq}`,
      senderName: chat.sender,
      text: chat.text,
      at: chat.at,
    };
    liveChat.push(message);
    if (liveChat.length > 2000) liveChat.shift();
    broadcast('steuerung', { type: 'live-chat', messages: [message] });
  },
  onStatus: (status) => broadcast('steuerung', { type: 'rtms-status', status: rtmsStatus(status) }),
});

/** Status für die App, inklusive der Frage, ob alles eingerichtet ist. */
function rtmsStatus(status = rtms.status()) {
  return {
    ...status,
    configured: Boolean(ZOOM_CLIENT_ID && ZOOM_CLIENT_SECRET && ZOOM_WEBHOOK_SECRET_TOKEN),
    missing: [
      !ZOOM_CLIENT_ID && 'ZOOM_CLIENT_ID',
      !ZOOM_CLIENT_SECRET && 'ZOOM_CLIENT_SECRET',
      !ZOOM_WEBHOOK_SECRET_TOKEN && 'ZOOM_WEBHOOK_SECRET_TOKEN',
    ].filter(Boolean),
    lastWebhookAt,
  };
}
let lastWebhookAt = null;

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
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

async function handleWebhook(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch {
    res.writeHead(413).end();
    return;
  }
  if (!verifyWebhook(ZOOM_WEBHOOK_SECRET_TOKEN, raw, req.headers)) {
    log('Webhook mit ungültiger Signatur abgelehnt.');
    res.writeHead(401).end();
    return;
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400).end();
    return;
  }
  lastWebhookAt = Date.now();
  if (body.event === 'endpoint.url_validation') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(urlValidationResponse(ZOOM_WEBHOOK_SECRET_TOKEN, body.payload?.plainToken ?? '')));
    log('Zoom hat die Webhook-Adresse erfolgreich geprüft.');
    broadcast('steuerung', { type: 'rtms-status', status: rtmsStatus() });
    return;
  }
  // Zoom erwartet eine sofortige Antwort; die Verbindung wird danach aufgebaut.
  res.writeHead(200).end();
  if (body.event === 'meeting.rtms_started') rtms.start(body.payload ?? {});
  else if (body.event === 'meeting.rtms_stopped') rtms.stop(body.payload ?? {});
}

/** Anfragen über den Tunnel (fremder Hostname) dürfen nur den Webhook erreichen. */
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
  if (url.pathname === '/zoom/webhook' && req.method === 'POST') {
    handleWebhook(req, res);
    return;
  }
  if (!isLocalHost(req.headers.host)) {
    res.writeHead(404).end();
    return;
  }
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, ...counts(), savedAt: saved?.savedAt ?? null, rtms: rtmsStatus() }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
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
const roles = new Map(); // ws -> 'steuerung' | 'ausgabe'

function counts() {
  let steuerungen = 0;
  let ausgaben = 0;
  for (const role of roles.values()) role === 'ausgabe' ? ausgaben++ : steuerungen++;
  return { steuerungen, ausgaben };
}

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
  const role = rolle === 'ausgabe' ? 'ausgabe' : 'steuerung';
  roles.set(ws, role);
  if (role === 'ausgabe') {
    if (lastSnapshot) send(ws, { type: 'snapshot', snapshot: lastSnapshot });
  } else {
    send(ws, { type: 'hello', saved, ...counts(), watch: watchStatus(), rtms: rtmsStatus() });
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
    broadcastCounts();
  });
});

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
  const st = rtmsStatus();
  console.log(
    st.configured
      ? `  Zoom-Live-Chat:    eingerichtet, Webhook-Pfad /zoom/webhook (über den Tunnel erreichbar machen)`
      : `  Zoom-Live-Chat:    noch nicht eingerichtet (fehlt in .env.local: ${st.missing.join(', ')})`,
  );
  console.log('  Beenden mit Strg+C');
  console.log('');
});

const shutdown = () => {
  stopWatch(false);
  rtms.close();
  wss.clients.forEach((ws) => ws.close());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
