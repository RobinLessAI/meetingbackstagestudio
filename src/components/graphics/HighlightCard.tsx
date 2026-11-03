import { MessageSquareQuote } from 'lucide-react';
import { clock } from '../../lib/time.ts';
import type { HighlightView } from '../../sync/snapshot.ts';

export function HighlightCard({
  message,
  variant = 'preview',
}: {
  message: HighlightView | null;
  variant?: 'preview' | 'present' | 'overlay';
}) {
  if (!message) {
    return (
      <p className="graphic-empty">
        Kein Beitrag ausgewählt. Im Chat bei einer Nachricht „Als Highlight“ wählen.
      </p>
    );
  }
  return (
    <figure className={`highlight highlight--${variant}`}>
      <span className="highlight__eyebrow">
        <MessageSquareQuote size={variant === 'present' ? 20 : 14} aria-hidden />
        Aus dem Chat
      </span>
      <blockquote className="highlight__text">{message.text}</blockquote>
      <figcaption className="highlight__who">
        <strong>{message.senderName}</strong>
        <span className="tabular">{clock(message.at, false)} Uhr</span>
      </figcaption>
    </figure>
  );
}
