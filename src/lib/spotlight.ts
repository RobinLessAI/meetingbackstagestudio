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
