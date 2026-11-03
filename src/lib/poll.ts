import type { PollOption } from '../state/types.ts';
import { findWord, normalize } from './text.ts';

export type VoteMatch =
  | { kind: 'gueltig'; optionId: string; via: 'kennung' | 'text' }
  | { kind: 'unklar'; optionIds: string[] };

export function optionKey(index: number, style: 'buchstaben' | 'zahlen'): string {
  return style === 'buchstaben' ? String.fromCharCode(65 + index) : String(index + 1);
}

const PREFIX = /^(?:(?:antwort|option|nr|nummer|stimme|stimme für|ich wähle|ich nehme)\s+)?/;

/**
 * Ordnet eine Chat-Nachricht einer Antwortoption zu.
 *
 * Gültig ist eine Nachricht, wenn sie genau einer Kennung (A, B … oder 1, 2 …)
 * oder genau dem Antworttext entspricht. Nachrichten, die eine Kennung oder
 * einen Antworttext nur enthalten („eher B“, „B oder C“), gehen zur Prüfung.
 */
export function matchVote(text: string, options: PollOption[]): VoteMatch | null {
  const norm = normalize(text);
  if (!norm || options.length === 0) return null;

  const letters = options.map((_, i) => String.fromCharCode(97 + i));
  const numbers = options.map((_, i) => String(i + 1));
  const texts = options.map((o) => normalize(o.text));
  const keyIndex = (k: string) => {
    const li = letters.indexOf(k);
    return li >= 0 ? li : numbers.indexOf(k);
  };

  const stripped = norm.replace(PREFIX, '');

  // 1. Nur die Kennung, z. B. „B“, „b)“, „Antwort 2“
  if (/^(?:[a-z]|\d{1,2})$/.test(stripped)) {
    const i = keyIndex(stripped);
    if (i >= 0) return { kind: 'gueltig', optionId: options[i].id, via: 'kennung' };
  }

  // 2. Genau der Antworttext
  const ti = texts.indexOf(stripped);
  if (ti >= 0) return { kind: 'gueltig', optionId: options[ti].id, via: 'text' };

  // 3. Kennung plus passender Antworttext, z. B. „C Live-Demos“
  const combo = stripped.match(/^([a-z]|\d{1,2})\s+(.+)$/);
  if (combo) {
    const i = keyIndex(combo[1]);
    if (i >= 0 && texts[i] === combo[2]) {
      return { kind: 'gueltig', optionId: options[i].id, via: 'kennung' };
    }
  }

  // 4. Enthält Kennungen oder Antworttexte: zur Prüfung vorlegen
  const words = norm.split(' ');
  const candidates = new Set<number>();
  if (words.length <= 6) {
    for (const w of words) {
      const i = keyIndex(w);
      if (i >= 0) candidates.add(i);
    }
  }
  if (words.length <= 14) {
    texts.forEach((t, i) => {
      if (t.length >= 3 && findWord(norm, t) !== -1) candidates.add(i);
    });
  }
  if (candidates.size > 0) {
    return {
      kind: 'unklar',
      optionIds: [...candidates].sort((a, b) => a - b).map((i) => options[i].id),
    };
  }
  return null;
}
