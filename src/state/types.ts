// Gemeinsames Datenmodell. Alle Bereiche lesen aus genau diesem Zustand.

export type Role = 'moderation' | 'co-moderation' | 'vortrag' | 'produktion' | 'teilnahme';

export type Backdrop = 'regal' | 'fenster' | 'wand' | 'pflanze' | 'buero' | 'unscharf' | 'raum';
export type Framing = 'nah' | 'halbnah' | 'weit';

export interface SimulatedVideo {
  backdrop: Backdrop;
  framing: Framing;
  /** Farbton der Wand in Grad (HSL). */
  wallHue: number;
  /** Index in der Hautton-Palette. */
  skin: number;
  /** Index in der Haarfarben-Palette. */
  hair: number;
  /** Horizontale Verschiebung der Person im Bild, -1 bis 1. */
  offset: number;
}

export interface Reaction {
  emoji: string;
  label: string;
  at: number;
}

export interface Participant {
  id: string;
  name: string;
  /** Kurzname für Kacheln und Stream-Deck-Tasten. */
  shortName: string;
  role: Role;
  device: 'Laptop' | 'Telefon' | 'Raumsystem';
  micOn: boolean;
  camOn: boolean;
  /** Zeitpunkt des Handzeichens (ms seit Epoche) oder null. */
  handRaisedAt: number | null;
  reaction: Reaction | null;
  joinedAt: number;
  video: SimulatedVideo;
}

export type SessionStatus = 'geplant' | 'laeuft' | 'beendet';

export interface AgendaItem {
  id: string;
  title: string;
  /** Minuten nach Beginn. */
  offsetMin: number;
  durationMin: number;
  owner: string;
  /** Verknüpfter Bereich für eine Schnellaktion. */
  link?: ViewId;
  linkLabel?: string;
}

export interface SessionState {
  title: string;
  subtitle: string;
  format: string;
  status: SessionStatus;
  scheduledStart: number;
  startedAt: number | null;
  endedAt: number | null;
  plannedDurationMin: number;
  agenda: AgendaItem[];
}

export interface MuteAllState {
  at: number;
  allowSelfUnmute: boolean;
  /** IDs, die stummgeschaltet wurden. */
  affected: string[];
}

export type ChatSource = 'beispiel' | 'simulator' | 'auto' | 'import' | 'zoom';

export interface ChatMessage {
  id: string;
  /** Teilnehmenden-ID oder null für einen frei eingegebenen Namen. */
  senderId: string | null;
  senderName: string;
  text: string;
  at: number;
  source: ChatSource;
  /** Kennung aus dem Zoom-Chat-Import, verhindert doppelte Übernahme. */
  importKey?: string;
}

/** Zeitfenster, in dem Chat-Nachrichten für eine Grafik gezählt werden. */
export interface CollectWindow {
  status: 'laeuft' | 'pausiert';
  startedAt: number;
  pausedAt: number | null;
  /** Zeiträume, in denen die Sammlung pausiert war (von, bis). */
  gaps: Array<[number, number]>;
}

export type LocationDecision =
  | { status: 'bestaetigt'; placeId: string; at: number }
  | { status: 'verworfen'; at: number };

export interface MapState extends CollectWindow {
  question: string;
  autoConfirm: boolean;
  decisions: Record<string, LocationDecision>;
  /** Manuell zur Prüfung markierte Nachrichten. */
  flagged: string[];
  view: 'welt' | 'europa' | 'dach' | 'deutschland';
  /** gefuellt = Meer und Länder farbig; umrisse = nur Länderumrisse auf transparentem Grund. */
  style: 'gefuellt' | 'umrisse';
}

export interface PollOption {
  id: string;
  text: string;
}

export type PollDecision =
  | { status: 'zugeordnet'; optionId: string }
  | { status: 'verworfen' };

export interface PollState {
  kind: 'auswahl' | 'offen';
  question: string;
  options: PollOption[];
  labelStyle: 'buchstaben' | 'zahlen';
  status: 'entwurf' | 'laeuft' | 'geschlossen';
  startedAt: number | null;
  closedAt: number | null;
  /** Zeiträume, in denen die Umfrage geschlossen war (von, bis). */
  gaps: Array<[number, number]>;
  countRule: 'letzte' | 'alle';
  decisions: Record<string, PollDecision>;
  /** Darstellung: Balken (waagerecht), Säulen (senkrecht), Ring, Torte oder Kacheln mit großen Zahlen. */
  chart: 'balken' | 'saeulen' | 'kreis' | 'torte' | 'kacheln';
}

