// Ortsverzeichnis für die Weltkarte.
//
// Deutschland: rund 15.000 Orte und Ortsteile mit Postleitzahlen aus GeoNames
// (CC BY 4.0, erzeugt durch scripts/generate-places-de.mjs). Dazu eine kleine Liste
// bekannter Orte außerhalb Deutschlands. Es werden keine Daten über Personen
// gespeichert: Ein Pin entsteht nur, wenn eine Person den Ort selbst im Chat nennt.
import { DE_PLACES, DE_STATE_CENTERS, DE_STATES } from './placesDe.ts';

export interface Place {
  id: string;
  name: string;
  /** Zusatz zur Unterscheidung, z. B. Bundesland oder Land. */
  region: string;
  kind: 'stadt' | 'land' | 'region';
  lat: number;
  lon: number;
  /** Zusätzliche Schreibweisen (nur Orte außerhalb Deutschlands und Länder). */
  aliases: string[];
  /** Einwohnerzahl, 0 = unbekannt (kleiner Ort oder Ortsteil). */
  population?: number;
  /** Bundesland-Code 1 … 16 bei Orten in Deutschland. */
  state?: number;
  /** Gemeinde, zu der ein Ortsteil gehört. */
  parent?: string;
}

/** Orte außerhalb Deutschlands und Länder. */
const INTERNATIONAL: Place[] = [
  { id: 'land-de', name: 'Deutschland', region: 'Land', kind: 'land', lat: 51.1657, lon: 10.4515, aliases: ['deutschland', 'germany'] },
  { id: 'wien', name: 'Wien', region: 'Österreich', kind: 'stadt', lat: 48.2082, lon: 16.3738, aliases: ['wien', 'vienna'] },
  { id: 'graz', name: 'Graz', region: 'Österreich', kind: 'stadt', lat: 47.0707, lon: 15.4395, aliases: ['graz'] },
  { id: 'linz', name: 'Linz', region: 'Österreich', kind: 'stadt', lat: 48.3069, lon: 14.2858, aliases: ['linz'] },
  { id: 'salzburg', name: 'Salzburg', region: 'Österreich', kind: 'stadt', lat: 47.8095, lon: 13.055, aliases: ['salzburg'] },
  { id: 'innsbruck', name: 'Innsbruck', region: 'Österreich', kind: 'stadt', lat: 47.2692, lon: 11.4041, aliases: ['innsbruck'] },
  { id: 'zuerich', name: 'Zürich', region: 'Schweiz', kind: 'stadt', lat: 47.3769, lon: 8.5417, aliases: ['zürich', 'zuerich', 'zurich'] },
  { id: 'bern', name: 'Bern', region: 'Schweiz', kind: 'stadt', lat: 46.948, lon: 7.4474, aliases: ['bern'] },
  { id: 'basel', name: 'Basel', region: 'Schweiz', kind: 'stadt', lat: 47.5596, lon: 7.5886, aliases: ['basel'] },
  { id: 'amsterdam', name: 'Amsterdam', region: 'Niederlande', kind: 'stadt', lat: 52.3676, lon: 4.9041, aliases: ['amsterdam'] },
  { id: 'paris', name: 'Paris', region: 'Frankreich', kind: 'stadt', lat: 48.8566, lon: 2.3522, aliases: ['paris'] },
  { id: 'london', name: 'London', region: 'Vereinigtes Königreich', kind: 'stadt', lat: 51.5074, lon: -0.1278, aliases: ['london'] },
  { id: 'lissabon', name: 'Lissabon', region: 'Portugal', kind: 'stadt', lat: 38.7223, lon: -9.1393, aliases: ['lissabon', 'lisbon', 'lisboa'] },
  { id: 'barcelona', name: 'Barcelona', region: 'Spanien', kind: 'stadt', lat: 41.3874, lon: 2.1686, aliases: ['barcelona'] },
  { id: 'mailand', name: 'Mailand', region: 'Italien', kind: 'stadt', lat: 45.4642, lon: 9.19, aliases: ['mailand', 'milano', 'milan'] },
  { id: 'warschau', name: 'Warschau', region: 'Polen', kind: 'stadt', lat: 52.2297, lon: 21.0122, aliases: ['warschau', 'warsaw', 'warszawa'] },
  { id: 'krakau', name: 'Krakau', region: 'Polen', kind: 'stadt', lat: 50.0647, lon: 19.945, aliases: ['krakau', 'kraków', 'krakow'] },
  { id: 'kopenhagen', name: 'Kopenhagen', region: 'Dänemark', kind: 'stadt', lat: 55.6761, lon: 12.5683, aliases: ['kopenhagen', 'copenhagen', 'københavn'] },
  { id: 'istanbul', name: 'Istanbul', region: 'Türkei', kind: 'stadt', lat: 41.0082, lon: 28.9784, aliases: ['istanbul'] },
  { id: 'accra', name: 'Accra', region: 'Ghana', kind: 'stadt', lat: 5.6037, lon: -0.187, aliases: ['accra'] },
  { id: 'nairobi', name: 'Nairobi', region: 'Kenia', kind: 'stadt', lat: -1.2921, lon: 36.8219, aliases: ['nairobi'] },
  { id: 'kapstadt', name: 'Kapstadt', region: 'Südafrika', kind: 'stadt', lat: -33.9249, lon: 18.4241, aliases: ['kapstadt', 'cape town'] },
  { id: 'new-york', name: 'New York', region: 'USA', kind: 'stadt', lat: 40.7128, lon: -74.006, aliases: ['new york', 'nyc'] },
  { id: 'toronto', name: 'Toronto', region: 'Kanada', kind: 'stadt', lat: 43.6532, lon: -79.3832, aliases: ['toronto'] },
  { id: 'mexiko-stadt', name: 'Mexiko-Stadt', region: 'Mexiko', kind: 'stadt', lat: 19.4326, lon: -99.1332, aliases: ['mexiko-stadt', 'mexiko stadt', 'mexico city'] },
  { id: 'sao-paulo', name: 'São Paulo', region: 'Brasilien', kind: 'stadt', lat: -23.5505, lon: -46.6333, aliases: ['são paulo', 'sao paulo'] },
  { id: 'singapur', name: 'Singapur', region: 'Singapur', kind: 'stadt', lat: 1.3521, lon: 103.8198, aliases: ['singapur', 'singapore'] },
  { id: 'tokio', name: 'Tokio', region: 'Japan', kind: 'stadt', lat: 35.6762, lon: 139.6503, aliases: ['tokio', 'tokyo'] },
  { id: 'sydney', name: 'Sydney', region: 'Australien', kind: 'stadt', lat: -33.8688, lon: 151.2093, aliases: ['sydney'] },
  { id: 'land-at', name: 'Österreich', region: 'Land', kind: 'land', lat: 47.5162, lon: 14.5501, aliases: ['österreich', 'oesterreich', 'austria'] },
  { id: 'land-ch', name: 'Schweiz', region: 'Land', kind: 'land', lat: 46.8182, lon: 8.2275, aliases: ['schweiz', 'switzerland', 'suisse'] },
];

