// Erzeugt das deutsche Ortsverzeichnis src/data/placesDe.ts aus zwei freien GeoNames-Auszügen
// (GeoNames, CC BY 4.0, https://www.geonames.org):
//
// 1. Orte ab 1.000 Einwohnern mit Einwohnerzahl: Datei cities.pbf aus dem npm-Paket
//    „all-the-cities“ (z. B. `npm pack all-the-cities@3.1.0` und entpacken)
// 2. Postleitzahlen mit Ortsnamen: zipcodes.de.csv aus
//    https://github.com/zauberware/postal-codes-json-xml-csv (data/DE.zip)
//
// Aufruf: node scripts/generate-places-de.mjs <pfad/cities.pbf> <pfad/zipcodes.de.csv>
// Die App lädt zur Laufzeit nichts nach; es werden keine Daten über Personen gespeichert.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [pbfPath, csvPath] = process.argv.slice(2);
if (!pbfPath || !csvPath) {
  console.error('Aufruf: node scripts/generate-places-de.mjs <cities.pbf> <zipcodes.de.csv>');
  process.exit(1);
}

// Bundesländer in GeoNames-Reihenfolge (Code 01 … 16)
const STATES = [
  'Baden-Württemberg', 'Bayern', 'Bremen', 'Hamburg', 'Hessen', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz',
  'Saarland', 'Schleswig-Holstein', 'Brandenburg', 'Mecklenburg-Vorpommern', 'Sachsen', 'Sachsen-Anhalt', 'Thüringen', 'Berlin',
];
const LETTER = { BW: 1, BY: 2, HB: 3, HH: 4, HE: 5, NI: 6, NW: 7, RP: 8, SL: 9, SH: 10, BB: 11, MV: 12, SN: 13, ST: 14, TH: 15, BE: 16 };
const STATE_NAMES = {
  bavaria: 2, 'lower saxony': 6, 'north rhine-westphalia': 7, 'rhineland-palatinate': 8, thuringia: 15, saxony: 13,
  'saxony-anhalt': 14, 'land berlin': 16, 'freie und hansestadt hamburg': 4, 'freie hansestadt bremen': 3,
  'mecklenburg-western pomerania': 12, hesse: 5,
};
STATES.forEach((s, i) => (STATE_NAMES[s.toLowerCase()] = i + 1));
const stateOf = (code, name) => {
  const n = Number(code);
  if (n >= 1 && n <= 16) return n;
  if (LETTER[code]) return LETTER[code];
  return STATE_NAMES[String(name).toLowerCase()] ?? 0;
};

// ---------------------------------------------------------------- cities.pbf
function readPbf(buf) {
  let pos = 0;
  const varint = () => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = buf[pos++];
      result += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return result;
  };
  const svarint = () => {
    const v = varint();
    return v % 2 === 1 ? -(v + 1) / 2 : v / 2;
  };
  const string = () => {
    const len = varint();
    const s = buf.toString('utf8', pos, pos + len);
    pos += len;
    return s;
  };
  const out = [];
  let lastLat = 0;
  let lastLon = 0;
  while (pos < buf.length) {
    // Jede Stadt ist eine Nachricht mit Längenpräfix; Koordinaten sind über alle Nachrichten delta-codiert.
    const len = varint();
    const end = pos + len;
    const c = {};
    while (pos < end) {
      const key = varint();
      const tag = key >> 3;
      const type = key & 7;
      if (tag === 1) c.id = svarint();
      else if (tag === 2) c.name = string();
      else if (tag === 3) c.country = string();
      else if (tag === 9) c.pop = varint();
      else if (tag === 10) c.lon = (lastLon += svarint()) / 1e5;
      else if (tag === 11) c.lat = (lastLat += svarint()) / 1e5;
      else if (tag === 7) c.fc = string();
      else if (tag === 8) c.admin = string();
      else if (type === 2) string();
      else if (type === 0) varint();
      else throw new Error(`Unerwarteter Feldtyp ${type}`);
    }
    out.push(c);
  }
  return out;
}

const cities = readPbf(readFileSync(pbfPath)).filter((c) => c.country === 'DE' && c.name && c.lat && c.lon);

// ---------------------------------------------------------- zipcodes.de.csv
function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// Großkunden-Postleitzahlen (Firmen, Behörden) sind keine Orte.
const NOT_LOCALITY =
  /(ordinariat|bischöf|vikariat|dr\.|versorgung|regierung|pharma|restaurant|kanzlei|anwalt|hotel|apotheke|praxis|zentrum|center|messe|anstalt|kammer|justiz|industrie|gmbh|mbh|\bag\b|\bkg\b|\beg\b|e\.\s?v\.|bank|kasse|versicherung|verwaltung|amt\b|ämter|agentur|landesamt|behörde|klinik|universität|hochschule|verlag|zentrale|service|postfach|gesellschaft|verband|ministerium|gericht|polizei|zoll|stiftung|werk\b|werke\b|stadt\s|landeshauptstadt|gemeinde|kreis|bundes|deutsche|lotterie|krankenhaus|zeitung|rundfunk|fernseh|sparkasse|volksbank|niederlassung|schaden|betriebs|hauptverwaltung|kirche|bistum|landeskirche)/i;
