import type { CloudLook, GraphicLook, GraphicLooks, MapLook, PollLook, WheelLook } from '../state/types.ts';

/** Gemeinsame Grundwerte: Navy-Box rechts in den MeetingBackstage-Farben. */
const BASE: GraphicLook = {
  position: 'mitte-rechts',
  width: 34,
  height: 0,
  marginX: 3,
  marginY: 6,
  background: '#11243c',
  backgroundOpacity: 92,
  border: true,
  borderColor: '#2c5069',
  corners: 'rund',
  shadow: false,
  padding: 100,
  font: 'standard',
  scale: 100,
  text: '#f2f2f2',
  muted: '#a2bdc3',
  accent: '#3cb4bd',
  showTitle: true,
  title: '',
  titleAlign: 'links',
  showMeta: true,
  fullBackground: 'dunkel',
  fullColor: '#0b1726',
  fullOpacity: 100,
};

export const DEFAULT_MAP_LOOK: MapLook = {
  ...BASE,
  height: 88,
  land: '#25445c',
  ocean: '#0d1c2e',
  oceanOpacity: 100,
  borders: '#0f2034',
  pin: '#3cb4bd',
  pinSize: 100,
  showLabels: true,
  labelColor: '#f2f2f2',
  showCounts: true,
};

export const DEFAULT_POLL_LOOK: PollLook = {
  ...BASE,
  barColor: '#7f9ba3',
  trackColor: '#ffffff',
  trackOpacity: 8,
  highlightLeader: true,
  multiColor: false,
  showPercent: true,
  showCounts: true,
  showKeys: true,
  sortByVotes: false,
  barSize: 100,
};

export const DEFAULT_CLOUD_LOOK: CloudLook = {
  ...BASE,
  colorMode: 'akzent',
  wordColor: '#f2f2f2',
  maxWords: 40,
  minSize: 100,
  maxSize: 100,
  weight: 'fett',
  uppercase: false,
  gap: 100,
};

export const DEFAULT_WHEEL_LOOK: WheelLook = {
  ...BASE,
  position: 'mitte',
  width: 46,
  height: 0,
  wheelColors: 'bunt',
  wheelColorA: '#0a747d',
  wheelColorB: '#17364c',
  wheelText: '#ffffff',
  wheelRim: '#f2f2f2',
  pointerColor: '#3cb4bd',
  showWinner: true,
  winnerBackground: '#3cb4bd',
  winnerText: '#072a2f',
};

export const DEFAULT_LOOKS: GraphicLooks = { karte: DEFAULT_MAP_LOOK, umfrage: DEFAULT_POLL_LOOK, wortwolke: DEFAULT_CLOUD_LOOK, gluecksrad: DEFAULT_WHEEL_LOOK };

/** Vorlagen für die gemeinsamen Werte (Box, Text, Vollbild). Grafik-eigene Farben passen sich mit an. */
export const LOOK_PRESETS: Array<{ id: string; label: string; look: Partial<MapLook & PollLook & CloudLook & WheelLook> }> = [
  { id: 'dunkel', label: 'Navy', look: { background: '#11243c', backgroundOpacity: 92, text: '#f2f2f2', muted: '#a2bdc3', accent: '#3cb4bd', borderColor: '#2c5069', border: true, land: '#25445c', ocean: '#0d1c2e', oceanOpacity: 100, borders: '#0f2034', labelColor: '#f2f2f2', barColor: '#7f9ba3', trackColor: '#ffffff', wordColor: '#f2f2f2', wheelRim: '#f2f2f2', wheelText: '#ffffff', fullBackground: 'dunkel' } },
  { id: 'hell', label: 'Hell', look: { background: '#ffffff', backgroundOpacity: 96, text: '#11243c', muted: '#536a7a', accent: '#026c75', borderColor: '#d5e0e4', border: true, land: '#b9cdd3', ocean: '#e6eef1', oceanOpacity: 100, borders: '#ffffff', labelColor: '#11243c', barColor: '#7f9ba3', trackColor: '#11243c', wordColor: '#11243c', wheelRim: '#11243c', wheelText: '#ffffff', fullBackground: 'farbe', fullColor: '#f2f2f2', fullOpacity: 100 } },
  { id: 'glas', label: 'Glas', look: { background: '#0b1726', backgroundOpacity: 55, text: '#ffffff', muted: '#c9dade', accent: '#5cc3cb', borderColor: '#ffffff', border: true, land: '#ffffff', ocean: '#000000', oceanOpacity: 0, borders: '#0b1726', labelColor: '#ffffff', barColor: '#d6e3e6', trackColor: '#ffffff', wordColor: '#ffffff', shadow: true, fullBackground: 'transparent' } },
  { id: 'transparent', label: 'Ohne Box', look: { backgroundOpacity: 0, border: false, shadow: false, text: '#ffffff', muted: '#e1ebee', accent: '#5cc3cb', ocean: '#000000', oceanOpacity: 0, land: '#ffffff', borders: '#000000', labelColor: '#ffffff', barColor: '#ffffff', wordColor: '#ffffff', fullBackground: 'transparent' } },
  { id: 'akzent', label: 'Petrol', look: { background: '#026c75', backgroundOpacity: 100, text: '#ffffff', muted: '#cfe5e8', accent: '#ffffff', borderColor: '#ffffff', border: false, land: '#ffffff', ocean: '#026c75', oceanOpacity: 0, borders: '#026c75', labelColor: '#ffffff', barColor: '#a2bdc3', trackColor: '#ffffff', wordColor: '#ffffff', corners: 'eckig', fullBackground: 'farbe', fullColor: '#026c75', fullOpacity: 100 } },
];

/** Gespeicherte Looks um neue Felder ergänzen. */
export function normalizeLooks(raw?: Partial<GraphicLooks>): GraphicLooks {
  return {
    karte: { ...DEFAULT_MAP_LOOK, ...(raw?.karte ?? {}) },
    umfrage: { ...DEFAULT_POLL_LOOK, ...(raw?.umfrage ?? {}) },
    wortwolke: { ...DEFAULT_CLOUD_LOOK, ...(raw?.wortwolke ?? {}) },
    gluecksrad: { ...DEFAULT_WHEEL_LOOK, ...(raw?.gluecksrad ?? {}) },
  };
}
