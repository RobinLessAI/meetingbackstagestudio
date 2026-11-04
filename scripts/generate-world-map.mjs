// Erzeugt die lokal eingebundene, vereinfachte Weltkarte als SVG-Pfaddaten.
//
// Quelle: Natural Earth (gemeinfrei) über das npm-Paket "world-atlas";
// Bundesländer aus Natural Earth Admin 1 (scripts/data/de-bundeslaender.geojson).
// Ergebnis: src/data/worldMap.ts. Die App lädt zur Laufzeit keine Kartendienste.
//
// Aufruf: npm run map:generate
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { geoArea, geoEqualEarth, geoPath, geoGraticule } from 'd3-geo';
import { feature, mesh } from 'topojson-client';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const atlas = (name) =>
  JSON.parse(readFileSync(join(root, 'node_modules/world-atlas', name), 'utf8'));

const WIDTH = 1000;
const sphere = { type: 'Sphere' };

// Equal-Earth-Projektion. Die gleiche Formel steckt in src/lib/projection.ts,
// damit Ortsmarkierungen exakt auf dieser Karte landen.
const projection = geoEqualEarth().fitWidth(WIDTH, sphere);
const scale = projection.scale();
const [tx, ty] = projection.translate();

const path = geoPath(projection).digits(1);
const [[, sy0], [, sy1]] = path.bounds(sphere);
const HEIGHT = Math.ceil(sy1 - sy0);

// Grobe Welt (1:110 Mio.)
const land110 = atlas('land-110m.json');
const countries110 = atlas('countries-110m.json');
const worldLand = path(feature(land110, land110.objects.land));
const worldCoast = path(mesh(land110, land110.objects.land));
const worldBorders = path(
  mesh(countries110, countries110.objects.countries, (a, b) => a !== b),
);
const spherePath = path(sphere);
const graticule = path(geoGraticule().step([30, 30]).precision(5)());

// Detailebene für die Europa- und DACH-Ansicht (1:50 Mio.), auf Europa beschnitten.
// Die Meridiane sind gekrümmt, daher alle vier Ecken projizieren.
const corners = [
  [-14, 67],
  [42, 67],
  [-14, 34],
  [42, 34],
].map((c) => projection(c));
const xs = corners.map((c) => c[0]);
const ys = corners.map((c) => c[1]);
const pad = 2;
export const EUROPE_EXTENT = [
  [Math.min(...xs) - pad, Math.min(...ys) - pad],
  [Math.max(...xs) + pad, Math.max(...ys) + pad],
];
const europeProjection = geoEqualEarth()
  .scale(scale)
  .translate([tx, ty])
  .clipExtent(EUROPE_EXTENT);
const europePath = geoPath(europeProjection).digits(1);
const land50 = atlas('land-50m.json');
const countries50 = atlas('countries-50m.json');
const europeLand = europePath(feature(land50, land50.objects.land));
const europeCoast = europePath(mesh(land50, land50.objects.land));
const europeBorders = europePath(
  mesh(countries50, countries50.objects.countries, (a, b) => a !== b),
);

// Deutschland-Ansicht: nur Deutschland (1:10 Mio.) mit Bundesländern, feinere Koordinaten.
const dePath = geoPath(projection).digits(2);
const countries10 = atlas('countries-10m.json');
const germany = feature(countries10, countries10.objects.countries).features.find((f) => f.id === '276');
const deCountry = dePath(germany);
// Bundesländer: Natural Earth Admin 1 (1:10 Mio.), ausgezogen in scripts/data/de-bundeslaender.geojson.
// d3-geo erwartet Ringe im Uhrzeigersinn; gegen den Uhrzeigersinn gespeicherte Ringe umdrehen.
const states = JSON.parse(readFileSync(join(root, 'scripts/data/de-bundeslaender.geojson'), 'utf8'));
for (const f of states.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    if (geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI) for (const ring of poly) ring.reverse();
  }
}
const deStates = dePath(states);

const out = `// Automatisch erzeugt durch scripts/generate-world-map.mjs – nicht von Hand bearbeiten.
// Kartendaten: Natural Earth (gemeinfrei), https://www.naturalearthdata.com
// Projektion: Equal Earth, Breite ${WIDTH} Einheiten.

export const MAP_WIDTH = ${WIDTH};
export const MAP_HEIGHT = ${HEIGHT};
export const MAP_PROJECTION = { scale: ${scale}, tx: ${tx}, ty: ${ty} } as const;
/** Bereich, für den die detailreichere Europa-Ebene vorliegt (x0, y0, x1, y1). */
export const EUROPE_DETAIL_EXTENT = ${JSON.stringify(EUROPE_EXTENT.flat().map((v) => Math.round(v * 10) / 10))} as const;

export const SPHERE_PATH = ${JSON.stringify(spherePath)};
export const GRATICULE_PATH = ${JSON.stringify(graticule)};
export const WORLD_LAND_PATH = ${JSON.stringify(worldLand)};
export const WORLD_BORDERS_PATH = ${JSON.stringify(worldBorders)};
export const WORLD_COAST_PATH = ${JSON.stringify(worldCoast)};
export const EUROPE_LAND_PATH = ${JSON.stringify(europeLand)};
export const EUROPE_BORDERS_PATH = ${JSON.stringify(europeBorders)};
export const EUROPE_COAST_PATH = ${JSON.stringify(europeCoast)};

/** Umriss von Deutschland (Natural Earth 1:10 Mio.). */
export const DE_COUNTRY_PATH = ${JSON.stringify(deCountry)};
/** Bundesländer (Natural Earth Admin 1). */
export const DE_STATES_PATH = ${JSON.stringify(deStates)};
`;

const target = join(root, 'src/data/worldMap.ts');
writeFileSync(target, out);
console.log(
  `worldMap.ts geschrieben: ${(out.length / 1024).toFixed(0)} KB, ` +
    `Höhe ${HEIGHT}, scale ${scale.toFixed(3)}, translate ${tx.toFixed(2)}/${ty.toFixed(2)}`,
);
