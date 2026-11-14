// Welche Bereiche darf das angemeldete Konto nutzen? (Rollen aus der Verwaltung; lokal ist alles erlaubt)
import { useSyncExternalStore } from 'react';
import { canUse, currentRights, rightsVersion, subscribeRights } from '../web/mode.ts';
import type { GraphicKind, ViewId } from './types.ts';

const GRAPHICS: GraphicKind[] = ['highlight', 'umfrage', 'karte', 'wortwolke', 'gluecksrad'];

/** Bereich (Recht) hinter einer Seite der Leiste. */
const VIEW_BEREICH: Partial<Record<ViewId, string>> = {
  meeting: 'meeting',
  spotlight: 'spotlight',
  dran: 'dran',
  ausgabe: 'ausgabe',
  integrationen: 'integrationen',
  produkte: 'produkte',
  slides: 'slides',
};

export const graphicAllowed = (k: GraphicKind) => canUse(`grafik:${k}`);

export function viewAllowed(id: ViewId): boolean {
  if (id === 'grafiken') return GRAPHICS.some(graphicAllowed);
  const b = VIEW_BEREICH[id];
  return !b || canUse(b);
}

/** Fehlende Bereiche ausgegraut zeigen (statt ganz auszublenden)? */
export const showLocked = () => currentRights()?.gesperrteZeigen ?? false;
/** Hinweis für gesperrte Bereiche. */
export const lockedHint = () => currentRights()?.hinweis || 'Dieser Bereich ist in deinem Paket nicht enthalten.';

/** Stream-Deck-/Tastenaktionen, die zu einem Bereich gehören. */
export function actionAllowed(id: string): boolean {
  if (/^spotlight|^naechste-hand/.test(id)) return canUse('spotlight');
  if (id === 'karte-anzeigen') return graphicAllowed('karte');
  if (id === 'wortwolke-anzeigen') return graphicAllowed('wortwolke');
  if (id === 'highlight-anzeigen') return graphicAllowed('highlight');
  if (id === 'rad-anzeigen' || id === 'rad-drehen') return graphicAllowed('gluecksrad');
  if (id === 'frage-anzeigen' || id === 'umfrage-schliessen') return graphicAllowed('umfrage');
  return true;
}

/** Neu zeichnen, wenn sich die Rechte ändern. */
export const useRightsVersion = () => useSyncExternalStore(subscribeRights, rightsVersion);
