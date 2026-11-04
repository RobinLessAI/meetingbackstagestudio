// Ortserkennung im Chat über das lokale Ortsverzeichnis.
//
// - findet Ortsnamen (auch mehrteilige wie „Bad Homburg vor der Höhe“), Postleitzahlen
//   und Bundesländer, unabhängig von Groß-/Kleinschreibung und Umlaut-Schreibweise
// - bei gleichnamigen Orten gewinnt ein deutlich größerer Ort, sonst geht die Angabe
//   mit Auswahl in die Prüfliste; Zusätze wie „in Sachsen“ grenzen die Auswahl ein
// - Wörter, die auch Ortsnamen sind („Essen“, „Waren“), zählen nur mit Ortsbezug
//   („aus Essen“) oder wenn die Nachricht kaum mehr enthält
// - kleine Tippfehler werden als Vorschlag zur Prüfung vorgelegt, nie automatisch gesetzt
import { DE_PLZ } from '../data/placesDe.ts';
import { PLACES, type Place } from '../data/places.ts';
import { normalize } from './text.ts';

export type LocationDetection =
  | { kind: 'eindeutig'; placeId: string; matched: string }
  | { kind: 'mehrdeutig'; placeIds: string[]; matched: string }
  | { kind: 'unbekannt'; candidate: string };

/** Kleinschreibung, Umlaute als ae/oe/ue/ss, Bindestriche als Leerzeichen, „Sankt“ als „st“. */
export function fold(text: string): string {
  return normalize(text)
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[àáâ]/g, 'a')
    .replace(/[èéê]/g, 'e')
    .replace(/-/g, ' ')
    .replace(/\bsankt\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------------ Index
const MAX_WORDS = 7;
/** Verbindungswörter, nach denen ein Namenszusatz beginnt („Frankfurt am Main“ → „frankfurt“). */
const QUALIFIER = /\s(?:am|an|an der|an den|in|im|in der|bei|ob|vor|vor der|auf|unter|ueber|zu)\s|\s\(/;
/** Übliche Abkürzungen der Zusätze im Chat. */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bam\b/g, 'a'],
  [/\ban der\b/g, 'a d'],
  [/\bbei\b/g, 'b'],
  [/\bin der\b/g, 'i d'],
  [/\bim\b/g, 'i'],
  [/\bvor der\b/g, 'v d'],
];

const index = new Map<string, Place[]>();
const addKey = (key: string, place: Place) => {
  if (!key || key.split(' ').length > MAX_WORDS) return;
  const list = index.get(key);
  if (!list) index.set(key, [place]);
  else if (!list.includes(place)) list.push(place);
};
// Orte außerhalb Deutschlands sind bekannte Großstädte; Länder und Bundesländer stehen über allen Orten.
const pop = (p: Place) => p.population ?? (p.kind === 'stadt' ? 1e6 : 1e7);

for (const place of PLACES) {
  const full = fold(place.name);
  // Ein- und zweibuchstabige Namen nur über ausdrückliche Schreibweisen (z. B. „bw“), sonst zu viele Zufallstreffer.
  if (full.length >= 3) addKey(full, place);
  for (const alias of place.aliases) addKey(fold(alias), place);
  // „Halle (Saale)“ → „halle“, „Frankfurt am Main“ → „frankfurt“
  const q = (' ' + place.name.toLowerCase() + ' ').search(QUALIFIER);
  if (q > 0) addKey(fold(place.name.slice(0, q - 1)), place);
  for (const [re, short] of ABBREVIATIONS) {
    const abbr = full.replace(re, short);
    if (abbr !== full) addKey(abbr, place);
  }
  // Ortsteile auch als „Hamburg Eißendorf“
  if (place.parent) addKey(fold(`${place.parent} ${place.name}`), place);
}
// Größte Orte zuerst, damit Auswahllisten sinnvoll sortiert sind.
for (const list of index.values()) list.sort((a, b) => pop(b) - pop(a));

const PLZ = new Map<string, number>(
  DE_PLZ.split(',').map((e) => {
    const [z, i] = e.split(':');
    return [z, Number(i)];
  }),
);
// PLACES beginnt mit den deutschen Orten in derselben Reihenfolge wie DE_PLACES (Index der PLZ-Liste).

