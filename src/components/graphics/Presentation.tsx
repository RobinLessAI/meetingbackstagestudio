import { useEffect, useRef, useState } from 'react';
import { CloudIcon, MapPin, MessageSquareQuote, Vote, X } from 'lucide-react';
import { GRAPHIC_LABEL } from '../../state/commands.ts';
import { useStore } from '../../state/store.tsx';
import type { GraphicKind } from '../../state/types.ts';
import { useUi } from '../../state/ui.tsx';
import { DemoTag } from '../ui.tsx';
import { HighlightCard } from './HighlightCard.tsx';
import { pollView } from '../../sync/snapshot.ts';
import { PollChart } from './PollChart.tsx';
import { WordCloud } from './WordCloud.tsx';
import { WorldMap, type PinCluster } from './WorldMap.tsx';

const TABS: Array<{ id: GraphicKind; icon: typeof MapPin }> = [
  { id: 'karte', icon: MapPin },
  { id: 'umfrage', icon: Vote },
  { id: 'wortwolke', icon: CloudIcon },
  { id: 'highlight', icon: MessageSquareQuote },
];

/** Große Präsentationsansicht, z. B. für einen zweiten Bildschirm. Nur lokal. */
export function Presentation() {
  const { presentation, setPresentation } = useUi();
  const { state, derived } = useStore();
  const [selected, setSelected] = useState<PinCluster | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  // Natives <dialog>: hält den Fokus in der Ansicht, Esc schließt.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (presentation && !d.open) d.showModal();
    if (!presentation && d.open) d.close();
  }, [presentation]);

  useEffect(() => {
    if (!presentation) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) setPresentation(TABS[i].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentation, setPresentation]);

  useEffect(() => setSelected(null), [presentation, state.map.view]);

  const highlight = state.chat.find((m) => m.id === state.highlightId) ?? null;
  const p = derived.poll;
  const title =
    presentation === 'karte'
      ? state.map.question
      : presentation === 'umfrage'
        ? state.poll.question
        : presentation === 'wortwolke'
          ? state.cloud.prompt
          : 'Frage aus dem Chat';
  const meta =
    presentation === 'karte'
      ? `${derived.map.peopleOnMap} Personen an ${derived.map.pins.length} Orten · nur selbst genannte, bestätigte Orte`
      : presentation === 'umfrage'
        ? state.poll.kind === 'offen'
          ? `${p.totalVotes} Antworten von ${p.voters} Personen`
          : `${p.totalVotes} Stimmen · gezählt wird die letzte gültige Antwort pro Person${state.poll.status === 'geschlossen' ? ' · Abstimmung geschlossen' : ''}`
        : presentation === 'wortwolke'
          ? `${derived.cloud.messageCount} Beiträge · ${derived.cloud.visible.length} Begriffe`
          : '';

  return (
    <dialog
      ref={ref}
      className="presentation"
      aria-label="Präsentationsansicht"
      onCancel={(e) => {
        e.preventDefault();
        setPresentation(null);
      }}
      onClose={() => setPresentation(null)}
    >
      {presentation && (
        <>
      <header className="presentation__bar">
        <div className="presentation__tabs" role="group" aria-label="Grafik wählen">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={presentation === t.id ? 'is-active' : ''}
              aria-pressed={presentation === t.id}
              onClick={() => setPresentation(t.id)}
            >
              <t.icon size={15} aria-hidden />
              {GRAPHIC_LABEL[t.id]}
              <kbd className="kbd">{i + 1}</kbd>
            </button>
          ))}
        </div>
        <div className="row">
          <DemoTag>Präsentation in diesem Fenster · für OBS die Ausgabe-Adressen nutzen</DemoTag>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPresentation(null)} autoFocus>
            <X size={14} aria-hidden /> Schließen <kbd className="kbd">Esc</kbd>
          </button>
        </div>
      </header>
      <div className="presentation__stage">
        <div className="presentation__frame">
          <h1 className="presentation__title">{title}</h1>
          <div className={`presentation__body presentation__body--${presentation}`}>
            {presentation === 'karte' && (
              <div className="presentation__map">
                <WorldMap
                  pins={derived.map.pins}
                  view={state.map.view}
                  variant="present"
                  aspect={2.1}
                  selectedId={selected?.id}
                  onSelect={setSelected}
                />
                {selected && (
                  <div className="presentation__pin-card" role="status">
                    {selected.pins.map((pin) => (
                      <div key={pin.place.id}>
                        <strong>
                          {pin.place.name}: {pin.people.length} {pin.people.length === 1 ? 'Person' : 'Personen'}
                        </strong>
                        <span>{pin.people.map((x) => x.name).join(', ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {presentation === 'umfrage' && <PollChart data={pollView(state.poll, p)} variant="present" />}
            {presentation === 'wortwolke' && <WordCloud terms={derived.cloud.visible} variant="present" />}
            {presentation === 'highlight' && <HighlightCard message={highlight} variant="present" />}
          </div>
          {meta && <p className="presentation__meta">{meta}</p>}
        </div>
      </div>
        </>
      )}
    </dialog>
  );
}
