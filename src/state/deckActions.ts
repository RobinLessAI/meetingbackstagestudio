import { useMemo } from 'react';
import {
  CloudIcon,
  EyeOff,
  Filter,
  Hand,
  Heart,
  LayoutGrid,
  LayoutPanelTop,
  ListX,
  Lock,
  MapPin,
  MessageSquareQuote,
  MicOff,
  PartyPopper,
  StarOff,
  Tag,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { clock, duration } from '../lib/time.ts';
import { GRAPHIC_LABEL, LAYOUT_LABEL, useCommands } from './commands.ts';
import { MUTE_ALL_EXEMPT } from './reducer.ts';
import { useStore } from './store.tsx';
import type { DeckActionId } from './types.ts';
import { useUi } from './ui.tsx';

export interface DeckAction {
  id: DeckActionId;
  label: string;
  hint: string;
  icon: LucideIcon;
  shortcut?: string;
  tone?: 'danger';
  /** Zustand, der auf der Taste sichtbar sein soll (z. B. eingeblendet). */
  active: boolean;
  status: string;
  /** Live-Aktionen sind nach Sitzungsende gesperrt. */
  live: boolean;
  run: () => void;
}

export const DECK_CATALOG: DeckActionId[] = [
  'naechste-hand',
  'spotlight-leeren',
  'alle-stumm',
  'galerie-wechseln',
  'galerie-zentrum',
  'frage-anzeigen',
  'umfrage-schliessen',
  'karte-anzeigen',
  'wortwolke-anzeigen',
  'highlight-anzeigen',
  'grafik-aus',
  'reaktion-applaus',
  'reaktion-herz',
  'filter-haende',
  'filter-mikro',
  'haende-senken',
  'namen-umschalten',
];

/** Tastenkürzel → Aktion. Gilt nur außerhalb von Eingabefeldern. */
export const SHORTCUTS: Record<string, DeckActionId> = {
  n: 'naechste-hand',
  s: 'spotlight-leeren',
  m: 'alle-stumm',
  g: 'galerie-wechseln',
  u: 'frage-anzeigen',
  k: 'karte-anzeigen',
  w: 'wortwolke-anzeigen',
  h: 'highlight-anzeigen',
  x: 'grafik-aus',
  r: 'reaktion-applaus',
};

const keyFor = (id: DeckActionId) =>
  Object.entries(SHORTCUTS).find(([, v]) => v === id)?.[0]?.toUpperCase();

/** Alle Aktionen für Steuerpult, Stream-Deck-Vorschau und Tastenkürzel. */
export function useDeckActions(): Record<DeckActionId, DeckAction> {
  const { state, derived, dispatch, notify } = useStore();
  const commands = useCommands();
  const ui = useUi();

  return useMemo(() => {
    const now = Date.now();
    const next = derived.queue.find((q) => !q.inSpotlight);
    const openMics = state.participants.filter(
      (p) => p.micOn && !(MUTE_ALL_EXEMPT as readonly string[]).includes(p.role),
    ).length;
    const g = state.program.graphic;
    const highlight = state.chat.find((m) => m.id === state.highlightId);

    const list: Omit<DeckAction, 'shortcut'>[] = [
      {
        id: 'naechste-hand',
        label: 'Nächste Hand ins Spotlight',
        hint: 'Setzt die am längsten wartende Person ohne Spotlight ins Spotlight.',
        icon: Hand,
        active: false,
        live: true,
        status: next ? `${next.participant.shortName} · wartet ${duration(now - next.raisedAt)}` : 'Keine Hand wartet',
        run: commands.nextHandToSpotlight,
      },
      {
        id: 'spotlight-leeren',
        label: 'Spotlight leeren',
        hint: 'Entfernt alle Personen aus dem Spotlight.',
        icon: StarOff,
        active: false,
        live: true,
        status: state.spotlight.length ? `${state.spotlight.length} im Spotlight` : 'Spotlight leer',
        run: commands.clearSpotlight,
      },
      {
        id: 'alle-stumm',
        label: 'Alle Teil\u00ADnehmenden stumm\u00ADschalten',
        hint: 'Öffnet eine Bestätigung. Moderation und Co-Moderation bleiben offen.',
        icon: MicOff,
        tone: 'danger',
        active: !!state.muteAll,
        live: true,
        status: state.muteAll ? `Aktiv seit ${clock(state.muteAll.at, false)}` : `${openMics} Mikros offen`,
        run: () => (derived.locked ? notify(derived.locked, 'warnung', false) : ui.setMuteAllOpen(true)),
      },
      {
        id: 'galerie-wechseln',
        label: 'Galerie wechseln',
        hint: 'Schaltet zwischen Zentrum, Spotlight-Bühne und Raster um.',
        icon: LayoutGrid,
        active: false,
        live: false,
        status: LAYOUT_LABEL[state.gallery.layout],
        run: commands.cycleGallery,
      },
      {
        id: 'galerie-zentrum',
        label: 'Moderation im Zentrum',
        hint: 'Galerie mit Robin groß in der Mitte.',
        icon: LayoutPanelTop,
        active: state.gallery.layout === 'zentrum',
        live: false,
        status: state.gallery.layout === 'zentrum' ? 'Aktiv' : 'Galerie-Layout',
        run: () => commands.setGalleryLayout('zentrum'),
      },
      {
        id: 'frage-anzeigen',
        label: 'Frage anzeigen',
        hint: 'Blendet die Umfrage mit Live-Ergebnis in der Vorschau ein oder aus.',
        icon: Vote,
        active: g === 'umfrage',
        live: true,
        status: `${derived.poll.totalVotes} ${state.poll.kind === 'offen' ? 'Antworten' : 'Stimmen'}`,
        run: () => commands.toggleGraphic('umfrage'),
      },
      {
        id: 'umfrage-schliessen',
        label: 'Umfrage schließen',
        hint: 'Beendet die Stimmabgabe. Spätere Chat-Antworten zählen nicht mehr.',
        icon: Lock,
        active: state.poll.status === 'geschlossen',
        live: false,
        status: state.poll.status === 'laeuft' ? 'Läuft' : state.poll.status === 'geschlossen' ? 'Geschlossen' : 'Entwurf',
        run: commands.closePoll,
      },
      {
        id: 'karte-anzeigen',
        label: 'Weltkarte einblenden',
        hint: 'Zeigt die bestätigten Orte aus dem Chat.',
        icon: MapPin,
        active: g === 'karte',
        live: true,
        status: `${derived.map.pins.length} Orte · ${derived.map.review.length} prüfen`,
        run: () => commands.toggleGraphic('karte'),
      },
      {
        id: 'wortwolke-anzeigen',
        label: 'Wortwolke einblenden',
        hint: 'Zeigt die freigegebenen Begriffe aus dem Chat.',
        icon: CloudIcon,
        active: g === 'wortwolke',
        live: true,
        status: `${derived.cloud.visible.length} Begriffe`,
        run: () => commands.toggleGraphic('wortwolke'),
      },
      {
        id: 'highlight-anzeigen',
        label: 'Chat-High\u00ADlight einblenden',
        hint: 'Zeigt den ausgewählten Chat-Beitrag als Bauchbinde.',
        icon: MessageSquareQuote,
        active: g === 'highlight',
        live: true,
        status: highlight ? highlight.senderName.split(' ')[0] : 'Kein Beitrag gewählt',
        run: () => commands.toggleGraphic('highlight'),
      },
      {
        id: 'grafik-aus',
        label: 'Grafik ausblenden',
        hint: 'Blendet die aktuelle Grafik aus.',
        icon: EyeOff,
        active: false,
        live: false,
        status: g ? `${GRAPHIC_LABEL[g]} sichtbar` : 'Nichts eingeblendet',
        run: commands.hideGraphic,
      },
      {
        id: 'reaktion-applaus',
        label: 'Reaktion einblenden: Applaus',
        hint: 'Blendet für 5 Sekunden Applaus ein.',
        icon: PartyPopper,
        active: false,
        live: true,
        status: '5 Sekunden',
        run: () => commands.showReaction('👏', 'Applaus'),
      },
      {
        id: 'reaktion-herz',
        label: 'Reaktion einblenden: Danke',
        hint: 'Blendet für 5 Sekunden ein Herz mit „Danke“ ein.',
        icon: Heart,
        active: false,
        live: true,
        status: '5 Sekunden',
        run: () => commands.showReaction('💛', 'Danke'),
      },
      {
        id: 'filter-haende',
        label: 'Teil\u00ADnehmende filtern: Hand\u00ADzeichen',
        hint: 'Öffnet die Teilnehmendenliste mit Filter „Hand gehoben“.',
        icon: Filter,
        active: state.participantView.status === 'hand',
        live: false,
        status: `${derived.queue.length} Hände`,
        run: () => {
          dispatch({ type: 'participantView/update', patch: { status: 'hand', sort: 'hand', query: '', role: 'alle' } });
          ui.go('teilnehmende');
          notify('Teilnehmende gefiltert: Hand gehoben, älteste zuerst', 'info');
        },
      },
      {
        id: 'filter-mikro',
        label: 'Teil\u00ADnehmende filtern: Mikro offen',
        hint: 'Öffnet die Teilnehmendenliste mit Filter „Mikrofon offen“.',
        icon: Filter,
        active: state.participantView.status === 'mikro-an',
        live: false,
        status: `${derived.openMics.length} offen`,
        run: () => {
          dispatch({ type: 'participantView/update', patch: { status: 'mikro-an', query: '', role: 'alle' } });
          ui.go('teilnehmende');
          notify('Teilnehmende gefiltert: Mikrofon offen', 'info');
        },
      },
      {
        id: 'haende-senken',
        label: 'Alle Hände senken',
        hint: 'Setzt alle Handzeichen zurück.',
        icon: ListX,
        active: false,
        live: true,
        status: `${derived.queue.length} gehoben`,
        run: commands.lowerAllHands,
      },
      {
        id: 'namen-umschalten',
        label: 'Namen ein/aus',
        hint: 'Schaltet die Namensanzeige in der Galerie um.',
        icon: Tag,
        active: state.gallery.showNames,
        live: false,
        status: state.gallery.showNames ? 'Namen sichtbar' : 'Namen aus',
        run: commands.toggleNames,
      },
    ];
    return Object.fromEntries(
      list.map((a) => [a.id, { ...a, shortcut: keyFor(a.id) }]),
    ) as Record<DeckActionId, DeckAction>;
  }, [state, derived, commands, ui, dispatch, notify]);
}

