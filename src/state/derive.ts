// Abgeleitete Auswertungen. Karte, Umfrage und Wortwolke werden nicht separat
// gespeichert, sondern bei jeder Änderung aus demselben Chat berechnet.
import { PLACE_BY_ID, type Place } from '../data/places.ts';
import { detectLocation, type LocationDetection } from '../lib/places.ts';
import { matchVote, optionKey } from '../lib/poll.ts';
import { buildCloud, type CloudTerm } from '../lib/words.ts';
import type {
  AppState,
  ChatMessage,
  CollectWindow,
  LocationDecision,
  Participant,
  PollOption,
  PollState,
  Role,
} from './types.ts';

/** Beiträge dieser Rollen werden nicht als Antworten ausgewertet. */
export const TEAM_ROLES: Role[] = ['moderation', 'co-moderation', 'vortrag', 'produktion'];

export function personKey(m: ChatMessage): string {
  return m.senderId ?? `name:${m.senderName.trim().toLowerCase()}`;
}

/** Gleicht einen Absendernamen mit den eingetragenen Team-Namen ab („Robin“ passt auch zu „Robin Weniger“). */
export function matchesTeamName(senderName: string, teamNames: string[]): boolean {
  const name = senderName.trim().toLowerCase();
  return teamNames.some((t) => {
    const team = t.trim().toLowerCase();
    return !!team && (name === team || name.startsWith(`${team} `));
  });
}

export function isTeamMessage(
  m: ChatMessage,
  byId: Record<string, Participant>,
  teamNames: string[] = [],
): boolean {
  const p = m.senderId ? byId[m.senderId] : undefined;
  if (p && TEAM_ROLES.includes(p.role)) return true;
  return matchesTeamName(m.senderName, teamNames);
}

export function inCollectWindow(at: number, w: CollectWindow): boolean {
  if (at < w.startedAt) return false;
  if (w.status === 'pausiert' && w.pausedAt !== null && at > w.pausedAt) return false;
  return !w.gaps.some(([from, to]) => at > from && at <= to);
}

export function inPollWindow(at: number, poll: PollState): boolean {
  if (poll.startedAt === null || at < poll.startedAt) return false;
  if (poll.status === 'geschlossen' && poll.closedAt !== null && at > poll.closedAt) return false;
  if (poll.status === 'entwurf') return false;
  return !poll.gaps.some(([from, to]) => at > from && at <= to);
}

export const participantsById = (s: AppState): Record<string, Participant> =>
  Object.fromEntries(s.participants.map((p) => [p.id, p]));

// ---------------------------------------------------------------- Handzeichen

export interface QueueEntry {
  participant: Participant;
  position: number;
  raisedAt: number;
  inSpotlight: boolean;
}

/** Gehobene Hände nach Eingangszeit, älteste zuerst. */
export function handQueue(s: AppState): QueueEntry[] {
  return s.participants
    .filter((p) => p.handRaisedAt !== null)
    .sort((a, b) => a.handRaisedAt! - b.handRaisedAt! || a.name.localeCompare(b.name, 'de'))
    .map((p, i) => ({
      participant: p,
      position: i + 1,
      raisedAt: p.handRaisedAt!,
      inSpotlight: s.spotlight.includes(p.id),
    }));
}

// ---------------------------------------------------------------------- Karte

export interface LocationItem {
  message: ChatMessage;
  detection: LocationDetection | null;
  decision: LocationDecision | null;
  auto: boolean;
}

export interface MapPin {
  place: Place;
  people: Array<{ key: string; name: string; messageId: string; at: number }>;
}

export interface MapAnalysis {
  review: LocationItem[];
  confirmed: LocationItem[];
  dismissed: LocationItem[];
  pins: MapPin[];
  peopleOnMap: number;
}

