import { useId, useMemo } from 'react';
import {
  EUROPE_BORDERS_PATH,
  EUROPE_DETAIL_EXTENT,
  EUROPE_LAND_PATH,
  GRATICULE_PATH,
  MAP_HEIGHT,
  MAP_WIDTH,
  SPHERE_PATH,
  WORLD_BORDERS_PATH,
  WORLD_LAND_PATH,
} from '../../data/worldMap.ts';
import { project } from '../../lib/projection.ts';
import type { MapPin } from '../../state/derive.ts';
import type { MapState } from '../../state/types.ts';

type View = MapState['view'];

/** Ausschnitt als [lonMin, latMin, lonMax, latMax]. */
const BOUNDS: Record<Exclude<View, 'welt'>, [number, number, number, number]> = {
  europa: [-11, 35.5, 31, 60.5],
  dach: [4.6, 45.6, 17.6, 55.2],
};

function viewBoxFor(view: View, aspect: number): [number, number, number, number] {
  if (view === 'welt') return [0, 0, MAP_WIDTH, MAP_HEIGHT];
  const [lo0, la0, lo1, la1] = BOUNDS[view];
  const pts = [
    project(lo0, la0),
    project(lo1, la0),
    project(lo0, la1),
    project(lo1, la1),
  ];
  let x0 = Math.min(...pts.map((p) => p[0]));
  let x1 = Math.max(...pts.map((p) => p[0]));
  let y0 = Math.min(...pts.map((p) => p[1]));
  let y1 = Math.max(...pts.map((p) => p[1]));
  // Auf das gewünschte Seitenverhältnis erweitern, damit nichts verzerrt wird.
  const w = x1 - x0;
  const h = y1 - y0;
  if (w / h < aspect) {
    const nw = h * aspect;
    x0 -= (nw - w) / 2;
    x1 = x0 + nw;
  } else {
    const nh = w / aspect;
    y0 -= (nh - h) / 2;
    y1 = y0 + nh;
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

export interface PinCluster {
  id: string;
  x: number;
  y: number;
  pins: MapPin[];
  count: number;
  label: string;
}

interface LabelPlacement {
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
}

type Box = [x0: number, y0: number, x1: number, y1: number];
const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/**
 * Einfache Beschriftungsplatzierung: rechts, links, unten oder oben –
 * die erste Position, die weder Pins noch bereits gesetzte Beschriftungen überdeckt.
 */
function placeLabels(clusters: PinCluster[], radius: (c: PinCluster) => number, fontSize: number) {
  const placed: Box[] = [];
  const pinsBoxes: Box[] = clusters.map((c) => {
    const r = radius(c);
    return [c.x - r, c.y - r, c.x + r, c.y + r];
  });
  const out = new Map<string, LabelPlacement>();
  for (const c of clusters) {
    const r = radius(c);
    const w = c.label.length * fontSize * 0.56;
    const h = fontSize * 1.1;
    const gap = r * 1.45;
    const side = (dx: number, dy: number, anchor: LabelPlacement['anchor']): [LabelPlacement, Box] => {
      const x = c.x + dx;
      const y = c.y + dy;
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      return [{ x, y, anchor }, [x0, y - h / 2, x0 + w, y + h / 2]];
    };
    const options: Array<[LabelPlacement, Box]> = [
      side(gap, 0, 'start'),
      side(-gap, 0, 'end'),
      side(gap * 0.8, -h * 0.9, 'start'),
      side(gap * 0.8, h * 0.9, 'start'),
      side(-gap * 0.8, -h * 0.9, 'end'),
      side(-gap * 0.8, h * 0.9, 'end'),
      side(0, r + h * 0.75, 'middle'),
      side(0, -r - h * 0.75, 'middle'),
    ];
    // Position mit den wenigsten Überschneidungen wählen (Beschriftungen zählen doppelt).
    const cost = (box: Box) =>
      placed.filter((b) => overlaps(b, box)).length * 2 +
      pinsBoxes.filter((b, i) => clusters[i] !== c && overlaps(b, box)).length;
    let [placement, box] = options[0];
    let best = cost(box);
    for (const opt of options.slice(1)) {
      if (best === 0) break;
      const value = cost(opt[1]);
      if (value < best) {
        [placement, box] = opt;
        best = value;
      }
    }
    placed.push(box);
    out.set(c.id, placement);
  }
  return out;
}

function clusterPins(pins: MapPin[], radius: number): PinCluster[] {
  const clusters: PinCluster[] = [];
  const sorted = [...pins].sort((a, b) => b.people.length - a.people.length);
  for (const pin of sorted) {
    const [x, y] = project(pin.place.lon, pin.place.lat);
    const hit = clusters.find((c) => Math.hypot(c.x - x, c.y - y) < radius);
    if (hit) {
      hit.pins.push(pin);
      hit.count += pin.people.length;
    } else {
      clusters.push({ id: pin.place.id, x, y, pins: [pin], count: pin.people.length, label: pin.place.name });
    }
  }
  for (const c of clusters) {
    if (c.pins.length > 1) c.label = `${c.pins[0].place.name} +${c.pins.length - 1}`;
  }
  return clusters;
}

export function WorldMap({
  pins,
  view,
  variant = 'preview',
  selectedId,
  onSelect,
  aspect = 2,
  renderWidth,
}: {
  pins: MapPin[];
  view: View;
  variant?: 'preview' | 'present' | 'overlay';
  selectedId?: string | null;
  onSelect?: (cluster: PinCluster | null) => void;
  aspect?: number;
  /** Erwartete Breite in Pixeln; bestimmt, wie groß Pins und Beschriftungen erscheinen. */
  renderWidth?: number;
}) {
  const vb = useMemo(() => viewBoxFor(view, aspect), [view, aspect]);
  // Größen in Bildschirmpixeln, umgerechnet über eine typische Darstellungsbreite.
  const refWidth = renderWidth ?? (variant === 'present' ? 1250 : variant === 'overlay' ? 320 : 760);
  const px = vb[2] / refWidth;
  const pinBase = (variant === 'present' ? 10 : variant === 'overlay' ? 6 : 7.5) * px;
  const clusters = useMemo(() => clusterPins(pins, pinBase * 2.1), [pins, pinBase]);
  const detailed = view !== 'welt';
  const showLabels = variant !== 'overlay' && (detailed || variant === 'present');
  const fontSize = (variant === 'present' ? 19 : 12.5) * px;
  const radius = (c: PinCluster) => pinBase * (1 + Math.sqrt(c.count - 1) * 0.42);
  const labels = useMemo(
    () => (showLabels ? placeLabels(clusters, radius, fontSize) : new Map<string, LabelPlacement>()),
    [clusters, showLabels, fontSize, pinBase],
  );
  const maskId = `europa-${useId().replace(/:/g, '')}`;
  const [ex0, ey0, ex1, ey1] = EUROPE_DETAIL_EXTENT;

  return (
    <svg
      className={`worldmap worldmap--${variant}`}
      viewBox={vb.join(' ')}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Weltkarte (${view === 'welt' ? 'Welt' : view === 'europa' ? 'Europa' : 'Deutschland, Österreich, Schweiz'}) mit ${pins.length} bestätigten Orten`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect?.(null);
      }}
    >
      <path d={SPHERE_PATH} className="worldmap__ocean" />
      {!detailed && <path d={GRATICULE_PATH} className="worldmap__grid" />}
      {detailed && (
        <defs>
          {/* Außerhalb des Europa-Ausschnitts wird die gröbere Weltkarte gezeigt. */}
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT}>
            <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="#fff" />
            <rect x={ex0} y={ey0} width={ex1 - ex0} height={ey1 - ey0} fill="#000" />
          </mask>
        </defs>
      )}
      <g mask={detailed ? `url(#${maskId})` : undefined}>
        <path d={WORLD_LAND_PATH} className="worldmap__land" />
        <path d={WORLD_BORDERS_PATH} className="worldmap__borders" strokeWidth={0.7 * px} />
      </g>
      {detailed && (
        <>
          <path d={EUROPE_LAND_PATH} className="worldmap__land" />
          <path d={EUROPE_BORDERS_PATH} className="worldmap__borders" strokeWidth={px} />
        </>
      )}
      {clusters.map((c) => {
        const r = radius(c);
        const place = labels.get(c.id);
        const selected = selectedId === c.id;
        const label = `${c.pins.map((p) => p.place.name).join(', ')}: ${c.count} ${c.count === 1 ? 'Person' : 'Personen'}`;
        return (
          <g
            key={c.id}
            className={`worldmap__pin${selected ? ' is-selected' : ''}${onSelect ? ' is-interactive' : ''}`}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-label={onSelect ? `${label}. Details anzeigen` : undefined}
            aria-pressed={onSelect ? selected : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(selected ? null : c);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(selected ? null : c);
              }
            }}
          >
            <title>{label}</title>
            <circle cx={c.x} cy={c.y} r={r * 1.9} className="worldmap__halo" />
            <circle cx={c.x} cy={c.y} r={r} className="worldmap__dot" strokeWidth={r * 0.22} />
            {c.count > 1 && (
              <text x={c.x} y={c.y} className="worldmap__count" fontSize={r * 1.15} dy="0.36em">
                {c.count}
              </text>
            )}
            {place && (
              <text
                x={place.x}
                y={place.y}
                dy="0.35em"
                textAnchor={place.anchor}
                className="worldmap__label"
                fontSize={fontSize}
                strokeWidth={fontSize * 0.28}
              >
                {c.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
