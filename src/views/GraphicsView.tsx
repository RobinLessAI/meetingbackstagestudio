import { CloudIcon, MapPin, MessageSquareQuote, Vote, type LucideIcon } from 'lucide-react';
import { ChatPanel } from '../components/ChatPanel.tsx';
import { useStore } from '../state/store.tsx';
import type { GraphicKind } from '../state/types.ts';
import { useUi } from '../state/ui.tsx';
import { CloudTab } from './graphics/CloudTab.tsx';
import { HighlightTab } from './graphics/HighlightTab.tsx';
import { MapTab } from './graphics/MapTab.tsx';
import { PollTab } from './graphics/PollTab.tsx';

const TABS: Array<{ id: GraphicKind; label: string; icon: LucideIcon }> = [
  { id: 'karte', label: 'Weltkarte', icon: MapPin },
  { id: 'umfrage', label: 'Umfrage', icon: Vote },
  { id: 'wortwolke', label: 'Wortwolke', icon: CloudIcon },
  { id: 'highlight', label: 'Chat-Highlight', icon: MessageSquareQuote },
];

export function GraphicsView() {
  const { graphicTab, setGraphicTab } = useUi();
  const { state, derived } = useStore();
  const badge: Record<GraphicKind, { n: number; warn: boolean } | null> = {
    karte: derived.map.review.length ? { n: derived.map.review.length, warn: true } : null,
    umfrage: derived.poll.unclear.length ? { n: derived.poll.unclear.length, warn: true } : null,
    wortwolke: null,
    highlight: null,
  };

  return (
    <div className="view view--graphics">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Live Grafiken</span>
          <h1 className="view__title">Grafiken aus dem Chat</h1>
          <p className="view__lead">
            Jede Nachricht im Chat-Simulator aktualisiert Weltkarte, Umfrage und Wortwolke gleichzeitig. Die Chips an jeder Nachricht zeigen,
            wie sie verstanden wurde.
          </p>
        </div>
      </header>

      <div className="graphics-grid">
        <ChatPanel />
        <section className="graphics-main" aria-label="Grafiken">
          <div className="tabs" role="tablist" aria-label="Grafiktyp">
            {TABS.map((t) => {
              const b = badge[t.id];
              const shown = state.program.graphic === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={graphicTab === t.id}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={graphicTab === t.id ? 0 : -1}
                  className={`tab${graphicTab === t.id ? ' is-active' : ''}`}
                  onClick={() => setGraphicTab(t.id)}
                  onKeyDown={(e) => {
                    const i = TABS.findIndex((x) => x.id === graphicTab);
                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
                      setGraphicTab(next.id);
                      document.getElementById(`tab-${next.id}`)?.focus();
                    }
                  }}
                >
                  <t.icon size={16} aria-hidden />
                  {t.label}
                  {b && (
                    <span className="tab__count" aria-label={`${b.n} zur Prüfung`}>
                      {b.n}
                    </span>
                  )}
                  {shown && <span className="tab__live" title="In der Vorschau eingeblendet">eingeblendet</span>}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" id={`panel-${graphicTab}`} aria-labelledby={`tab-${graphicTab}`} className="tabpanel">
            {graphicTab === 'karte' && <MapTab />}
            {graphicTab === 'umfrage' && <PollTab />}
            {graphicTab === 'wortwolke' && <CloudTab />}
            {graphicTab === 'highlight' && <HighlightTab />}
          </div>
        </section>
      </div>
    </div>
  );
}
