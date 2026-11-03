import { ChevronRight, Star } from 'lucide-react';
import { clock, duration } from '../lib/time.ts';
import { useCommands } from '../state/commands.ts';
import { useDeckActions } from '../state/deckActions.ts';
import { useNow, useStore } from '../state/store.tsx';
import type { DeckActionId, StreamDeckModel } from '../state/types.ts';

export const MODELS: Record<StreamDeckModel, { label: string; cols: number; rows: number; actions: DeckActionId[] }> = {
  klein: { label: '6 Tasten (3 × 2)', cols: 3, rows: 2, actions: ['naechste-hand', 'alle-stumm'] },
  standard: {
    label: '15 Tasten (5 × 3)',
    cols: 5,
    rows: 3,
    actions: ['naechste-hand', 'spotlight-leeren', 'alle-stumm', 'galerie-wechseln'],
  },
  xl: {
    label: '32 Tasten (8 × 4)',
    cols: 8,
    rows: 4,
    actions: [
      'naechste-hand',
      'spotlight-leeren',
      'alle-stumm',
      'galerie-wechseln',
      'frage-anzeigen',
      'karte-anzeigen',
      'grafik-aus',
    ],
  },
};

const KEY_LABEL: Partial<Record<DeckActionId, string>> = {
  'naechste-hand': 'Nächste Hand',
  'spotlight-leeren': 'Spot leeren',
  'alle-stumm': 'Alle stumm',
  'galerie-wechseln': 'Galerie',
  'frage-anzeigen': 'Frage',
  'karte-anzeigen': 'Karte',
  'grafik-aus': 'Grafik aus',
};

/** Anzahl der Personentasten pro Seite: alles außer der letzten Reihe. */
export const queueSlotsFor = (model: StreamDeckModel) => {
  const m = MODELS[model];
  return m.cols * m.rows - m.cols;
};

/**
 * Lokale Simulation eines Tastenfelds. Es besteht keine Verbindung zu
 * einem Gerät; eine echte Anbindung bräuchte eine unterstützte Erweiterung.
 */
export function StreamDeck() {
  const { state, derived, dispatch } = useStore();
  const commands = useCommands();
  const actions = useDeckActions();
  const now = useNow();
  const model = MODELS[state.streamDeck.model];
  const slots = queueSlotsFor(state.streamDeck.model);
  const pages = Math.max(1, Math.ceil(derived.queue.length / slots));
  const page = Math.min(state.streamDeck.page, pages - 1);
  const firstWaiting = derived.queue.find((q) => !q.inSpotlight);
  const pageEntries = derived.queue.slice(page * slots, page * slots + slots);
  const actionKeys = model.actions.slice(0, model.cols - 1);

  return (
    <div className="deckdev" style={{ ['--deck-cols' as string]: model.cols }}>
      <div className="deckdev__keys" role="group" aria-label={`Tastenfeld-Vorschau, ${model.label}`}>
        {Array.from({ length: slots }, (_, i) => {
          const q = pageEntries[i];
          if (!q) {
            return (
              <div key={`empty-${i}`} className="sdkey sdkey--empty" aria-hidden>
                <span className="sdkey__num">{page * slots + i + 1}</span>
                <span className="sdkey__free">frei</span>
              </div>
            );
          }
          const p = q.participant;
          const isNext = q === firstWaiting;
          return (
            <button
              key={p.id}
              type="button"
              className={`sdkey sdkey--person${q.inSpotlight ? ' is-lit' : ''}${isNext ? ' is-next' : ''}`}
              onClick={() => commands.toggleSpotlight(p.id)}
              aria-pressed={q.inSpotlight}
              aria-label={`Taste ${q.position}: ${p.name}, Hand seit ${clock(q.raisedAt)}, wartet ${duration(now - q.raisedAt)}. ${q.inSpotlight ? 'Im Spotlight, drücken zum Entfernen' : 'Drücken für Spotlight'}`}
            >
              <span className="sdkey__num tabular">{q.position}</span>
              <span className="sdkey__name">{p.shortName}</span>
              <span className="sdkey__wait tabular">{duration(now - q.raisedAt)}</span>
              <span className="sdkey__state">
                {q.inSpotlight ? (
                  <>
                    <Star size={10} strokeWidth={3} aria-hidden /> SPOT
                  </>
                ) : isNext ? (
                  'NÄCHSTE'
                ) : (
                  'WARTET'
                )}
              </span>
            </button>
          );
        })}
        {actionKeys.map((id) => {
          const a = actions[id];
          return (
            <button
              key={id}
              type="button"
              className={`sdkey sdkey--action${a.active ? ' is-lit' : ''}${a.tone === 'danger' ? ' is-danger' : ''}`}
              onClick={a.run}
              aria-label={`${a.label}. ${a.status}`}
              title={a.hint}
            >
              <a.icon size={20} strokeWidth={2} aria-hidden />
              <span className="sdkey__label">{KEY_LABEL[id] ?? a.label}</span>
              <span className="sdkey__status">{a.active && id === 'alle-stumm' ? 'AKTIV' : a.status}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="sdkey sdkey--action sdkey--page"
          disabled={pages < 2}
          onClick={() => dispatch({ type: 'streamDeck/update', patch: { page: (page + 1) % pages } })}
          aria-label={`Seite ${page + 1} von ${pages}. Nächste Seite`}
        >
          <ChevronRight size={20} aria-hidden />
          <span className="sdkey__label">Seite</span>
          <span className="sdkey__status tabular">
            {page + 1}/{pages}
          </span>
        </button>
      </div>
    </div>
  );
}
