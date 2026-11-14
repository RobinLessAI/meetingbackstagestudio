// Ein „Raum“ = alles, was zu einem Konto gehört: Veranstaltung, Vorlagen, Stream-Deck-Schlüssel,
// Regie im Meeting, Teilnehmende, Live-Chat und die verbundenen Fenster (Steuerung, OBS, Regie).
// Lokal gibt es genau einen Raum; im Web-Modus einen pro Kundenkonto, jeweils mit eigenem Datenordner.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { meetingSignature, normalizeAttendees, normalizeSdkChat, parseMeetingLink, spotlightError } from './meetingSdk.mjs';
import { resetAnswers } from './resetAnswers.mjs';
import { createZoomAccount } from './zoomAccount.mjs';
import { createTeamsAccount, createTeamsLive } from './teams.mjs';

const MAX_CHAT_FILE = 5 * 1024 * 1024;
const REGIE_STATES = new Set(['verbindet', 'wartet', 'verbunden', 'fehler', 'bereit']);

/** Schlüssel aus einer Datei lesen oder neu anlegen (Stream Deck, OBS-Adressen). */
function keyFile(file, bytes) {
  try {
    const k = fs.readFileSync(file, 'utf8').trim();
    if (/^[a-f0-9]{8,}$/.test(k)) return k;
  } catch {
    /* neu erzeugen */
  }
  const k = crypto.randomBytes(bytes).toString('hex');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, k, { mode: 0o600 });
  } catch {
    /* dann nur für diesen Start gültig */
  }
  return k;
}

/**
 * @param {object} o
 * @param {string} o.id Kennung des Raums (Konto-ID oder „lokal“)
 * @param {string} o.dataDir eigener Datenordner
 * @param {boolean} o.web Web-Modus: keine Zugriffe auf Ordner des Rechners, Chat wird nicht gespeichert
 * @param {object} o.cfg gemeinsame Einstellungen (Zoom, Teams, Versionen)
 * @param {(…args) => void} o.log
 * @param {{actionKey: string, outputKey: string}} [o.keys] Schlüssel aus dem Konto (Web-Modus); sonst aus Dateien im Datenordner
 * @param {() => Promise<{actionKey: string, outputKey: string}>} [o.renewKeys] neue Schlüssel im Konto speichern (Web-Modus)
 */