export interface CloudFilters {
  stopwords: boolean;
  shortWords: boolean;
  profanity: boolean;
  /** Nachrichten, die als Umfrage-Stimme zählen, nicht in die Wortwolke übernehmen. */
  ignoreVotes: boolean;
  minCount: 1 | 2 | 3;
}

export interface CloudState extends CollectWindow {
  prompt: string;
  filters: CloudFilters;
  hidden: string[];
  maxWords: number;
}

export type GraphicKind = 'karte' | 'umfrage' | 'wortwolke' | 'highlight';

/** Position einer Einblendung im Bild (3 × 3 Raster). */
export type LookPosition =
  | 'oben-links'
  | 'oben-mitte'
  | 'oben-rechts'
  | 'mitte-links'
  | 'mitte'
  | 'mitte-rechts'
  | 'unten-links'
  | 'unten-mitte'
  | 'unten-rechts';

/** Gemeinsame Darstellung von Weltkarte, Umfrage und Wortwolke in der OBS-Ausgabe. Farben als #rrggbb. */
export interface GraphicLook {
  // Einblendung (Programm bzw. stil=einblendung)
  position: LookPosition;
  /** Breite und Höhe der Einblendung in Prozent des Bildes; Höhe 0 = automatisch. */
  width: number;
  height: number;
  /** Abstand zum Bildrand in Prozent. */
  marginX: number;
  marginY: number;
  // Box
  background: string;
  backgroundOpacity: number;
  border: boolean;
  borderColor: string;
  corners: 'eckig' | 'rund' | 'stark';
  shadow: boolean;
  /** Innenabstand in Prozent der Standardgröße. */
  padding: number;
  // Text
  font: 'standard' | 'schmal' | 'serif';
  /** Schrift- und Elementgröße in Prozent. */
  scale: number;
  text: string;
  muted: string;
  accent: string;
  showTitle: boolean;
  /** Eigener Titel; leer = Frage aus der Grafik. */
  title: string;
  titleAlign: 'links' | 'mitte';
  showMeta: boolean;
  // Vollbild
  fullBackground: 'dunkel' | 'farbe' | 'transparent';
  fullColor: string;
  fullOpacity: number;
}

export interface MapLook extends GraphicLook {
  land: string;
  ocean: string;
  oceanOpacity: number;
  borders: string;
  pin: string;
  /** Größe der Punkte in Prozent. */
  pinSize: number;
  showLabels: boolean;
  labelColor: string;
  showCounts: boolean;
}

export interface PollLook extends GraphicLook {
  barColor: string;
  trackColor: string;
  trackOpacity: number;
  /** Führende Antwort in Akzentfarbe hervorheben. */
  highlightLeader: boolean;
  /** Jede Antwort in eigener Farbe. */
  multiColor: boolean;
  showPercent: boolean;
  showCounts: boolean;
  showKeys: boolean;
  /** Nach Stimmen sortieren statt in Antwort-Reihenfolge. */
  sortByVotes: boolean;
  /** Balkenstärke in Prozent. */
  barSize: number;
}

export interface CloudLook extends GraphicLook {
  colorMode: 'akzent' | 'einfarbig' | 'bunt';
  wordColor: string;
  maxWords: number;
  /** Größe der kleinsten und größten Begriffe in Prozent. */
  minSize: number;
  maxSize: number;
  weight: 'normal' | 'fett';
  uppercase: boolean;
  /** Abstand zwischen Begriffen in Prozent. */
  gap: number;
}

export interface GraphicLooks {
  karte: MapLook;
  umfrage: PollLook;
  wortwolke: CloudLook;
}

/** Aussehen der Chat-Highlight-Einblendung (Bauchbinde). Farben als #rrggbb. */
export interface HighlightStyle {
  background: string;
  /** Deckkraft des Hintergrunds in Prozent (0 = durchsichtig). */
  backgroundOpacity: number;
  text: string;
  accent: string;
  name: string;
  /** Schriftgröße in Prozent der Standardgröße. */
  size: number;
  corners: 'eckig' | 'rund' | 'stark';
  position: 'links' | 'mitte' | 'rechts';
  font: 'standard' | 'schmal' | 'serif';
  /** Akzentbalken am linken Rand. */
  bar: boolean;
  /** Kleine Überschrift über dem Text, leer = ausgeblendet. */
  label: string;
  showName: boolean;
  showTime: boolean;
}

