import { useNow, useStore } from '../../state/store.tsx';
import { HighlightCard } from './HighlightCard.tsx';
import { pollView } from '../../sync/snapshot.ts';
import { PollChart } from './PollChart.tsx';
import { WordCloud } from './WordCloud.tsx';
import { WorldMap } from './WorldMap.tsx';

/** Eingeblendete Grafik auf der lokalen Galerie-Vorschau. */
export function ProgramOverlay() {
  const { state, derived } = useStore();
  const now = useNow();
  const { graphic, reaction } = state.program;
  const highlight = state.chat.find((m) => m.id === state.highlightId) ?? null;
  const showReaction = reaction && now - reaction.at < 5000;

  return (
    <>
      {graphic === 'highlight' && (
        <div className="overlay overlay--lower">
          <HighlightCard message={highlight} variant="overlay" />
        </div>
      )}
      {graphic && graphic !== 'highlight' && (
        <div className="overlay overlay--side">
          <p className="overlay__title">
            {graphic === 'karte' ? state.map.question : graphic === 'umfrage' ? state.poll.question : state.cloud.prompt}
          </p>
          <div className="overlay__body">
            {graphic === 'karte' && <WorldMap pins={derived.map.pins} view={state.map.view} variant="overlay" aspect={1.25} />}
            {graphic === 'umfrage' && (
              <PollChart data={pollView(state.poll, derived.poll)} variant="overlay" chart="balken" />
            )}
            {graphic === 'wortwolke' && <WordCloud terms={derived.cloud.visible.slice(0, 18)} variant="overlay" />}
          </div>
        </div>
      )}
      {showReaction && (
        <div className="overlay overlay--reaction" role="status">
          <span className="overlay__emoji" aria-hidden>
            {reaction.emoji}
          </span>
          <span className="overlay__reaction-label">{reaction.label}</span>
        </div>
      )}
    </>
  );
}
