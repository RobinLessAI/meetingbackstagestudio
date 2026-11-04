import type { CSSProperties } from 'react';
import { MessageSquareQuote } from 'lucide-react';
import { DEFAULT_HIGHLIGHT_STYLE } from '../../data/highlightStyle.ts';
import { clock } from '../../lib/time.ts';
import type { HighlightStyle } from '../../state/types.ts';
import type { HighlightView } from '../../sync/snapshot.ts';

/** #rrggbb und Deckkraft (0–100) als rgb()-Farbe. */
function withAlpha(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${Math.max(0, Math.min(100, opacity)) / 100})`;
}

const FONTS: Record<HighlightStyle['font'], string> = {
  standard: 'var(--font-ui)',
  schmal: 'var(--font-cond)',
  serif: "Georgia, 'Times New Roman', serif",
};
const RADIUS: Record<HighlightStyle['corners'], string> = { eckig: '0', rund: '0.4em', stark: '1.1em' };

/** CSS-Variablen für das eingestellte Aussehen (gelten in App, Präsentation und OBS gleich). */
export function highlightVars(style: HighlightStyle = DEFAULT_HIGHLIGHT_STYLE): CSSProperties {
  const s = { ...DEFAULT_HIGHLIGHT_STYLE, ...style };
  return {
    '--hl-bg': withAlpha(s.background, s.backgroundOpacity),
    '--hl-border': s.backgroundOpacity > 0 ? withAlpha(s.text, 14) : 'transparent',
    '--hl-text': s.text,
    '--hl-muted': withAlpha(s.text, 72),
    '--hl-accent': s.accent,
    '--hl-name': s.name,
    '--hl-scale': String(s.size / 100),
    '--hl-radius': RADIUS[s.corners],
    '--hl-font': FONTS[s.font],
    '--hl-bar': s.bar ? `inset 0.25em 0 0 ${s.accent}` : 'none',
    '--hl-pad-x': s.backgroundOpacity > 0 ? '1.2em' : '0',
  } as CSSProperties;
}

export function HighlightCard({
  message,
  variant = 'preview',
  style = DEFAULT_HIGHLIGHT_STYLE,
}: {
  message: HighlightView | null;
  variant?: 'preview' | 'present' | 'overlay';
  style?: HighlightStyle;
}) {
  if (!message) {
    return (
      <p className="graphic-empty">
        Kein Beitrag ausgewählt. Im Chat bei einer Nachricht „Als Highlight“ wählen.
      </p>
    );
  }
  const s = { ...DEFAULT_HIGHLIGHT_STYLE, ...style };
  return (
    <figure className={`highlight highlight--${variant}`} style={highlightVars(s)}>
      {s.label.trim() && (
        <span className="highlight__eyebrow">
          <MessageSquareQuote size={variant === 'present' ? 20 : 14} aria-hidden />
          {s.label}
        </span>
      )}
      <blockquote className="highlight__text">{message.text}</blockquote>
      {(s.showName || s.showTime) && (
        <figcaption className="highlight__who">
          {s.showName && <strong>{message.senderName}</strong>}
          {s.showTime && <span className="tabular">{clock(message.at, false)} Uhr</span>}
        </figcaption>
      )}
    </figure>
  );
}