export interface ProgramState {
  /** Die aktuell eingeblendete Grafik in der lokalen Vorschau. */
  graphic: GraphicKind | null;
  /** Kurz eingeblendete Reaktion (z. B. Applaus). */
  reaction: Reaction | null;
}

export type GalleryLayout = 'zentrum' | 'spotlight' | 'raster';
export type TileCount = 'auto' | 8 | 12 | 16;

export interface GalleryState {
  layout: GalleryLayout;
  tileCount: TileCount;
  showNames: boolean;
  showReactions: boolean;
  showHands: boolean;
  hideNoVideo: boolean;
}

export type DeckActionId =
  | 'alle-stumm'
  | 'naechste-hand'
  | 'spotlight-leeren'
  | 'galerie-wechseln'
  | 'galerie-zentrum'
  | 'frage-anzeigen'
  | 'karte-anzeigen'
  | 'wortwolke-anzeigen'
  | 'highlight-anzeigen'
  | 'grafik-aus'
  | 'reaktion-applaus'
  | 'reaktion-herz'
  | 'filter-haende'
  | 'filter-mikro'
  | 'haende-senken'
  | 'namen-umschalten'
  | 'umfrage-schliessen';

export interface DeckState {
  tiles: DeckActionId[];
  columns: 3 | 4 | 5;
}

export type StreamDeckModel = 'klein' | 'standard' | 'xl';

export interface StreamDeckState {
  model: StreamDeckModel;
  page: number;
}

export type OutputId = 'ndi' | 'srt' | 'sdi' | 'dante' | 'virtuelle-kamera' | 'aufnahme';
export type OutputSource = 'programm' | 'galerie' | 'grafik' | 'moderation' | 'audio-mix';

export interface Settings {
  /** Namen, deren Chat-Beiträge nicht ausgewertet werden (Moderation, Team). */
  teamNames: string[];
  autoDemo: boolean;
  lowerHandOnSpotlight: boolean;
  maxSpotlight: number;
  shortcuts: boolean;
  motion: 'system' | 'reduziert' | 'normal';
}

export interface LogEntry {
  id: string;
  at: number;
  text: string;
  tone: 'info' | 'erfolg' | 'warnung' | 'fehler';
}

export type ViewId =
  | 'meeting'
  | 'veranstaltung'
  | 'teilnehmende'
  | 'galerie'
  | 'grafiken'
  | 'steuerpult'
  | 'audio'
  | 'ausgabe'
  | 'integrationen';

export type ParticipantFilter =
  | 'alle'
  | 'hand'
  | 'mikro-an'
  | 'mikro-aus'
  | 'kamera-aus'
  | 'spricht'
  | 'spotlight';

export interface ParticipantView {
  query: string;
  role: Role | 'alle';
  status: ParticipantFilter;
  sort: 'liste' | 'name' | 'rolle' | 'hand' | 'beitritt';
}

export interface AppState {
  /** Beispieldaten oder eigene Veranstaltung (nur diese wird gespeichert). */
  dataMode: 'demo' | 'eigene';
  session: SessionState;
  participants: Participant[];
  /** Simulierte sprechende Person. */
  activeSpeakerId: string | null;
  /** Spotlight-Reihenfolge (IDs). */
  spotlight: string[];
  muteAll: MuteAllState | null;
  chat: ChatMessage[];
  map: MapState;
  poll: PollState;
  cloud: CloudState;
  highlightId: string | null;
  /** Highlight-Auswahl zeigt nur Nachrichten ab diesem Zeitpunkt („Liste leeren“); null = alle. */
  highlightSince: number | null;
  highlightStyle: HighlightStyle;
  /** Darstellung von Weltkarte, Umfrage und Wortwolke in OBS. */
  looks: GraphicLooks;
  program: ProgramState;
  gallery: GalleryState;
  deck: DeckState;
  streamDeck: StreamDeckState;
  outputs: Record<OutputId, OutputSource>;
  participantView: ParticipantView;
  settings: Settings;
  log: LogEntry[];
  /** Zähler für Demo-Beitritte. */
  joinCursor: number;
}
