// Glücksrad: Felder aus Chat oder eigener Liste, Zufallsauswahl, Winkel, Herausnehmen, Neustart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { resetAnswers } from '../server/resetAnswers.mjs';
import { createEventState, normalizeState } from '../src/data/event.ts';
import { chatNames, createSpin, indexAtPointer, parseWheelList, targetAngle, wheelEntries } from '../src/lib/wheel.ts';
import { reducer } from '../src/state/reducer.ts';
import type { AppState, ChatMessage } from '../src/state/types.ts';

const msg = (id: string, senderName: string, text: string, at: number): ChatMessage => ({ id, senderId: null, senderName, text, at, source: 'zoom' });

function withChat(): AppState {
  const s = createEventState({ title: 'Test', teamNames: ['Robin'], mapQuestion: '', cloudPrompt: '' }, 1000);
  return {
    ...s,
    chat: [
      msg('a', 'Anna', 'Hallo aus Köln', 2000),
      msg('b', 'Robin Weniger', 'Willkommen!', 2100),
      msg('c', 'Ben', 'Ich bin dabei', 2200),
      msg('d', 'anna', 'Nochmal', 2300),
      msg('e', 'Carla', 'Dabei!', 2400),
      msg('f', 'Dirk', 'Moin', 500),
    ],
  };
}

test('Eigene Liste: eine Zeile oder Komma pro Eintrag, ohne Doppelte', () => {
  assert.deepEqual(parseWheelList('Anna\nBen, Carla\n\n  anna \nDirk;Eva'), ['Anna', 'Ben', 'Carla', 'Dirk', 'Eva']);
});

test('Namen aus dem Chat: ohne Team, ohne Doppelte, erst ab Start, optional mit Stichwort', () => {
  const s = withChat();
  assert.deepEqual(chatNames(s), ['Anna', 'Ben', 'Carla']);
  const kw = { ...s, wheel: { ...s.wheel, keyword: 'dabei' } };
  assert.deepEqual(chatNames(kw), ['Ben', 'Carla']);
  const removed = { ...s, wheel: { ...s.wheel, removed: ['ben'] } };
  assert.deepEqual(wheelEntries(removed), ['Anna', 'Carla']);
  const own = { ...s, wheel: { ...s.wheel, source: 'eigene' as const, custom: ['Preis 1', 'Preis 2'] } };
  assert.deepEqual(wheelEntries(own), ['Preis 1', 'Preis 2']);
});

test('Der Endwinkel bringt immer genau das gewählte Feld unter den Zeiger', () => {
  for (let n = 2; n <= 40; n += 3) {
    for (let i = 0; i < n; i++) {
      for (const offset of [-0.35, 0, 0.35]) {
        for (const from of [0, 123.4, 359]) {
          const deg = targetAngle(n, i, offset, from, 5);
          assert.equal(indexAtPointer(n, deg), i, `n=${n} i=${i} offset=${offset} from=${from}`);
          assert.ok(deg >= from + 5 * 360 && deg < from + 6 * 360);
        }
      }
    }
  }
});

test('Drehen: Zufall wählt den Gewinner, Dauer bestimmt die Umdrehungen', () => {
  const values = [0.6, 0.5, 0.1];
  const spin = createSpin(['A', 'B', 'C', 'D', 'E'], { durationSec: 6, restDeg: 30 }, 10_000, () => values.shift() ?? 0);
  assert.equal(spin.winnerIndex, 3);
  assert.equal(spin.durationMs, 6000);
  assert.equal(spin.fromDeg, 30);
  assert.equal(indexAtPointer(5, spin.toDeg), 3);
  assert.ok(spin.toDeg - spin.fromDeg > 5 * 360);
});

test('Gewinner wird beim nächsten Drehen herausgenommen und in der Liste vermerkt', () => {
  let s = withChat();
  const spin1 = createSpin(wheelEntries(s), s.wheel, 5000, () => 0);
  s = reducer(s, { type: 'wheel/spin', spin: spin1 });
  assert.equal(s.wheel.history[0].name, 'Anna');
  // Bis zum nächsten Drehen bleibt das Rad unverändert.
  assert.deepEqual(wheelEntries(s), ['Anna', 'Ben', 'Carla']);
  const spin2 = createSpin(['Ben', 'Carla'], s.wheel, 20_000, () => 0.9);
  s = reducer(s, { type: 'wheel/spin', spin: spin2 });
  assert.deepEqual(s.wheel.removed, ['anna']);
  assert.deepEqual(wheelEntries(s), ['Ben', 'Carla']);
  assert.deepEqual(s.wheel.history.map((h) => h.name), ['Carla', 'Anna']);
  // Ohne Herausnehmen bleibt die Person im Rad.
  let t = withChat();
  t = reducer(t, { type: 'wheel/update', patch: { removeWinner: false } });
  t = reducer(t, { type: 'wheel/spin', spin: spin1 });
  t = reducer(t, { type: 'wheel/clearResult' });
  assert.deepEqual(t.wheel.removed, []);
  assert.equal(t.wheel.spin, null);
});

test('Neustart der App: Ergebnisse weg, eigene Liste und Einstellungen bleiben', () => {
  let s = withChat();
  s = reducer(s, { type: 'wheel/update', patch: { source: 'eigene', custom: ['X', 'Y'], title: 'Wer gewinnt?' } });
  s = reducer(s, { type: 'wheel/spin', spin: createSpin(['X', 'Y'], s.wheel, 3000, () => 0) });
  s = reducer(s, { type: 'wheel/toggleRemoved', name: 'Y' });
  const r = normalizeState(resetAnswers(JSON.parse(JSON.stringify(s)), 99_000));
  assert.equal(r.wheel.spin, null);
  assert.deepEqual(r.wheel.history, []);
  assert.deepEqual(r.wheel.removed, []);
  assert.equal(r.wheel.since, 99_000);
  assert.deepEqual(r.wheel.custom, ['X', 'Y']);
  assert.equal(r.wheel.title, 'Wer gewinnt?');
  // Ältere Speicherstände ohne Glücksrad bekommen die Grundwerte.
  const { wheel: _w, ...old } = s;
  assert.equal(normalizeState(old as Partial<AppState>).wheel.title, 'Wer ist dran?');
});