// ---------------------------------------------------------------- Kontext
/** Wörter direkt vor einem Ort, die eine Ortsangabe anzeigen. */
const PREPOSITIONS = new Set(['aus', 'in', 'von', 'bei', 'nahe', 'naehe', 'um', 'im', 'nach', 'zwischen', 'ausm', 'vom', 'from', 'richtung']);
/** Wörter, die in Begrüßungen um eine Ortsangabe herum stehen. */
const FILLER = new Set(
  [
    'gruesse', 'gruess', 'gruss', 'gruesse', 'liebe', 'lieben', 'viele', 'herzliche', 'beste', 'schoene', 'sonnige', 'sonnigen', 'hallo', 'hi',
    'hey', 'moin', 'servus', 'guten', 'morgen', 'tag', 'abend', 'mahlzeit', 'aus', 'in', 'von', 'bei', 'dem', 'der', 'den', 'die', 'das', 'schoenen',
    'hier', 'live', 'dabei', 'und', 'ich', 'wir', 'bin', 'sind', 'sitze', 'sitzen', 'komme', 'kommen', 'wohne', 'wohnen', 'from', 'greetings', 'hello',
    'zugeschaltet', 'heute', 'aktuell', 'gerade', 'gruesst', 'euch', 'alle', 'an', 'nahe', 'naehe', 'um', 'im', 'nach', 'mit', 'zu', 'zuhause', 'home',
  ].map(fold),
);
/** Ortsnamen, die zugleich gängige Wörter oder Vornamen sind; sie zählen nur mit Ortsbezug. */
const COMMON = new Set(
  [
    'essen', 'waren', 'lage', 'rain', 'weil', 'mark', 'hof', 'wald', 'berg', 'see', 'au', 'zell', 'feld', 'dorf', 'linden', 'buch', 'ohne', 'kirchen',
    'werben', 'hagen', 'bad', 'neu', 'alt', 'mitte', 'nord', 'sued', 'ost', 'west', 'tal', 'halle', 'senden', 'kaufen', 'wolfen', 'bergen', 'bruch',
    'hausen', 'stein', 'fuchs', 'bach', 'eichen', 'roth', 'baden', 'heide', 'werther', 'weiden', 'singen', 'leer', 'eisen', 'ems', 'brake', 'lohne',
    'laufen', 'frieden', 'freiheit', 'hoffnung', 'sonne', 'wiese', 'wiesen', 'garten', 'markt', 'kirche', 'burg', 'mühle', 'muehle', 'brunnen', 'holz',
    'ruhe', 'gute', 'liebe', 'treue', 'mut', 'glauben', 'weg', 'land', 'lauf', 'rot', 'rothe', 'grund', 'ende', 'anger', 'horn', 'kamp', 'loh',
  ].map(fold),
);
/** Nach Formulierungen wie „aus …“ häufig genannt, aber kein Ort. */
const NOT_A_PLACE = new Set(
  [
    'homeoffice', 'home', 'buero', 'office', 'zug', 'auto', 'kueche', 'garten', 'urlaub', 'bett', 'cafe', 'bahn', 'zuhause', 'hotel', 'teams', 'zoom',
    'pause', 'raum', 'gruppe', 'workshop', 'meeting', 'breakout', 'sitzung', 'besprechung', 'arbeit', 'uni', 'schule', 'wohnzimmer', 'arbeitszimmer',
    'keller', 'dach', 'balkon', 'zentrale', 'firma', 'kita', 'praxis', 'dem', 'der', 'den', 'dem homeoffice', 'dem buero',
  ].map(fold),
);

const PHRASE =
  /(?:^|\s)(?:[Gg]r(?:ü|ue|u)(?:ß|ss)e|[Gg]ru(?:ß|ss)|[Hh]allo|[Mm]oin|[Ss]ervus|[Hh]i|[Ll]ive|[Dd]abei|[Zz]ugeschaltet|[Kk]omme|[Kk]ommen|[Bb]in|[Ss]ind|[Ss]itze|[Ss]itzen|[Ww]ohne|[Hh]ier)\s+(?:aus|in|von|bei)\s+(?:(?:dem|der|den|schönen|sonnigen|verregneten)\s+){0,2}(\p{Lu}[\p{L}.-]+(?:\s+\p{Lu}[\p{L}.-]+){0,2})/u;

