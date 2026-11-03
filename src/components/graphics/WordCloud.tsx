import type { CloudTerm } from '../../lib/words.ts';

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
}: {
  terms: CloudTerm[];
  variant?: 'preview' | 'present' | 'overlay';
  /** Wenn gesetzt, lassen sich Begriffe per Klick ausblenden (Moderationsansicht). */
  onToggle?: (key: string) => void;
  hiddenKeys?: string[];
}) {
  if (terms.length === 0) {
    return <p className="graphic-empty">Noch keine Begriffe. Neue Chat-Beiträge erscheinen hier sofort.</p>;
  }
  const max = Math.max(...terms.map((t) => t.count));
  const min = Math.min(...terms.map((t) => t.count));
  // Vorschau in Pixeln, Präsentation und Einblendung relativ zur Bühnenbreite (cqi).
  const [lo, hi, unit] =
    variant === 'present' ? [1.7, 6.6, 'cqi'] : variant === 'overlay' ? [1.25, 3.4, 'cqi'] : [14, 52, 'px'];
  const size = (count: number) =>
    max === min ? (lo + hi) / 2.4 : lo + (hi - lo) * Math.sqrt((count - min) / (max - min));

  return (
    <ul className={`cloud cloud--${variant}`} aria-label="Wortwolke">
      {centerOut(terms).map((t) => {
        const tier = t.count === max ? 'top' : t.count >= max * 0.5 ? 'mid' : 'low';
        const hidden = hiddenKeys.includes(t.key);
        const style = { fontSize: `${size(t.count).toFixed(2)}${unit}` };
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