/** Gebräuchliche fremdsprachige Namen großer Städte. */
const EXTRA_ALIASES: Record<string, string[]> = { München: ['munich'], Köln: ['cologne'], Nürnberg: ['nuremberg'], Hannover: ['hanover'] };

const DE: Place[] = DE_PLACES.map(([id, name, lat, lon, population, state, parent, alt]) => ({
  id,
  name,
  region: parent ? `${parent}, ${DE_STATES[state - 1]}` : DE_STATES[state - 1],
  kind: 'stadt',
  lat,
  lon,
  aliases: [...(alt ?? []), ...(population > 100000 ? (EXTRA_ALIASES[name] ?? []) : [])],
  population,
  state,
  parent: parent || undefined,
}));

/** Bundesländer als eigene Orte („aus Bayern“). Stadtstaaten sind bereits als Stadt enthalten. */
const STATES: Place[] = DE_STATES.flatMap((name, i) =>
  ['Berlin', 'Hamburg', 'Bremen'].includes(name)
    ? []
    : [{
        id: `bl-${i + 1}`,
        name,
        region: 'Bundesland',
        kind: 'region' as const,
        lat: DE_STATE_CENTERS[i][0],
        lon: DE_STATE_CENTERS[i][1],
        aliases: name === 'Nordrhein-Westfalen' ? ['nrw'] : name === 'Baden-Württemberg' ? ['bawü'] : name === 'Mecklenburg-Vorpommern' ? ['meckpomm'] : [],
        state: i + 1,
      }],
);

