// Live-Chat aus Zoom über Realtime Media Streams (RTMS).
//
// Ablauf laut Zoom-Dokumentation:
// 1. Zoom ruft den Webhook mit meeting.rtms_started auf (über einen Tunnel öffentlich erreichbar).
// 2. Verbindung zum Signaling-WebSocket, Handshake mit HMAC-Signatur.
// 3. Verbindung zum Media-WebSocket, nur Medientyp Chat (16).
// 4. Chat-Nachrichten (msg_type 18) werden an die Steuerung weitergereicht.
//
// Umgesetzt mit reinem JavaScript, damit es auch unter Windows läuft
// (das offizielle Paket @zoom/rtms unterstützt nur macOS und Linux).
import crypto from 'node:crypto';
import WebSocket from 'ws';

const MSG = {
  SIGNALING_HAND_SHAKE_REQ: 1,
  SIGNALING_HAND_SHAKE_RESP: 2,
  DATA_HAND_SHAKE_REQ: 3,
  DATA_HAND_SHAKE_RESP: 4,
  EVENT_UPDATE: 6,
  CLIENT_READY_ACK: 7,
  STREAM_STATE_UPDATE: 8,
  SESSION_STATE_UPDATE: 9,
  KEEP_ALIVE_REQ: 12,
  KEEP_ALIVE_RESP: 13,
  MEDIA_DATA_CHAT: 18,
};
const MEDIA_CHAT = 16;
const CONTENT_TEXT = 5;

const hmac = (secret, message) => crypto.createHmac('sha256', secret).update(message).digest('hex');

export const rtmsSignature = (clientId, meetingUuid, streamId, clientSecret) =>
  hmac(clientSecret, `${clientId},${meetingUuid},${streamId}`);

