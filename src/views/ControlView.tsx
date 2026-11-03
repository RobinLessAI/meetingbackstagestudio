import { useId, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ListRestart, Pencil, Plus, ScrollText, X } from 'lucide-react';
import { GalleryStage } from '../components/GalleryStage.tsx';
import { HandQueue } from '../components/people.tsx';
import { MODELS, StreamDeck } from '../components/StreamDeck.tsx';
import { Button, DemoTag, Empty, IconButton, Kbd, NotConnected, Panel, Segmented } from '../components/ui.tsx';
import { createInitialState } from '../data/sample.ts';
import { clock } from '../lib/time.ts';
import { DECK_CATALOG, useDeckActions } from '../state/deckActions.ts';
import { useStore } from '../state/store.tsx';
import type { DeckState, StreamDeckModel } from '../state/types.ts';
import { useUi } from '../state/ui.tsx';

export function ControlView() {
  const { state, derived, dispatch, notify } = useStore();
  const actions = useDeckActions();
  const { go } = useUi();
  const [editing, setEditing] = useState(false);
  const [toAdd, setToAdd] = useState('');
  const addId = useId();
  const tiles = state.deck.tiles;
  const setTiles = (next: DeckState['tiles']) => dispatch({ type: 'deck/update', patch: { tiles: next } });
  const available = DECK_CATALOG.filter((id) => !tiles.includes(id));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tiles.length) return;
    const next = [...tiles];
    [next[i], next[j]] = [next[j], next[i]];
    setTiles(next);
  };

  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Steuerpult und Stream Deck</span>
          <h1 className="view__title">Steuerpult</h1>
          <p className="view__lead">
            Große Aktionsflächen für die wichtigsten Abläufe. Jede Aktion gibt eine Rückmeldung; Änderungen erscheinen sofort in Galerie und
            Teilnehmerliste.
          </p>
        </div>
        <div className="view__head-side">
          <Segmented<DeckState['columns']>
            label="Spalten"
            value={state.deck.columns}
            onChange={(columns) => dispatch({ type: 'deck/update', patch: { columns } })}
            options={[
              { value: 3, label: '3' },
              { value: 4, label: '4' },
              { value: 5, label: '5' },
            ]}
          />
          <Button icon={editing ? Check : Pencil} variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Fertig' : 'Raster anpassen'}
          </Button>
        </div>
      </header>

      <div className="control-grid">
        <div className="stack">
          {editing && (
            <div className="deck-editor">
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!toAdd) return;
                  setTiles([...tiles, toAdd as DeckState['tiles'][number]]);
                  setToAdd('');
                }}
              >
                <label htmlFor={addId} className="field-label">
                  Aktion hinzufügen
                </label>
                <select id={addId} className="select deck-editor__select" value={toAdd} onChange={(e) => setToAdd(e.target.value)} disabled={available.length === 0}>
                  <option value="">{available.length ? 'Aktion wählen …' : 'Alle Aktionen sind im Raster'}</option>
                  {available.map((id) => (
                    <option key={id} value={id}>
                      {actions[id].label}
                    </option>
                  ))}
                </select>
                <Button type="submit" icon={Plus} disabled={!toAdd}>
                  Hinzufügen
                </Button>
              </form>
              <Button
                variant="ghost"
                icon={ListRestart}
                onClick={() => {
                  dispatch({ type: 'deck/update', patch: createInitialState().deck });
                  notify('Steuerpult auf Standardbelegung zurückgesetzt', 'info');
                }}
              >
                Standard wiederherstellen
              </Button>
            </div>
          )}

          {tiles.length === 0 ? (
            <Panel>
              <Empty icon={Plus} title="Das Raster ist leer">
                <p>Über „Raster anpassen“ Aktionen hinzufügen.</p>
              </Empty>
            </Panel>
          ) : (
            <div className="deck" style={{ gridTemplateColumns: `repeat(${state.deck.columns}, minmax(0, 1fr))` }}>
              {tiles.map((id, i) => {
                const a = actions[id];
                const blocked = a.live && !!derived.locked;
                return (
                  <div key={id} className="deck__cell">
                    <button
                      type="button"
                      className={`deck-tile${a.active ? ' is-active' : ''}${a.tone === 'danger' ? ' is-danger' : ''}${blocked ? ' is-blocked' : ''}`}
                      onClick={a.run}
                      disabled={editing}
                      aria-pressed={a.active}
                      aria-describedby={`hint-${id}`}
                    >
                      <span className="deck-tile__top">
                        <a.icon size={22} strokeWidth={2} aria-hidden />
                        {a.shortcut && <Kbd>{a.shortcut}</Kbd>}
                      </span>
                      <span className="deck-tile__label">{a.label}</span>
                      <span className="deck-tile__status">{blocked ? 'Gesperrt: Sitzung beendet' : a.status}</span>
                      <span id={`hint-${id}`} className="sr-only">
                        {a.hint}
                      </span>
                    </button>
                    {editing && (
                      <div className="deck__edit">
                        <IconButton label={`${a.label} nach links`} icon={ArrowLeft} disabled={i === 0} onClick={() => move(i, -1)} />
                        <IconButton label={`${a.label} nach rechts`} icon={ArrowRight} disabled={i === tiles.length - 1} onClick={() => move(i, 1)} />
                        <IconButton label={`${a.label} entfernen`} icon={X} tone="danger" onClick={() => setTiles(tiles.filter((t) => t !== id))} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="control-bottom">
            <Panel eyebrow="Wirkung" title="Galerie-Vorschau" actions={<Button size="sm" variant="ghost" onClick={() => go('galerie')}>Galerie Studio</Button>}>
              <GalleryStage size="medium" showCaption={false} />
            </Panel>
            <Panel eyebrow="Rückmeldungen" title="Aktionsprotokoll" actions={<DemoTag />} flush>
              {state.log.length === 0 ? (
                <Empty icon={ScrollText} title="Noch keine Aktionen" compact>
                  <p>Jede ausgelöste Aktion wird hier mit Uhrzeit protokolliert.</p>
                </Empty>
              ) : (
                <ol className="log">
                  {state.log.slice(0, 14).map((l) => (
                    <li key={l.id} className={`log__item log__item--${l.tone}`}>
                      <span className="log__time mono">{clock(l.at)}</span>
                      <span>{l.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </div>

        <aside className="stack">
          <Panel
            eyebrow="Tastenfeld-Vorschau"
            title={
              <>
                Stream Deck <DemoTag>Simulation</DemoTag>
              </>
            }
            actions={<NotConnected>Kein Gerät verbunden</NotConnected>}
          >
            <div className="stack">
              <Segmented<StreamDeckModel>
                label="Tastenfeld"
                size="sm"
                value={state.streamDeck.model}
                onChange={(model) => dispatch({ type: 'streamDeck/update', patch: { model, page: 0 } })}
                options={(Object.keys(MODELS) as StreamDeckModel[]).map((m) => ({ value: m, label: MODELS[m].label }))}
              />
              <StreamDeck />
              <ul className="deck-legend">
                <li>
                  <span className="deck-legend__swatch is-next" /> Zuerst wartende Person
                </li>
                <li>
                  <span className="deck-legend__swatch is-lit" /> Im Spotlight
                </li>
                <li>Taste drücken: Spotlight an. Erneut drücken: Spotlight aus.</li>
              </ul>
              <p className="callout callout--info">
                Dies ist eine lokale Vorschau. Eine echte Verbindung zum Gerät bräuchte ein unterstütztes Plugin (Stream Deck SDK) oder eine
                Controller-Software mit lokaler Schnittstelle. Details unter Integrationen.
              </p>
            </div>
          </Panel>
          <Panel eyebrow="Reihenfolge der Tasten" title="Handzeichen" flush>
            <HandQueue dense />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
