import { CloudIcon, MapPin, MessageSquareQuote, Vote, type LucideIcon } from 'lucide-react';
import type { GraphicTab } from '../../state/ui.tsx';

/** Unterseiten von „Live Grafiken“ in der Reihenfolge des Ausklappmenüs. Der Chat öffnet sich als eigenes Fenster. */
export const GRAPHIC_PAGES: Array<{ id: GraphicTab; label: string; icon: LucideIcon; lead: string }> = [
  { id: 'karte', label: 'Weltkarte', icon: MapPin, lead: 'Orte aus dem Chat. Eindeutige Orte erscheinen auf der Karte, unklare landen in der Prüfliste.' },
  { id: 'umfrage', label: 'Umfrage', icon: Vote, lead: 'Antworten wie „A“ oder „2“ aus dem Chat. Pro Person zählt die zuletzt abgegebene gültige Stimme.' },
  { id: 'wortwolke', label: 'Wortwolke', icon: CloudIcon, lead: 'Begriffe aus dem Chat, gefiltert nach Füllwörtern und unangemessenen Begriffen.' },
  { id: 'highlight', label: 'Chat-Highlight', icon: MessageSquareQuote, lead: 'Eine einzelne Chat-Nachricht groß einblenden. Über „Chat-Fenster öffnen“ hast du alle Nachrichten in einem eigenen Fenster neben Zoom.' },
];
