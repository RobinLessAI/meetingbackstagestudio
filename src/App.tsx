import { useEffect, useRef } from 'react';
import { Presentation } from './components/graphics/Presentation.tsx';
import { ShortcutHelp, Sidebar, TopBar } from './components/layout.tsx';
import { LockedBanner, MuteAllBanner, MuteAllDialog, Toasts } from './components/people.tsx';
import { SHORTCUTS, useDeckActions } from './state/deckActions.ts';
import { useAutoDemo } from './state/simulation.ts';
import { StoreProvider, useStore } from './state/store.tsx';
import { SyncProvider } from './sync/SyncProvider.tsx';
import { UiProvider, useUi, VIEWS } from './state/ui.tsx';
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
      // Alt + 1 … 7 wechselt den Bereich (über den Tastencode, damit es auch auf macOS funktioniert).
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-7]$/.test(e.code)) {
        e.preventDefault();
        u.go(VIEWS[Number(e.code.slice(5)) - 1].id);
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
  const { view } = useUi();
  const { state } = useStore();
  useAutoDemo();
  useShortcuts();

  useEffect(() => {
    document.documentElement.dataset.motion = state.settings.motion;
  }, [state.settings.motion]);

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
        <div className="main__banners">
          <MuteAllBanner />
          {view !== 'veranstaltung' && view !== 'integrationen' && <LockedBanner />}
        </div>
        {view === 'veranstaltung' && <EventView />}
        {view === 'teilnehmende' && <ParticipantsView />}
        {view === 'galerie' && <GalleryView />}
        {view === 'grafiken' && <GraphicsView />}
        {view === 'steuerpult' && <ControlView />}
        {view === 'audio' && <AudioView />}
        {view === 'integrationen' && <IntegrationsView />}
      </main>
      <MuteAllDialog />
      <Presentation />
      <ShortcutHelp />
      <Toasts />
    </div>
  );
}
