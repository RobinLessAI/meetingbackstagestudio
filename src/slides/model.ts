// Folien (MeetingBackstage Slides): Datenmodell, das Editor, OBS-Ausgabe und Server gemeinsam nutzen.
// Alle Maße in Pixeln einer 1920 × 1080-Fläche; die Ausgabe skaliert auf die Größe der OBS-Quelle.
import SCHRIFTEN from './schriften.json';

export const FLAECHE = { w: 1920, h: 1080 };
export const SCHRIFT_NAMEN: string[] = SCHRIFTEN.map((s) => s.name);
export { SCHRIFTEN };

export type Animation = 'keine' | 'einblenden' | 'von-unten' | 'von-oben' | 'von-links' | 'von-rechts' | 'zoom';

interface Basis {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  opacity: number;
  hidden: boolean;
  locked: boolean;
  anim: Animation;
  animDauer: number;
  animVerz: number;
}

export interface TextEl extends Basis {
  typ: 'text';
  text: string;
  font: string;
  size: number;
  weight: 400 | 700;
  italic: boolean;
  underline: boolean;
  upper: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  bg: string;
  bgOpacity: number;
  pad: number;
  radius: number;
  borderW: number;
  borderColor: string;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  outlineW: number;
  outlineColor: string;
}

export interface FormEl extends Basis {
  typ: 'form';
  form: 'rechteck' | 'ellipse' | 'linie';
  fill: string;
  fill2: string;
  verlauf: boolean;
  winkel: number;
  fillOpacity: number;
  radius: number;
  borderW: number;
  borderColor: string;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
}

export interface BildEl extends Basis {
  typ: 'bild';
  src: string;
  fit: 'cover' | 'contain';
  radius: number;
  borderW: number;
  borderColor: string;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
}

export interface VideoEl extends Omit<BildEl, 'typ'> {
  typ: 'video';
  loop: boolean;
  ton: boolean;
}

export type Element = TextEl | FormEl | BildEl | VideoEl;
export type ElementTyp = Element['typ'];

export interface Hintergrund {
  typ: 'transparent' | 'farbe' | 'verlauf' | 'bild' | 'video';
  color: string;
  color2: string;
  winkel: number;
  src: string;
  fit: 'cover' | 'contain';
  abdunkeln: number;
}

export interface Folie {
  id: string;
  key: string;
  name: string;
  updatedAt: number;
  hintergrund: Hintergrund;
  elemente: Element[];
}

export interface Medium {
  name: string;
  url: string;
  typ: 'bild' | 'video';
  groesse: number;
  original: string;
  at: number;
}

export interface FolienState {
  folien: Folie[];
  medien: Medium[];
  kanal: { key: string; liveId: string | null };
  speicher: { belegt: number; max: number; bildMax: number; videoMax: number };
  basis: string;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const basis = (name: string, x: number, y: number, w: number, h: number): Basis => ({
  id: newId(),
  name,
  x,
  y,
  w,
  h,
  rot: 0,
  opacity: 1,
  hidden: false,
  locked: false,
  anim: 'einblenden',
  animDauer: 0.6,
  animVerz: 0,
});

export function neuerText(): TextEl {
  return {
    ...basis('Text', 160, 380, 1600, 220),
    typ: 'text',
    text: 'Doppelklick oder rechts bearbeiten',
    font: 'Barlow',
    size: 96,
    weight: 700,
    italic: false,
    underline: false,
    upper: false,
    color: '#ffffff',
    align: 'center',
    valign: 'middle',
    lineHeight: 1.15,
    letterSpacing: 0,
    bg: '#11243c',
    bgOpacity: 0,
    pad: 24,
    radius: 16,
    borderW: 0,
    borderColor: '#3cb4bd',
    shadow: true,
    shadowColor: '#000000',
    shadowBlur: 18,
    outlineW: 0,
    outlineColor: '#000000',
  };
}

export function neueForm(form: FormEl['form'] = 'rechteck'): FormEl {
  return {
    ...basis(form === 'ellipse' ? 'Kreis' : form === 'linie' ? 'Linie' : 'Fläche', 660, 340, form === 'linie' ? 600 : 600, form === 'linie' ? 8 : 400),
    typ: 'form',
    form,
    fill: '#026c75',
    fill2: '#11243c',
    verlauf: false,
    winkel: 135,
    fillOpacity: 1,
    radius: form === 'rechteck' ? 24 : 0,
    borderW: 0,
    borderColor: '#ffffff',
    shadow: false,
    shadowColor: '#000000',
    shadowBlur: 24,
  };
}

export function neuesBild(src: string, typ: 'bild' | 'video' = 'bild'): BildEl | VideoEl {
  const b: BildEl = {
    ...basis(typ === 'video' ? 'Video' : 'Bild', 480, 200, 960, 540),
    typ: 'bild',
    src,
    fit: 'cover',
    radius: 16,
    borderW: 0,
    borderColor: '#ffffff',
    shadow: true,
    shadowColor: '#000000',
    shadowBlur: 30,
  };
  return typ === 'video' ? { ...b, typ: 'video', loop: true, ton: false } : b;
}

export const STANDARD_HINTERGRUND: Hintergrund = {
  typ: 'transparent',
  color: '#11243c',
  color2: '#026c75',
  winkel: 135,
  src: '',
  fit: 'cover',
  abdunkeln: 0,
};

/** Hex-Farbe + Deckkraft → rgba() */
export function rgba(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}
