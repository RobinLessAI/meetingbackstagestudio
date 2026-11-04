import { useEffect, useRef } from 'react';
import { Presentation } from './components/graphics/Presentation.tsx';
import { ShortcutHelp, Sidebar, TopBar } from './components/layout.tsx';
import { LockedBanner, MuteAllBanner, MuteAllDialog, Toasts } from './components/people.tsx';
import { SHORTCUTS, useDeckActions } from './state/deckActions.ts';
import { useAutoDemo } from './state/simulation.ts';
import { StoreProvider, useStore } from './state/store.tsx';
import { SyncProvider } from './sync/SyncProvider.tsx';
import { DEFAULT_VIEW, UiProvider, useUi, VIEWS } from './state/ui.tsx';
import { ObsView } from './views/ObsView.tsx';
import { AudioView } from './views/AudioView.tsx';
import { ControlView } from './views/ControlView.tsx';
import { EventView } from './views/EventView.tsx';
import { GalleryView } from './views/GalleryView.tsx';
import { GraphicsView } from './views/GraphicsView.tsx';
import { IntegrationsView } from './views/IntegrationsView.tsx';
import { ParticipantsView } from './views/ParticipantsView.tsx';

export function App() {
  return (
    <StoreProvider>
      <SyncProvider>
        <UiProvider>
          <Shell />
        </UiProvider>
      </SyncProvider>
    </StoreProvider>
  );
}

const isTyping = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
  );
};

function useShortcuts() {
  const { state } = useStore();
  const ui = useUi();
  const actions = useDeckActions();
  const latest = useRef({ actions, ui, enabled: state.settings.shortcuts });
  latest.current = { actions, ui, enabled: state.settings.shortcuts };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { actions: a, ui: u, enabled } = latest.current;
      if (e.defaultPrevented || isTyping(e.target)) return;
      // Alt + Ziffer wechselt den sichtbaren Bereich (über den Tastencode, damit es auch auf macOS funktioniert).
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
        const target = u.views[Number(e.code.slice(5)) - 1];
        if (!target) return;
        e.preventDefault();
        u.go(target.id);
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.key === '?') {
        e.preventDefault();
        u.setHelpOpen(true);
        return;
      }
      if (!enabled) return;
      const id = SHORTCUTS[e.key.toLowerCase()];
      if (id) {
        e.preventDefault();
        a[id].run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Shell() {
  const { view, views, go, showDemo } = useUi();
  const { state } = useStore();
  useAutoDemo();
  useShortcuts();

  useEffect(() => {
    document.documentElement.dataset.motion = state.settings.motion;
  }, [state.settings.motion]);

  // Ausgeblendete Bereiche nicht offen lassen.
  useEffect(() => {
    if (!views.some((v) => v.id === view)) go(DEFAULT_VIEW);
  }, [view, views, go]);

  useEffect(() => {
    const label = VIEWS.find((v) => v.id === view)?.label;
    document.title = label ? `${label} · MeetingBackstage Studio` : 'MeetingBackstage Studio';
  }, [view]);

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Zum Inhalt springen
      </a>
      <Sidebar />
      <TopBar />
      <main id="main" className="main" tabIndex={-1}>
        {showDemo && (
          <div className="main__banners">
            <MuteAllBanner />
            {view !== 'veranstaltung' && view !== 'integrationen' && view !== 'ausgabe' && <LockedBanner />}
          </div>
        )}
        {view === 'veranstaltung' && <EventView />}
        {view === 'teilnehmende' && <ParticipantsView />}
        {view === 'galerie' && <GalleryView />}
        {view === 'grafiken' && <GraphicsView />}
        {view === 'steuerpult' && <ControlView />}
        {view === 'audio' && <AudioView />}
        {view === 'ausgabe' && <ObsView />}
        {view === 'integrationen' && <IntegrationsView />}
      </main>
      <MuteAllDialog />
      <Presentation />
      <ShortcutHelp />
      <Toasts />
    </div>
  );
}
