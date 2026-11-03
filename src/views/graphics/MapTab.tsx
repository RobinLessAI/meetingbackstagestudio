import { useId, useState } from 'react';
import { Check, CircleHelp, MapPin, Pause, Play, RotateCcw, Undo2, X } from 'lucide-react';
import { WorldMap, type PinCluster } from '../../components/graphics/WorldMap.tsx';
import { Badge, Button, Dialog, Empty, IconButton, Panel, Segmented, Switch } from '../../components/ui.tsx';
import { PLACE_BY_ID, PLACES } from '../../data/places.ts';
import { clock } from '../../lib/time.ts';
import type { LocationItem } from '../../state/derive.ts';
import { useStore } from '../../state/store.tsx';
import type { MapState } from '../../state/types.ts';
import { CollectStatus, GraphicHeader } from './shared.tsx';

function ReviewItem({ item }: { item: LocationItem }) {
  const { dispatch, notify } = useStore();
  const [manual, setManual] = useState('');
  const selectId = useId();
  const d = item.detection;
  const confirm = (placeId: string) => {
    dispatch({ type: 'map/decide', messageId: item.message.id, decision: { status: 'bestaetigt', placeId, at: Date.now() } });
    notify(`${PLACE_BY_ID[placeId]?.name} bestätigt: ${item.message.senderName} erscheint auf der Karte`, 'erfolg');
  };
  const dismiss = () => {
    dispatch({ type: 'map/decide', messageId: item.message.id, decision: { status: 'verworfen', at: Date.now() } });
    notify(`Ortsangabe von ${item.message.senderName} verworfen`, 'info');
  };

  return (
    <li className="review">
      <div className="review__msg">
        <span className="review__who">
          {item.message.senderName} <span className="subtle tabular">{clock(item.message.at, false)}</span>
        </span>
        <q className="review__text">{item.message.text}</q>
      </div>
      <div className="review__state">
        {d?.kind === 'eindeutig' && (
          <Badge tone="ok" icon={MapPin}>
            Erkannt: {PLACE_BY_ID[d.placeId]?.name}, {PLACE_BY_ID[d.placeId]?.region}
          </Badge>
        )}
        {d?.kind === 'mehrdeutig' && <Badge tone="warn">Mehrdeutig: „{d.matched}“</Badge>}
        {d?.kind === 'unbekannt' && <Badge tone="warn">Unbekannter Ort: „{d.candidate}“</Badge>}
        {!d && <Badge tone="warn">Manuell zur Prüfung markiert</Badge>}
      </div>
      <div className="review__actions">
        {d?.kind === 'eindeutig' && (
          <Button size="sm" variant="primary" icon={Check} onClick={() => confirm(d.placeId)}>
            Bestätigen
          </Button>
        )}
        {d?.kind === 'mehrdeutig' &&
          d.placeIds.map((id) => (
            <Button key={id} size="sm" icon={Check} onClick={() => confirm(id)}>
              {PLACE_BY_ID[id]?.name}
            </Button>
          ))}
        {(d?.kind === 'unbekannt' || !d) && (
          <form
            className="review__manual"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual) confirm(manual);
            }}
          >
            <label htmlFor={selectId} className="sr-only">
              Ort aus dem Verzeichnis zuordnen
            </label>
            <select id={selectId} className="select" value={manual} onChange={(e) => setManual(e.target.value)}>
              <option value="">Ort zuordnen …</option>
              {[...PLACES]
                .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.region})
                  </option>
                ))}
            </select>
            <Button size="sm" type="submit" disabled={!manual}>
              Zuordnen
            </Button>
          </form>
        )}
        <Button size="sm" variant="ghost" icon={X} onClick={dismiss}>
          Verwerfen
        </Button>
      </div>
    </li>
  );
}

