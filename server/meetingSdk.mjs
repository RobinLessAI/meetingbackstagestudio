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
const EVERYONE = /^(everyone|alle|an alle|jeder|all|hallo allerseits!?)$/i;

/**
 * Chat-Nachricht aus dem SDK-Ereignis onReceiveChatMsg lesen.
 *
 * Zoom Web SDK 6.x liefert (ggf. eingepackt in { data: … }):
 *   { sender, senderId, timestamp, receiver, receiverId, type: 'text' | 'file',
 *     content: { text, messageId, chatType, … } }
 * Ältere Versionen nutzen andere Felder; die werden weiterhin akzeptiert.
 * Gibt null zurück, wenn kein Text erkennbar ist (z. B. Dateien). private = an einzelne Person gerichtet.
 */
export function normalizeSdkChat(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  // Einpackung { data: {...} } entfernen
  const data =
    raw.data && typeof raw.data === 'object' && (raw.data.content || raw.data.sender || raw.data.text || raw.data.message) ? raw.data : raw;
  if (data.type === 'file') return null;
  const content = data.content && typeof data.content === 'object' ? data.content : {};
  const text = firstString(content.text, content.message, typeof data.content === 'string' ? data.content : undefined, data.text, data.message, data.msg);
  if (!text) return null;
  const senderName =
    firstString(
      typeof data.sender === 'string' ? data.sender : undefined,
      data.sender?.name,
      data.sender?.displayName,
      data.senderName,
      content.senderName,
      content.sender?.name,
    ) ?? 'Unbekannt';
  const receiverName = firstString(typeof data.receiver === 'string' ? data.receiver : undefined, data.receiver?.name, data.receiverName, content.receiverName);
  const rawReceiverId = data.receiverId ?? data.receiver?.userId ?? content.receiverId;
  const hasReceiverId = rawReceiverId !== undefined && rawReceiverId !== null && rawReceiverId !== '';
  // Die Empfänger-ID ist verlässlicher als der (übersetzte) Name: 0 = an alle.
  const toEveryone = hasReceiverId ? Number(rawReceiverId) === 0 : receiverName ? EVERYONE.test(receiverName.trim()) : true;
  let at = Number(data.timestamp ?? content.t ?? content.timestamp ?? data.time ?? 0);
  if (at > 0 && at < 1e12) at *= 1000; // Sekunden statt Millisekunden
  if (!(at > 0) || Math.abs(at - now) > 24 * 3600_000) at = now;
  const id = content.messageId ?? content.msgId ?? data.msgId ?? data.messageId ?? data.id;
  const key = id
    ? `sdk:${id}`
    : `sdk:${crypto.createHash('sha1').update(`${senderName}|${text}|${Math.floor(at / 1000)}`).digest('hex').slice(0, 16)}`;
  return { key, senderName, text: text.trim(), at, private: !toEveryone };
}

/** Ersten vorhandenen Wert aus mehreren möglichen Feldnamen lesen (das SDK benennt Felder je Version anders). */
const first = (o, keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/**
 * Teilnehmerliste aus dem Meeting SDK (getAttendeeslist) in ein schlankes Format bringen.
 * Die Regie selbst wird herausgefiltert; Rolle der Regie: host, cohost oder teilnehmer.
 */
export function normalizeAttendees(rawList, rawSelf, spotlight) {
  const selfId = Number(first(rawSelf, ['userId', 'userid', 'id']));
  const list = (Array.isArray(rawList) ? rawList : [])
    .map((u) => {
      const userId = Number(first(u, ['userId', 'userid', 'id']));
      const name = String(first(u, ['userName', 'displayName', 'name']) ?? '').trim();
      if (!Number.isFinite(userId) || !name) return null;
      const video = first(u, ['bVideoOn', 'isVideoOn', 'videoOn', 'video']);
      const muted = first(u, ['muted', 'isMuted', 'bMute']);
      const hand = first(u, ['bRaiseHand', 'isRaiseHand', 'raiseHand', 'raisedHand']);
      return {
        userId,
        name,
        host: Boolean(first(u, ['isHost'])),
        cohost: Boolean(first(u, ['isCoHost', 'bCoHost', 'isCohost'])),
        video: video === undefined ? null : Boolean(video),
        muted: muted === undefined ? null : Boolean(muted),
        hand: Boolean(hand),
      };
    })
    .filter((u) => u && u.userId !== selfId);
  const isHost = Boolean(first(rawSelf, ['isHost']));
  const isCoHost = Boolean(first(rawSelf, ['isCoHost', 'bCoHost', 'isCohost'])) || String(first(rawSelf, ['role', 'userRole']) ?? '').toLowerCase().includes('cohost');
  return {
    list,
    spotlight: Array.isArray(spotlight) ? spotlight.map(Number).filter(Number.isFinite) : [],
    spotlightKnown: Array.isArray(spotlight),
    role: isHost ? 'host' : isCoHost ? 'cohost' : rawSelf ? 'teilnehmer' : 'unbekannt',
  };
}

/** Verständliche Meldung, wenn Zoom ein Spotlight ablehnt. */
export function spotlightError(error, code, role) {
  if (role === 'teilnehmer') {
    return 'Zoom lässt das Spotlight nur Host oder Co-Host setzen. In Zoom unter „Teilnehmer“ bei „MeetingBackstage (Regie)“ auf „Mehr“ → „Zum Co-Host machen“ klicken.';
  }
  const text = String(error ?? '').trim();
  return `Zoom hat das Spotlight abgelehnt${text ? `: ${text}` : ''}${code !== null && code !== undefined ? ` (${code})` : ''}. Spotlight braucht mindestens drei Personen im Meeting, und die Person muss ihr Video eingeschaltet haben.`;
}
