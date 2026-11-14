import { useEffect, useRef } from 'react';
import { ChatPopupWindow } from './components/ChatPopup.tsx';
import { Presentation } from './components/graphics/Presentation.tsx';
import { ShortcutHelp, Sidebar, TopBar } from './components/layout.tsx';
import { LockedBanner, MuteAllBanner, MuteAllDialog, Toasts } from './components/people.tsx';
import { SHORTCUTS, useDeckActions } from './state/deckActions.ts';
import { useAutoDemo } from './state/simulation.ts';
import { StoreProvider, useStore } from './state/store.tsx';
import { SyncProvider, useSync } from './sync/SyncProvider.tsx';
import type { DeckActionId, ViewId } from './state/types.ts';
import { DEFAULT_VIEW, UiProvider, useUi, VIEWS } from './state/ui.tsx';
import { ObsView } from './views/ObsView.tsx';
import { SpotlightView } from './views/SpotlightView.tsx';
import { RosterView } from './views/RosterView.tsx';
import { AdminView } from './web/AdminView.tsx';
import { WebsiteView } from './web/website/WebsiteView.tsx';
import { ProductsView } from './views/ProductsView.tsx';
import { LockedView } from './views/LockedView.tsx';
import { actionAllowed } from './state/rights.ts';
import { RosterPopupWindow, useRosterSync } from './components/RosterList.tsx';
import { MeetingView } from './views/MeetingView.tsx';
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
        if (!actionAllowed(id)) return; // gehört zu einem gesperrten Bereich
        a[id].run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Aktionen vom Stream Deck (über http://localhost:4300/aktion/…) wie einen Tastendruck ausführen. */
function useRemoteActions() {
  const actions = useDeckActions();
  const { notify } = useStore();
  const { setActionHandler } = useSync();
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    setActionHandler((id) => {
      const action = latest.current[id as DeckActionId];
      if (!action) {
        notify(`Stream Deck: unbekannte Aktion „${id}“`, 'fehler');
        return;
      }
      if (!actionAllowed(id)) {
        notify('Stream Deck: Diese Funktion ist in deinem Paket nicht enthalten.', 'fehler');
        return;
      }
      action.run();
    });
    return () => setActionHandler(null);
  }, [setActionHandler, notify]);
}

const ZOOM_RETURN: Record<string, { text: string; ok: boolean }> = {
  verbunden: { text: 'Dein Zoom-Konto ist verbunden. Deine Meetings stehen jetzt in der Liste.', ok: true },
  abgebrochen: { text: 'Die Verbindung mit Zoom wurde abgebrochen.', ok: false },
  abgelaufen: { text: 'Die Verbindung mit Zoom hat zu lange gedauert. Bitte noch einmal „Mit Zoom verbinden“.', ok: false },
  fehler: { text: 'Zoom-Konto konnte nicht verbunden werden. Bitte später erneut versuchen.', ok: false },
};

/** Web: Rückkehr von „Mit Zoom verbinden“ (/?zoom=…) melden, zur Meeting-Seite gehen und die Adresse aufräumen. */
function useZoomReturn(go: (view: ViewId) => void) {
  const { notify } = useStore();
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('zoom');
    if (!result) return;
    window.history.replaceState(null, '', '/');
    const r = ZOOM_RETURN[result] ?? ZOOM_RETURN.fehler;
    notify(r.text, r.ok ? 'erfolg' : 'fehler');
    go('meeting');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function Shell() {
  const { view, views, go, showDemo } = useUi();
  useZoomReturn(go);
  const { state } = useStore();
  useAutoDemo();
  useShortcuts();
  useRemoteActions();
  useRosterSync();

  useEffect(() => {
    document.documentElement.dataset.motion = state.settings.motion;
  }, [state.settings.motion]);

  // Ausgeblendete Bereiche nicht offen lassen.
  useEffect(() => {
    if (!views.some((v) => v.id === view)) go(views.find((v) => !v.locked)?.id ?? DEFAULT_VIEW);
  }, [view, views, go]);
  const lockedView = views.find((v) => v.id === view && v.locked);

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
        {lockedView && <LockedView title={lockedView.label} />}
        {!lockedView && view === 'veranstaltung' && <EventView />}
        {!lockedView && view === 'teilnehmende' && <ParticipantsView />}
        {!lockedView && view === 'galerie' && <GalleryView />}
        {!lockedView && view === 'grafiken' && <GraphicsView />}
        {!lockedView && view === 'steuerpult' && <ControlView />}
        {!lockedView && view === 'audio' && <AudioView />}
        {!lockedView && view === 'ausgabe' && <ObsView />}
        {!lockedView && view === 'integrationen' && <IntegrationsView />}
        {!lockedView && view === 'meeting' && <MeetingView />}
        {!lockedView && view === 'spotlight' && <SpotlightView />}
        {!lockedView && view === 'dran' && <RosterView />}
        {!lockedView && view === 'verwaltung' && <AdminView />}
        {!lockedView && view === 'website' && <WebsiteView />}
        {!lockedView && view === 'produkte' && <ProductsView />}
      </main>
      <MuteAllDialog />
      <Presentation />
      <ChatPopupWindow />
      <RosterPopupWindow />
      <ShortcutHelp />
      <Toasts />
    </div>
  );
}
