// Liste „Wer war dran“: Teilnehmende aus Zoom aufnehmen, markieren, Spotlight vermerken, Neustart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { resetAnswers } from '../server/resetAnswers.mjs';
import { createEventState, normalizeState } from '../src/data/event.ts';
import { reducer, rosterKey } from '../src/state/reducer.ts';
import type { AppState } from '../src/state/types.ts';

const base = (): AppState => createEventState({ title: 'Test', teamNames: [], mapQuestion: '', cloudPrompt: '' }, 1000);

test('Neue Namen kommen dazu, Wiedereintritte treffen dieselbe Zeile', () => {
  let s = base();
  s = reducer(s, { type: 'roster/seen', names: ['Anna Schulz', 'Ben'], spotlightNames: [], at: 2000 });
  assert.deepEqual(Object.keys(s.roster.entries).sort(), ['anna schulz', 'ben']);
  s = reducer(s, { type: 'roster/mark', key: 'ben', mark: 'gefragt', on: true, at: 3000 });
  // Ben verlässt das Meeting und kommt mit anderer Schreibweise zurück: Markierung bleibt.
  const before = s;
  s = reducer(s, { type: 'roster/seen', names: ['Anna Schulz', ' BEN '], spotlightNames: [], at: 4000 });
  assert.equal(s, before, 'ohne Neues bleibt der Zustand unverändert');
  assert.equal(s.roster.entries.ben.marks.gefragt, 3000);
  assert.equal(rosterKey('  Anna   Schulz '), 'anna schulz');
});

test('Markieren und zurücknehmen, Notiz, Spotlight wird vermerkt', () => {
  let s = base();
  s = reducer(s, { type: 'roster/seen', names: ['Anna'], spotlightNames: ['Anna'], at: 2000 });
  assert.equal(s.roster.entries.anna.spotlightAt, 2000);
  s = reducer(s, { type: 'roster/mark', key: 'anna', mark: 'gesprochen', on: true, at: 2500 });
  s = reducer(s, { type: 'roster/mark', key: 'anna', mark: 'merken', on: true, at: 2600 });
  s = reducer(s, { type: 'roster/mark', key: 'anna', mark: 'merken', on: false, at: 2700 });
  assert.deepEqual(s.roster.entries.anna.marks, { gesprochen: 2500 });
  s = reducer(s, { type: 'roster/note', key: 'anna', note: 'Frage zu Canva' });
  assert.equal(s.roster.entries.anna.note, 'Frage zu Canva');
  // Erneutes Spotlight erst nach einer Minute neu vermerken (sonst ständig neue Zustände).
  assert.equal(reducer(s, { type: 'roster/seen', names: ['Anna'], spotlightNames: ['Anna'], at: 30_000 }), s);
  assert.equal(reducer(s, { type: 'roster/seen', names: ['Anna'], spotlightNames: ['Anna'], at: 70_000 }).roster.entries.anna.spotlightAt, 70_000);
  s = reducer(s, { type: 'roster/clearMarks' });
  assert.deepEqual(s.roster.entries.anna.marks, {});
  assert.equal(s.roster.entries.anna.spotlightAt, null);
  assert.equal(s.roster.entries.anna.note, '');
});

test('Von Hand hinzufügen und entfernen', () => {
  let s = base();
  s = reducer(s, { type: 'roster/add', name: 'Telefon Raum 2', at: 1500 });
  assert.equal(s.roster.entries['telefon raum 2'].manual, true);
  assert.equal(reducer(s, { type: 'roster/add', name: 'telefon raum 2', at: 1600 }), s);
  s = reducer(s, { type: 'roster/remove', key: 'telefon raum 2' });
  assert.deepEqual(s.roster.entries, {});
});

test('Neustart leert die Liste, alte Speicherstände ohne Liste funktionieren', () => {
  let s = base();
  s = reducer(s, { type: 'roster/seen', names: ['Anna'], spotlightNames: [], at: 2000 });
  const r = normalizeState(resetAnswers(JSON.parse(JSON.stringify(s)), 9000));
  assert.deepEqual(r.roster.entries, {});
  const { roster: _r, ...old } = s;
  assert.deepEqual(normalizeState(old as Partial<AppState>).roster.entries, {});
});
