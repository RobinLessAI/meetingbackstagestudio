import { importKeys, timeToTimestamp, type ParsedChatMessage } from '../lib/zoomChat.ts';
import { nextId } from './store.tsx';
import type { ChatMessage } from './types.ts';

/** Wandelt eingelesene Zoom-Chat-Nachrichten in Chat-Nachrichten der App um. */
export function toChatMessages(parsed: ParsedChatMessage[], now: number = Date.now()): ChatMessage[] {
  const keys = importKeys(parsed);
  return parsed.map((m, i) => ({
    id: nextId('z'),
    senderId: null,
    senderName: m.sender,
    text: m.text,
    // Ohne Uhrzeit (einfaches Format) zählen die Nachrichten ab jetzt, in Dateireihenfolge.
    at: m.time ? timeToTimestamp(m.time, now) : now + i,
    source: 'import',
    importKey: keys[i],
  }));
}

/** Wie viele der Nachrichten noch nicht im Chat sind. */
export function countNew(messages: ChatMessage[], chat: ChatMessage[]): number {
  const known = new Set(chat.map((m) => m.importKey).filter(Boolean));
  return messages.filter((m) => !m.importKey || !known.has(m.importKey)).length;
}
