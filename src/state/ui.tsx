import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GraphicKind, ViewId } from './types.ts';

/** Alle Bereiche. demo = nur simuliert, standardmäßig ausgeblendet. */
export const VIEWS: Array<{ id: ViewId; label: string; short: string; demo?: boolean }> = [
  { id: 'meeting', label: 'Meeting', short: 'Meeting' },
  { id: 'grafiken', label: 'Live Grafiken', short: 'Grafiken' },
  { id: 'ausgabe', label: 'OBS-Ausgabe', short: 'OBS' },
  { id: 'integrationen', label: 'Zoom & Einstellungen', short: 'Zoom' },
  { id: 'veranstaltung', label: 'Veranstaltung', short: 'Start', demo: true },
  { id: 'teilnehmende', label: 'Teilnehmende', short: 'Personen', demo: true },
  { id: 'galerie', label: 'Galerie Studio', short: 'Galerie', demo: true },
  { id: 'steuerpult', label: 'Steuerpult & Stream Deck', short: 'Steuerpult', demo: true },
  { id: 'audio', label: 'Audio & Ausgabe', short: 'Audio', demo: true },
];

export const DEFAULT_VIEW: ViewId = 'meeting';

const DEMO_KEY = 'mb-demo-bereiche';
const readDemo = () => {
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
};

/** Unterseiten von „Live Grafiken“: der Chat und die vier Grafiken. */
/** „uebersicht“ = Dashboard mit allen vier Grafiken (Klick auf „Live Grafiken“). */
export type GraphicTab = 'uebersicht' | GraphicKind;

const NAV_OPEN_KEY = 'mb-grafiken-offen';

interface UiValue {
  view: ViewId;
  go: (view: ViewId, opts?: { graphicTab?: GraphicTab }) => void;
  graphicTab: GraphicTab;
  setGraphicTab: (t: GraphicTab) => void;
  /** Untermenü „Live Grafiken“ in der Leiste aufgeklappt. */
  graphicsOpen: boolean;
  setGraphicsOpen: (open: boolean) => void;
  muteAllOpen: boolean;
  setMuteAllOpen: (open: boolean) => void;
  presentation: GraphicKind | null;
  setPresentation: (g: GraphicKind | null) => void;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  /** Chat als eigenes Fenster (Pop-up) geöffnet. */
  chatPopupOpen: boolean;
  setChatPopupOpen: (open: boolean) => void;
  /** Simulierte Bereiche (Teilnehmende, Galerie, Steuerpult, Audio …) anzeigen. */
  showDemo: boolean;
  setShowDemo: (on: boolean) => void;
  /** Die aktuell sichtbaren Bereiche in Reihenfolge der Leiste. */
  views: typeof VIEWS;
}

const UiCtx = createContext<UiValue | null>(null);

const readHash = (): ViewId => {
  const h = window.location.hash.replace('#', '');
  return (VIEWS.find((v) => v.id === h)?.id ?? DEFAULT_VIEW) as ViewId;
};

export function UiProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewId>(readHash);
  const [graphicTab, setGraphicTab] = useState<GraphicTab>('uebersicht');
  const [chatPopupOpen, setChatPopupOpen] = useState(false);
  const [graphicsOpen, setGraphicsOpenState] = useState(() => {
    try {
      return localStorage.getItem(NAV_OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const setGraphicsOpen = useCallback((on: boolean) => {
    setGraphicsOpenState(on);
    try {
      localStorage.setItem(NAV_OPEN_KEY, on ? '1' : '0');
    } catch {
      /* nur Komfort */
    }
  }, []);
  const [muteAllOpen, setMuteAllOpen] = useState(false);
  const [presentation, setPresentation] = useState<GraphicKind | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showDemo, setShowDemoState] = useState(readDemo);
  const views = useMemo(() => VIEWS.filter((v) => showDemo || !v.demo), [showDemo]);
  const setShowDemo = useCallback((on: boolean) => {
    setShowDemoState(on);
    try {
      localStorage.setItem(DEMO_KEY, on ? '1' : '0');
    } catch {
      /* nur Komfort */
    }
  }, []);

  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((v: ViewId, opts?: { graphicTab?: GraphicTab }) => {
    if (opts?.graphicTab) setGraphicTab(opts.graphicTab);
    setView(v);
    if (window.location.hash !== `#${v}`) {
      try {
        history.replaceState(null, '', `#${v}`);
      } catch {
        // In eingebetteten Ansichten kann die Adresse gesperrt sein; die Ansicht wechselt trotzdem.
      }
    }
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(
    () => ({
      view,
      go,
      graphicTab,
      setGraphicTab,
      graphicsOpen,
      setGraphicsOpen,
      muteAllOpen,
      setMuteAllOpen,
      presentation,
      setPresentation,
      helpOpen,
      setHelpOpen,
      chatPopupOpen,
      setChatPopupOpen,
      showDemo,
      setShowDemo,
      views,
    }),
    [view, go, graphicTab, graphicsOpen, setGraphicsOpen, muteAllOpen, presentation, helpOpen, chatPopupOpen, showDemo, setShowDemo, views],
  );
  return <UiCtx.Provider value={value}>{children}</UiCtx.Provider>;
}

export function useUi(): UiValue {
  const v = useContext(UiCtx);
  if (!v) throw new Error('useUi außerhalb von UiProvider');
  return v;
}
