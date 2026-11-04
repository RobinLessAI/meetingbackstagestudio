import type { HighlightStyle } from '../state/types.ts';

/** Standard-Aussehen des Chat-Highlights (wie bisher: dunkle Karte mit Bernstein-Akzent). */
export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = {
  background: '#0d0f13',
  backgroundOpacity: 95,
  text: '#e8ebee',
  accent: '#f0b43c',
  name: '#e8ebee',
  size: 100,
  corners: 'rund',
  position: 'links',
  font: 'standard',
  bar: true,
  label: 'Aus dem Chat',
  showName: true,
  showTime: true,
};

/** Vorlagen zum schnellen Wechseln; Feinheiten danach einzeln anpassen. */
export const HIGHLIGHT_PRESETS: Array<{ id: string; label: string; style: Partial<HighlightStyle> }> = [
  { id: 'standard', label: 'Dunkel', style: DEFAULT_HIGHLIGHT_STYLE },
  {
    id: 'hell',
    label: 'Hell',
    style: { background: '#ffffff', backgroundOpacity: 96, text: '#15181c', accent: '#b7790a', name: '#15181c', corners: 'rund', bar: true },
  },
  {
    id: 'akzent',
    label: 'Akzentfläche',
    style: { background: '#f0b43c', backgroundOpacity: 100, text: '#1b1405', accent: '#1b1405', name: '#1b1405', corners: 'eckig', bar: false },
  },
  {
    id: 'nachrichten',
    label: 'Nachrichten-Look',
    style: { background: '#0b2a4a', backgroundOpacity: 92, text: '#ffffff', accent: '#e63946', name: '#ffffff', corners: 'eckig', bar: true, font: 'schmal' },
  },
  {
    id: 'transparent',
    label: 'Nur Text',
    style: { background: '#000000', backgroundOpacity: 0, text: '#ffffff', accent: '#ffffff', name: '#ffffff', bar: false },
  },
];