export function MapTab() {
  const { state, derived, dispatch, notify } = useStore();
  const [selected, setSelected] = useState<PinCluster | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const qId = useId();
  const m = derived.map;
  const map = state.map;
  const since = clock(map.status === 'laeuft' ? map.startedAt : (map.pausedAt ?? map.startedAt), false);
  const selectedPins = selected
    ? m.pins.filter((p) => selected.pins.some((s) => s.place.id === p.place.id))
    : [];

  return (
    <div className="graphic">
      <GraphicHeader
        kind="karte"
        title="Weltkarte mit Ortsmarkierungen"
        status={
          <>
            <CollectStatus status={map.status} since={since} />
            <span className="subtle tabular">
              {m.peopleOnMap} Personen · {m.pins.length} Orte · {m.review.length} zur Prüfung
            </span>
          </>
        }
      />

      <div className="graphic-tools">
        <div className="field graphic-tools__question">
          <label className="field-label" htmlFor={qId}>
            Frage im Chat
          </label>
          <input
            id={qId}
            className="input"
            value={map.question}
            maxLength={90}
            onChange={(e) => dispatch({ type: 'map/update', patch: { question: e.target.value } })}
          />
        </div>
        <Segmented<MapState['view']>
          label="Ausschnitt"
          value={map.view}
          onChange={(view) => {
            dispatch({ type: 'map/update', patch: { view } });
            setSelected(null);
          }}
          options={[
            { value: 'welt', label: 'Welt' },
            { value: 'europa', label: 'Europa' },
            { value: 'dach', label: 'D-A-CH' },
          ]}
        />
        <div className="row graphic-tools__buttons">
          {map.status === 'laeuft' ? (
            <Button icon={Pause} onClick={() => dispatch({ type: 'map/pause', at: Date.now() })}>
              Pausieren
            </Button>
          ) : (
            <Button icon={Play} onClick={() => dispatch({ type: 'map/resume', at: Date.now() })}>
              Fortsetzen
            </Button>
          )}
          <Button icon={RotateCcw} variant="ghost" onClick={() => setResetOpen(true)}>
            Neu starten
          </Button>
        </div>
      </div>

      <div className="map-layout">
        <div className="map-canvas">
          <WorldMap pins={m.pins} view={map.view} selectedId={selected?.id} onSelect={setSelected} aspect={1.9} />
          {m.pins.length === 0 && (
            <div className="map-canvas__empty">
              <Empty icon={MapPin} title="Noch keine bestätigten Orte" compact>
                <p>Erkannte Ortsangaben aus dem Chat erscheinen rechts in der Prüfliste.</p>
              </Empty>
            </div>
          )}
          <p className="map-canvas__credit">
            Vereinfachte Karte, lokal eingebunden · Kartendaten: Natural Earth (gemeinfrei)
          </p>
        </div>

        <div className="stack map-side">
          {selected && (
            <Panel
              eyebrow="Auswahl"
              title={selectedPins.map((p) => p.place.name).join(', ')}
              actions={<IconButton label="Auswahl schließen" icon={X} onClick={() => setSelected(null)} />}
            >
              {selectedPins.map((pin) => (
                <div key={pin.place.id} className="pin-detail">
                  <span className="pin-detail__head">
                    <strong>{pin.place.name}</strong>
                    <span className="subtle">{pin.place.region}</span>
                    <Badge tone="accent">
                      {pin.people.length} {pin.people.length === 1 ? 'Person' : 'Personen'}
                    </Badge>
                  </span>
                  <ul className="pin-detail__people">
                    {pin.people.map((person) => (
                      <li key={person.key}>
                        {person.name}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Undo2}
                          onClick={() => {
                            dispatch({ type: 'map/decide', messageId: person.messageId, decision: null });
                            notify(`Zuordnung von ${person.name} zurückgenommen`, 'info');
                          }}
                        >
                          Zurücknehmen
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Panel>
          )}

          <Panel
            eyebrow="Vor der Anzeige prüfen"
            title={
              <>
                Prüfliste <span className="subtle tabular">{m.review.length}</span>
              </>
            }
            actions={
              m.review.some((r) => r.detection?.kind === 'eindeutig') ? (
                <Button
                  size="sm"
                  onClick={() => {
                    const clear = m.review.filter((r) => r.detection?.kind === 'eindeutig');
                    clear.forEach((r) =>
                      r.detection?.kind === 'eindeutig' &&
                      dispatch({
                        type: 'map/decide',
                        messageId: r.message.id,
                        decision: { status: 'bestaetigt', placeId: r.detection.placeId, at: Date.now() },
                      }),
                    );
                    notify(`${clear.length} eindeutige Orte bestätigt`, 'erfolg');
                  }}
                >
                  Eindeutige bestätigen
                </Button>
              ) : undefined
            }
            flush
          >
            {m.review.length === 0 ? (
              <Empty icon={Check} title="Alles geprüft" compact>
                <p>Neue Ortsangaben aus dem Chat erscheinen hier, bevor sie auf die Karte kommen.</p>
              </Empty>
            ) : (
              <ul className="review-list">
                {[...m.review].reverse().map((item) => (
                  <ReviewItem key={item.message.id} item={item} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel eyebrow="Regeln" title="So entsteht ein Pin">
            <ul className="rules">
              <li>Nur Orte, die eine Person selbst im Chat nennt. Es werden keine anderen Standortdaten genutzt.</li>
              <li>Mehrdeutige, unbekannte oder nicht erkennbare Angaben landen in der Prüfliste statt auf der Karte.</li>
              <li>Pro Person zählt der zuletzt bestätigte Ort. Mehrere Personen am selben Ort werden gruppiert.</li>
              <li>Beiträge von Moderation, Vortrag und Produktion werden nicht ausgewertet.</li>
            </ul>
            <div className="divider" />
            <Switch
              checked={map.autoConfirm}
              onChange={(v) => dispatch({ type: 'map/update', patch: { autoConfirm: v } })}
              label="Eindeutige Orte automatisch bestätigen"
              description="Mehrdeutige und unbekannte Orte brauchen weiterhin eine Prüfung."
            />
          </Panel>

          <Panel
            eyebrow="Überblick"
            title={
              <>
                Bestätigte Orte <span className="subtle tabular">{m.pins.length}</span>
              </>
            }
            flush
          >
            {m.pins.length === 0 ? (
              <Empty icon={MapPin} title="Keine Orte" compact />
            ) : (
              <ul className="place-list">
                {m.pins.map((pin) => (
                  <li key={pin.place.id}>
                    <span className="place-list__name">{pin.place.name}</span>
                    <span className="subtle place-list__people">{pin.people.map((p) => p.name.split(' ')[0]).join(', ')}</span>
                    <span className="place-list__count tabular">{pin.people.length}</span>
                  </li>
                ))}
              </ul>
            )}
            {m.dismissed.length > 0 && (
              <div className="dismissed">
                <button type="button" className="link-btn" onClick={() => setShowDismissed((v) => !v)} aria-expanded={showDismissed}>
                  <CircleHelp size={13} aria-hidden /> {m.dismissed.length} verworfene Angaben {showDismissed ? 'ausblenden' : 'anzeigen'}
                </button>
                {showDismissed && (
                  <ul className="dismissed__list">
                    {m.dismissed.map((d) => (
                      <li key={d.message.id}>
                        <span>
                          {d.message.senderName}: <q>{d.message.text}</q>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Undo2}
                          onClick={() => dispatch({ type: 'map/decide', messageId: d.message.id, decision: null })}
                        >
                          Wiederherstellen
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Weltkarte neu starten?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger-solid"
              icon={RotateCcw}
              onClick={() => {
                dispatch({ type: 'map/reset', at: Date.now() });
                setSelected(null);
                setResetOpen(false);
                notify('Weltkarte neu gestartet. Es zählen nur noch neue Chat-Beiträge.', 'info');
              }}
            >
              Neu starten
            </Button>
          </>
        }
      >
        <p>
          Alle {m.peopleOnMap} Pins und Prüfentscheidungen werden entfernt. Ab jetzt zählen nur neue Chat-Beiträge. Der Chat selbst bleibt
          erhalten.
        </p>
      </Dialog>
    </div>
  );
}
