// Zoom Meeting SDK (Web): MeetingBackstage tritt dem eigenen Meeting als sichtbarer
// zusätzlicher Teilnehmer „MeetingBackstage (Regie)“ bei und liest den Chat mit.
// Kostenfrei, ohne Realtime Media Streams.
//
// Der Server erzeugt nur die Beitritts-Signatur (das Client-Geheimnis bleibt auf
// diesem Rechner) und wandelt eingehende Chat-Nachrichten in das Format der App um.
import crypto from 'node:crypto';

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** Meeting-ID und (falls im Link enthalten) Kenncode aus einem Zoom-Link oder einer Nummer lesen. */
export function parseMeetingLink(input) {
  const v = String(input ?? '').trim();
  let meetingId = '';
  const link = v.match(/\/(?:j|w|s|wc\/join|wc)\/(\d{9,12})/);
  if (link) meetingId = link[1];
  else {
    const digits = v.replace(/[\s-]/g, '');
    if (/^\d{9,12}$/.test(digits)) meetingId = digits;
  }
  const pwd = v.match(/[?&]pwd=([^&#\s]+)/);
  return { meetingId, passcode: pwd ? decodeURIComponent(pwd[1]) : '' };
}

/**
 * Signatur für den Beitritt (JWT, HS256), wie Zoom sie für das Meeting SDK verlangt.
 * role 0 = Teilnehmer. Ab SDK 5 muss appKey enthalten sein.
 */
export function meetingSignature({ clientId, clientSecret, meetingNumber, role = 0, now = Date.now() }) {
  const iat = Math.floor(now / 1000) - 30;
  const exp = iat + 2 * 60 * 60;
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({ appKey: clientId, sdkKey: clientId, mn: String(meetingNumber), role, iat, exp, tokenExp: exp });
  const sig = crypto.createHmac('sha256', clientSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const firstString = (...values) => values.find((v) => typeof v === 'string' && v.trim() !== '');
const EVERYONE = /^(everyone|alle|jeder|all)$/i;

/**
 * Chat-Nachricht aus dem SDK-Ereignis onReceiveChatMsg lesen. Zoom dokumentiert das
 * Format nicht verbindlich, daher werden die bekannten Varianten akzeptiert.
 * Gibt null zurück, wenn kein Text erkennbar ist. private = an einzelne Person gerichtet.
 */
export function normalizeSdkChat(data, now = Date.now()) {
  if (!data || typeof data !== 'object') return null;
  const c = data.content && typeof data.content === 'object' ? data.content : data.data && typeof data.data === 'object' ? data.data : data;
  const text = firstString(c.message, c.text, typeof c.content === 'string' ? c.content : undefined, c.msg, data.message, data.text);
  if (!text) return null;
  const senderName =
    firstString(c.senderName, c.sender?.name, c.sender?.displayName, typeof c.sender === 'string' ? c.sender : undefined, data.senderName) ??
    'Unbekannt';
  const receiverName = firstString(c.receiverName, c.receiver?.name, typeof c.receiver === 'string' ? c.receiver : undefined, data.receiverName);
  const receiverId = c.receiverId ?? c.receiver?.userId ?? data.receiverId;
  const toEveryone = receiverName ? EVERYONE.test(receiverName.trim()) : receiverId === undefined || receiverId === null || Number(receiverId) === 0;
  let at = Number(c.timestamp ?? c.time ?? c.t ?? data.timestamp ?? 0);
  if (at > 0 && at < 1e12) at *= 1000; // Sekunden statt Millisekunden
  if (!(at > 0) || Math.abs(at - now) > 24 * 3600_000) at = now;
  const id = c.msgId ?? c.messageId ?? c.id ?? data.msgId ?? data.id;
  const key = id
    ? `sdk:${id}`
    : `sdk:${crypto.createHash('sha1').update(`${senderName}|${text}|${Math.floor(at / 1000)}`).digest('hex').slice(0, 16)}`;
  return { key, senderName, text: text.trim(), at, private: !toEveryone };
}