const CONNECTORS = new Set(['am', 'an', 'der', 'die', 'den', 'dem', 'des', 'im', 'in', 'bei', 'ob', 'vor', 'auf', 'zu', 'zum', 'zur', 'unter', 'und', 'b.', 'a.', 'd.', 'v.', 'i.', 'a.d.', 'v.d.', 'o.', 'u.']);
const isLocalityName = (name) => {
  if (!name || NOT_LOCALITY.test(name) || /\d/.test(name)) return false;
  for (const word of name.replace(/[()]/g, ' ').split(/[\s/]+/).filter(Boolean)) {
    if (CONNECTORS.has(word.toLowerCase())) continue;
    if (/^\p{Lu}{2,}$/u.test(word.replace(/-/g, ''))) return false; // Abkürzungen wie SWR
    if (!/^\p{Lu}/u.test(word)) return false;
  }
  return true;
};

const zipRows = parseCsv(readFileSync(csvPath, 'utf8'));

// --------------------------------------------------------------- Zusammenführen
const keyOf = (name, state) => `${name.toLowerCase()}|${state}`;
const places = []; // { id, name, lat, lon, pop, state }
const byKey = new Map();

// GeoNames führt einzelne Großstädte unter englischem Namen.
const NAME_FIX = { Munich: 'München' };
for (const c of cities) {
  if (NAME_FIX[c.name]) c.name = NAME_FIX[c.name];
  // Stadtteile (PPLX) haben oft unplausible Einwohnerzahlen; sie zählen wie kleine Orte.
  if (c.fc === 'PPLX') c.pop = 0;
}
for (const c of cities) {
  const state = stateOf(c.admin, '');
  if (!state) continue;
  const key = keyOf(c.name, state);
  const prev = byKey.get(key);
  // Gleichnamige Einträge im selben Land: den größeren behalten.
  if (prev && prev.pop >= (c.pop ?? 0)) continue;
  const place = { id: `de-${c.id}`, name: c.name, lat: c.lat, lon: c.lon, pop: c.pop ?? 0, state };
  if (prev) places[places.indexOf(prev)] = place;
  else places.push(place);
  byKey.set(key, place);
}

