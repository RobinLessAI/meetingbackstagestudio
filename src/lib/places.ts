import { AMBIGUOUS_ALIASES, PLACES } from '../data/places.ts';
import { findWord, normalize } from './text.ts';

export type LocationDetection =
  | { kind: 'eindeutig'; placeId: string; matched: string }
  | { kind: 'mehrdeutig'; placeIds: string[]; matched: string }
  | { kind: 'unbekannt'; candidate: string };

interface AliasEntry {
  alias: string;
  placeIds: string[];
  ambiguous: boolean;
}

const ALIASES: AliasEntry[] = [
  ...PLACES.flatMap((p) =>
    p.aliases.map((a) => ({ alias: normalize(a), placeIds: [p.id], ambiguous: false })),
  ),
  ...Object.entries(AMBIGUOUS_ALIASES).map(([alias, placeIds]) => ({
    alias: normalize(alias),
    placeIds,
    ambiguous: true,
  })),
].sort((a, b) => b.alias.length - a.alias.length);

/**
 * Typische Formulierungen für eine Ortsangabe. Nur der großgeschriebene Teil
 * danach wird als möglicher Ort betrachtet.
 */
const PHRASE =
  /(?:^|\s)(?:[Gg]r(?:ü|ue|u)(?:ß|ss)e|[Gg]ru(?:ß|ss)|[Hh]allo|[Mm]oin|[Ss]ervus|[Hh]i|[Ll]ive|[Dd]abei|[Zz]ugeschaltet|[Kk]omme|[Kk]ommen|[Bb]in|[Ss]ind|[Ss]itze|[Ss]itzen|[Ww]ohne|[Hh]ier)\s+(?:aus|in|von)\s+(?:(?:dem|der|den|schönen|sonnigen|verregneten)\s+){0,2}(\p{Lu}[\p{L}-]+(?:\s+\p{Lu}[\p{L}-]+)?)/u;

/** Wörter, die nach diesen Formulierungen häufig stehen, aber kein Ort sind. */
const NOT_A_PLACE = new Set(
  [
    'homeoffice', 'home', 'büro', 'office', 'zug', 'auto', 'küche', 'garten', 'urlaub', 'bett',
    'café', 'cafe', 'bahn', 'zuhause', 'hotel', 'teams', 'zoom', 'pause', 'raum', 'gruppe',
    'workshop', 'meeting', 'breakout', 'sitzung', 'besprechung', 'arbeit', 'uni', 'schule',
  ].map((w) => normalize(w)),
);

/**
 * Erkennt Ortsangaben ausschließlich anhand des lokalen Ortsverzeichnisses.
 * Unbekannte Orte werden nur über typische Formulierungen („Grüße aus …“) erkannt
 * und nie auf die Karte gesetzt, sondern zur Prüfung vorgelegt.
 */
export function detectLocation(text: string): LocationDetection | null {
  let work = normalize(text);
  if (!work) return null;

  const hits: AliasEntry[] = [];
  const matched: string[] = [];
  for (const entry of ALIASES) {
    let idx = findWord(work, entry.alias);
    while (idx !== -1) {
      hits.push(entry);
      matched.push(entry.alias);
      // Fundstelle überschreiben, damit kürzere Schreibweisen nicht doppelt treffen.
      work = work.slice(0, idx) + ' '.repeat(entry.alias.length) + work.slice(idx + entry.alias.length);
      idx = findWord(work, entry.alias, idx + entry.alias.length);
    }
  }

  if (hits.length > 0) {
    const ids = [...new Set(hits.flatMap((h) => h.placeIds))];
    const matchedText = [...new Set(matched)].join(', ');
    if (ids.length === 1 && !hits.some((h) => h.ambiguous)) {
      return { kind: 'eindeutig', placeId: ids[0], matched: matchedText };
    }
    return { kind: 'mehrdeutig', placeIds: ids, matched: matchedText };
  }

  const phrase = text.normalize('NFC').match(PHRASE);
  if (phrase) {
    const candidate = phrase[1].trim();
    if (!NOT_A_PLACE.has(normalize(candidate)) && candidate.length >= 3) {
      return { kind: 'unbekannt', candidate };
    }
  }
  return null;
}
