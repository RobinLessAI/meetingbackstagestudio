import type {
  AppState,
  ChatMessage,
  Participant,
  SimulatedVideo,
} from '../state/types.ts';

// Beispielveranstaltung mit erfundenen Personen. Alle Zeiten werden relativ zum
// Ladezeitpunkt berechnet, damit Wartezeiten und Laufzeit realistisch wirken.

const MIN = 60_000;

const v = (
  backdrop: SimulatedVideo['backdrop'],
  framing: SimulatedVideo['framing'],
  wallHue: number,
  skin: number,
  hair: number,
  offset = 0,
): SimulatedVideo => ({ backdrop, framing, wallHue, skin, hair, offset });

type Seed = Omit<Participant, 'joinedAt' | 'handRaisedAt' | 'reaction'> & {
  joinedMin: number;
};

const SEEDS: Seed[] = [
  { id: 'robin', name: 'Robin', shortName: 'Robin', role: 'moderation', device: 'Laptop', micOn: true, camOn: true, joinedMin: -12, video: v('regal', 'halbnah', 30, 1, 2, 0) },
  { id: 'mara', name: 'Mara Lindqvist', shortName: 'Mara', role: 'co-moderation', device: 'Laptop', micOn: false, camOn: true, joinedMin: -10, video: v('fenster', 'halbnah', 200, 0, 4, -0.2) },
  { id: 'henrike', name: 'Dr. Henrike Vogt', shortName: 'H. Vogt', role: 'vortrag', device: 'Laptop', micOn: true, camOn: true, joinedMin: -8, video: v('buero', 'nah', 215, 0, 5, 0.1) },
  { id: 'tobias', name: 'Tobias Kern', shortName: 'Tobias', role: 'produktion', device: 'Laptop', micOn: false, camOn: false, joinedMin: -15, video: v('wand', 'halbnah', 0, 2, 1) },
  { id: 'jonas', name: 'Jonas Petersen', shortName: 'Jonas', role: 'teilnahme', device: 'Laptop', micOn: false, camOn: true, joinedMin: -1, video: v('pflanze', 'halbnah', 140, 0, 3, 0.15) },
  { id: 'aylin', name: 'Aylin Demir', shortName: 'Aylin', role: 'teilnahme', device: 'Laptop', micOn: false, camOn: true, joinedMin: 0, video: v('unscharf', 'nah', 25, 2, 0, -0.1) },
  { id: 'lukas', name: 'Lukas Brandstätter', shortName: 'Lukas', role: 'teilnahme', device: 'Laptop', micOn: true, camOn: true, joinedMin: 0, video: v('regal', 'weit', 45, 1, 1, 0.25) },
  { id: 'sofia', name: 'Sofia Marino', shortName: 'Sofia', role: 'teilnahme', device: 'Telefon', micOn: false, camOn: false, joinedMin: 1, video: v('wand', 'nah', 330, 1, 0) },
  { id: 'kwame', name: 'Kwame Mensah', shortName: 'Kwame', role: 'teilnahme', device: 'Laptop', micOn: false, camOn: true, joinedMin: 1, video: v('fenster', 'halbnah', 185, 4, 0, 0) },
  { id: 'lea', name: 'Lea Hoffmann', shortName: 'Lea', role: 'teilnahme', device: 'Laptop', micOn: false, camOn: true, joinedMin: 1, video: v('wand', 'halbnah', 95, 0, 3, -0.2) },
  { id: 'paul', name: 'Paul Schütte', shortName: 'Paul', role: 'teilnahme', device: 'Laptop', micOn: true, camOn: true, joinedMin: 2, video: v('buero', 'weit', 210, 0, 2, 0.1) },
  { id: 'nele', name: 'Nele Fischer', shortName: 'Nele', role: 'teilnahme', device: 'Telefon', micOn: false, camOn: false, joinedMin: 2, video: v('wand', 'nah', 270, 0, 4) },
  { id: 'emre', name: 'Emre Yılmaz', shortName: 'Emre', role: 'teilnahme', device: 'Laptop', micOn: false, camOn: true, joinedMin: 3, video: v('regal', 'halbnah', 15, 2, 0, -0.15) },
  { id: 'katarzyna', name: 'Katarzyna Nowak', shortName: 'Katarzyna', role: 'teilnahme', device: 'Laptop', micOn: false, camOn: true, joinedMin: 3, video: v('pflanze', 'nah', 160, 0, 3, 0.2) },
  { id: 'felix', name: 'Felix Gruber', shortName: 'Felix', role: 'teilnahme', device: 'Laptop', micOn: false, camOn: false, joinedMin: 4, video: v('wand', 'halbnah', 50, 1, 1) },
  { id: 'ines', name: 'Ines Moreau', shortName: 'Ines', role: 'teilnahme', device: 'Laptop', micOn: true, camOn: true, joinedMin: 4, video: v('unscharf', 'halbnah', 190, 3, 0, 0) },
  { id: 'jana', name: 'Jana Albrecht', shortName: 'Jana', role: 'teilnahme', device: 'Laptop', micOn: false, camOn: true, joinedMin: 5, video: v('fenster', 'nah', 35, 0, 2, 0.1) },
  { id: 'raum', name: 'Seminarraum 2.14 · Köln', shortName: 'Raum 2.14', role: 'teilnahme', device: 'Raumsystem', micOn: true, camOn: true, joinedMin: -5, video: v('raum', 'weit', 40, 1, 1) },
  { id: 'ole', name: 'Ole Brandt', shortName: 'Ole', role: 'teilnahme', device: 'Laptop', micOn: false, camOn: true, joinedMin: 18, video: v('regal', 'nah', 120, 1, 1, -0.1) },
];

