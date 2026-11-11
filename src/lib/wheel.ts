// Glücksrad: Felder bestimmen, zufällig drehen, Winkel berechnen.
import { isTeamMessage, participantsById } from '../state/derive.ts';
import type { AppState, WheelSpin, WheelState } from '../state/types.ts';
import { findWord, normalize } from './text.ts';

/** Mehr Felder lassen sich nicht mehr lesen. */
export const WHEEL_MAX = 100;

const key = (name: string) => name.trim().toLowerCase();

/** Eigene Liste aus einem Textfeld: eine Zeile oder ein Komma pro Eintrag, ohne Doppelte. */
export function parseWheelList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]/)) {
    const v = raw.trim().slice(0, 60);
    if (!v || seen.has(key(v))) continue;
    seen.add(key(v));
    out.push(v);
  }
  return out;
}

/**
 * Namen aus dem Chat: alle, die seit „since“ geschrieben haben (ohne Team), in der Reihenfolge
 * ihrer ersten Nachricht. Mit Stichwort nur, wer dieses Wort geschrieben hat.
 */
export function chatNames(state: AppState): string[] {
  const w = state.wheel;
  const byId = participantsById(state);
  const kw = normalize(w.keyword ?? '').trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of state.chat) {
    if (m.at < w.since) continue;
    const name = m.senderName.trim();
    if (!name || seen.has(key(name))) continue;
    if (isTeamMessage(m, byId, state.settings.teamNames)) continue;
    if (kw && findWord(normalize(m.text), kw) < 0) continue;
    seen.add(key(name));
    out.push(name);
  }
  return out;
}

/** Alle möglichen Felder (vor dem Herausnehmen). */
export function wheelCandidates(state: AppState): string[] {
  return state.wheel.source === 'eigene' ? state.wheel.custom : chatNames(state);
}

/** Felder, die gerade im Rad sind. */
export function wheelEntries(state: AppState): string[] {
  const removed = new Set(state.wheel.removed.map(key));
  return wheelCandidates(state)
    .filter((n) => !removed.has(key(n)))
    .slice(0, WHEEL_MAX);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Endwinkel, bei dem das Gewinnerfeld unter dem Zeiger (oben) steht. */
export function targetAngle(count: number, winnerIndex: number, offset: number, fromDeg: number, turns: number): number {
  const seg = 360 / count;
  const center = (winnerIndex + 0.5 + offset) * seg;
  // Drehung R im Uhrzeigersinn bringt den Winkel a nach oben, wenn a + R ≡ 0 (mod 360).
  const delta = mod(-center - fromDeg, 360);
  return fromDeg + turns * 360 + delta;
}

/** Welches Feld steht bei diesem Winkel unter dem Zeiger? */
export function indexAtPointer(count: number, deg: number): number {
  const seg = 360 / count;
  return Math.floor(mod(-deg, 360) / seg) % count;
}

/** Zufallszahl 0 ≤ x < 1, möglichst aus einer guten Quelle. */
function random(): number {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  } catch {
    return Math.random();
  }
}

/** Neue Drehung: Gewinner zufällig, Dauer und Umdrehungen aus den Einstellungen. */
export function createSpin(entries: string[], w: Pick<WheelState, 'durationSec' | 'restDeg'>, now: number, rand: () => number = random): WheelSpin {
  const winnerIndex = Math.floor(rand() * entries.length);
  const offset = (rand() - 0.5) * 0.7;
  const durationMs = Math.round(Math.min(20, Math.max(2, w.durationSec)) * 1000);
  const turns = Math.max(3, Math.round(durationMs / 1000) + 1);
  const fromDeg = mod(w.restDeg ?? 0, 360);
  return {
    id: `rad-${now.toString(36)}-${Math.floor(rand() * 1e6).toString(36)}`,
    entries: [...entries],
    winnerIndex,
    offset,
    fromDeg,
    toDeg: targetAngle(entries.length, winnerIndex, offset, fromDeg, turns),
    startedAt: now,
    durationMs,
  };
}

/** Ist die Drehung zu Ende? */
export const spinDone = (spin: WheelSpin | null, now: number) => !!spin && now >= spin.startedAt + spin.durationMs;

export const DEFAULT_WHEEL: Omit<WheelState, 'since'> = {
  title: 'Wer ist dran?',
  source: 'chat',
  keyword: '',
  custom: [],
  removeWinner: true,
  removed: [],
  durationSec: 6,
  spin: null,
  restDeg: 0,
  history: [],
};
