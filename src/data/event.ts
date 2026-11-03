import type { AppState } from '../state/types.ts';
import { createInitialState } from './sample.ts';

export interface NewEventInput {
  title: string;
  teamNames: string[];
  mapQuestion: string;
  cloudPrompt: string;
}

/**
 * Leere eigene Veranstaltung ohne Beispielpersonen und Beispiel-Chat.
 * Karte und Wortwolke sammeln ab jetzt, die Umfrage startet als Entwurf.
 */
export function createEventState(input: NewEventInput, now: number = Date.now()): AppState {
  const base = createInitialState(now);
  return {
    ...base,
    dataMode: 'eigene',
    session: {
      ...base.session,
      title: input.title.trim() || 'Eigene Veranstaltung',
      subtitle: 'Eigene Veranstaltung',
      format: 'Chat aus Zoom · Grafiken für OBS',
      status: 'laeuft',
      scheduledStart: now,
      startedAt: now,
      endedAt: null,
      agenda: [],
    },
    participants: [],
    activeSpeakerId: null,
    spotlight: [],
    muteAll: null,
    chat: [],
    map: { ...base.map, question: input.mapQuestion.trim() || base.map.question, startedAt: now, decisions: {}, flagged: [] },
    poll: { ...base.poll, status: 'entwurf', startedAt: null, closedAt: null, gaps: [], decisions: {} },
    cloud: { ...base.cloud, prompt: input.cloudPrompt.trim() || base.cloud.prompt, startedAt: now, hidden: [] },
    highlightId: null,
    program: { graphic: null, reaction: null },
    settings: { ...base.settings, teamNames: input.teamNames.map((n) => n.trim()).filter(Boolean), autoDemo: false },
    log: [],
    joinCursor: 0,
  };
}

/**
 * Ergänzt einen gespeicherten Stand um Felder, die in neueren Versionen
 * hinzugekommen sind, damit ältere Speicherstände weiter funktionieren.
 */
export function normalizeState(raw: Partial<AppState>): AppState {
  const base = createInitialState();
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    cloud: { ...base.cloud, ...(raw.cloud ?? {}), filters: { ...base.cloud.filters, ...(raw.cloud?.filters ?? {}) } },
    map: { ...base.map, ...(raw.map ?? {}) },
    poll: { ...base.poll, ...(raw.poll ?? {}) },
    program: { ...base.program, ...(raw.program ?? {}) },
  } as AppState;
}
