import { MessageSquareQuote, X } from 'lucide-react';
import { HighlightCard } from '../../components/graphics/HighlightCard.tsx';
import { Button, Empty, Panel } from '../../components/ui.tsx';
import { clock } from '../../lib/time.ts';
import { useStore } from '../../state/store.tsx';
import { GraphicHeader } from './shared.tsx';

export function HighlightTab() {
  const { state, derived, dispatch, notify } = useStore();
  const message = state.chat.find((m) => m.id === state.highlightId) ?? null;
  const candidates = state.chat
    .filter((m) => !derived.tags[m.id]?.team && m.text.trim().split(/\s+/).length >= 3)
    .slice(-10)
    .reverse();

  return (
    <div className="graphic">
      <GraphicHeader
        kind="highlight"
        title="Chat-Highlight"
        status={<span className="subtle">{message ? `Beitrag von ${message.senderName}` : 'Kein Beitrag ausgewählt'}</span>}
      >
        {message && (
          <Button variant="ghost" icon={X} onClick={() => dispatch({ type: 'highlight/set', id: null })}>
            Auswahl aufheben
          </Button>
        )}
      </GraphicHeader>

      <div className="highlight-layout">
        <Panel eyebrow="Live-Vorschau" title="Bauchbinde">
          <div className="highlight-stage">
            <HighlightCard message={message} variant="preview" />
          </div>
        </Panel>
        <Panel eyebrow="Schnellauswahl" title="Letzte Beiträge mit Inhalt" flush>
          {candidates.length === 0 ? (
            <Empty icon={MessageSquareQuote} title="Keine passenden Beiträge" compact />
          ) : (
            <ul className="pick-list">
              {candidates.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={state.highlightId === m.id ? 'is-active' : ''}
                    aria-pressed={state.highlightId === m.id}
                    onClick={() => {
                      dispatch({ type: 'highlight/set', id: m.id });
                      notify(`Chat-Highlight gewählt: ${m.senderName}`, 'info');
                    }}
                  >
                    <span className="pick-list__who">
                      {m.senderName} <span className="subtle tabular">{clock(m.at, false)}</span>
                    </span>
                    <span className="pick-list__text">{m.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
