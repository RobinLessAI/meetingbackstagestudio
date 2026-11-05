import { ChatPanel } from '../components/ChatPanel.tsx';
import { useStore } from '../state/store.tsx';
import { useUi } from '../state/ui.tsx';
import { CloudTab } from './graphics/CloudTab.tsx';
import { HighlightTab } from './graphics/HighlightTab.tsx';
import { MapTab } from './graphics/MapTab.tsx';
import { GRAPHIC_PAGES } from './graphics/pages.ts';
import { PollTab } from './graphics/PollTab.tsx';
import { useGraphicCounts } from './graphics/counts.ts';

/**
 * Live Grafiken: eine Unterseite pro Eintrag (Chat, Weltkarte, Umfrage, Wortwolke, Highlight).
 * Ausgewählt wird über das Ausklappmenü in der Leiste; auf schmalen Bildschirmen über die Leiste oben.
 */
export function GraphicsView() {
  const { graphicTab, setGraphicTab } = useUi();
  const { state } = useStore();
  const counts = useGraphicCounts();
  const page = GRAPHIC_PAGES.find((p) => p.id === graphicTab) ?? GRAPHIC_PAGES[0];

  return (
    <div className="view view--graphics">
      <nav className="tabs graphics-tabs" aria-label="Live Grafiken">
        {GRAPHIC_PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`tab${graphicTab === p.id ? ' is-active' : ''}`}
            aria-current={graphicTab === p.id ? 'page' : undefined}
            onClick={() => setGraphicTab(p.id)}
          >
            <p.icon size={16} aria-hidden />
            {p.label}
            {counts[p.id] ? <span className="tab__count">{counts[p.id]}</span> : null}
          </button>
        ))}
      </nav>

      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Live Grafiken</span>
          <h1 className="view__title">
            {page.label}
            {page.id !== 'chat' && state.program.graphic === page.id && <span className="tab__live">im Programm</span>}
          </h1>
          <p className="view__lead">{page.lead}</p>
        </div>
      </header>

      {page.id === 'chat' ? (
        <div className="graphics-chat">
          <ChatPanel />
        </div>
      ) : (
        <section className="graphics-main" aria-label={page.label}>
          {page.id === 'karte' && <MapTab />}
          {page.id === 'umfrage' && <PollTab />}
          {page.id === 'wortwolke' && <CloudTab />}
          {page.id === 'highlight' && <HighlightTab />}
        </section>
      )}
    </div>
  );
}
