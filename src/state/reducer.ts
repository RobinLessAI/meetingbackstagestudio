import { JOIN_POOL } from '../data/sample.ts';
import type {
  AppState,
  ChatMessage,
  CloudFilters,
  CloudState,
  DeckState,
  GalleryState,
  GraphicKind,
  LocationDecision,
  LogEntry,
  MapState,
  OutputId,
  OutputSource,
  Participant,
  ParticipantView,
  PollDecision,
  PollOption,
  PollState,
  Reaction,
  SessionStatus,
  Settings,
  StreamDeckState,
} from './types.ts';

/** Diese Rollen werden von „Alle stummschalten“ ausgenommen. */
export const MUTE_ALL_EXEMPT = ['moderation', 'co-moderation'] as const;

export type Action =
  | { type: 'session/status'; status: SessionStatus; at: number }
  | { type: 'participant/mic'; id: string; on: boolean }
  | { type: 'participant/cam'; id: string; on: boolean }
  | { type: 'participant/hand'; id: string; raised: boolean; at: number }
  | { type: 'participant/react'; id: string; reaction: Reaction | null }
  | { type: 'participant/join'; at: number }
  | { type: 'participant/leave'; id: string }
  | { type: 'hands/lowerAll' }
  | { type: 'speaker/set'; id: string | null }
  | { type: 'spotlight/toggle'; id: string }
  | { type: 'spotlight/remove'; id: string }
  | { type: 'spotlight/clear' }
  | { type: 'spotlight/move'; id: string; dir: -1 | 1 }
  | { type: 'muteAll/run'; at: number; allowSelfUnmute: boolean }
  | { type: 'muteAll/dismiss' }
  | { type: 'chat/add'; message: ChatMessage }
  | { type: 'chat/import'; messages: ChatMessage[] }
  | { type: 'map/decide'; messageId: string; decision: LocationDecision | null }
  | { type: 'map/flag'; messageId: string }
  | { type: 'map/update'; patch: Partial<Pick<MapState, 'question' | 'autoConfirm' | 'view'>> }
  | { type: 'map/pause' | 'map/resume' | 'map/reset'; at: number }
  | {
      type: 'poll/configure';
      kind: PollState['kind'];
      question: string;
      options: PollOption[];
      labelStyle: PollState['labelStyle'];
    }
  | { type: 'poll/start' | 'poll/close' | 'poll/reopen' | 'poll/reset'; at: number }
  | { type: 'poll/decide'; messageId: string; decision: PollDecision | null }
  | { type: 'poll/update'; patch: Partial<Pick<PollState, 'countRule' | 'chart' | 'labelStyle'>> }
  | {
      type: 'cloud/update';
      patch: Partial<Pick<CloudState, 'prompt' | 'maxWords'>>;
      filters?: Partial<CloudFilters>;
    }
  | { type: 'cloud/toggleHidden'; key: string }
  | { type: 'cloud/pause' | 'cloud/resume' | 'cloud/reset'; at: number }
  | { type: 'highlight/set'; id: string | null }
  | { type: 'program/graphic'; graphic: GraphicKind | null }
  | { type: 'program/reaction'; reaction: Reaction | null }
  | { type: 'gallery/update'; patch: Partial<GalleryState> }
  | { type: 'deck/update'; patch: Partial<DeckState> }
  | { type: 'streamDeck/update'; patch: Partial<StreamDeckState> }
  | { type: 'output/source'; id: OutputId; source: OutputSource }
  | { type: 'participantView/update'; patch: Partial<ParticipantView> }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'log/add'; entry: LogEntry }
  | { type: 'demo/replace'; state: AppState };

/** Person für einen Demo-Beitritt; der Zähler sorgt für eindeutige IDs und Namen. */
export function joinParticipant(cursor: number, at: number): Participant {
  const seed = JOIN_POOL[cursor % JOIN_POOL.length];
  const round = Math.floor(cursor / JOIN_POOL.length);
  return {
    id: `gast-${cursor + 1}`,
    name: round > 0 ? `${seed.name} (${round + 1})` : seed.name,
    shortName: seed.shortName,
    role: 'teilnahme',
    device: seed.device,
    micOn: false,
    camOn: true,
    handRaisedAt: null,
    reaction: null,
    joinedAt: at,
    video: seed.video,
  };
}

const updateParticipant = (
  s: AppState,
  id: string,
  fn: (p: Participant) => Participant,
): AppState => ({ ...s, participants: s.participants.map((p) => (p.id === id ? fn(p) : p)) });

