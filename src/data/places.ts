// Kleines lokales Ortsverzeichnis für die Demo-Karte.
//
// Es enthält ausschließlich allgemein bekannte Orte mit ihren öffentlichen
// Koordinaten. Es werden keine Daten über Personen gespeichert: Ein Pin
// entsteht nur, wenn eine Person den Ort selbst im Chat nennt und die
// Moderation die Zuordnung bestätigt.

export interface Place {
  id: string;
  name: string;
  /** Zusatz zur Unterscheidung, z. B. Land oder Region. */
  region: string;
  kind: 'stadt' | 'land';
  lat: number;
  lon: number;
  /** Schreibweisen, die eindeutig auf diesen Ort verweisen. */
  aliases: string[];
}

export const PLACES: Place[] = [
  { id: 'werl', name: 'Werl', region: 'NRW, Deutschland', kind: 'stadt', lat: 51.5536, lon: 7.9136, aliases: ['werl'] },
  { id: 'soest', name: 'Soest', region: 'NRW, Deutschland', kind: 'stadt', lat: 51.5711, lon: 8.1057, aliases: ['soest'] },
  { id: 'dortmund', name: 'Dortmund', region: 'NRW, Deutschland', kind: 'stadt', lat: 51.5136, lon: 7.4653, aliases: ['dortmund'] },
  { id: 'muenster', name: 'Münster', region: 'NRW, Deutschland', kind: 'stadt', lat: 51.9607, lon: 7.6261, aliases: ['münster', 'muenster'] },
  { id: 'koeln', name: 'Köln', region: 'NRW, Deutschland', kind: 'stadt', lat: 50.9375, lon: 6.9603, aliases: ['köln', 'koeln', 'cologne'] },
  { id: 'berlin', name: 'Berlin', region: 'Deutschland', kind: 'stadt', lat: 52.52, lon: 13.405, aliases: ['berlin'] },
  { id: 'hamburg', name: 'Hamburg', region: 'Deutschland', kind: 'stadt', lat: 53.5511, lon: 9.9937, aliases: ['hamburg'] },
  { id: 'bremen', name: 'Bremen', region: 'Deutschland', kind: 'stadt', lat: 53.0793, lon: 8.8017, aliases: ['bremen'] },
  { id: 'muenchen', name: 'München', region: 'Bayern, Deutschland', kind: 'stadt', lat: 48.1351, lon: 11.582, aliases: ['münchen', 'muenchen', 'munich'] },
  { id: 'stuttgart', name: 'Stuttgart', region: 'Deutschland', kind: 'stadt', lat: 48.7758, lon: 9.1829, aliases: ['stuttgart'] },
  { id: 'leipzig', name: 'Leipzig', region: 'Sachsen, Deutschland', kind: 'stadt', lat: 51.3397, lon: 12.3731, aliases: ['leipzig'] },
  { id: 'dresden', name: 'Dresden', region: 'Sachsen, Deutschland', kind: 'stadt', lat: 51.0504, lon: 13.7373, aliases: ['dresden'] },
  { id: 'frankfurt-main', name: 'Frankfurt am Main', region: 'Hessen, Deutschland', kind: 'stadt', lat: 50.1109, lon: 8.6821, aliases: ['frankfurt am main', 'frankfurt main', 'ffm'] },
  { id: 'frankfurt-oder', name: 'Frankfurt (Oder)', region: 'Brandenburg, Deutschland', kind: 'stadt', lat: 52.3471, lon: 14.5506, aliases: ['frankfurt oder', 'frankfurt an der oder'] },
  { id: 'halle-saale', name: 'Halle (Saale)', region: 'Sachsen-Anhalt, Deutschland', kind: 'stadt', lat: 51.4969, lon: 11.9688, aliases: ['halle saale', 'halle an der saale'] },
  { id: 'halle-westfalen', name: 'Halle (Westf.)', region: 'NRW, Deutschland', kind: 'stadt', lat: 52.0601, lon: 8.3602, aliases: ['halle westfalen', 'halle westf'] },
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
  { id: 'land-de', name: 'Deutschland', region: 'Land', kind: 'land', lat: 51.1657, lon: 10.4515, aliases: ['deutschland', 'germany'] },
  { id: 'land-at', name: 'Österreich', region: 'Land', kind: 'land', lat: 47.5162, lon: 14.5501, aliases: ['österreich', 'oesterreich', 'austria'] },
  { id: 'land-ch', name: 'Schweiz', region: 'Land', kind: 'land', lat: 46.8182, lon: 8.2275, aliases: ['schweiz', 'switzerland', 'suisse'] },
];

/**
 * Schreibweisen, die mehrere Orte meinen können. Diese werden nie
 * automatisch gesetzt, sondern landen mit Auswahlmöglichkeiten in der Prüfliste.
 */
export const AMBIGUOUS_ALIASES: Record<string, string[]> = {
  frankfurt: ['frankfurt-main', 'frankfurt-oder'],
  halle: ['halle-saale', 'halle-westfalen'],
};

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(
  PLACES.map((p) => [p.id, p]),
);
