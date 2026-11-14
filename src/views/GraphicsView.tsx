import { LayoutGrid } from 'lucide-react';
import { useStore } from '../state/store.tsx';
import { useUi } from '../state/ui.tsx';
import { CloudTab } from './graphics/CloudTab.tsx';
import { WheelTab } from './graphics/WheelTab.tsx';
import { GraphicsDashboard } from './graphics/Dashboard.tsx';
import { HighlightTab } from './graphics/HighlightTab.tsx';
import { LookPanel } from './graphics/LookPanel.tsx';
import { MapTab } from './graphics/MapTab.tsx';
import { GRAPHIC_PAGES, visibleGraphicPages } from './graphics/pages.ts';
import { graphicAllowed, useRightsVersion } from '../state/rights.ts';
import { LockedView } from './LockedView.tsx';
import { PollTab } from './graphics/PollTab.tsx';
import { useGraphicCounts } from './graphics/counts.ts';

/**
 * Live Grafiken: eine Unterseite pro Eintrag (Weltkarte, Umfrage, Wortwolke, Highlight).
 * Der Chat öffnet sich als eigenes Fenster (Pop-up).
 * Ausgewählt wird über das Ausklappmenü in der Leiste; auf schmalen Bildschirmen über die Leiste oben.
 */
export function GraphicsView() {
  const { graphicTab, setGraphicTab } = useUi();
  const { state } = useStore();
  const counts = useGraphicCounts();
  const overview = graphicTab === 'uebersicht';
  useRightsVersion();
  const page = GRAPHIC_PAGES.find((p) => p.id === graphicTab) ?? GRAPHIC_PAGES[0];
  const pageLocked = !overview && !graphicAllowed(page.id);

  return (
    <div className="view view--graphics">
      <nav className="tabs graphics-tabs" aria-label="Live Grafiken">
        <button
          type="button"
          className={`tab${overview ? ' is-active' : ''}`}
          aria-current={overview ? 'page' : undefined}
          onClick={() => setGraphicTab('uebersicht')}
        >
          <LayoutGrid size={16} aria-hidden />
          Übersicht
        </button>
        {visibleGraphicPages().map((p) => (
          <button
            key={p.id}
            type="button"
            className={`tab${graphicTab === p.id ? ' is-active' : ''}${p.locked ? ' is-locked' : ''}`}
            title={p.locked ? `${p.label} – nicht in deinem Paket` : undefined}
            aria-current={graphicTab === p.id ? 'page' : undefined}
            onClick={() => setGraphicTab(p.id)}
          >
            <p.icon size={16} aria-hidden />
            {p.label}
            {counts[p.id] ? <span className="tab__count">{counts[p.id]}</span> : null}
          </button>
        ))}
      </nav>

      {pageLocked ? (
        <LockedView title={page.label} />
      ) : overview ? (
        <header className="view__head">
          <div className="view__titles">
            <span className="eyebrow">Live Grafiken</span>
            <h1 className="view__title">Übersicht</h1>
            <p className="view__lead">
              Alle Grafiken auf einen Blick, so wie sie in OBS aussehen. Klick auf eine Vorschau öffnet die Einstellungen.
            </p>
          </div>
        </header>
      ) : (
        <header className="view__head">
          <div className="view__titles">
            <span className="eyebrow">Live Grafiken</span>
            <h1 className="view__title">
              {page.label}
              {state.program.graphic === page.id && <span className="tab__live">im Programm</span>}
            </h1>
            <p className="view__lead">{page.lead}</p>
          </div>
        </header>
      )}

      {pageLocked ? null : overview ? (
        <GraphicsDashboard />
      ) : (
        <section className="graphics-main" aria-label={page.label}>
          {page.id === 'karte' && <MapTab />}
          {page.id === 'umfrage' && <PollTab />}
          {page.id === 'wortwolke' && <CloudTab />}
          {page.id === 'highlight' && <HighlightTab />}
          {page.id === 'gluecksrad' && <WheelTab />}
          {(page.id === 'karte' || page.id === 'umfrage' || page.id === 'wortwolke' || page.id === 'gluecksrad') && <LookPanel graphic={page.id} />}
        </section>
      )}
    </div>
  );
}
