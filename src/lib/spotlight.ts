// Spotlight: Personen zu gespeicherten Namen finden und die nächste Hand bestimmen (ohne React, testbar).
import type { ZoomPerson } from '../sync/SyncProvider.tsx';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Person zu einem gespeicherten Namen finden. Zoom-Namen ändern sich gern leicht
 * („Anna Schulz (sie/ihr)“, „Anna – iPad“), daher: genau, dann Anfang, dann enthalten.
 */
export function findPerson(list: ZoomPerson[], name: string): ZoomPerson | null {
  const n = norm(name);
  if (!n) return null;
  return (
    list.find((p) => norm(p.name) === n) ??
    list.find((p) => norm(p.name).startsWith(`${n} `) || norm(p.name).startsWith(`${n}(`)) ??
    list.find((p) => norm(p.name).includes(n)) ??
    null
  );
}

/** Wartende Hand, die am längsten oben ist und noch nicht im Spotlight steht. */
export function nextRaisedHand(list: ZoomPerson[], spotlight: number[]): ZoomPerson | null {
  return (
    list
      .filter((p) => p.hand && !spotlight.includes(p.userId))
      .sort((a, b) => (a.handSince ?? Infinity) - (b.handSince ?? Infinity) || a.name.localeCompare(b.name, 'de'))[0] ?? null
  );
}

/** Zoom erlaubt höchstens so viele Personen gleichzeitig im Spotlight. */
export const SPOTLIGHT_MAX = 9;

/**
 * Was ein Klick bzw. eine Taste für diese Person tun soll.
 * Mehrere gleichzeitig: dazunehmen oder nur diese Person herausnehmen.
 * Nur eine Person: ersetzen; steht sie schon allein im Spotlight, aufheben.
 */
export function spotlightOp(spotlight: number[], userId: number, multi: boolean): 'add' | 'replace' | 'remove' | 'voll' {
  const inSpot = spotlight.includes(userId);
  if (multi) {
    if (inSpot) return 'remove';
    if (spotlight.length === 0) return 'replace';
    return spotlight.length >= SPOTLIGHT_MAX ? 'voll' : 'add';
  }
  return inSpot && spotlight.length === 1 ? 'remove' : 'replace';
}

export interface Request {
  person: ZoomPerson;
  speaking: boolean;
  /** Hat in der letzten Minute gesprochen, ist aber gerade still oder stumm. */
  spokeRecently: boolean;
  hand: boolean;
  mic: boolean;
}

/** Wie lange „hat eben gesprochen“ angezeigt wird. */
export const SPOKE_RECENTLY_MS = 60_000;

/**
 * Wer sich gerade meldet: spricht, hat die Hand oben oder das Mikrofon an (ohne Host).
 * Reihenfolge: Sprechende zuerst, dann Hände (wer am längsten wartet), dann offene Mikrofone (neueste zuerst).
 */
export function currentRequests(list: ZoomPerson[], speakers: number[], now: number): Request[] {
  const rank = (r: Request) => (r.speaking ? 0 : r.hand ? 1 : r.mic ? 2 : 3);
  return list
    .filter((p) => !p.host)
    .map((p) => {
      const speaking = speakers.includes(p.userId) && p.muted !== true;
      const spokeRecently = !speaking && !!p.spokeAt && now - p.spokeAt < SPOKE_RECENTLY_MS;
      return { person: p, speaking, spokeRecently, hand: p.hand, mic: p.muted === false };
    })
    .filter((r) => r.speaking || r.hand || r.mic || r.spokeRecently)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.hand && b.hand ? (a.person.handSince ?? Infinity) - (b.person.handSince ?? Infinity) : 0) ||
        (b.person.micSince ?? 0) - (a.person.micSince ?? 0) ||
        (b.person.spokeAt ?? 0) - (a.person.spokeAt ?? 0) ||
        a.person.name.localeCompare(b.person.name, 'de'),
    );
}