/** Wenn die sprechende Person stumm ist, spricht in der Simulation niemand mehr. */
const fixSpeaker = (s: AppState): AppState => {
  const sp = s.participants.find((p) => p.id === s.activeSpeakerId);
  return sp && sp.micOn ? s : { ...s, activeSpeakerId: null };
};

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'session/status': {
      const session = { ...s.session, status: a.status };
      if (a.status === 'geplant') {
        session.scheduledStart = a.at + 15 * 60_000;
        session.startedAt = null;
        session.endedAt = null;
      } else if (a.status === 'laeuft') {
        // Aus „geplant“ startet die Sitzung jetzt, aus „beendet“ läuft sie weiter.
        session.startedAt =
          s.session.status === 'geplant' ? a.at : (s.session.startedAt ?? a.at);
        session.endedAt = null;
      } else {
        session.startedAt = s.session.startedAt ?? a.at - 60 * 60_000;
        session.endedAt = a.at;
      }
      return { ...s, session };
    }

    case 'participant/mic':
      return fixSpeaker(updateParticipant(s, a.id, (p) => ({ ...p, micOn: a.on })));
    case 'participant/cam':
      return updateParticipant(s, a.id, (p) => ({ ...p, camOn: a.on }));
    case 'participant/hand':
      return updateParticipant(s, a.id, (p) => ({ ...p, handRaisedAt: a.raised ? a.at : null }));
    case 'participant/react':
      return updateParticipant(s, a.id, (p) => ({ ...p, reaction: a.reaction }));
    case 'participant/join':
      return {
        ...s,
        participants: [...s.participants, joinParticipant(s.joinCursor, a.at)],
        joinCursor: s.joinCursor + 1,
      };
    case 'participant/leave': {
      const target = s.participants.find((p) => p.id === a.id);
      if (!target || target.role === 'moderation') return s;
      return fixSpeaker({
        ...s,
        participants: s.participants.filter((p) => p.id !== a.id),
        spotlight: s.spotlight.filter((id) => id !== a.id),
        muteAll: s.muteAll
          ? { ...s.muteAll, affected: s.muteAll.affected.filter((id) => id !== a.id) }
          : null,
      });
    }
    case 'hands/lowerAll':
      return { ...s, participants: s.participants.map((p) => ({ ...p, handRaisedAt: null })) };
    case 'speaker/set':
      return { ...s, activeSpeakerId: a.id };

    case 'spotlight/toggle': {
      if (s.spotlight.includes(a.id)) {
        return { ...s, spotlight: s.spotlight.filter((id) => id !== a.id) };
      }
      if (s.spotlight.length >= s.settings.maxSpotlight) return s;
      const next = { ...s, spotlight: [...s.spotlight, a.id] };
      return s.settings.lowerHandOnSpotlight
        ? updateParticipant(next, a.id, (p) => ({ ...p, handRaisedAt: null }))
        : next;
    }
    case 'spotlight/remove':
      return { ...s, spotlight: s.spotlight.filter((id) => id !== a.id) };
    case 'spotlight/clear':
      return { ...s, spotlight: [] };
    case 'spotlight/move': {
      const i = s.spotlight.indexOf(a.id);
      const j = i + a.dir;
      if (i < 0 || j < 0 || j >= s.spotlight.length) return s;
      const list = [...s.spotlight];
      [list[i], list[j]] = [list[j], list[i]];
      return { ...s, spotlight: list };
    }

    case 'muteAll/run': {
      const affected = s.participants
        .filter((p) => !(MUTE_ALL_EXEMPT as readonly string[]).includes(p.role))
        .map((p) => p.id);
      return fixSpeaker({
        ...s,
        participants: s.participants.map((p) =>
          affected.includes(p.id) ? { ...p, micOn: false } : p,
        ),
        muteAll: { at: a.at, allowSelfUnmute: a.allowSelfUnmute, affected },
      });
    }
    case 'muteAll/dismiss':
      return { ...s, muteAll: null };

    case 'chat/add':
      return { ...s, chat: [...s.chat, a.message] };
    case 'chat/import': {
      const known = new Set(s.chat.map((m) => m.importKey).filter(Boolean));
      const fresh = a.messages.filter((m) => !m.importKey || !known.has(m.importKey));
      if (fresh.length === 0) return s;
      // Chronologisch einsortieren: Die Auswertung („letzte Antwort zählt“) braucht die richtige Reihenfolge.
      const chat = [...s.chat, ...fresh].sort((x, y) => x.at - y.at);
      return { ...s, chat };
    }

    case 'map/decide': {
      const decisions = { ...s.map.decisions };
      if (a.decision) decisions[a.messageId] = a.decision;
      else delete decisions[a.messageId];
      return { ...s, map: { ...s.map, decisions } };
    }
    case 'map/flag':
      return s.map.flagged.includes(a.messageId)
        ? s
        : { ...s, map: { ...s.map, flagged: [...s.map.flagged, a.messageId] } };
    case 'map/update':
      return { ...s, map: { ...s.map, ...a.patch } };
    case 'map/pause':
      return s.map.status === 'pausiert' ? s : { ...s, map: { ...s.map, status: 'pausiert', pausedAt: a.at } };
    case 'map/resume':
      return s.map.status === 'laeuft'
        ? s
        : {
            ...s,
            map: {
              ...s.map,
              status: 'laeuft',
              pausedAt: null,
              gaps: [...s.map.gaps, [s.map.pausedAt ?? a.at, a.at]],
            },
          };
    case 'map/reset':
      return {
        ...s,
        map: { ...s.map, status: 'laeuft', startedAt: a.at, pausedAt: null, gaps: [], decisions: {}, flagged: [] },
      };

    case 'poll/configure':
      return {
        ...s,
        poll: {
          ...s.poll,
          kind: a.kind,
          question: a.question,
          options: a.options,
          labelStyle: a.labelStyle,
          status: 'entwurf',
          startedAt: null,
          closedAt: null,
          gaps: [],
          decisions: {},
        },
      };
    case 'poll/start':
      return { ...s, poll: { ...s.poll, status: 'laeuft', startedAt: a.at, closedAt: null, gaps: [], decisions: {} } };
    case 'poll/close':
      return s.poll.status !== 'laeuft' ? s : { ...s, poll: { ...s.poll, status: 'geschlossen', closedAt: a.at } };
    case 'poll/reopen':
      return s.poll.status !== 'geschlossen'
        ? s
        : {
            ...s,
            poll: {
              ...s.poll,
              status: 'laeuft',
              closedAt: null,
              gaps: [...s.poll.gaps, [s.poll.closedAt ?? a.at, a.at]],
            },
          };
    case 'poll/reset':
      return {
        ...s,
        poll: {
          ...s.poll,
          status: s.poll.status === 'entwurf' ? 'entwurf' : 'laeuft',
          startedAt: s.poll.status === 'entwurf' ? null : a.at,
          closedAt: null,
          gaps: [],
          decisions: {},
        },
      };
    case 'poll/decide': {
      const decisions = { ...s.poll.decisions };
      if (a.decision) decisions[a.messageId] = a.decision;
      else delete decisions[a.messageId];
      return { ...s, poll: { ...s.poll, decisions } };
    }
    case 'poll/update':
      return { ...s, poll: { ...s.poll, ...a.patch } };

    case 'cloud/update':
      return {
        ...s,
        cloud: { ...s.cloud, ...a.patch, filters: { ...s.cloud.filters, ...(a.filters ?? {}) } },
      };
    case 'cloud/toggleHidden': {
      const hidden = s.cloud.hidden.includes(a.key)
        ? s.cloud.hidden.filter((k) => k !== a.key)
        : [...s.cloud.hidden, a.key];
      return { ...s, cloud: { ...s.cloud, hidden } };
    }
    case 'cloud/pause':
      return s.cloud.status === 'pausiert'
        ? s
        : { ...s, cloud: { ...s.cloud, status: 'pausiert', pausedAt: a.at } };
    case 'cloud/resume':
      return s.cloud.status === 'laeuft'
        ? s
        : {
            ...s,
            cloud: {
              ...s.cloud,
              status: 'laeuft',
              pausedAt: null,
              gaps: [...s.cloud.gaps, [s.cloud.pausedAt ?? a.at, a.at]],
            },
          };
    case 'cloud/reset':
      return {
        ...s,
        cloud: { ...s.cloud, status: 'laeuft', startedAt: a.at, pausedAt: null, gaps: [], hidden: [] },
      };

    case 'highlight/set':
      return { ...s, highlightId: a.id };
    case 'program/graphic':
      return { ...s, program: { ...s.program, graphic: a.graphic } };
    case 'program/reaction':
      return { ...s, program: { ...s.program, reaction: a.reaction } };
    case 'gallery/update':
      return { ...s, gallery: { ...s.gallery, ...a.patch } };
    case 'deck/update':
      return { ...s, deck: { ...s.deck, ...a.patch } };
    case 'streamDeck/update':
      return { ...s, streamDeck: { ...s.streamDeck, ...a.patch } };
    case 'output/source':
      return { ...s, outputs: { ...s.outputs, [a.id]: a.source } };
    case 'participantView/update':
      return { ...s, participantView: { ...s.participantView, ...a.patch } };
    case 'settings/update': {
      const settings = { ...s.settings, ...a.patch };
      // Wird das Limit gesenkt, bleiben die zuerst gewählten Personen im Spotlight.
      return { ...s, settings, spotlight: s.spotlight.slice(0, settings.maxSpotlight) };
    }
    case 'log/add':
      return { ...s, log: [a.entry, ...s.log].slice(0, 60) };
    case 'demo/replace':
      return a.state;
  }
}
