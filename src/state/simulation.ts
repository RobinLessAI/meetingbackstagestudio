import { useEffect } from 'react';
import { useCommands } from './commands.ts';
import { TEAM_ROLES } from './derive.ts';
import { useStore } from './store.tsx';

const SCRIPT = [
  'Grüße aus Linz',
  'Basel',
  'Hallo aus Dortmund',
  'Soest',
  'Frankfurt',
  'B',
  'C',
  '2',
  'eher A',
  'Aufmerksamkeit',
  'Pausen',
  'mehr Beispiele bitte',
  'Rituale',
  'Danke für den Impuls!',
  'Ton war kurz weg, jetzt wieder da',
  'Kann man die Umfrage nochmal zeigen?',
  'Blickkontakt',
  'Struktur',
];

const REACTIONS: Array<[string, string]> = [
  ['👏', 'Applaus'],
  ['👍', 'Daumen hoch'],
  ['❤️', 'Herz'],
  ['😂', 'Lachen'],
  ['🎉', 'Feiern'],
];

const pick = <T,>(list: T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

/**
 * Optionale Live-Simulation: erzeugt in Abständen Chat-Nachrichten,
 * Handzeichen, Reaktionen und Sprecherwechsel. Nur lokale Beispieldaten.
 */
export function useAutoDemo() {
  const { state, stateRef, dispatch } = useStore();
  const commands = useCommands();
  const enabled = state.settings.autoDemo;

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const s = stateRef.current;
      const guests = s.participants.filter((p) => !TEAM_ROLES.includes(p.role));
      const who = pick(guests);
      if (!who) return;
      const roll = Math.random();
      if (roll < 0.45) {
        commands.sendChat(who.id, who.name, pick(SCRIPT)!, 'auto');
      } else if (roll < 0.6) {
        if (who.handRaisedAt === null || Math.random() < 0.3) {
          dispatch({ type: 'participant/hand', id: who.id, raised: who.handRaisedAt === null, at: Date.now() });
        }
      } else if (roll < 0.8) {
        const [emoji, label] = pick(REACTIONS)!;
        dispatch({ type: 'participant/react', id: who.id, reaction: { emoji, label, at: Date.now() } });
      } else {
        const speakers = s.participants.filter((p) => p.micOn);
        const next = pick(speakers);
        dispatch({ type: 'speaker/set', id: next?.id ?? null });
      }
    };
    const t = window.setInterval(tick, 3500);
    return () => window.clearInterval(t);
  }, [enabled, stateRef, dispatch, commands]);
}
