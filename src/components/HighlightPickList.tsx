import { useId, useState } from 'react';
import { Eraser, History, MessageSquareQuote, Search } from 'lucide-react';
import { clock } from '../lib/time.ts';
import { useStore } from '../state/store.tsx';
import { Button, Empty } from './ui.tsx';

/**
 * Alle Chat-Nachrichten, neueste zuerst; ein Klick wählt die Nachricht als Highlight
 * (erneuter Klick hebt die Auswahl auf). Genutzt auf der Seite Chat-Highlight und im Pop-up.
 */
export function HighlightPickList({ fill = false }: { fill?: boolean }) {
  const { state, derived, dispatch, notify } = useStore();
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const since = state.highlightSince;
  const searchId = useId();
  const q = query.trim().toLowerCase();
  const everything = state.chat.filter((m) => m.text.trim());
  // „Liste leeren“ blendet ältere Nachrichten nur hier aus; Karte, Umfrage und Wortwolke bleiben unberührt.
  const all = since ? everything.filter((m) => m.at >= since) : everything;
  const hiddenCount = everything.length - all.length;
  const list = (q ? all.filter((m) => `${m.senderName} ${m.text}`.toLowerCase().includes(q)) : all).slice(-300).reverse();

  return (
    <div className={`pick${fill ? ' pick--fill' : ''}`}>
      <div className="pick__search">
        <Search size={14} aria-hidden />
        <label htmlFor={searchId} className="sr-only">
          Chat durchsuchen
        </label>
        <input
          id={searchId}
          className="input input--sm"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Suchen in ${all.length} Nachrichten …`}
          autoComplete="off"
        />
      </div>
      <div className="pick__tools">
        {confirmClear ? (
          <>
            <span className="subtle">Alle bisherigen Nachrichten aus dieser Liste ausblenden?</span>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                dispatch({ type: 'highlight/since', at: Date.now() });
                setConfirmClear(false);
                setQuery('');
                notify('Liste geleert. Neue Chat-Nachrichten erscheinen weiter hier.', 'info');
              }}
            >
              Ja, leeren
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
              Abbrechen
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" icon={Eraser} onClick={() => setConfirmClear(true)} disabled={all.length === 0}>
              Liste leeren
            </Button>
            {hiddenCount > 0 && (
              <Button size="sm" variant="ghost" icon={History} onClick={() => dispatch({ type: 'highlight/since', at: null })}>
                {hiddenCount} ältere wieder anzeigen
              </Button>
            )}
          </>
        )}
      </div>
      {list.length === 0 ? (
        <Empty
          icon={MessageSquareQuote}
          title={q ? 'Keine Nachricht passt zur Suche' : since ? 'Liste geleert, noch keine neuen Nachrichten' : 'Noch keine Chat-Nachrichten'}
          compact
        />
      ) : (
        <ul className="pick-list">
          {list.map((m) => {
            const active = state.highlightId === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={active ? 'is-active' : ''}
                  aria-pressed={active}
                  title={active ? 'Klicken hebt die Auswahl auf' : 'Als Highlight wählen'}
                  onClick={() => dispatch({ type: 'highlight/set', id: active ? null : m.id })}
                >
                  <span className="pick-list__who">
                    {m.senderName} <span className="subtle tabular">{clock(m.at, false)}</span>
                    {derived.tags[m.id]?.team && <span className="subtle"> · Team</span>}
                  </span>
                  <span className="pick-list__text">{m.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