/** Bekannte Landschaften und Inseln, die oft statt eines Ortes genannt werden. */
const LANDSCAPES: Place[] = (
  [
    ['Allgäu', 47.72, 10.31], ['Bodensee', 47.63, 9.37], ['Schwarzwald', 48.3, 8.15], ['Ruhrgebiet', 51.5, 7.25, ['ruhrpott', 'pott']],
    ['Sauerland', 51.25, 8.1], ['Münsterland', 51.95, 7.6], ['Eifel', 50.3, 6.75], ['Harz', 51.75, 10.6], ['Erzgebirge', 50.55, 12.95],
    ['Rhön', 50.45, 9.95], ['Spreewald', 51.85, 14.0], ['Uckermark', 53.15, 13.85], ['Lausitz', 51.6, 14.3], ['Vogtland', 50.45, 12.15],
    ['Odenwald', 49.65, 8.95], ['Taunus', 50.25, 8.35], ['Westerwald', 50.6, 7.85], ['Hunsrück', 49.9, 7.3], ['Pfalz', 49.35, 8.0],
    ['Emsland', 52.7, 7.35], ['Ostfriesland', 53.4, 7.4], ['Lüneburger Heide', 53.1, 10.1], ['Oberbayern', 47.9, 11.6], ['Franken', 49.6, 10.9],
    ['Niederrhein', 51.5, 6.4], ['Ostwestfalen', 52.0, 8.6, ['owl', 'ostwestfalen-lippe']], ['Rheinland', 50.8, 6.9], ['Breisgau', 48.0, 7.8],
    ['Chiemgau', 47.85, 12.5], ['Bergisches Land', 51.15, 7.2], ['Siegerland', 50.85, 8.05],
    ['Rügen', 54.42, 13.4], ['Sylt', 54.9, 8.32], ['Usedom', 53.95, 14.05], ['Fehmarn', 54.45, 11.15], ['Föhr', 54.72, 8.5], ['Norderney', 53.71, 7.2],
  ] as Array<[string, number, number, string[]?]>
).map(([name, lat, lon, aliases]) => ({
  id: `ls-${name.toLowerCase().normalize('NFKD').replace(/[^a-z]+/g, '-')}`,
  name,
  region: 'Region, Deutschland',
  kind: 'region',
  lat,
  lon,
  aliases: aliases ?? [],
}));

export const PLACES: Place[] = [...DE, ...STATES, ...LANDSCAPES, ...INTERNATIONAL];

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]));

/**
 * Frühere IDs des kleinen Demo-Verzeichnisses (gespeicherte Veranstaltungen, Beispieldaten).
 * Sie zeigen auf den nächstgelegenen Ort gleichen Namens im neuen Verzeichnis.
 */
const LEGACY: Record<string, [string, number, number]> = {
  'werl': ['Werl', 51.5536, 7.9136],
  'soest': ['Soest', 51.5711, 8.1057],
  'dortmund': ['Dortmund', 51.5136, 7.4653],
  'muenster': ['Münster', 51.9607, 7.6261],
  'koeln': ['Köln', 50.9375, 6.9603],
  'berlin': ['Berlin', 52.52, 13.405],
  'hamburg': ['Hamburg', 53.5511, 9.9937],
  'bremen': ['Bremen', 53.0793, 8.8017],
  'muenchen': ['München', 48.1351, 11.582],
  'stuttgart': ['Stuttgart', 48.7758, 9.1829],
  'leipzig': ['Leipzig', 51.3397, 12.3731],
  'dresden': ['Dresden', 51.0504, 13.7373],
  'frankfurt-main': ['Frankfurt am Main', 50.1109, 8.6821],
  'frankfurt-oder': ['Frankfurt (Oder)', 52.3471, 14.5506],
  'halle-saale': ['Halle (Saale)', 51.4969, 11.9688],
  'halle-westfalen': ['Halle', 52.0601, 8.3602],
};
for (const [oldId, [name, lat, lon]] of Object.entries(LEGACY)) {
  let best: Place | undefined;
  let bestD = Infinity;
  for (const p of DE) {
    if (p.name !== name) continue;
    const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
    if (d < bestD || (d === bestD && (p.population ?? 0) > (best?.population ?? 0))) {
      bestD = d;
      best = p;
    }
  }
  if (best) PLACE_BY_ID[oldId] = best;
}
