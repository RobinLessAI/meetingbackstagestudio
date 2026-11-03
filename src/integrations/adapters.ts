// Integrationsgrenzen
//
// Die Oberfläche ruft heute ausschließlich lokale Befehle auf (src/state/commands.ts).
// Für eine echte Anbindung werden diese Schnittstellen von einem Adapter
// implementiert, der eine offiziell unterstützte Schnittstelle nutzt. Die
// Demo-Implementierungen unten beschreiben genau, was der Prototyp tut: nichts
// außerhalb dieser App.

import type { ChatMessage, Participant } from '../state/types.ts';

export type ConnectionState =
  | { status: 'nicht-verbunden'; reason: string }
  | { status: 'verbindet' }
  | { status: 'verbunden'; since: number }
  | { status: 'fehler'; message: string };

/** Konferenzplattform: Teilnehmende, Chat und Host-Funktionen. */
export interface MeetingAdapter {
  readonly id: string;
  connection(): ConnectionState;
  /** Liefert Änderungen an Teilnehmenden (Beitritt, Mikrofon, Kamera, Handzeichen). */
  onParticipants(cb: (list: Participant[]) => void): () => void;
  onChat(cb: (message: ChatMessage) => void): () => void;
  setSpotlight(participantIds: string[]): Promise<void>;
  muteAll(options: { allowSelfUnmute: boolean }): Promise<void>;
  lowerHand(participantId: string): Promise<void>;
}

/** Bedienhardware wie Stream Deck oder andere Tastenfelder. */
export interface ControllerAdapter {
  readonly id: string;
  connection(): ConnectionState;
  /** Überträgt Beschriftung und Leuchtzustand pro Taste. */
  render(keys: Array<{ index: number; title: string; lit: boolean }>): Promise<void>;
  onKeyPress(cb: (index: number) => void): () => void;
}

/** Video- oder Audioausgang (NDI, SRT, SDI, Dante). */
export interface OutputAdapter {
  readonly id: string;
  connection(): ConnectionState;
  start(source: string): Promise<void>;
  stop(): Promise<void>;
}

const NOT_CONNECTED: ConnectionState = {
  status: 'nicht-verbunden',
  reason: 'Der Prototyp enthält keine Verbindung. Alle Aktionen ändern nur den lokalen Demo-Zustand.',
};

const rejectDemo = (what: string) =>
  Promise.reject(new Error(`${what} ist im Prototyp nicht verfügbar (Demo, nicht verbunden).`));

/** Simulierte Verbindungsprüfung für die Oberfläche: endet immer mit „nicht verbunden“. */
export function testConnection(name: string): Promise<ConnectionState> {
  return new Promise((resolve) =>
    window.setTimeout(
      () =>
        resolve({
          status: 'fehler',
          message: `${name}: keine Verbindung hergestellt. Im Prototyp ist keine echte Schnittstelle eingebaut.`,
        }),
      1200,
    ),
  );
}

export const demoMeetingAdapter: MeetingAdapter = {
  id: 'demo',
  connection: () => NOT_CONNECTED,
  onParticipants: () => () => {},
  onChat: () => () => {},
  setSpotlight: () => rejectDemo('Spotlight in Zoom'),
  muteAll: () => rejectDemo('Stummschalten in Zoom'),
  lowerHand: () => rejectDemo('Hand senken in Zoom'),
};

export const demoControllerAdapter: ControllerAdapter = {
  id: 'demo',
  connection: () => NOT_CONNECTED,
  render: () => Promise.resolve(),
  onKeyPress: () => () => {},
};
