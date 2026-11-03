import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GraphicKind, ViewId } from './types.ts';

export const VIEWS: Array<{ id: ViewId; label: string; short: string }> = [
  { id: 'veranstaltung', label: 'Veranstaltung', short: 'Start' },
  { id: 'teilnehmende', label: 'Teilnehmende', short: 'Personen' },
  { id: 'galerie', label: 'Galerie Studio', short: 'Galerie' },
  { id: 'grafiken', label: 'Live Grafiken', short: 'Grafiken' },
  { id: 'steuerpult', label: 'Steuerpult & Stream Deck', short: 'Steuerpult' },
  { id: 'audio', label: 'Audio & Ausgabe', short: 'Audio' },
  { id: 'integrationen', label: 'Integrationen & Einstellungen', short: 'Integrationen' },
];

export type GraphicTab = GraphicKind;

interface UiValue {
  view: ViewId;
  go: (view: ViewId, opts?: { graphicTab?: GraphicTab }) => void;
  graphicTab: GraphicTab;
  setGraphicTab: (t: GraphicTab) => void;
  muteAllOpen: boolean;
  setMuteAllOpen: (open: boolean) => void;
  presentation: GraphicKind | null;
  setPresentation: (g: GraphicKind | null) => void;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

const UiCtx = createContext<UiValue | null>(null);

const readHash = (): ViewId => {
  const h = window.location.hash.replace('#', '');
  return (VIEWS.find((v) => v.id === h)?.id ?? 'veranstaltung') as ViewId;
};

export function UiProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewId>(readHash);
  const [graphicTab, setGraphicTab] = useState<GraphicTab>('karte');
  const [muteAllOpen, setMuteAllOpen] = useState(false);
  const [presentation, setPresentation] = useState<GraphicKind | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

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
      muteAllOpen,
      setMuteAllOpen,
      presentation,
      setPresentation,
      helpOpen,
      setHelpOpen,
    }),
    [view, go, graphicTab, muteAllOpen, presentation, helpOpen],
  );
  return <UiCtx.Provider value={value}>{children}</UiCtx.Provider>;
}

export function useUi(): UiValue {
  const v = useContext(UiCtx);
  if (!v) throw new Error('useUi außerhalb von UiProvider');
  return v;
}