interface Hit {
  start: number;
  end: number;
  key: string;
  candidates: Place[];
  plz: boolean;
}

/** Wählt bei gleichnamigen Orten einen deutlich größeren; sonst bleibt die Auswahl offen. */
function resolve(candidates: Place[]): Place[] {
  if (candidates.length <= 1) return candidates;
  const [a, b] = candidates;
  if (pop(a) >= 20000 && pop(a) >= 5 * pop(b)) return [a];
  return candidates.slice(0, 8);
}

// ---------------------------------------------------------- Tippfehler
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Ähnlich geschriebene Orte (für Vorschläge in der Prüfliste), standardmäßig ab 1.000 Einwohnern. */
export function suggestPlaces(candidate: string, limit = 5, maxDistance?: number, minPop = 1000): Place[] {
  const key = fold(candidate);
  if (key.length < 4) return [];
  const max = maxDistance ?? (key.length >= 8 ? 2 : 1);
  const found: Place[] = [];
  for (const [k, places] of index) {
    if (Math.abs(k.length - key.length) > max) continue;
    if (editDistance(k, key, max) > max) continue;
    for (const p of places) if (pop(p) >= minPop && !found.includes(p)) found.push(p);
  }
  return found.sort((a, b) => pop(b) - pop(a)).slice(0, limit);
}

/** Orte, deren Name mit der Eingabe beginnt (für die manuelle Zuordnung), größte zuerst. */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const starts: Place[] = [];
  for (const p of PLACES) {
    if (fold(p.name).startsWith(q)) starts.push(p);
  }
  // Regionen und Länder hinter Großstädten einordnen
  const rank = (p: Place) => (p.kind === 'stadt' ? pop(p) : 150000);
  return starts.sort((a, b) => rank(b) - rank(a)).slice(0, limit);
}

// ------------------------------------------------------------- Erkennung
const cache = new Map<string, LocationDetection | null>();

/**
 * Erkennt Ortsangaben anhand des lokalen Ortsverzeichnisses.
 * Unbekannte Orte werden nur über typische Formulierungen („Grüße aus …“) erkannt
 * und nie auf die Karte gesetzt, sondern zur Prüfung vorgelegt.
 */
export function detectLocation(text: string): LocationDetection | null {
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const result = detect(text);
  if (cache.size > 5000) cache.clear();
  cache.set(text, result);
  return result;
}

