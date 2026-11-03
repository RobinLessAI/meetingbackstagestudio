// Erzeugt die lokal eingebundene, vereinfachte Weltkarte als SVG-Pfaddaten.
//
// Quelle: Natural Earth (gemeinfrei) über das npm-Paket "world-atlas".
// Ergebnis: src/data/worldMap.ts. Die App lädt zur Laufzeit keine Kartendienste.
//
// Aufruf: npm run map:generate
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { geoEqualEarth, geoPath, geoGraticule } from 'd3-geo';
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
const europeBorders = europePath(
  mesh(countries50, countries50.objects.countries, (a, b) => a !== b),
);

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
export const EUROPE_LAND_PATH = ${JSON.stringify(europeLand)};
export const EUROPE_BORDERS_PATH = ${JSON.stringify(europeBorders)};
`;

const target = join(root, 'src/data/worldMap.ts');
writeFileSync(target, out);
console.log(
  `worldMap.ts geschrieben: ${(out.length / 1024).toFixed(0)} KB, ` +
    `Höhe ${HEIGHT}, scale ${scale.toFixed(3)}, translate ${tx.toFixed(2)}/${ty.toFixed(2)}`,
);
