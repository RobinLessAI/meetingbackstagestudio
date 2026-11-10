// Microsoft Teams: eigenes Konto verbinden, Teams-Meetings aus dem Kalender lesen und
// den Meeting-Chat live mitlesen – kostenlos über Microsoft Graph.
//
// Anmeldung: Microsoft-Konto (Firma, Schule, Verein) mit einer eigenen App-Registrierung in
// Microsoft Entra (öffentlicher Client mit PKCE, ohne Geheimnis). Die Weiterleitung geht an
// http://localhost:<PORT>/teams/anmeldung, die Token liegen nur lokal in daten/teams-anmeldung.json.
//
// Live-Chat: Microsoft erlaubt kein häufiges Nachfragen. Neue Nachrichten meldet Graph deshalb
// per Benachrichtigung an eine öffentliche https-Adresse. Dafür startet MeetingBackstage einen
// kostenlosen Tunnel (cloudflared, sonst ngrok) zu einem eigenen kleinen Empfänger, der nur
// Graph-Benachrichtigungen annimmt. Die eigentliche App bleibt nur auf diesem Rechner erreichbar.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const TEAMS_SCOPES = ['offline_access', 'User.Read', 'Calendars.Read', 'Chat.Read'];

// ------------------------------------------------------------------ Hilfsfunktionen

/** Chat-ID (Thread) aus einem Teams-Link lesen, z. B. …/meetup-join/19%3ameeting_…%40thread.v2/0?context=… */
export function threadIdFromLink(input) {
  let v = String(input ?? '').trim();
  try {
    v = decodeURIComponent(v);
  } catch {
    /* schon dekodiert */
  }
  return v.match(/19:meeting_[A-Za-z0-9_-]+@thread\.v2/)?.[0] ?? null;
}

/** Ist das ein Teams-Link? */
export function isTeamsLink(input) {
  return /^https:\/\/(?:[\w-]+\.)*teams\.(?:microsoft|live)\.com\//i.test(String(input ?? '').trim());
}

/** Links vergleichbar machen (Kodierung, Groß-/Kleinschreibung, Schrägstrich am Ende). */
export function sameJoinLink(a, b) {
  const norm = (x) => {
    let v = String(x ?? '').trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* egal */
    }
    return v.toLowerCase().replace(/\/+$/, '');
  };
  if (!a || !b) return false;
  const ta = threadIdFromLink(a);
  if (ta && ta === threadIdFromLink(b)) return true;
  return norm(a) === norm(b);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Teams-Nachrichten kommen als HTML; daraus reinen Text machen (Emojis bleiben erhalten). */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<emoji\b[^>]*\balt="([^"]*)"[^>]*>(?:\s*<\/emoji>)?/gi, '$1')
    .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<attachment\b[^>]*>\s*<\/attachment>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Graph-Chatnachricht in das Format der App bringen; Systemmeldungen und gelöschte Nachrichten fallen weg. */
export function normalizeTeamsMessage(m) {
  if (!m || m.messageType !== 'message' || m.deletedDateTime) return null;
  const text = m.body?.contentType === 'html' ? htmlToText(m.body?.content) : String(m.body?.content ?? '').trim();
  if (!text) return null;
  const senderName = m.from?.user?.displayName ?? m.from?.application?.displayName ?? 'Unbekannt';
  const at = Date.parse(m.createdDateTime ?? '') || Date.now();
  return { key: `teams-${m.id}`, senderName, text, at };
}

/** Kalendereintrag aus Graph in das Listenformat (wie bei Zoom) bringen. */
export function normalizeTeamsEvent(e) {
  const link = e.onlineMeeting?.joinUrl;
  if (!e.isOnlineMeeting || !link) return null;
  const utc = (t) => (t?.dateTime ? `${t.dateTime.replace(/\.\d+$/, '')}${/Z|[+-]\d\d:\d\d$/.test(t.dateTime) ? '' : 'Z'}` : null);
  const start = utc(e.start);
  const end = utc(e.end);
  const recurring = e.type === 'occurrence' || e.type === 'exception' || e.type === 'seriesMaster';
  return {
    id: threadIdFromLink(link) ?? e.seriesMasterId ?? e.id,
    topic: e.subject || 'Teams-Besprechung',
    start,
    duration: start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 60000) : null,
    timezone: 'UTC',
    recurring,
    type: recurring ? 8 : 2,
    link,
    platform: 'teams',
  };
}