function detect(text: string): LocationDetection | null {
  const words = fold(text).split(' ').filter(Boolean);
  if (!words.length) return null;

  // Längste passende Wortfolgen von links nach rechts
  const hits: Hit[] = [];
  for (let i = 0; i < words.length; ) {
    let hit: Hit | null = null;
    if (/^\d{5}$/.test(words[i]) && PLZ.has(words[i])) {
      hit = { start: i, end: i + 1, key: words[i], candidates: [PLACES[PLZ.get(words[i])!]], plz: true };
    } else {
      for (let n = Math.min(MAX_WORDS, words.length - i); n >= 1; n--) {
        const key = words.slice(i, i + n).join(' ');
        const candidates = index.get(key);
        if (candidates) {
          hit = { start: i, end: i + n, key, candidates, plz: false };
          break;
        }
      }
    }
    if (hit) {
      hits.push(hit);
      i = hit.end;
    } else i++;
  }

  // Ortsbezug prüfen: Präposition davor oder kaum weitere Wörter in der Nachricht
  const covered = new Set(hits.flatMap((h) => Array.from({ length: h.end - h.start }, (_, k) => h.start + k)));
  const rest = words.filter((w, i) => !covered.has(i) && !FILLER.has(w) && !/^\d+$/.test(w));
  const short = rest.length <= 2;
  const accepted = hits.filter((h) => {
    if (h.plz) return true;
    if (NOT_A_PLACE.has(h.key)) return false;
    const prep = h.start > 0 && PREPOSITIONS.has(words[h.start - 1]);
    const multiword = h.end - h.start >= 2;
    // „aus Werl“, „Grüße aus Kleinkleckersdorf“ oder die Nachricht ist nur der Ort
    if (prep || (rest.length === 0 && hits.length === 1)) return true;
    if (COMMON.has(h.key)) return false;
    // Kurze Nachricht: Orte ab 1.000 Einwohnern; lange Nachricht ohne Ortsbezug: nur große Orte
    if (short) return multiword || pop(h.candidates[0]) >= 1000;
    return multiword || pop(h.candidates[0]) >= 50000;
  });

  // „Kleinmachnow bei Berlin“, „Gröbenzell nahe München“: der zweite Ort dient nur zur Einordnung.
  const located = accepted.filter(
    (h, i) => !(i > 0 && h.start > 0 && ['bei', 'nahe', 'naehe', 'b'].includes(words[h.start - 1]) && accepted[i - 1].candidates.every((p) => p.kind === 'stadt')),
  );
  accepted.length = 0;
  accepted.push(...located);

  if (accepted.length) {
    // Bundesländer und Gemeinden dienen als Zusatz („Neustadt in Sachsen“, „Hamburg Eißendorf“).
    const regions = accepted.filter((h) => h.candidates.every((p) => p.kind === 'region'));
    const others = accepted.filter((h) => !regions.includes(h));
    const states = new Set(regions.flatMap((h) => h.candidates.map((p) => p.state)));
    const used = new Set<Hit>();
    const resolved = others.map((h) => {
      let c = h.candidates;
      if (states.size) {
        const inState = c.filter((p) => p.state && states.has(p.state));
        if (inState.length) {
          c = inState;
          regions.forEach((r) => used.add(r));
        }
      }
      const parents = others.filter((o) => o !== h).flatMap((o) => o.candidates.map((p) => p.name));
      const inParent = c.filter((p) => p.parent && parents.includes(p.parent));
      if (inParent.length) {
        c = inParent;
        for (const o of others) if (o !== h && o.candidates.some((p) => inParent.some((q) => q.parent === p.name))) used.add(o);
      }
      return { hit: h, places: resolve(c) };
    });
    const final = [...resolved.filter((r) => !used.has(r.hit)), ...regions.filter((r) => !used.has(r)).map((h) => ({ hit: h, places: h.candidates }))];
    const ids = [...new Set(final.flatMap((r) => r.places.map((p) => p.id)))];
    const matched = [...new Set(final.map((r) => r.hit.key))].join(', ');
    if (ids.length === 1) return { kind: 'eindeutig', placeId: ids[0], matched };
    if (ids.length > 1) return { kind: 'mehrdeutig', placeIds: ids.slice(0, 8), matched };
  }

  // Unbekannter Ort nach typischer Formulierung oder als kurze Nachricht: Tippfehler-Vorschläge
  const phrase = text.normalize('NFC').match(PHRASE);
  let candidate = phrase?.[1]?.trim() ?? '';
  // Kurze Nachricht ohne Formulierung („Dortmunt“): nur bei längeren Wörtern, damit Begriffe für die Wortwolke nicht stören.
  if (!candidate && !hits.length && words.length <= 2 && /^\p{Lu}/u.test(text.trim()) && fold(text).length >= 6) {
    candidate = text.trim().replace(/[!.?,;:]+$/, '');
  }
  if (candidate && !NOT_A_PLACE.has(fold(candidate))) {
    // Ohne Formulierung nur Städte ab 20.000 Einwohnern vorschlagen, sonst wirken Wörter wie „Pausen“ wie Orte.
    const suggestions = phrase ? suggestPlaces(candidate) : suggestPlaces(candidate, 5, 1, 20000);
    if (suggestions.length) return { kind: 'mehrdeutig', placeIds: suggestions.map((p) => p.id), matched: candidate };
    if (phrase && candidate.length >= 3) return { kind: 'unbekannt', candidate };
  }
  return null;
}
