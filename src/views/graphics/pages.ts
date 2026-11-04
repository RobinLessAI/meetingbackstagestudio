import { CloudIcon, MapPin, MessageSquare, MessageSquareQuote, Vote, type LucideIcon } from 'lucide-react';
import type { GraphicTab } from '../../state/ui.tsx';

/** Unterseiten von „Live Grafiken“ in der Reihenfolge des Ausklappmenüs. */
export const GRAPHIC_PAGES: Array<{ id: GraphicTab; label: string; icon: LucideIcon; lead: string }> = [
  {
    id: 'chat',
    label: 'Chat',
    icon: MessageSquare,
    lead: 'Alle Nachrichten aus Zoom. Die Chips an jeder Nachricht zeigen, wie sie für Karte, Umfrage und Wortwolke verstanden wurde. Unten kannst du Testnachrichten eingeben.',
  },
  { id: 'karte', label: 'Weltkarte', icon: MapPin, lead: 'Orte aus dem Chat. Eindeutige Orte erscheinen auf der Karte, unklare landen in der Prüfliste.' },
  { id: 'umfrage', label: 'Umfrage', icon: Vote, lead: 'Antworten wie „A“ oder „2“ aus dem Chat. Pro Person zählt die zuletzt abgegebene gültige Stimme.' },
  { id: 'wortwolke', label: 'Wortwolke', icon: CloudIcon, lead: 'Begriffe aus dem Chat, gefiltert nach Füllwörtern und unangemessenen Begriffen.' },
  { id: 'highlight', label: 'Chat-Highlight', icon: MessageSquareQuote, lead: 'Eine einzelne Chat-Nachricht groß einblenden.' },
];
