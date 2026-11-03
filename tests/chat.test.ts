import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importKeys, parseZoomChat, timeToTimestamp } from '../src/lib/zoomChat.ts';
import { createInitialState } from '../src/data/sample.ts';
import { createEventState } from '../src/data/event.ts';
import { analyzeCloud, analyzeMap, analyzePoll, matchesTeamName } from '../src/state/derive.ts';
import { reducer } from '../src/state/reducer.ts';
import { buildSnapshot } from '../src/sync/snapshot.ts';

test('Zoom-Chat: neues Format mit Nachricht in der Folgezeile, nur Nachrichten an alle', () => {
  const raw = [
    '10:01:51 From Robin to Everyone:',
    '\tVon wo seid ihr dabei?',
    '10:02:10 From Lea Hoffmann to Everyone:',
    '\tBerlin',
    '10:02:15 From Jonas to Robin(Direct Message):',
    '\tGeheim',
    '10:02:20 From Aylin Demir to Everyone:',
    '\tReacted to "Berlin" with 👍',
    '10:02:30 From Paul (Host) to Everyone:',
    '\tZeile eins',
    '\tZeile zwei',
  ].join('\n');
  const r = parseZoomChat(raw);
  assert.equal(r.format, 'zoom');
  assert.deepEqual(r.messages.map((m) => [m.sender, m.text]), [
    ['Robin', 'Von wo seid ihr dabei?'],
    ['Lea Hoffmann', 'Berlin'],
    ['Paul', 'Zeile eins\nZeile zwei'],
  ]);
  assert.equal(r.skippedPrivate, 1);
  assert.equal(r.skippedReactions, 1);
});

test('Zoom-Chat: deutsches und älteres Format', () => {
  const de = parseZoomChat('10:01:51 Von Lea an Alle: Grüße aus Wien\n10:03:00 Von Jonas an Robin (Direktnachricht): privat');
  assert.deepEqual(de.messages.map((m) => m.text), ['Grüße aus Wien']);
  assert.equal(de.skippedPrivate, 1);
  const old = parseZoomChat('10:05:23\t From  Jonas Petersen : Hallo zusammen\r\n10:05:40\t From  Lea : B');
  assert.deepEqual(old.messages.map((m) => [m.sender, m.text]), [
    ['Jonas Petersen', 'Hallo zusammen'],
    ['Lea', 'B'],
  ]);
});

test('Zoom-Chat: einfaches Format und Schlüssel für doppelte Nachrichten', () => {
  const r = parseZoomChat('Lea: Berlin\nJonas: B');
  assert.equal(r.format, 'einfach');
  assert.equal(r.messages.length, 2);
  const keys = importKeys([
    { time: '10:00:00', sender: 'A', text: 'B' },
    { time: '10:00:00', sender: 'A', text: 'B' },
  ]);
  assert.notEqual(keys[0], keys[1]);
  const now = new Date(2026, 10, 3, 0, 10).getTime();
  assert.equal(new Date(timeToTimestamp('23:55:00', now)).getDate(), 2, 'kurz vor Mitternacht = Vortag');
});

test('Team-Namen: Beiträge der Moderation werden nicht ausgewertet', () => {
  assert.equal(matchesTeamName('Robin Weniger', ['Robin']), true);
  assert.equal(matchesTeamName('Robina', ['Robin']), false);
  const now = Date.now();
  let s = createEventState({ title: 'Test', teamNames: ['Robin'], mapQuestion: '', cloudPrompt: '' }, now - 1000);
  const msg = (id: string, sender: string, text: string, at: number) => ({ id, senderId: null, senderName: sender, text, at, source: 'zoom' as const, importKey: id });
  s = reducer(s, { type: 'chat/import', messages: [msg('a', 'Robin Weniger', 'Berlin', now), msg('b', 'Lea', 'Grüße aus Wien', now + 1)] });
  const map = analyzeMap(s);
  assert.deepEqual(map.review.map((r) => r.message.senderName), ['Lea']);
  // Gleiche Schlüssel werden nicht doppelt übernommen
  const again = reducer(s, { type: 'chat/import', messages: [msg('b', 'Lea', 'Grüße aus Wien', now + 1)] });
  assert.equal(again, s);
});

test('Neue Veranstaltung startet ohne Beispieldaten', () => {
  const s = createEventState({ title: ' Workshop ', teamNames: [' Robin ', ''], mapQuestion: 'Wo?', cloudPrompt: 'Was?' });
  assert.equal(s.dataMode, 'eigene');
  assert.equal(s.session.title, 'Workshop');
  assert.deepEqual(s.settings.teamNames, ['Robin']);
  assert.equal(s.chat.length, 0);
  assert.equal(s.participants.length, 0);
  assert.equal(s.poll.status, 'entwurf');
});

test('Momentaufnahme für OBS enthält die aufbereiteten Grafikdaten', () => {
  const s = { ...createInitialState(1_800_000_000_000), highlightId: 'm23' };
  const poll = analyzePoll(s);
  const snap = buildSnapshot(s, { map: analyzeMap(s), poll, cloud: analyzeCloud(s, poll) }, 1);
  assert.equal(snap.v, 1);
  assert.equal(snap.poll.totals.length, 4);
  assert.equal(snap.poll.totalVotes, 12);
  assert.ok(snap.map.pins.length > 0);
  assert.equal(snap.cloud.terms[0].key, 'aufmerksamkeit');
  assert.ok(snap.highlight?.text.startsWith('Wie haltet ihr'));
  // Muss sich als JSON verschicken lassen
  assert.deepEqual(JSON.parse(JSON.stringify(snap)).poll.totals[1].count, 6);
});
