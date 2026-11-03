// Einlesen des gespeicherten Zoom-Chats („Chat speichern“ im Zoom-Client).
//
// Zoom hat das Dateiformat mehrfach geändert und dokumentiert es nicht offiziell.
// Der Parser erkennt deshalb mehrere bekannte Varianten und übernimmt
// ausschließlich Nachrichten an alle. Private Nachrichten werden nie übernommen.

export interface ParsedChatMessage {
  /** Uhrzeit aus der Datei, z. B. „10:05:23“. */
  time: string;
  sender: string;
  text: string;
}

export interface ChatParseResult {
  messages: ParsedChatMessage[];
  skippedPrivate: number;
  skippedReactions: number;
  format: 'zoom' | 'einfach' | 'unbekannt';
}

const TIME = String.raw`(\d{1,2}:\d{2}(?::\d{2})?)`;

/** „10:01:51 From Robin to Everyone:“ bzw. „10:01:51 Von Robin an Alle: Text“ */
const HEADER_TARGET = new RegExp(String.raw`^${TIME}\s+(?:From|Von)\s+(.+?)\s+(?:to|an)\s+(.+?)\s*:\s?(.*)$`, 'i');
/** Älteres Format: „10:05:23	 From  Jonas Petersen : Hallo“ */
const HEADER_PLAIN = new RegExp(String.raw`^${TIME}\s+(?:From|Von)\s+(.+?)\s*:\s?(.*)$`, 'i');

const PUBLIC_TARGETS = /^(everyone|alle|jeden|jeder|allen)$/i;
const ROLE_SUFFIX = /\s*\((host|co-host|gastgeber|co-gastgeber|mitgastgeber|mitveranstalter|moderator)\)\s*$/i;
const REACTION = /^(reacted to|reagierte auf|hat mit .* reagiert|removed a .* reaction)/i;
const REPLY = /^(replying to|antwort auf)\s+["„“]/i;

const cleanName = (name: string) => name.replace(ROLE_SUFFIX, '').replace(/\s+/g, ' ').trim();

export function parseZoomChat(raw: string): ChatParseResult {
  const lines = raw.replace(/^﻿/, '').split(/\r?\n/);
  const result: ChatParseResult = { messages: [], skippedPrivate: 0, skippedReactions: 0, format: 'unbekannt' };
  let current: (ParsedChatMessage & { isPrivate: boolean }) | null = null;

  const flush = () => {
    if (!current) return;
    const text = current.text.trim();
    if (current.isPrivate) result.skippedPrivate += 1;
    else if (REACTION.test(text)) result.skippedReactions += 1;
    else if (text) result.messages.push({ time: current.time, sender: current.sender, text });
    current = null;
  };

  for (const line of lines) {
    const target = line.match(HEADER_TARGET);
    const plain = target ? null : line.match(HEADER_PLAIN);
    if (target || plain) {
      flush();
      result.format = 'zoom';
      if (target) {
        const [, time, sender, to, text] = target;
        const isPrivate = !PUBLIC_TARGETS.test(cleanName(to)) || /privat|direct|direkt/i.test(to);
        current = { time, sender: cleanName(sender), text: text ?? '', isPrivate };
      } else {
        const [, time, sender, text] = plain!;
        current = { time, sender: cleanName(sender), text: text ?? '', isPrivate: /privately|privat/i.test(sender) };
      }
      continue;
    }
    if (current) {
      const body = line.trim();
      if (!body || REPLY.test(body)) continue;
      current.text = current.text ? `${current.text}\n${body}` : body;
    }
  }
  flush();

  // Einfaches Format ohne Zoom-Kopfzeilen: eine Nachricht pro Zeile „Name: Text“.
  if (result.format === 'unbekannt') {
    for (const line of lines) {
      const m = line.match(/^\s*([^:\n]{1,60}?)\s*:\s+(.+)$/);
      if (m) result.messages.push({ time: '', sender: cleanName(m[1]), text: m[2].trim() });
    }
    if (result.messages.length) result.format = 'einfach';
  }
  return result;
}

/** Wandelt die Uhrzeit aus der Datei in einen Zeitstempel von heute (oder gestern, nach Mitternacht). */
export function timeToTimestamp(time: string, now: number = Date.now()): number {
  const m = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return now;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), Number(m[3] ?? 0), 0);
  // Liegt die Zeit deutlich in der Zukunft, stammt die Nachricht vom Vortag.
  if (d.getTime() - now > 5 * 60_000) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/**
 * Schlüssel, um bereits übernommene Nachrichten beim erneuten Einlesen derselben
 * Datei zu erkennen. Gleiche Nachrichten in derselben Sekunde werden durchnummeriert.
 */
export function importKeys(messages: ParsedChatMessage[]): string[] {
  const seen = new Map<string, number>();
  return messages.map((m, i) => {
    const base = m.time ? `${m.time}|${m.sender}|${m.text}` : `ohne-zeit|${i}|${m.sender}|${m.text}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}#${n}` : base;
  });
}
