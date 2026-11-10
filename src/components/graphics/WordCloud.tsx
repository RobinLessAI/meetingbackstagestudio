import type { CSSProperties } from 'react';
import { PALETTE } from '../../lib/color.ts';
import type { CloudTerm } from '../../lib/words.ts';
import type { CloudLook } from '../../state/types.ts';

/** Ordnet die Begriffe so, dass die häufigsten in der Mitte stehen. */
function centerOut(terms: CloudTerm[]): CloudTerm[] {
  const out: CloudTerm[] = [];
  terms.forEach((t, i) => (i % 2 === 0 ? out.push(t) : out.unshift(t)));
  return out;
}

export function WordCloud({
  terms,
  variant = 'preview',
  onToggle,
  hiddenKeys = [],
  look,
}: {
  terms: CloudTerm[];
  variant?: 'preview' | 'present' | 'overlay';
  /** Wenn gesetzt, lassen sich Begriffe per Klick ausblenden (Moderationsansicht). */
  onToggle?: (key: string) => void;
  hiddenKeys?: string[];
  /** Eigene Farben, Größen und Anzahl für die OBS-Ausgabe. */
  look?: CloudLook;
}) {
  if (look) terms = terms.slice(0, look.maxWords);
  if (terms.length === 0) {
    return <p className="graphic-empty">Noch keine Begriffe. Neue Chat-Beiträge erscheinen hier sofort.</p>;
  }
  const max = Math.max(...terms.map((t) => t.count));
  const min = Math.min(...terms.map((t) => t.count));
  // Vorschau in Pixeln, Präsentation und Einblendung relativ zur Bühnenbreite (cqi).
  const [lo0, hi0, unit] =
    variant === 'present' ? [1.7, 6.6, 'cqi'] : variant === 'overlay' ? [1.25, 3.4, 'cqi'] : [14, 52, 'px'];
  const lo = (lo0 as number) * (look ? look.minSize / 100 : 1);
  const hi = Math.max(lo, (hi0 as number) * (look ? look.maxSize / 100 : 1));
  const vars = look
    ? ({
        '--cloud-weight': look.weight === 'fett' ? '700' : '500',
        '--cloud-weight-low': look.weight === 'fett' ? '600' : '400',
        ...(look.colorMode === 'einfarbig'
          ? { '--cloud-low': look.wordColor, '--cloud-mid': look.wordColor, '--cloud-top': look.wordColor }
          : look.colorMode === 'akzent'
            ? { '--cloud-low': look.wordColor, '--cloud-mid': look.wordColor }
            : {}),
        textTransform: look.uppercase ? 'uppercase' : undefined,
        gap: `${(0.2 * look.gap) / 100}em ${(0.6 * look.gap) / 100}em`,
      } as unknown as CSSProperties)
    : undefined;
  const size = (count: number) =>
    max === min ? (lo + hi) / 2.4 : lo + (hi - lo) * Math.sqrt((count - min) / (max - min));

  return (
    <ul className={`cloud cloud--${variant}`} aria-label="Wortwolke" style={vars}>
      {centerOut(terms).map((t, i) => {
        const tier = t.count === max ? 'top' : t.count >= max * 0.5 ? 'mid' : 'low';
        const hidden = hiddenKeys.includes(t.key);
        // In der OBS-Ausgabe skaliert die Größeneinstellung (--lk-scale) mit.
        const fs = `${size(t.count).toFixed(2)}${unit}`;
        const style: CSSProperties = { fontSize: unit === 'cqi' ? `calc(${fs} * var(--lk-scale, 1))` : fs };
        if (look?.colorMode === 'bunt') style.color = PALETTE[i % PALETTE.length];
        const title = `${t.display}: ${t.count} ${t.count === 1 ? 'Nennung' : 'Nennungen'}`;
        return (
          <li key={t.key} className={`cloud__word cloud__word--${tier}${hidden ? ' is-hidden' : ''}`} style={style}>
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(t.key)}
                title={`${title}. Klicken zum ${hidden ? 'Einblenden' : 'Ausblenden'}`}
                aria-label={`${title}. ${hidden ? 'Wieder einblenden' : 'Ausblenden'}`}
              >
                {t.display}
              </button>
            ) : (
              <span title={title}>{t.display}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