/** Prüft die Signatur eines Zoom-Webhooks (x-zm-signature: v0=HMAC(secret, "v0:{timestamp}:{body}")). */
export function verifyWebhook(secretToken, rawBody, headers) {
  const ts = headers['x-zm-request-timestamp'];
  const sig = headers['x-zm-signature'];
  if (!ts || !sig || !secretToken) return false;
  // Alte Anfragen (mehr als 5 Minuten) ablehnen, um Wiederholungen zu verhindern.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = `v0=${hmac(secretToken, `v0:${ts}:${rawBody}`)}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Antwort auf die Endpunkt-Prüfung von Zoom. */
export const urlValidationResponse = (secretToken, plainToken) => ({
  plainToken,
  encryptedToken: hmac(secretToken, plainToken),
});

/**
 * Normalisiert eine Chat-Nachricht aus RTMS. Die Felder sind nicht überall gleich
 * dokumentiert, deshalb werden mehrere Formen akzeptiert.
 */
export function normalizeChat(msg) {
  const c = msg && typeof msg.content === 'object' && msg.content !== null ? msg.content : msg;
  const text = [c.data, c.text, typeof msg.content === 'string' ? msg.content : undefined].find(
    (v) => typeof v === 'string' && v.trim(),
  );
  if (!text) return null;
  const sender = c.user_name ?? c.userName ?? c.sender_name ?? msg.user_name ?? 'Unbekannt';
  const ts = Number(c.timestamp ?? msg.timestamp ?? Date.now());
  // Zeitstempel können in Sekunden, Millisekunden oder Mikrosekunden kommen.
  const at = ts > 1e14 ? Math.round(ts / 1000) : ts > 1e11 ? ts : ts * 1000;
  return { sender: String(sender), text: text.trim(), at: Number.isFinite(at) ? at : Date.now(), userId: c.user_id ?? null };
}

/**
 * Verwaltet die RTMS-Verbindungen. `onChat` bekommt jede Chat-Nachricht,
 * `onStatus` jede Statusänderung (für die Anzeige in der App).
 */
export function createRtms({ clientId, clientSecret, log, onChat, onStatus }) {
  const streams = new Map(); // streamId -> { meetingUuid, signaling, media, messages, since }
  let status = { state: clientId && clientSecret ? 'bereit' : 'nicht-eingerichtet', meeting: null, since: null, messages: 0, error: null };

  const setStatus = (patch) => {
    status = { ...status, ...patch };
    onStatus(status);
  };

  const keepAlive = (ws, msg) =>
    ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ msg_type: MSG.KEEP_ALIVE_RESP, timestamp: msg.timestamp }));

  function connectMedia(stream, streamId, url) {
    const media = new WebSocket(url);
    stream.media = media;
    media.on('open', () => {
      media.send(
        JSON.stringify({
          msg_type: MSG.DATA_HAND_SHAKE_REQ,
          protocol_version: 1,
          meeting_uuid: stream.meetingUuid,
          rtms_stream_id: streamId,
          signature: rtmsSignature(clientId, stream.meetingUuid, streamId, clientSecret),
          media_type: MEDIA_CHAT,
          payload_encryption: false,
          media_params: { chat: { content_type: CONTENT_TEXT } },
        }),
      );
    });
    media.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.msg_type === MSG.DATA_HAND_SHAKE_RESP) {
        if (msg.status_code === 0) {
          stream.signaling?.send(JSON.stringify({ msg_type: MSG.CLIENT_READY_ACK, rtms_stream_id: streamId }));
          setStatus({ state: 'verbunden', meeting: stream.meetingUuid, since: Date.now(), error: null });
          log('RTMS: Chat-Datenstrom verbunden.');
        } else {
          setStatus({ state: 'fehler', error: `Zoom hat die Chat-Verbindung abgelehnt (Code ${msg.status_code}).` });
          log('RTMS: Media-Handshake abgelehnt', msg.status_code, msg.reason ?? '');
        }
      } else if (msg.msg_type === MSG.KEEP_ALIVE_REQ) {
        keepAlive(media, msg);
      } else if (msg.msg_type === MSG.MEDIA_DATA_CHAT) {
        const chat = normalizeChat(msg);
        if (chat) {
          stream.messages += 1;
          setStatus({ messages: status.messages + 1 });
          onChat({ ...chat, streamId, seq: stream.messages });
        } else {
          log('RTMS: Chat-Nachricht in unbekanntem Format', JSON.stringify(msg).slice(0, 300));
        }
      }
    });
    media.on('close', () => log('RTMS: Media-Verbindung geschlossen.'));
    media.on('error', (e) => log('RTMS: Media-Fehler', e.message));
  }

  function start({ meeting_uuid: meetingUuid, rtms_stream_id: streamId, server_urls: serverUrls }) {
    if (!clientId || !clientSecret) {
      setStatus({ state: 'fehler', error: 'Zugangsdaten fehlen (.env.local).' });
      return;
    }
    if (!meetingUuid || !streamId || !serverUrls || streams.has(streamId)) return;
    const stream = { meetingUuid, signaling: null, media: null, messages: 0, since: Date.now() };
    streams.set(streamId, stream);
    setStatus({ state: 'verbindet', meeting: meetingUuid, error: null });
    log('RTMS: Meeting gestartet, verbinde …');

    const signaling = new WebSocket(serverUrls);
    stream.signaling = signaling;
    signaling.on('open', () => {
      signaling.send(
        JSON.stringify({
          msg_type: MSG.SIGNALING_HAND_SHAKE_REQ,
          protocol_version: 1,
          meeting_uuid: meetingUuid,
          rtms_stream_id: streamId,
          sequence: crypto.randomInt(1_000_000),
          signature: rtmsSignature(clientId, meetingUuid, streamId, clientSecret),
          media_type: MEDIA_CHAT,
        }),
      );
    });
    signaling.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.msg_type === MSG.SIGNALING_HAND_SHAKE_RESP) {
        if (msg.status_code === 0) {
          const urls = msg.media_server?.server_urls ?? {};
          const url = urls.chat ?? urls.all ?? Object.values(urls)[0];
          if (url) connectMedia(stream, streamId, url);
          else setStatus({ state: 'fehler', error: 'Zoom hat keine Adresse für den Chat-Datenstrom geliefert.' });
        } else {
          setStatus({ state: 'fehler', error: `Zoom hat die Anmeldung abgelehnt (Code ${msg.status_code}). Zugangsdaten prüfen.` });
          log('RTMS: Signaling-Handshake abgelehnt', msg.status_code, msg.reason ?? '');
        }
      } else if (msg.msg_type === MSG.KEEP_ALIVE_REQ) {
        keepAlive(signaling, msg);
      } else if (msg.msg_type === MSG.STREAM_STATE_UPDATE || msg.msg_type === MSG.SESSION_STATE_UPDATE) {
        log('RTMS: Zustand', msg.state ?? '', msg.reason ?? '');
      }
    });
    signaling.on('close', () => {
      log('RTMS: Signaling-Verbindung geschlossen.');
      stop({ rtms_stream_id: streamId });
    });
    signaling.on('error', (e) => {
      log('RTMS: Signaling-Fehler', e.message);
      setStatus({ state: 'fehler', error: `Verbindung zu Zoom fehlgeschlagen: ${e.message}` });
    });
  }

  function stop({ rtms_stream_id: streamId }) {
    const stream = streams.get(streamId);
    if (!stream) return;
    streams.delete(streamId);
    stream.media?.close();
    stream.signaling?.close();
    if (streams.size === 0) setStatus({ state: 'bereit', meeting: null, since: null, error: null });
    log('RTMS: Meeting beendet oder Datenstrom gestoppt.');
  }

  return { start, stop, status: () => status, close: () => [...streams.keys()].forEach((id) => stop({ rtms_stream_id: id })) };
}
