import type { CSSProperties } from 'react';
import { inkFor, withAlpha } from '../../lib/color.ts';
import type { GraphicLook } from '../../state/types.ts';

const FONTS: Record<GraphicLook['font'], string> = {
  standard: 'var(--font-ui)',
  schmal: 'var(--font-cond)',
  serif: "Georgia, 'Times New Roman', serif",
};
const RADIUS: Record<GraphicLook['corners'], string> = { eckig: '0', rund: '0.5cqi', stark: '1.6cqi' };

/** Farben, Schrift und Größe als CSS-Variablen; die Grafiken darin übernehmen sie automatisch. */
export function lookVars(look: GraphicLook): CSSProperties {
  return {
    '--text': look.text,
    '--text-2': look.text,
    '--text-3': look.muted,
    '--accent': look.accent,
    '--accent-ink': inkFor(look.accent),
    '--raised': withAlpha(look.text, 8),
    '--hover': withAlpha(look.text, 14),
    '--line-strong': withAlpha(look.text, 18),
    '--lk-font': FONTS[look.font],
    '--lk-scale': String(look.scale / 100),
    '--lk-pad': String(look.padding / 100),
    '--lk-title-align': look.titleAlign === 'mitte' ? 'center' : 'left',
    fontFamily: FONTS[look.font],
  } as CSSProperties;
}

/** Box der Einblendung: Hintergrund, Rahmen, Ecken, Schatten. */
export function boxVars(look: GraphicLook): CSSProperties {
  return {
    background: withAlpha(look.background, look.backgroundOpacity),
    border: look.border ? `1px solid ${look.borderColor}` : '1px solid transparent',
    borderRadius: RADIUS[look.corners],
    boxShadow: look.shadow ? '0 1.2cqi 3.5cqi rgb(0 0 0 / 0.45)' : 'none',
  };
}

/** Lage der Einblendung im Bild (3 × 3 Raster, Breite/Höhe/Abstand in Prozent). */
export function placement(look: GraphicLook): CSSProperties {
  const [v, h] = look.position === 'mitte' ? ['mitte', 'mitte'] : look.position.split('-');
  const s: CSSProperties = { width: `${look.width}%` };
  if (h === 'links') s.left = `${look.marginX}%`;
  else if (h === 'rechts') s.right = `${look.marginX}%`;
  else Object.assign(s, { left: 0, right: 0, marginInline: 'auto' });
  if (look.height > 0) s.height = `${look.height}%`;
  else Object.assign(s, { height: 'fit-content', maxHeight: `${100 - 2 * look.marginY}%` });
  if (v === 'oben') s.top = `${look.marginY}%`;
  else if (v === 'unten') s.bottom = `${look.marginY}%`;
  else Object.assign(s, { top: 0, bottom: 0, marginBlock: 'auto' });
  return s;
}

/** Hintergrund im Vollbild (inline), oder null für die Standardklassen. */
export function fullBackground(look: GraphicLook): string | null {
  if (look.fullBackground === 'farbe') return withAlpha(look.fullColor, look.fullOpacity);
  if (look.fullBackground === 'transparent') return 'transparent';
  return null;
}