/**
 * Serientermine zu einem Eintrag zusammenfassen (wie bei Zoom): pro Link der nächste
 * anstehende Termin, sonst der letzte vergangene.
 */
export function groupTeamsEvents(events, now = Date.now()) {
  const byLink = new Map();
  for (const e of events.map(normalizeTeamsEvent).filter(Boolean)) {
    const key = e.id;
    const prev = byLink.get(key);
    if (!prev) {
      byLink.set(key, e);
      continue;
    }
    const t = Date.parse(e.start ?? '');
    const p = Date.parse(prev.start ?? '');
    const upcoming = (x) => x + (prev.duration ?? 60) * 60000 >= now;
    const better = upcoming(t) ? !upcoming(p) || t < p : !upcoming(p) && t > p;
    const merged = better ? e : prev;
    byLink.set(key, { ...merged, recurring: prev.recurring || e.recurring, type: prev.recurring || e.recurring ? 8 : 2 });
  }
  return [...byLink.values()].sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ------------------------------------------------------------------ Konto (Anmeldung, Graph)

export function createTeamsAccount({ clientId, tenant, redirectUri, dataDir, log, loginBase, graphBase }) {
  const LOGIN = loginBase ?? `https://login.microsoftonline.com/${tenant || 'organizations'}/oauth2/v2.0`;
  const GRAPH = graphBase ?? 'https://graph.microsoft.com/v1.0';
  const file = path.join(dataDir, 'teams-anmeldung.json');
  let tokens = null;
  try {
    tokens = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    tokens = null;
  }
  const pending = new Map(); // state -> { verifier, at }

  async function save(t) {
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.writeFile(file, JSON.stringify(t), { mode: 0o600 });
    tokens = t;
  }

  async function tokenRequest(params) {
    const res = await fetch(`${LOGIN}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: TEAMS_SCOPES.join(' '), ...params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      const code = String(body.error_codes?.[0] ?? '');
      const hint =
        code === '65001'
          ? ' Die Berechtigungen wurden noch nicht erteilt.'
          : code === '700016'
            ? ' Die Anwendungs-ID (TEAMS_CLIENT_ID) ist in diesem Verzeichnis unbekannt.'
            : code === '7000218'
              ? ' In der App-Registrierung unter „Authentifizierung“ „Öffentliche Clientflows zulassen“ auf „Ja“ stellen.'
              : '';
      throw new Error(`Microsoft-Anmeldung fehlgeschlagen (${body.error ?? res.status}).${hint}`);
    }
    await save({
      ...(tokens ?? {}),
      access: body.access_token,
      refresh: body.refresh_token ?? tokens?.refresh ?? null,
      expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
      scope: body.scope ?? '',
    });
  }

  async function accessToken() {
    if (!tokens) throw new Error('Noch nicht mit Microsoft Teams verbunden.');
    if (Date.now() > tokens.expiresAt - 120_000) {
      if (!tokens.refresh) throw new Error('Microsoft-Anmeldung abgelaufen. Bitte neu verbinden.');
      await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
    }
    return tokens.access;
  }

  async function graph(method, pathOrUrl, body, headers = {}) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(data.error?.message ?? '');
      const err = new Error(
        res.status === 401
          ? 'Microsoft hat die Anmeldung abgelehnt. Bitte „Teams-Konto trennen“ und neu verbinden.'
          : res.status === 403
            ? `Microsoft verweigert den Zugriff (${msg || 'fehlende Berechtigung'}). Prüfe in der App-Registrierung die API-Berechtigungen (Calendars.Read, Chat.Read) und verbinde neu.`
            : `Microsoft Graph antwortet mit ${res.status}${msg ? `: ${msg}` : ''}`,
      );
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    graph,
    status: () => ({
      configured: Boolean(clientId),
      connected: Boolean(tokens),
      name: tokens?.name ?? null,
      email: tokens?.email ?? null,
      redirectUri,
    }),

    /** Adresse der Microsoft-Anmeldung (mit PKCE, ohne Geheimnis). */
    authorizeUrl() {
      if (!clientId) return null;
      for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60_000) pending.delete(k);
      const state = b64url(crypto.randomBytes(16));
      const verifier = b64url(crypto.randomBytes(48));
      const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
      pending.set(state, { verifier, at: Date.now() });
      return `${LOGIN}/authorize?${new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: TEAMS_SCOPES.join(' '),
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      })}`;
    },

    /** Rückkehr von Microsoft mit ?code=…&state=… */
    async handleCallback(params) {
      if (params.get('error')) throw new Error(`Microsoft meldet: ${params.get('error_description') ?? params.get('error')}`);
      const p = pending.get(params.get('state') ?? '');
      if (!p)
        throw new Error(
          'Die Anmeldung ist abgelaufen oder wurde schon verwendet. Bitte in MeetingBackstage erneut auf „Mit Microsoft anmelden“ klicken.',
        );
      pending.delete(params.get('state'));
      await tokenRequest({ grant_type: 'authorization_code', code: params.get('code') ?? '', redirect_uri: redirectUri, code_verifier: p.verifier });
      try {
        const me = await graph('GET', '/me?$select=displayName,mail,userPrincipalName');
        await save({ ...tokens, name: me.displayName ?? null, email: me.mail ?? me.userPrincipalName ?? null });
      } catch {
        /* Name nur zur Anzeige */
      }
      log(`Mit Microsoft Teams verbunden${tokens?.name ? ` (${tokens.name})` : ''}.`);
    },

    async disconnect() {
      tokens = null;
      await fsp.rm(file, { force: true });
    },

    /** Teams-Besprechungen aus dem Kalender (30 Tage zurück bis 180 Tage voraus). */
    async listMeetings(now = Date.now()) {
      const q = new URLSearchParams({
        startDateTime: new Date(now - 30 * 86400_000).toISOString(),
        endDateTime: new Date(now + 180 * 86400_000).toISOString(),
        $select: 'id,subject,start,end,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,type,seriesMasterId',
        $top: '250',
      });
      const events = [];
      let next = `/me/calendarView?${q}`;
      for (let page = 0; next && page < 8; page++) {
        const body = await graph('GET', next, undefined, { Prefer: 'outlook.timezone="UTC"' });
        events.push(...(body.value ?? []));
        next = body['@odata.nextLink'] ?? null;
      }
      return groupTeamsEvents(
        events.filter((e) => !e.onlineMeetingProvider || e.onlineMeetingProvider === 'teamsForBusiness'),
        now,
      );
    },

    /** Chat-ID eines Meetings: steht meist im Link, sonst über die eigenen Meeting-Chats suchen. */
    async resolveChat(link) {
      const fromLink = threadIdFromLink(link);
      if (fromLink) return fromLink;
      let next = `/me/chats?${new URLSearchParams({ $filter: "chatType eq 'meeting'", $top: '50' })}`;
      for (let page = 0; next && page < 10; page++) {
        const body = await graph('GET', next);
        const hit = (body.value ?? []).find((c) => sameJoinLink(c.onlineMeetingInfo?.joinWebUrl, link));
        if (hit) return hit.id;
        next = body['@odata.nextLink'] ?? null;
      }
      throw new Error(
        'Zu diesem Link wurde kein Meeting-Chat in deinem Konto gefunden. Funktioniert nur mit Meetings, an denen du teilnimmst. Tipp: das Meeting aus der Liste „Aus Microsoft Teams“ wählen.',
      );
    },
  };
}

// ------------------------------------------------------------------ Tunnel

/**
 * Öffentliche https-Adresse für den Empfänger: feste Adresse aus TEAMS_PUBLIC_URL,
 * sonst ein kostenloser Tunnel mit cloudflared (ohne Konto) oder ngrok.
 */
export function startTunnel(port, { log, spawnImpl = spawn, timeoutMs = 40_000 } = {}) {
  const tryOne = (cmd, args, pattern) =>
    new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnImpl(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        reject(e);
        return;
      }
      let done = false;
      const timer = setTimeout(() => finish(new Error(`${cmd} hat keine Adresse gemeldet.`)), timeoutMs);
      const finish = (err, url) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) {
          child.kill();
          reject(err);
        } else resolve({ url, stop: () => child.kill(), child, tool: cmd });
      };
      const onData = (buf) => {
        const m = String(buf).match(pattern);
        if (m) finish(null, m[0]);
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('error', (e) => finish(e.code === 'ENOENT' ? Object.assign(new Error(`${cmd} ist nicht installiert.`), { code: 'ENOENT' }) : e));
      child.on('exit', (code) => finish(new Error(`${cmd} wurde beendet (Code ${code}).`)));
    });

  return tryOne('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], /https:\/\/[a-z0-9-]+\.trycloudflare\.com/).catch(
    (e) => {
      if (e.code !== 'ENOENT') throw e;
      log?.('cloudflared nicht gefunden, versuche ngrok …');
      return tryOne(
        'ngrok',
        ['http', `127.0.0.1:${port}`, '--log', 'stdout', '--log-format', 'logfmt'],
        /https:\/\/[a-z0-9.-]+\.ngrok(?:-free)?\.(?:app|dev|io)/,
      ).catch((e2) => {
        if (e2.code === 'ENOENT') {
          throw new Error(
            'Für den Teams-Live-Chat fehlt ein Tunnel-Programm. Im Terminal „brew install cloudflared“ ausführen (kostenlos, ohne Konto) und erneut versuchen.',
          );
        }
        throw e2;
      });
    },
  );
}

// ------------------------------------------------------------------ Live-Chat

const NOTIFY_PATH = '/graph/benachrichtigung';

/**
 * Empfänger für Graph-Benachrichtigungen. Nimmt nur POST auf NOTIFY_PATH an und nur mit
 * dem geheimen clientState des aktuellen Abos; alles andere wird abgewiesen.
 */
export function createNotificationReceiver({ getSecret, onNotification }) {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'POST' || url.pathname !== NOTIFY_PATH) {
      res.writeHead(404).end();
      return;
    }
    // Bestätigung beim Anlegen des Abos: Token unverändert als Text zurückgeben.
    const token = url.searchParams.get('validationToken');
    if (token !== null) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(token);
      req.resume();
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1024 * 1024) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => {
      res.writeHead(202).end();
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return;
      }
      const secret = getSecret();
      for (const n of body?.value ?? []) {
        if (!secret || n.clientState !== secret) continue;
        onNotification(n);
      }
    });
  });
}

export function createTeamsLive({ account, log, onMessage, onStatus, receiverPort, publicUrl, tunnel = startTunnel, retryDelayMs = 5000 }) {
  let state = { state: 'bereit', meeting: null, link: null, since: null, messages: 0, error: null, tunnelUrl: null };
  let chatId = null;
  let subscription = null; // { id, secret }
  let renewTimer = null;
  let tunnelHandle = null;
  let receiver = null;
  let generation = 0;
  const seen = new Set();

  const set = (patch) => {
    state = { ...state, ...patch };
    onStatus(state);
  };

  async function ensureReceiver() {
    if (receiver) return;
    receiver = createNotificationReceiver({
      getSecret: () => subscription?.secret ?? null,
      onNotification: (n) => fetchMessage(n).catch((e) => log(`Teams: Nachricht nicht abrufbar: ${e.message}`)),
    });
    await new Promise((resolve, reject) => {
      receiver.once('error', reject);
      receiver.listen(receiverPort, '127.0.0.1', resolve);
    });
  }

  async function fetchMessage(n) {
    const id = n.resourceData?.id ?? String(n.resource ?? '').match(/messages\('([^']+)'\)/)?.[1];
    if (!id || !chatId || seen.has(id)) return;
    seen.add(id);
    const m = await account.graph('GET', `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(id)}`);
    const msg = normalizeTeamsMessage(m);
    if (!msg) return;
    state.messages += 1;
    onMessage(msg);
    onStatus(state);
  }

  const expiry = () => new Date(Date.now() + 55 * 60_000).toISOString();

  async function subscribe(baseUrl, gen) {
    const secret = b64url(crypto.randomBytes(24));
    subscription = { id: null, secret };
    let lastErr = null;
    // Ein frischer Tunnel braucht ein paar Sekunden, bis er weltweit erreichbar ist.
    for (let attempt = 0; attempt < 6; attempt++) {
      if (gen !== generation) return;
      try {
        const sub = await account.graph('POST', '/subscriptions', {
          changeType: 'created',
          notificationUrl: `${baseUrl}${NOTIFY_PATH}`,
          resource: `/chats/${chatId}/messages`,
          expirationDateTime: expiry(),
          clientState: secret,
        });
        subscription = { id: sub.id, secret };
        return;
      } catch (e) {
        lastErr = e;
        if (e.status && e.status !== 400) throw e;
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
    throw lastErr ?? new Error('Microsoft konnte den Tunnel nicht erreichen.');
  }

  function scheduleRenew(baseUrl, gen) {
    clearTimeout(renewTimer);
    renewTimer = setTimeout(async () => {
      if (gen !== generation || !subscription?.id) return;
      try {
        await account.graph('PATCH', `/subscriptions/${subscription.id}`, { expirationDateTime: expiry() });
      } catch (e) {
        log(`Teams: Abo verlängern fehlgeschlagen (${e.message}), lege es neu an.`);
        try {
          await subscribe(baseUrl, gen);
        } catch (e2) {
          set({ state: 'fehler', error: `Live-Chat unterbrochen: ${e2.message}` });
          return;
        }
      }
      scheduleRenew(baseUrl, gen);
    }, 40 * 60_000);
    renewTimer.unref?.();
  }

  async function stop(announce = true) {
    generation += 1;
    clearTimeout(renewTimer);
    const sub = subscription;
    subscription = null;
    chatId = null;
    if (sub?.id) await account.graph('DELETE', `/subscriptions/${sub.id}`).catch(() => {});
    tunnelHandle?.stop();
    tunnelHandle = null;
    if (announce) set({ state: 'bereit', meeting: null, link: null, since: null, error: null, tunnelUrl: null });
  }

  return {
    status: () => state,
    stop,
    async start(link, topic) {
      await stop(false);
      const gen = generation;
      set({ state: 'verbindet', meeting: topic || 'Teams-Meeting', link, since: null, messages: 0, error: null, tunnelUrl: null });
      try {
        chatId = await account.resolveChat(link);
        await ensureReceiver();
        let baseUrl = publicUrl?.replace(/\/+$/, '');
        if (!baseUrl) {
          tunnelHandle = await tunnel(receiverPort, { log });
          baseUrl = tunnelHandle.url;
          tunnelHandle.child?.on?.('exit', () => {
            if (gen === generation && state.state === 'verbunden')
              set({ state: 'fehler', error: 'Der Tunnel wurde beendet. Bitte „Chat mitlesen“ erneut klicken.' });
          });
          log(`Teams: Tunnel bereit (${tunnelHandle.tool}): ${baseUrl}`);
        }
        if (gen !== generation) return;
        set({ tunnelUrl: baseUrl });
        await subscribe(baseUrl, gen);
        if (gen !== generation) return;
        scheduleRenew(baseUrl, gen);
        set({ state: 'verbunden', since: Date.now() });
        log(`Teams: Live-Chat für „${state.meeting}“ aktiv.`);
      } catch (e) {
        if (gen !== generation) return;
        await stop(false);
        set({ state: 'fehler', error: e.message });
        log(`Teams: ${e.message}`);
      }
    },
    async close() {
      await stop(false);
      receiver?.closeAllConnections?.();
      receiver?.close();
      receiver = null;
    },
  };
}