/** Namen für Demo-Beitritte über „Person beitreten lassen“. */
export const JOIN_POOL: Array<Pick<Participant, 'name' | 'shortName' | 'device'> & { video: SimulatedVideo }> = [
  { name: 'Miriam Haas', shortName: 'Miriam', device: 'Laptop', video: v('pflanze', 'halbnah', 100, 0, 2, 0.1) },
  { name: 'Daniel Osei', shortName: 'Daniel', device: 'Laptop', video: v('buero', 'nah', 205, 4, 0) },
  { name: 'Clara Winkler', shortName: 'Clara', device: 'Telefon', video: v('wand', 'nah', 350, 0, 3, -0.1) },
  { name: 'Yusuf Aydın', shortName: 'Yusuf', device: 'Laptop', video: v('regal', 'halbnah', 20, 2, 0, 0.2) },
  { name: 'Greta Lund', shortName: 'Greta', device: 'Laptop', video: v('fenster', 'halbnah', 190, 0, 5) },
  { name: 'Matteo Ricci', shortName: 'Matteo', device: 'Laptop', video: v('unscharf', 'nah', 30, 1, 0) },
];

type ChatSeed = [minAfterStart: number, senderId: string, text: string];

const CHAT: ChatSeed[] = [
  [0.5, 'mara', 'Guten Morgen zusammen! Ich bin heute im Chat für euch da. Bei Technikfragen einfach hier melden.'],
  [1.2, 'jonas', 'Moin! Ton und Bild sind gut 👍'],
  [2.0, 'aylin', 'Guten Morgen aus dem Homeoffice ☕'],
  [10.2, 'robin', 'Schreibt gern in den Chat, von wo ihr heute dabei seid. Die Stadt reicht.'],
  [10.6, 'paul', 'Werl'],
  [10.8, 'lukas', 'Grüße aus Wien!'],
  [11.0, 'kwame', 'Accra 🇬🇭'],
  [11.1, 'lea', 'Berlin'],
  [11.3, 'emre', 'Köln'],
  [11.4, 'katarzyna', 'Hallo aus Leipzig'],
  [11.6, 'jonas', 'Frankfurt'],
  [11.8, 'felix', 'Graz'],
  [12.0, 'ines', 'Zürich, aber gebürtig aus Lyon'],
  [12.2, 'jana', 'Werl! 😄'],
  [12.4, 'nele', 'Grüße aus Hintertupfingen'],
  [12.6, 'sofia', 'Hamburg'],
  [12.8, 'raum', 'Hier im Raum sitzen alle aus Köln und Umgebung'],
  [13.0, 'aylin', 'Wien'],
  [19.4, 'ole', 'Bin etwas später dazugekommen, sitze in Halle'],
  [24.0, 'henrike', 'Die Folien schicken wir nach dem Workshop per Mail.'],
  [27.0, 'emre', 'Kann man die Aufzeichnung später ansehen?'],
  [27.4, 'mara', 'Es gibt heute keine Aufzeichnung, aber eine Zusammenfassung per Mail.'],
  [33.2, 'aylin', 'Wie haltet ihr die Energie hoch, wenn die Hälfte im Raum sitzt und die andere Hälfte online ist?'],
  [35.5, 'robin', 'Kurze Runde: Was nehmt ihr aus dem Impuls mit? Ein bis drei Wörter.'],
  [35.8, 'lukas', 'Aufmerksamkeit'],
  [35.9, 'lea', 'Pausen einplanen'],
  [36.0, 'kwame', 'Aufmerksamkeit ist Beziehung'],
  [36.1, 'paul', 'Kamera-Regeln'],
  [36.2, 'katarzyna', 'Interaktion'],
  [36.3, 'emre', 'Pausen!'],
  [36.4, 'nele', 'verdammt viel Input'],
  [36.5, 'ines', 'Blickkontakt'],
  [36.6, 'jana', 'Aufmerksamkeit'],
  [36.7, 'sofia', 'mehr Interaktion'],
  [36.8, 'felix', 'Struktur und Rituale'],
  [36.9, 'raum', 'Pausen'],
  [37.0, 'robin', 'Und jetzt die Umfrage: Welches Format hilft euch am meisten? A, B, C oder D in den Chat.'],
  [37.1, 'jonas', 'A'],
  [37.15, 'lea', 'B'],
  [37.2, 'kwame', '2'],
  [37.3, 'paul', 'Live-Demos'],
  [37.35, 'sofia', 'b'],
  [37.4, 'katarzyna', 'Antwort D'],
  [37.45, 'ines', 'B)'],
  [37.5, 'emre', 'eher D'],
  [37.55, 'lukas', 'B oder C'],
  [37.6, 'felix', '1'],
  [37.65, 'nele', 'B'],
  [37.7, 'jonas', 'C'],
  [37.75, 'jana', 'C'],
  [37.8, 'raum', 'B'],
  [37.85, 'aylin', 'Kurze Impulse'],
];