export function analyzeMap(s: AppState): MapAnalysis {
  const byId = participantsById(s);
  const flagged = new Set(s.map.flagged);
  const items: LocationItem[] = [];
  for (const m of s.chat) {
    if (isTeamMessage(m, byId, s.settings.teamNames)) continue;
    const isFlagged = flagged.has(m.id);
    if (!isFlagged && !inCollectWindow(m.at, s.map)) continue;
    const detection = detectLocation(m.text);
    if (!detection && !isFlagged) continue;
    let decision = s.map.decisions[m.id] ?? null;
    let auto = false;
    if (!decision && s.map.autoConfirm && detection?.kind === 'eindeutig') {
      decision = { status: 'bestaetigt', placeId: detection.placeId, at: m.at };
      auto = true;
    }
    items.push({ message: m, detection, decision, auto });
  }

  const review = items.filter((i) => !i.decision);
  const confirmed = items.filter((i) => i.decision?.status === 'bestaetigt');
  const dismissed = items.filter((i) => i.decision?.status === 'verworfen');

  // Pro Person zählt der zuletzt bestätigte Ort.
  const latest = new Map<string, LocationItem>();
  for (const item of [...confirmed].sort((a, b) => a.message.at - b.message.at)) {
    latest.set(personKey(item.message), item);
  }
  const groups = new Map<string, MapPin>();
  for (const [key, item] of latest) {
    const decision = item.decision as Extract<LocationDecision, { status: 'bestaetigt' }>;
    const place = PLACE_BY_ID[decision.placeId];
    if (!place) continue;
    const pin = groups.get(place.id) ?? { place, people: [] };
    pin.people.push({
      key,
      name: item.message.senderName,
      messageId: item.message.id,
      at: item.message.at,
    });
    groups.set(place.id, pin);
  }
  const pins = [...groups.values()].sort(
    (a, b) => b.people.length - a.people.length || a.place.name.localeCompare(b.place.name, 'de'),
  );
  return { review, confirmed, dismissed, pins, peopleOnMap: latest.size };
}

// ------------------------------------------------------------------- Umfrage

export interface VoteRecord {
  message: ChatMessage;
  optionId: string;
  manual: boolean;
  counted: boolean;
}

export interface PollTotal {
  option: PollOption;
  key: string;
  count: number;
  pct: number;
}

export interface PollAnalysis {
  totals: PollTotal[];
  totalVotes: number;
  voters: number;
  votes: VoteRecord[];
  unclear: Array<{ message: ChatMessage; optionIds: string[] }>;
  discarded: ChatMessage[];
  openAnswers: Array<{ message: ChatMessage; hidden: boolean }>;
  /** Nachrichten, die als Stimme gewertet wurden (für den Wortwolken-Filter). */
  voteMessageIds: Set<string>;
  leaderIds: string[];
}

export function analyzePoll(s: AppState): PollAnalysis {
  const { poll } = s;
  const byId = participantsById(s);
  const messages = s.chat.filter((m) => !isTeamMessage(m, byId, s.settings.teamNames) && inPollWindow(m.at, poll));

  const result: PollAnalysis = {
    totals: [],
    totalVotes: 0,
    voters: 0,
    votes: [],
    unclear: [],
    discarded: [],
    openAnswers: [],
    voteMessageIds: new Set(),
    leaderIds: [],
  };

  if (poll.kind === 'offen') {
    result.openAnswers = messages.map((m) => ({
      message: m,
      hidden: poll.decisions[m.id]?.status === 'verworfen',
    }));
    result.totalVotes = result.openAnswers.filter((a) => !a.hidden).length;
    result.voters = new Set(
      result.openAnswers.filter((a) => !a.hidden).map((a) => personKey(a.message)),
    ).size;
    return result;
  }

  for (const m of messages) {
    const decision = poll.decisions[m.id];
    if (decision?.status === 'verworfen') {
      if (matchVote(m.text, poll.options)) result.discarded.push(m);
      continue;
    }
    if (decision?.status === 'zugeordnet') {
      result.votes.push({ message: m, optionId: decision.optionId, manual: true, counted: true });
      continue;
    }
    const match = matchVote(m.text, poll.options);
    if (!match) continue;
    if (match.kind === 'gueltig') {
      result.votes.push({ message: m, optionId: match.optionId, manual: false, counted: true });
    } else {
      result.unclear.push({ message: m, optionIds: match.optionIds });
    }
  }

  if (poll.countRule === 'letzte') {
    const last = new Map<string, VoteRecord>();
    for (const v of result.votes) {
      const prev = last.get(personKey(v.message));
      if (prev) prev.counted = false;
      last.set(personKey(v.message), v);
    }
  }

  const counted = result.votes.filter((v) => v.counted);
  result.totalVotes = counted.length;
  result.voters = new Set(counted.map((v) => personKey(v.message))).size;
  result.voteMessageIds = new Set(result.votes.map((v) => v.message.id));
  result.totals = poll.options.map((option, i) => {
    const count = counted.filter((v) => v.optionId === option.id).length;
    return {
      option,
      key: optionKey(i, poll.labelStyle),
      count,
      pct: result.totalVotes ? Math.round((count / result.totalVotes) * 100) : 0,
    };
  });
  const max = Math.max(0, ...result.totals.map((t) => t.count));
  result.leaderIds = max > 0 ? result.totals.filter((t) => t.count === max).map((t) => t.option.id) : [];
  result.votes.reverse();
  return result;
}

