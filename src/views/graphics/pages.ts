import { CloudIcon, Disc3, MapPin, MessageSquareQuote, Vote, type LucideIcon } from 'lucide-react';
import type { GraphicKind } from '../../state/types.ts';

/** Unterseiten von „Live Grafiken“ in der Reihenfolge des Ausklappmenüs. „Live Grafiken“ selbst zeigt die Übersicht. */
export const GRAPHIC_PAGES: Array<{ id: GraphicKind; label: string; icon: LucideIcon; lead: string }> = [
  { id: 'highlight', label: 'Chat-Highlight', icon: MessageSquareQuote, lead: 'Eine einzelne Chat-Nachricht groß einblenden. Die Liste der Chat-Nachrichten lässt sich als Pop-up öffnen, z. B. neben Zoom.' },
  { id: 'umfrage', label: 'Umfrage', icon: Vote, lead: 'Antworten wie „A“ oder „2“ aus dem Chat. Pro Person zählt die zuletzt abgegebene gültige Stimme.' },
  { id: 'karte', label: 'Weltkarte', icon: MapPin, lead: 'Orte aus dem Chat. Eindeutige Orte erscheinen auf der Karte, unklare landen in der Prüfliste.' },
  { id: 'wortwolke', label: 'Wortwolke', icon: CloudIcon, lead: 'Begriffe aus dem Chat, gefiltert nach Füllwörtern und unangemessenen Begriffen.' },
  { id: 'gluecksrad', label: 'Glücksrad', icon: Disc3, lead: 'Ein Rad, das sich dreht und zufällig einen Namen aus dem Chat oder aus deiner eigenen Liste auswählt.' },
];