export function createInitialState(now: number = Date.now()): AppState {
  const start = now - 38 * MIN;
  const at = (min: number) => Math.round(start + min * MIN);

  const handAt: Record<string, number> = {
    jonas: now - (4 * MIN + 12_000),
    aylin: now - (2 * MIN + 38_000),
    kwame: now - 58_000,
  };
  const reactionAt: Record<string, Participant['reaction']> = {
    lea: { emoji: '👏', label: 'Applaus', at: now - 2_000 },
    paul: { emoji: '❤️', label: 'Herz', at: now - 4_000 },
  };

  const participants: Participant[] = SEEDS.map(({ joinedMin, ...p }) => ({
    ...p,
    joinedAt: at(joinedMin),
    handRaisedAt: handAt[p.id] ?? null,
    reaction: reactionAt[p.id] ?? null,
  }));
  const byId = Object.fromEntries(participants.map((p) => [p.id, p]));

  const chat: ChatMessage[] = CHAT.map(([min, senderId, text], i) => ({
    id: `m${i + 1}`,
    senderId,
    senderName: byId[senderId]?.name ?? senderId,
    text,
    at: at(min),
    source: 'beispiel',
  }));
  const idOf = (senderId: string, text: string) =>
    chat.find((m) => m.senderId === senderId && m.text === text)!.id;

  const confirmed: Array<[string, string, string]> = [
    ['paul', 'Werl', 'werl'],
    ['lukas', 'Grüße aus Wien!', 'wien'],
    ['kwame', 'Accra 🇬🇭', 'accra'],
    ['lea', 'Berlin', 'berlin'],
    ['emre', 'Köln', 'koeln'],
    ['katarzyna', 'Hallo aus Leipzig', 'leipzig'],
    ['felix', 'Graz', 'graz'],
    ['ines', 'Zürich, aber gebürtig aus Lyon', 'zuerich'],
    ['jana', 'Werl! 😄', 'werl'],
    ['sofia', 'Hamburg', 'hamburg'],
    ['aylin', 'Wien', 'wien'],
  ];

  return {
    dataMode: 'demo',
    session: {
      title: 'Hybrid moderieren: Aufmerksamkeit halten',
      subtitle: 'Online-Workshop mit Seminarraum Köln',
      format: 'Workshop · 120 Minuten · hybrid',
      status: 'laeuft',
      scheduledStart: start,
      startedAt: start,
      endedAt: null,
      plannedDurationMin: 120,
      agenda: [
        { id: 'a1', title: 'Ankommen und Technikcheck', offsetMin: 0, durationMin: 10, owner: 'Tobias Kern', link: 'audio', linkLabel: 'Audio prüfen' },
        { id: 'a2', title: 'Begrüßung und Weltkarte: Von wo seid ihr dabei?', offsetMin: 10, durationMin: 12, owner: 'Robin', link: 'grafiken', linkLabel: 'Weltkarte öffnen' },
        { id: 'a3', title: 'Impuls: Aufmerksamkeit in hybriden Räumen', offsetMin: 22, durationMin: 13, owner: 'Dr. Henrike Vogt', link: 'galerie', linkLabel: 'Galerie öffnen' },
        { id: 'a4', title: 'Wortwolke, Umfrage und Fragerunde mit Handzeichen', offsetMin: 35, durationMin: 20, owner: 'Robin', link: 'steuerpult', linkLabel: 'Steuerpult öffnen' },
        { id: 'a5', title: 'Pause', offsetMin: 55, durationMin: 10, owner: 'Alle' },
        { id: 'a6', title: 'Gruppenarbeit in Kleingruppen', offsetMin: 65, durationMin: 30, owner: 'Mara Lindqvist' },
        { id: 'a7', title: 'Rückblick: Was nehmt ihr mit?', offsetMin: 95, durationMin: 15, owner: 'Robin', link: 'grafiken', linkLabel: 'Wortwolke öffnen' },
        { id: 'a8', title: 'Abschluss und Feedback', offsetMin: 110, durationMin: 10, owner: 'Robin' },
      ],
    },
    participants,
    activeSpeakerId: 'robin',
    spotlight: ['henrike'],
    muteAll: null,
    chat,
    map: {
      question: 'Von wo seid ihr heute dabei?',
      status: 'laeuft',
      startedAt: at(10),
      pausedAt: null,
      gaps: [],
      autoConfirm: false,
      decisions: Object.fromEntries(
        confirmed.map(([sender, text, placeId]) => [
          idOf(sender, text),
          { status: 'bestaetigt' as const, placeId, at: at(13.5) },
        ]),
      ),
      flagged: [],
      view: 'europa',
    },
    poll: {
      kind: 'auswahl',
      question: 'Welches Format hilft euch am meisten beim Lernen?',
      options: [
        { id: 'o1', text: 'Kurze Impulse' },
        { id: 'o2', text: 'Breakout-Räume' },
        { id: 'o3', text: 'Live-Demos' },
        { id: 'o4', text: 'Offene Fragerunden' },
      ],
      labelStyle: 'buchstaben',
      status: 'laeuft',
      startedAt: at(37),
      closedAt: null,
      gaps: [],
      countRule: 'letzte',
      decisions: {},
      chart: 'balken',
    },
    cloud: {
      prompt: 'Was nehmt ihr aus dem Impuls mit?',
      status: 'laeuft',
      startedAt: at(35.5),
      pausedAt: null,
      gaps: [],
      filters: { stopwords: true, shortWords: true, profanity: true, ignoreVotes: true, minCount: 1 },
      hidden: [],
      maxWords: 40,
    },
    highlightId: idOf('aylin', 'Wie haltet ihr die Energie hoch, wenn die Hälfte im Raum sitzt und die andere Hälfte online ist?'),
    program: { graphic: null, reaction: null },
    gallery: {
      layout: 'zentrum',
      tileCount: 'auto',
      showNames: true,
      showReactions: true,
      showHands: true,
      hideNoVideo: false,
    },
    deck: {
      columns: 4,
      tiles: [
        'naechste-hand',
        'spotlight-leeren',
        'alle-stumm',
        'galerie-wechseln',
        'frage-anzeigen',
        'karte-anzeigen',
        'wortwolke-anzeigen',
        'grafik-aus',
        'reaktion-applaus',
        'highlight-anzeigen',
        'filter-haende',
        'haende-senken',
      ],
    },
    streamDeck: { model: 'standard', page: 0 },
    outputs: {
      ndi: 'programm',
      srt: 'programm',
      sdi: 'galerie',
      dante: 'audio-mix',
      'virtuelle-kamera': 'programm',
      aufnahme: 'programm',
    },
    participantView: { query: '', role: 'alle', status: 'alle', sort: 'liste' },
    settings: {
      teamNames: [],
      autoDemo: false,
      lowerHandOnSpotlight: false,
      maxSpotlight: 4,
      shortcuts: true,
      motion: 'system',
    },
    log: [],
    joinCursor: 0,
  };
}
