import { useStore } from '../../state/store.tsx';
import type { GraphicTab } from '../../state/ui.tsx';

/** Anzahl offener Einträge zur Prüfung je Unterseite (für Leiste und Tabs). */
export function useGraphicCounts(): Partial<Record<GraphicTab, number>> {
  const { derived } = useStore();
  return { karte: derived.map.review.length, umfrage: derived.poll.unclear.length };
}
