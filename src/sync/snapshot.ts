// Momentaufnahme für die OBS-Ausgabeseiten. Enthält nur, was zum Zeichnen
// der Grafiken nötig ist, und wird bei jeder Änderung an den Server geschickt.
import type { CloudTerm } from '../lib/words.ts';
import type { MapPin, PollAnalysis, PollTotal } from '../state/derive.ts';
import type { AppState, GraphicKind, MapState, PollState, Reaction } from '../state/types.ts';

export interface PollView {
  kind: PollState['kind'];
  chart: PollState['chart'];
  status: PollState['status'];
  question: string;
  totals: PollTotal[];
  leaderIds: string[];
  totalVotes: number;
  voters: number;
  openAnswers: Array<{ id: string; text: string; sender: string }>;
}

export interface HighlightView {
  text: string;
  senderName: string;
  at: number;
}

export interface OutputSnapshot {
  v: 1;
  at: number;
  title: string;
  program: { graphic: GraphicKind | null; reaction: Reaction | null };
  map: { question: string; view: MapState['view']; pins: MapPin[]; people: number };
  poll: PollView;
  cloud: { prompt: string; terms: CloudTerm[]; messages: number };
  highlight: HighlightView | null;
}

export function pollView(poll: PollState, a: PollAnalysis): PollView {
  return {
    kind: poll.kind,
    chart: poll.chart,
    status: poll.status,
    question: poll.question,
    totals: a.totals,
    leaderIds: a.leaderIds,
    totalVotes: a.totalVotes,
    voters: a.voters,
    openAnswers: a.openAnswers
      .filter((x) => !x.hidden)
      .map((x) => ({ id: x.message.id, text: x.message.text, sender: x.message.senderName })),
  };
}

export function buildSnapshot(
  state: AppState,
  derived: {
    map: { pins: MapPin[]; peopleOnMap: number };
    poll: PollAnalysis;
    cloud: { visible: CloudTerm[]; messageCount: number };
  },
  now: number = Date.now(),
): OutputSnapshot {
  const h = state.chat.find((m) => m.id === state.highlightId);
  return {
    v: 1,
    at: now,
    title: state.session.title,
    program: { graphic: state.program.graphic, reaction: state.program.reaction },
    map: { question: state.map.question, view: state.map.view, pins: derived.map.pins, people: derived.map.peopleOnMap },
    poll: pollView(state.poll, derived.poll),
    cloud: { prompt: state.cloud.prompt, terms: derived.cloud.visible, messages: derived.cloud.messageCount },
    highlight: h ? { text: h.text, senderName: h.senderName, at: h.at } : null,
  };
}
