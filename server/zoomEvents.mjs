// Zoom-Ereignisse über WebSocket statt Webhook.
//
// Der Server baut selbst eine ausgehende Verbindung zu Zoom auf. Dadurch braucht es
// keine öffentliche Adresse und keinen Tunnel-Dienst. Zoom liefert darüber dieselben
// Ereignisse wie per Webhook, z. B. meeting.rtms_started.
//
// Ablauf:
// 1. Zugangs-Token mit Client-ID und Client-Geheimnis holen
//    (client_credentials; mit ZOOM_ACCOUNT_ID zusätzlich account_credentials)
// 2. Verbinden mit wss://ws.zoom.us/ws?subscriptionId=…&access_token=…
// 3. Alle 30 Sekunden ein Lebenszeichen senden, bei Abbruch neu verbinden
import WebSocket from 'ws';

const HEARTBEAT_MS = 30_000;

/** Akzeptiert die Subscription ID oder die komplette wss-Adresse aus dem Marketplace. */
export function parseSubscriptionId(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const m = v.match(/[?&]subscriptionId=([^&\s]+)/);
  return m ? decodeURIComponent(m[1]) : v;
}

/** Holt ein Zugangs-Token. Gibt { token, expiresIn } zurück oder wirft mit verständlicher Meldung. */
export async function fetchAccessToken({ clientId, clientSecret, accountId, oauthUrl = 'https://zoom.us/oauth/token' }) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const attempts = [{ grant_type: 'client_credentials' }];
  if (accountId) attempts.push({ grant_type: 'account_credentials', account_id: accountId });
  let lastError = '';
  for (const params of attempts) {
    const res = await fetch(oauthUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.access_token) return { token: body.access_token, expiresIn: Number(body.expires_in ?? 3600) };
    lastError = `${params.grant_type}: ${res.status} ${body.reason ?? body.error ?? ''}`.trim();
  }
  throw new Error(`Zoom hat kein Zugangs-Token ausgegeben (${lastError}). Client-ID und Client-Geheimnis prüfen.`);
}

/** Liest ein Ereignis aus einer WebSocket-Nachricht von Zoom. */
export function parseEventMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (msg?.event) return msg;
  if (msg?.module === 'message' && msg.content) {
    try {
      const inner = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
      return inner?.event ? inner : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function createZoomEventSocket({ clientId, clientSecret, accountId, subscriptionId, onEvent, onStatus, log, wsBase, oauthUrl }) {
  let ws = null;
  let heartbeat = null;
  let retry = null;
  let attempt = 0;
  let stopped = false;
  let state = { state: 'getrennt', error: null, since: null };

  const set = (patch) => {
    state = { ...state, ...patch };
    onStatus(state);
  };

  const schedule = () => {
    if (stopped) return;
    attempt += 1;
    const delay = Math.min(60_000, 2000 * 2 ** Math.min(attempt - 1, 5));
    retry = setTimeout(connect, delay);
  };

  async function connect() {
    if (stopped) return;
    set({ state: 'verbindet' });
    let token;
    try {
      ({ token } = await fetchAccessToken({ clientId, clientSecret, accountId, oauthUrl }));
    } catch (e) {
      set({ state: 'fehler', error: e.message });
      log(e.message);
      schedule();
      return;
    }
    const url = `${wsBase ?? 'wss://ws.zoom.us/ws'}?subscriptionId=${encodeURIComponent(subscriptionId)}&access_token=${encodeURIComponent(token)}`;
    ws = new WebSocket(url);
    ws.on('open', () => {
      attempt = 0;
      set({ state: 'verbunden', error: null, since: Date.now() });
      log('Zoom-Ereignisse: WebSocket verbunden, warte auf Meeting-Start.');
      heartbeat = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ module: 'heart_beat' }));
      }, HEARTBEAT_MS);
    });
    ws.on('message', (data) => {
      const event = parseEventMessage(data);
      if (event) {
        onEvent(event);
        return;
      }
      // Alles außer Lebenszeichen anzeigen, damit sich Probleme nachvollziehen lassen.
      const text = String(data);
      if (!/heart_beat/.test(text)) log(`Zoom-Ereignisse: Nachricht ohne Ereignis: ${text.slice(0, 300)}`);
    });
    ws.on('close', (code, reason) => {
      clearInterval(heartbeat);
      ws = null;
      if (stopped) return;
      const text = String(reason || '');
      set({ state: 'getrennt', error: code === 1000 ? null : `Verbindung zu Zoom getrennt (${code}${text ? `: ${text}` : ''}), verbinde neu …` });
      log(`Zoom-Ereignisse: Verbindung getrennt (${code} ${text}).`);
      schedule();
    });
    ws.on('error', (e) => log('Zoom-Ereignisse: Fehler', e.message));
  }

  connect();
  return {
    status: () => state,
    close: () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      ws?.close();
    },
  };
}