export function createRoom({ id, dataDir, web, cfg, log: baseLog, keys, renewKeys: renewExternal, can = () => true }) {
  const log = web ? (...a) => baseLog(`[${id.slice(0, 8)}]`, ...a) : baseLog;
  const SAVE_FILE = path.join(dataDir, 'veranstaltung.json');
  const TEMPLATE_FILE = path.join(dataDir, 'vorlagen.json');

  // ------------------------------------------------------------- Verbindungen
  const roles = new Map(); // ws -> 'steuerung' | 'ausgabe' | 'vorschau' | 'regie'
  const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  const broadcast = (role, msg) => {
    // Vorschau-Fenster in der App erhalten dasselbe wie OBS-Ausgaben, zählen aber nicht mit.
    for (const [ws, r] of roles) if (r === role || (role === 'ausgabe' && r === 'vorschau')) send(ws, msg);
  };
  const hasRole = (role) => [...roles.values()].includes(role);
  function counts() {
    let steuerungen = 0;
    let ausgaben = 0;
    for (const role of roles.values()) {
      if (role === 'ausgabe') ausgaben++;
      else if (role === 'steuerung') steuerungen++;
    }
    return { steuerungen, ausgaben };
  }
  const broadcastCounts = () => broadcast('steuerung', { type: 'clients', ...counts() });

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
      .filter(
        (t) => t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.kind === 'string' && t.data && typeof t.data === 'object',
      )
      .slice(0, 200)
      .map((t) => ({ id: t.id.slice(0, 64), name: t.name.slice(0, 60), kind: t.kind.slice(0, 20), data: t.data, at: Number(t.at) || Date.now() }));
    await fsp.mkdir(dataDir, { recursive: true });
    const tmp = `${TEMPLATE_FILE}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(clean, null, 1));
    await fsp.rename(tmp, TEMPLATE_FILE);
    templates = clean;
  }

  async function writeSave(state) {
    await fsp.mkdir(dataDir, { recursive: true });
    // Im Web-Modus bleiben Chatnachrichten nur im Speicher (Datenschutz), gespeichert wird der Rest.
    const stored = web && state && typeof state === 'object' ? { ...state, chat: [], highlightId: null } : state;
    const payload = { savedAt: Date.now(), state: stored };
    const tmp = `${SAVE_FILE}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(payload));
    await fsp.rename(tmp, SAVE_FILE);
    saved = { savedAt: payload.savedAt, state };
    return payload.savedAt;
  }

  // ------------------------------------------- Schlüssel (Stream Deck, OBS)
  // Stream Deck & Co. rufen /aktion/<id>?schluessel=… auf. Der Schlüssel verhindert, dass
  // beliebige Webseiten Aktionen auslösen. Im Web-Modus bestimmt er zugleich das Konto.
  let actionKey = keys?.actionKey ?? keyFile(path.join(dataDir, 'aktion-schluessel.txt'), 5);
  // Geheimer Teil der OBS-Adressen (nur im Web-Modus nötig, lokal ist alles auf dem eigenen Rechner).
  let outputKey = web ? (keys?.outputKey ?? null) : null;

  async function renewKeys() {
    if (renewExternal) {
      const k = await renewExternal();
      actionKey = k.actionKey;
      outputKey = k.outputKey;
      // Alte OBS-Quellen trennen: ihre Adresse gilt nicht mehr.
      for (const [ws, r] of roles) if (r === 'ausgabe') ws.close(4003, 'Schlüssel erneuert');
      return;
    }
    actionKey = crypto.randomBytes(5).toString('hex');
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.writeFile(path.join(dataDir, 'aktion-schluessel.txt'), actionKey, { mode: 0o600 });
  }

  // --------------------------------------------- Zoom-Konto (eigene Meetings)
  const zoomAccount = createZoomAccount({
    clientId: cfg.zoomClientId,
    clientSecret: cfg.zoomClientSecret,
    redirectUri: cfg.zoomRedirectUri,
    dataDir,
    log,
    oauthBase: cfg.zoomOauthBase,
    apiBase: cfg.zoomApiBase,
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
      name: cfg.regieName,
      account: { ...zoomAccount.status(), oneClick: web },
      appVersion: cfg.appVersion,
      sdkVersion: cfg.sdkVersion,
      configured: Boolean(cfg.zoomClientId && cfg.zoomClientSecret && cfg.sdkMain),
      sdkInstalled: Boolean(cfg.sdkMain),
      missing: [!cfg.zoomClientId && 'ZOOM_CLIENT_ID', !cfg.zoomClientSecret && 'ZOOM_CLIENT_SECRET'].filter(Boolean),
    };
  }

  function setRegie(patch) {
    regie = { ...regie, ...patch };
    broadcast('steuerung', { type: 'regie-status', status: regieStatus() });
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

  function handleRegieChat(data) {
    // Die ersten Nachrichten im Rohformat protokollieren, falls Zoom das Format ändert (lokal; im Web keine Inhalte ins Protokoll).
    if (rawLogged < 3 && !web) {
      rawLogged += 1;
      log(`Regie: Chat-Rohdaten von Zoom: ${JSON.stringify(data).slice(0, 400)}`);
    }
    const chat = normalizeSdkChat(data);
    if (!chat) {
      log(web ? 'Regie: Chat-Nachricht nicht erkannt.' : `Regie: Chat-Nachricht nicht erkannt: ${JSON.stringify(data).slice(0, 400)}`);
      return;
    }
    if (chat.private) {
      if (!web) log(`Regie: private Nachricht von ${chat.senderName} nicht übernommen.`);
      return;
    }
    if (!pushLive(chat)) return;
    regie.messages += 1;
    broadcast('steuerung', { type: 'regie-status', status: regieStatus() });
  }

  /** Beitrittsdaten für das Regie-Fenster (Signatur wird hier erzeugt, das Geheimnis bleibt auf dem Server). */
  async function regieJoin(meetingInput, passcodeInput) {
    const st = regieStatus();
    if (!st.sdkInstalled) throw new Error('Das Zoom Meeting SDK fehlt. Bitte im Terminal „npm install“ ausführen und neu starten.');
    if (st.missing.length)
      throw new Error(web ? 'Zoom ist auf dem Server noch nicht eingerichtet.' : `In .env.local fehlt: ${st.missing.join(', ')}.`);
    const { meetingId, passcode } = parseMeetingLink(meetingInput);
    if (!meetingId) throw new Error('Keine gültige Meeting-ID erkannt. Bitte den Zoom-Link oder die 9- bis 11-stellige Nummer einfügen.');
    // Web: Meetings gehören meist zu fremden Zoom-Konten. Dafür verlangt Zoom ein OBF-Token des verbundenen Kontos.
    // Klappt das nicht, versucht die Regie es ohne (eigene Meetings gehen auch so) und nennt den Grund, falls Zoom ablehnt.
    let obfToken = null;
    let obfProblem = null;
    if (web && zoomAccount.status().connected) {
      try {
        obfToken = await zoomAccount.obfToken(meetingId);
      } catch (e) {
        obfProblem = e.message;
        log(`Regie: kein OBF-Token (${e.message})`);
      }
    }
    return {
      sdkKey: cfg.zoomClientId,
      signature: meetingSignature({ clientId: cfg.zoomClientId, clientSecret: cfg.zoomClientSecret, meetingNumber: meetingId }),
      meetingNumber: meetingId,
      passWord: String(passcodeInput ?? '').trim() || passcode,
      userName: cfg.regieName,
      ...(obfToken ? { obfToken } : {}),
      ...(obfProblem ? { obfProblem } : {}),
    };
  }

  // ------------------------------------------------ Teilnehmende und Spotlight in Zoom
  const emptyPeople = () => ({ list: [], spotlight: [], spotlightKnown: false, role: 'unbekannt', at: null });
  let zoomPeople = emptyPeople();
  const handSince = new Map(); // userId -> Zeitpunkt, seit dem die Hand oben ist
  const micSince = new Map(); // userId -> Zeitpunkt, seit dem das Mikrofon an ist
  const spokeAt = new Map(); // userId -> zuletzt als Sprecher gemeldet
  let speakers = []; // aktuell von Zoom gemeldete Sprecher
  let attendeesLogged = false;
  let requestSeq = 0;
  const pendingRequests = new Map(); // requestId -> { ws, label }

  function peopleStatus() {
    return {
      ...zoomPeople,
      speakers: speakers.filter((uid) => zoomPeople.list.some((u) => u.userId === uid)),
      list: zoomPeople.list.map((u) => ({
        ...u,
        handSince: handSince.get(u.userId) ?? null,
        micSince: micSince.get(u.userId) ?? null,
        spokeAt: spokeAt.get(u.userId) ?? null,
      })),
    };
  }
  const broadcastPeople = () => broadcast('steuerung', { type: 'zoom-teilnehmende', status: peopleStatus() });
  function clearPeople() {
    zoomPeople = emptyPeople();
    handSince.clear();
    micSince.clear();
    spokeAt.clear();
    speakers = [];
    broadcastPeople();
  }

  function handleAttendees(msg) {
    if (!attendeesLogged && Array.isArray(msg.list) && msg.list.length && !web) {
      attendeesLogged = true;
      log(
        `Regie: Teilnehmende im Rohformat: ${JSON.stringify(msg.list[0]).slice(0, 300)} · Regie: ${JSON.stringify(msg.self ?? null).slice(0, 200)}`,
      );
    }
    const next = normalizeAttendees(msg.list, msg.self, msg.spotlight);
    // Kennt diese SDK-Version keine Spotlight-Liste, die zuletzt bekannte behalten.
    if (!next.spotlightKnown) next.spotlight = zoomPeople.spotlight.filter((uid) => next.list.some((u) => u.userId === uid));
    const now = Date.now();
    for (const u of next.list) {
      if (u.hand && !handSince.has(u.userId)) handSince.set(u.userId, now);
      if (!u.hand) handSince.delete(u.userId);
      if (u.muted === false && !micSince.has(u.userId)) micSince.set(u.userId, now);
      if (u.muted !== false) micSince.delete(u.userId);
    }
    for (const map of [handSince, micSince, spokeAt])
      for (const uid of [...map.keys()]) if (!next.list.some((u) => u.userId === uid)) map.delete(uid);
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

  // ------------------------------------------------------------- Microsoft Teams (nur lokal)
  const teamsEnabled = !web;
  const teamsAccount = createTeamsAccount({
    clientId: teamsEnabled ? cfg.teamsClientId : '',
    tenant: cfg.teamsTenantId,
    redirectUri: `http://localhost:${cfg.port}/teams/anmeldung`,
    dataDir,
    log,
    loginBase: cfg.teamsLoginBase,
    graphBase: cfg.teamsGraphBase,
  });
  const teamsLive = createTeamsLive({
    account: teamsAccount,
    log,
    receiverPort: cfg.teamsReceiverPort,
    publicUrl: cfg.teamsPublicUrl,
    onMessage: (m) => pushLive(m),
    onStatus: () => broadcast('steuerung', { type: 'teams-status', status: teamsStatus() }),
  });
  function teamsStatus() {
    return { ...teamsAccount.status(), live: teamsLive.status() };
  }
  const broadcastTeams = () => broadcast('steuerung', { type: 'teams-status', status: teamsStatus() });

  // ------------------------------------------------- Zoom-Ordner beobachten (nur lokal)
  const DEFAULT_FOLDERS = [
    path.join(os.homedir(), 'Documents', 'Zoom'),
    path.join(os.homedir(), 'Dokumente', 'Zoom'),
    path.join(os.homedir(), 'OneDrive', 'Documents', 'Zoom'),
    path.join(os.homedir(), 'OneDrive', 'Dokumente', 'Zoom'),
  ];
  const CHAT_FILE = /chat.*\.txt$/i;
  let watch = null; // { folder, timer, file, mtime, size, error, startedAt }

  function watchStatus() {
    if (web) return { active: false, folder: null, file: null, error: null, unavailable: true };
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
    if (web) {
      broadcast('steuerung', { type: 'watch-status', ...watchStatus(), error: 'Der Chat-Export ist nur in der lokalen Version verfügbar.' });
      return;
    }
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
      broadcast('steuerung', { type: 'chat-file', file: path.relative(watch.folder, found.file), mtime: found.mtime, content });
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

  // ------------------------------------------------------------- Nachrichten
  async function handleSteuerung(ws, msg) {
    // Rechte der Rolle: Spotlight-Befehle nur, wenn der Bereich freigeschaltet ist
    if (String(msg?.type ?? '').startsWith('zoom-spotlight') && !can('spotlight')) {
      send(ws, { type: 'zoom-aktion', ok: false, message: 'Spotlight ist in deinem Paket nicht enthalten.' });
      return;
    }
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
      case 'schluessel-erneuern':
        await renewKeys();
        broadcast('steuerung', { type: 'schluessel', aktionSchluessel: actionKey, ausgabeSchluessel: outputKey });
        log('Schlüssel für Stream Deck und OBS erneuert.');
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
          sendSpotlight(
            ws,
            zoomPeople.spotlight.map((uid) => ({ operate: 'remove', userId: uid })),
            'Spotlight aufgehoben',
          );
          break;
        }
        const person = zoomPeople.list.find((u) => u.userId === Number(msg.userId));
        if (!person) {
          send(ws, { type: 'zoom-aktion', ok: false, message: 'Diese Person ist nicht mehr im Meeting.' });
          break;
        }
        const label =
          operate === 'remove'
            ? `${person.name} aus dem Spotlight genommen`
            : operate === 'add'
              ? `${person.name} zusätzlich im Spotlight`
              : `${person.name} im Spotlight`;
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
        if (!teamsEnabled || !teamsAccount.status().connected) {
          send(ws, {
            type: 'error',
            message: teamsEnabled
              ? 'Bitte zuerst unter „Aus Microsoft Teams“ mit Microsoft anmelden.'
              : 'Microsoft Teams ist in der Web-Version noch nicht verfügbar.',
          });
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
  }

  async function handleRegieMessage(ws, msg) {
    switch (msg.type) {
      case 'regie-hello':
        try {
          const join = await regieJoin(msg.meeting, msg.passcode);
          send(ws, { type: 'regie-join', join, version: { app: cfg.appVersion, sdk: cfg.sdkVersion, regieStand: cfg.regieStand } });
          log(`Regie: tritt Meeting ${join.meetingNumber} als „${cfg.regieName}“ bei …`);
          setRegie({ state: 'verbindet', meeting: join.meetingNumber, since: null, error: null });
        } catch (e) {
          send(ws, { type: 'regie-error', message: e.message, version: { app: cfg.appVersion, sdk: cfg.sdkVersion, regieStand: cfg.regieStand } });
          setRegie({ state: 'fehler', error: e.message });
        }
        break;
      case 'regie-status': {
        if (!REGIE_STATES.has(msg.state)) return;
        const error = msg.state === 'fehler' ? String(msg.error ?? 'Unbekannter Fehler').slice(0, 300) : null;
        if (msg.state !== regie.state || error !== regie.error) {
          log(`Regie: ${msg.state}${error ? ` – ${error}` : ''}`);
          setRegie({ state: msg.state, error, since: msg.state === 'verbunden' ? Date.now() : regie.since });
          if (msg.state === 'bereit' || msg.state === 'fehler') clearPeople();
        }
        break;
      }
      case 'regie-teilnehmende':
        handleAttendees(msg);
        break;
      case 'regie-sprecher': {
        speakers = (Array.isArray(msg.userIds) ? msg.userIds : []).map(Number).filter(Number.isFinite).slice(0, 20);
        const now = Date.now();
        for (const uid of speakers) spokeAt.set(uid, now);
        broadcastPeople();
        break;
      }
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

  // ------------------------------------------------------------- Raum nach außen
  return {
    id,
    get actionKey() {
      return actionKey;
    },
    get outputKey() {
      return outputKey;
    },
    teamsAccount,
    broadcastTeams,

    /** Web: Rückkehr von Zoom mit Code (Weiterleitung direkt auf den Server). */
    async zoomConnectCode(code) {
      await zoomAccount.connect({ code });
      broadcast('steuerung', { type: 'regie-status', status: regieStatus() });
    },
    /** Web: Adresse der Zoom-Freigabe mit einmaligem state. */
    zoomAuthorizeUrl: (state) => zoomAccount.authorizeUrl(state),
    /** Zoom-Konto, das mit diesem Raum verbunden ist (für das Entfernen der App über Zoom). */
    zoomUserId: () => zoomAccount.zoomUserId(),
    /** Die App wurde bei Zoom entfernt: Anmeldung löschen und Steuerungen informieren. */
    async zoomForget() {
      await zoomAccount.forget();
      broadcast('steuerung', { type: 'regie-status', status: regieStatus() });
    },
    /** Konto wird gelöscht: Anmeldung bei Zoom zurückziehen. */
    zoomDisconnect: () => zoomAccount.disconnect(),
    regieStatus,
    counts,
    savedAt: () => saved?.savedAt ?? null,
    /** Anzahl offener Verbindungen (zum Aufräumen leerer Räume). */
    connections: () => roles.size,

    /** Eine neue WebSocket-Verbindung in diesen Raum aufnehmen. */
    attach(ws, rolle, extra = {}) {
      const role = rolle === 'ausgabe' || rolle === 'regie' || rolle === 'vorschau' ? rolle : 'steuerung';
      roles.set(ws, role);
      if (role === 'ausgabe' || role === 'vorschau') {
        if (lastSnapshot) send(ws, { type: 'snapshot', snapshot: lastSnapshot });
      } else if (role === 'steuerung') {
        send(ws, {
          type: 'hello',
          saved,
          ...counts(),
          watch: watchStatus(),
          regie: regieStatus(),
          teams: teamsStatus(),
          zoomTeilnehmende: peopleStatus(),
          aktionSchluessel: actionKey,
          ausgabeSchluessel: outputKey,
          vorlagen: templates,
          ...extra,
        });
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
        if (role === 'regie') handleRegieMessage(ws, msg).catch((e) => log(`Regie: ${e.message}`));
        else if (role === 'steuerung') await handleSteuerung(ws, msg);
      });
      ws.on('close', () => {
        roles.delete(ws);
        if (role === 'regie' && !hasRole('regie')) {
          log('Regie-Fenster geschlossen.');
          setRegie({ state: 'bereit', since: null, error: null });
          clearPeople();
        }
        broadcastCounts();
      });
    },

    /** Stream-Deck-Aktion an die zuletzt geöffnete Steuerung geben. */
    action(actionId) {
      if (!/^[a-z0-9-]{2,40}$/.test(actionId)) return { status: 400, body: { ok: false, fehler: 'Unbekannte Aktion.' } };
      // Nur an eine Steuerung schicken (die zuletzt geöffnete), sonst würde doppelt umgeschaltet.
      const target = [...roles.entries()]
        .filter(([, r]) => r === 'steuerung')
        .map(([ws]) => ws)
        .pop();
      if (!target) return { status: 409, body: { ok: false, fehler: 'Die Steuerung ist nicht geöffnet. Bitte MeetingBackstage im Browser öffnen.' } };
      send(target, { type: 'aktion', id: actionId });
      return { status: 200, body: { ok: true, aktion: actionId } };
    },

    /** Alle Fenster trennen (z. B. bei Sperre oder Löschung des Kontos). */
    /** Nachricht an alle offenen Steuerungen dieses Kontos (z. B. „Rechte geändert“). */
    notify(msg) {
      broadcast('steuerung', msg);
    },

    kick(code = 4001, reason = 'Konto gesperrt') {
      for (const ws of roles.keys()) ws.close(code, reason);
    },

    async close() {
      stopWatch(false);
      await teamsLive.close().catch(() => {});
    },
  };
}