// Kleinere Orte aus dem Postleitzahlenverzeichnis ergänzen (Koordinate = Mittel ihrer PLZ-Gebiete).
// Einträge wie „Bad Harzburg Westerode“ oder „Dresden Gompitz, Unkersdorf“ bestehen aus
// Gemeinde und Ortsteil(en); die Ortsteile werden als eigene kleine Orte mit Gemeinde geführt.
const zipLocalities = zipRows.filter((r) => isLocalityName(r.place) && stateOf(r.state_code, r.state));
const baseNames = new Set([...cities.map((c) => c.name.toLowerCase()), ...zipLocalities.map((r) => r.place.toLowerCase())]);
function splitMunicipality(full) {
  const words = full.split(' ');
  for (let n = words.length - 1; n >= 1; n--) {
    const prefix = words.slice(0, n).join(' ');
    const rest = words.slice(n).join(' ');
    // „Waren (Müritz)“, „Ruhstorf an der Rott“, „Wentorf bei Hamburg“ sind ein Name, keine Ortsteile.
    if (/^[(]/.test(rest) || CONNECTORS.has(words[n].toLowerCase())) continue;
    if (baseNames.has(prefix.toLowerCase())) return { municipality: prefix, districts: rest.split(/,\s*/).filter(Boolean) };
  }
  return { municipality: full, districts: [] };
}
const baseOf = (name) => name.split(/\s(?:am|an|an der|in|im|in der|bei|b\.|ob|vor|vor der|auf|i\.|a\.)\s|\s\(/)[0].trim().toLowerCase();
const citiesByBase = new Map();
for (const p of places) {
  p.alt = [];
  const b = baseOf(p.name);
  citiesByBase.set(b, [...(citiesByBase.get(b) ?? []), p]);
}
function sameCity(name, state, lat, lon) {
  for (const p of citiesByBase.get(baseOf(name)) ?? []) {
    if (p.state !== state) continue;
    const km = Math.hypot((p.lat - lat) * 111, (p.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180));
    if (km < 15) return p;
  }
  return null;
}
const extra = new Map();
const add = (key, entry, r) => {
  const e = extra.get(key) ?? { ...entry, lat: 0, lon: 0, n: 0, zip: r.zipcode };
  e.lat += Number(r.latitude);
  e.lon += Number(r.longitude);
  e.n += 1;
  if (r.zipcode < e.zip) e.zip = r.zipcode;
  extra.set(key, e);
};
const municipalityOfZipRow = new Map();
// Mehr als zwei Wörter ohne Verbindungswort („an der“, „bei“ …) sind fast immer Firmen- oder Personennamen.
const plausible = (name) => {
  const words = name.split(' ');
  return words.length <= 2 || words.some((w) => CONNECTORS.has(w.toLowerCase()) || w.startsWith('('));
};
for (const r of zipLocalities) {
  const state = stateOf(r.state_code, r.state);
  const { municipality, districts } = splitMunicipality(r.place);
  if (!plausible(municipality)) continue;
  municipalityOfZipRow.set(r, keyOf(municipality, state));
  if (!byKey.has(keyOf(municipality, state))) {
    // „Freiburg im Breisgau“ und „Freiburg“ sind derselbe Ort: als weitere Schreibweise führen.
    const same = sameCity(municipality, state, Number(r.latitude), Number(r.longitude));
    if (same) {
      byKey.set(keyOf(municipality, state), same);
      if (!same.alt.includes(municipality)) same.alt.push(municipality);
      continue;
    }
    add(keyOf(municipality, state), { name: municipality, state, parent: '' }, r);
  }
  for (const d of districts) {
    if (d.length < 3 || d.toLowerCase() === municipality.toLowerCase() || !isLocalityName(d) || !plausible(d) || byKey.has(keyOf(d, state))) continue;
    add(`${keyOf(d, state)}|${municipality.toLowerCase()}`, { name: d, state, parent: municipality }, r);
  }
}
const slug = (t) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const [key, e] of extra) {
  const place = {
    id: `de-p${e.zip}-${slug(e.parent ? `${e.name}-${e.parent}` : e.name)}`,
    name: e.name,
    parent: e.parent,
    lat: e.lat / e.n,
    lon: e.lon / e.n,
    pop: 0,
    state: e.state,
  };
  places.push(place);
  if (!e.parent) byKey.set(key, place);
}

// Postleitzahl → Ort
places.sort((a, b) => b.pop - a.pop || a.name.localeCompare(b.name, 'de'));
const index = new Map(places.map((p, i) => [p, i]));
const plz = {};
for (const r of zipRows) {
  if (!/^\d{5}$/.test(r.zipcode) || plz[r.zipcode] !== undefined) continue;
  const state = stateOf(r.state_code, r.state);
  const mKey = municipalityOfZipRow.get(r);
  let place = mKey ? byKey.get(mKey) : undefined;
  void state;
  if (!place) {
    // Großkunden-PLZ: nächstgelegenen Ort ab 10.000 Einwohnern nehmen.
    const lat = Number(r.latitude);
    const lon = Number(r.longitude);
    let best = null;
    let bestD = Infinity;
    for (const p of places) {
      if (p.pop < 10000) break;
      const d = (p.lat - lat) ** 2 + ((p.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    place = best;
  }
  if (place) plz[r.zipcode] = index.get(place);
}

// Mittelpunkt je Bundesland (einwohnergewichtet) für Angaben wie „aus Bayern“
const centers = STATES.map((_, i) => {
  let w = 0;
  let lat = 0;
  let lon = 0;
  for (const p of places) {
    if (p.state !== i + 1) continue;
    const pw = Math.max(p.pop, 500);
    w += pw;
    lat += p.lat * pw;
    lon += p.lon * pw;
  }
  return [Math.round((lat / w) * 1e4) / 1e4, Math.round((lon / w) * 1e4) / 1e4];
});

const rows = places.map((p) => {
  const row = [p.id, p.name, Math.round(p.lat * 1e4) / 1e4, Math.round(p.lon * 1e4) / 1e4, p.pop, p.state];
  if (p.parent || p.alt?.length) row.push(p.parent ?? '');
  if (p.alt?.length) row.push(p.alt);
  return row;
});
const plzCompact = Object.entries(plz)
  .sort()
  .map(([z, i]) => `${z}:${i}`)
  .join(',');

const out = `// Automatisch erzeugt durch scripts/generate-places-de.mjs – nicht von Hand bearbeiten.
// Daten: GeoNames (CC BY 4.0), https://www.geonames.org – Orte ab 1.000 Einwohnern
// sowie Orte aus dem Postleitzahlenverzeichnis. Enthält keine Daten über Personen.

/** Bundesländer, Index = GeoNames-Code - 1. */
export const DE_STATES = ${JSON.stringify(STATES)} as const;
/** Einwohnergewichteter Mittelpunkt je Bundesland [Breite, Länge]. */
export const DE_STATE_CENTERS: Array<[number, number]> = ${JSON.stringify(centers)};
/** [ID, Name, Breite, Länge, Einwohner (0 = unbekannt, kleiner Ort), Bundesland-Code, Gemeinde bei Ortsteilen, weitere Schreibweisen], nach Größe sortiert. */
export const DE_PLACES: Array<[string, string, number, number, number, number, string?, string[]?]> = ${JSON.stringify(rows)};
/** Postleitzahl:Index in DE_PLACES, durch Komma getrennt. */
export const DE_PLZ = ${JSON.stringify(plzCompact)};
`;
writeFileSync(join(root, 'src/data/placesDe.ts'), out);
console.log(
  `placesDe.ts: ${places.length} Orte (${cities.length} mit Einwohnerzahl, ${extra.size} aus PLZ, davon ${places.filter((p) => p.parent).length} Ortsteile), ` +
    `${Object.keys(plz).length} Postleitzahlen, ${(out.length / 1024).toFixed(0)} KB`,
);
