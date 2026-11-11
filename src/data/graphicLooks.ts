import type { CloudLook, GraphicLook, GraphicLooks, MapLook, PollLook, WheelLook } from '../state/types.ts';

/** Gemeinsame Grundwerte: dunkle Box rechts, wie bisher. */
const BASE: GraphicLook = {
  position: 'mitte-rechts',
  width: 34,
  height: 0,
  marginX: 3,
  marginY: 6,
  background: '#090a0d',
  backgroundOpacity: 92,
  border: true,
  borderColor: '#39414b',
  corners: 'rund',
  shadow: false,
  padding: 100,
  font: 'standard',
  scale: 100,
  text: '#e8ebee',
  muted: '#8a949f',
  accent: '#f0b43c',
  showTitle: true,
  title: '',
  titleAlign: 'links',
  showMeta: true,
  fullBackground: 'dunkel',
  fullColor: '#07080a',
  fullOpacity: 100,
};

export const DEFAULT_MAP_LOOK: MapLook = {
  ...BASE,
  height: 88,
  land: '#2a323b',
  ocean: '#0f1418',
  oceanOpacity: 100,
  borders: '#151a1f',
  pin: '#f0b43c',
  pinSize: 100,
  showLabels: true,
  labelColor: '#e8ebee',
  showCounts: true,
};

export const DEFAULT_POLL_LOOK: PollLook = {
  ...BASE,
  barColor: '#8f99a5',
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
  wordColor: '#e8ebee',
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
  wheelColorA: '#f0b43c',
  wheelColorB: '#2a323b',
  wheelText: '#ffffff',
  wheelRim: '#e8ebee',
  pointerColor: '#f0b43c',
  showWinner: true,
  winnerBackground: '#f0b43c',
  winnerText: '#1b1405',
};

export const DEFAULT_LOOKS: GraphicLooks = { karte: DEFAULT_MAP_LOOK, umfrage: DEFAULT_POLL_LOOK, wortwolke: DEFAULT_CLOUD_LOOK, gluecksrad: DEFAULT_WHEEL_LOOK };

/** Vorlagen für die gemeinsamen Werte (Box, Text, Vollbild). Grafik-eigene Farben passen sich mit an. */
export const LOOK_PRESETS: Array<{ id: string; label: string; look: Partial<MapLook & PollLook & CloudLook & WheelLook> }> = [
  { id: 'dunkel', label: 'Dunkel', look: { background: '#090a0d', backgroundOpacity: 92, text: '#e8ebee', muted: '#8a949f', accent: '#f0b43c', borderColor: '#39414b', border: true, land: '#2a323b', ocean: '#0f1418', oceanOpacity: 100, borders: '#151a1f', labelColor: '#e8ebee', barColor: '#8f99a5', trackColor: '#ffffff', wordColor: '#e8ebee', wheelRim: '#e8ebee', wheelText: '#ffffff', fullBackground: 'dunkel' } },
  { id: 'hell', label: 'Hell', look: { background: '#ffffff', backgroundOpacity: 96, text: '#15181c', muted: '#5b6570', accent: '#b7790a', borderColor: '#d5dae0', border: true, land: '#c9d0d8', ocean: '#eef2f6', oceanOpacity: 100, borders: '#ffffff', labelColor: '#15181c', barColor: '#7d8792', trackColor: '#000000', wordColor: '#15181c', wheelRim: '#15181c', wheelText: '#ffffff', fullBackground: 'farbe', fullColor: '#f3f4f6', fullOpacity: 100 } },
  { id: 'glas', label: 'Glas', look: { background: '#0b0d12', backgroundOpacity: 55, text: '#ffffff', muted: '#c6ccd3', accent: '#ffd166', borderColor: '#ffffff', border: true, land: '#ffffff', ocean: '#000000', oceanOpacity: 0, borders: '#0b0d12', labelColor: '#ffffff', barColor: '#d8dde3', trackColor: '#ffffff', wordColor: '#ffffff', shadow: true, fullBackground: 'transparent' } },
  { id: 'transparent', label: 'Ohne Box', look: { backgroundOpacity: 0, border: false, shadow: false, text: '#ffffff', muted: '#e1e5ea', accent: '#ffd166', ocean: '#000000', oceanOpacity: 0, land: '#ffffff', borders: '#000000', labelColor: '#ffffff', barColor: '#ffffff', wordColor: '#ffffff', fullBackground: 'transparent' } },
  { id: 'akzent', label: 'Akzent', look: { background: '#f0b43c', backgroundOpacity: 100, text: '#1b1405', muted: '#4a3a12', accent: '#1b1405', borderColor: '#1b1405', border: false, land: '#1b1405', ocean: '#f0b43c', oceanOpacity: 0, borders: '#f0b43c', labelColor: '#1b1405', barColor: '#6b5418', trackColor: '#1b1405', wordColor: '#1b1405', corners: 'eckig', fullBackground: 'farbe', fullColor: '#f0b43c', fullOpacity: 100 } },
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
