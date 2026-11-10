// Filter und Sortierung der Meetings aus dem Zoom-Konto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterMeetings, type MeetingFilter } from '../src/views/meetingFilter.ts';
import type { ZoomMeeting } from '../src/sync/SyncProvider.tsx';

const now = new Date('2026-11-12T10:00:00').getTime();
const m = (topic: string, start: string | null, type: ZoomMeeting['type']): ZoomMeeting => ({
  id: String(Math.abs([...topic].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % 1e10),
  topic,
  start,
  duration: 60,
  timezone: null,
  recurring: type === 3 || type === 8 || type === 'pmi',
  type,
  link: 'https://zoom.us/j/1',
});
const list = [
  m('Vergangen', '2026-11-01T09:00:00', 2),
  m('Heute', '2026-11-12T15:00:00', 2),
  m('Nächste Woche', '2026-11-17T09:00:00', 2),
  m('Montagsrunde', '2026-11-16T08:00:00', 8),
  m('Offener Raum', null, 3),
  m('Persönlicher Meetingraum', null, 'pmi'),
  m('Im Dezember', '2026-12-20T09:00:00', 2),
];
const f = (p: Partial<MeetingFilter>): string[] =>
  filterMeetings(list, { art: 'alle', zeitraum: 'ab-heute', sortierung: 'datum-auf', suche: '', ...p }, now).map((x) => x.topic);

test('Ab heute, nächste zuerst, ohne Termin am Ende', () => {
  assert.deepEqual(f({}), ['Heute', 'Montagsrunde', 'Nächste Woche', 'Im Dezember', 'Offener Raum', 'Persönlicher Meetingraum']);
});

test('Zeiträume', () => {
  assert.deepEqual(f({ zeitraum: 'heute' }), ['Heute']);
  assert.deepEqual(f({ zeitraum: 'woche' }), ['Heute', 'Montagsrunde', 'Nächste Woche']);
  assert.ok(f({ zeitraum: 'alle' }).includes('Vergangen'));
});

test('Art, Sortierung und Suche', () => {
  assert.deepEqual(f({ art: 'wiederkehrend' }), ['Montagsrunde', 'Offener Raum', 'Persönlicher Meetingraum']);
  assert.ok(!f({ art: 'einmalig' }).includes('Montagsrunde'));
  assert.equal(f({ sortierung: 'datum-ab' })[0], 'Im Dezember');
  assert.equal(f({ sortierung: 'name' })[0], 'Heute');
  assert.deepEqual(f({ suche: 'montag' }), ['Montagsrunde']);
});