// ---------------------------------------------------------------- Wortwolke

export interface CloudAnalysis {
  terms: CloudTerm[];
  visible: CloudTerm[];
  messageCount: number;
}

export function analyzeCloud(s: AppState, poll: PollAnalysis): CloudAnalysis {
  const byId = participantsById(s);
  const messages = s.chat.filter(
    (m) =>
      !isTeamMessage(m, byId, s.settings.teamNames) &&
      inCollectWindow(m.at, s.cloud) &&
      !(s.cloud.filters.ignoreVotes && poll.voteMessageIds.has(m.id)),
  );
  const terms = buildCloud(
    messages.map((m) => ({ text: m.text, sender: m.senderName })),
    s.cloud.filters,
    s.cloud.hidden,
  );
  return {
    terms,
    visible: terms.filter((t) => !t.excluded).slice(0, s.cloud.maxWords),
    messageCount: messages.length,
  };
}

// ------------------------------------------------- Einordnung je Nachricht

export interface MessageTags {
  team: boolean;
  location: LocationDetection | null;
  locationState: 'offen' | 'bestaetigt' | 'verworfen' | null;
  vote: { label: string; state: 'gezaehlt' | 'ersetzt' | 'pruefen' | 'verworfen' } | null;
  cloud: boolean;
}

/** Zeigt im Chat, wie jede Nachricht von den Grafiken verstanden wurde. */
export function tagMessages(
  s: AppState,
  map: MapAnalysis,
  poll: PollAnalysis,
): Record<string, MessageTags> {
  const byId = participantsById(s);
  const out: Record<string, MessageTags> = {};
  const locationById = new Map<string, LocationItem>();
  for (const i of [...map.review, ...map.confirmed, ...map.dismissed]) locationById.set(i.message.id, i);
  const voteById = new Map(poll.votes.map((v) => [v.message.id, v]));
  const unclearIds = new Set(poll.unclear.map((u) => u.message.id));
  const discardedIds = new Set(poll.discarded.map((m) => m.id));
  const keyOf = (optionId: string) => {
    const i = s.poll.options.findIndex((o) => o.id === optionId);
    return i >= 0 ? optionKey(i, s.poll.labelStyle) : '?';
  };
  for (const m of s.chat) {
    const team = isTeamMessage(m, byId, s.settings.teamNames);
    const loc = locationById.get(m.id);
    const vote = voteById.get(m.id);
    out[m.id] = {
      team,
      location: loc?.detection ?? null,
      locationState: loc
        ? loc.decision
          ? loc.decision.status === 'bestaetigt'
            ? 'bestaetigt'
            : 'verworfen'
          : 'offen'
        : null,
      vote: vote
        ? { label: keyOf(vote.optionId), state: vote.counted ? 'gezaehlt' : 'ersetzt' }
        : unclearIds.has(m.id)
          ? { label: '?', state: 'pruefen' }
          : discardedIds.has(m.id)
            ? { label: '–', state: 'verworfen' }
            : null,
      cloud:
        !team &&
        inCollectWindow(m.at, s.cloud) &&
        !(s.cloud.filters.ignoreVotes && poll.voteMessageIds.has(m.id)),
    };
  }
  return out;
}
