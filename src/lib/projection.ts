import { MAP_PROJECTION } from '../data/worldMap.ts';

// Equal-Earth-Projektion (Šavrič, Patterson, Jenny 2018), identisch zur
// Projektion, mit der scripts/generate-world-map.mjs die Karte erzeugt hat.
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

export function project(lon: number, lat: number): [number, number] {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const l = Math.asin(M * Math.sin(phi));
  const l2 = l * l;
  const l6 = l2 * l2 * l2;
  const x = (lambda * Math.cos(l)) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)));
  const y = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2));
  return [MAP_PROJECTION.tx + MAP_PROJECTION.scale * x, MAP_PROJECTION.ty - MAP_PROJECTION.scale * y];
}
