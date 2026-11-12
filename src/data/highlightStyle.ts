import type { HighlightStyle } from '../state/types.ts';

/** Standard-Aussehen des Chat-Highlights: Navy-Karte mit Petrol-Akzent (MeetingBackstage-Farben). */
export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = {
  background: '#11243c',
  backgroundOpacity: 95,
  text: '#f2f2f2',
  accent: '#3cb4bd',
  name: '#f2f2f2',
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
  { id: 'standard', label: 'Navy', style: DEFAULT_HIGHLIGHT_STYLE },
  {
    id: 'hell',
    label: 'Hell',
    style: { background: '#ffffff', backgroundOpacity: 96, text: '#11243c', accent: '#026c75', name: '#11243c', corners: 'rund', bar: true },
  },
  {
    id: 'akzent',
    label: 'Petrol',
    style: { background: '#026c75', backgroundOpacity: 100, text: '#ffffff', accent: '#ffffff', name: '#ffffff', corners: 'eckig', bar: false },
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
