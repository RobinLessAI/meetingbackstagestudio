import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geoEqualEarth } from 'd3-geo';
import { detectLocation } from '../src/lib/places.ts';
import { matchVote } from '../src/lib/poll.ts';
import { buildCloud } from '../src/lib/words.ts';
import { project } from '../src/lib/projection.ts';
import { MAP_PROJECTION } from '../src/data/worldMap.ts';
import { createInitialState } from '../src/data/sample.ts';
import { analyzeCloud, analyzeMap, analyzePoll, handQueue } from '../src/state/derive.ts';
import type { PollOption } from '../src/state/types.ts';

test('Ortserkennung: eindeutige Orte aus dem Verzeichnis', () => {
  assert.deepEqual(detectLocation('Werl'), { kind: 'eindeutig', placeId: 'werl', matched: 'werl' });
  assert.equal(detectLocation('Grüße aus Wien!')?.kind, 'eindeutig');
  assert.equal((detectLocation('Wien-Floridsdorf') as { placeId: string }).placeId, 'wien');
  assert.equal((detectLocation('Frankfurt am Main') as { placeId: string }).placeId, 'frankfurt-main');
  assert.equal((detectLocation('frankfurt (oder)') as { placeId: string }).placeId, 'frankfurt-oder');
});

test('Ortserkennung: mehrdeutige Orte gehen zur Prüfung', () => {
  const r = detectLocation('Frankfurt');
  assert.equal(r?.kind, 'mehrdeutig');
  assert.deepEqual((r as { placeIds: string[] }).placeIds.sort(), ['frankfurt-main', 'frankfurt-oder']);
  assert.equal(detectLocation('Berlin, aber eigentlich Wien')?.kind, 'mehrdeutig');
});

test('Ortserkennung: unbekannte Orte nur über typische Formulierungen', () => {
  assert.deepEqual(detectLocation('Grüße aus Hintertupfingen'), {
    kind: 'unbekannt',
    candidate: 'Hintertupfingen',
  });
  assert.equal(detectLocation('Guten Morgen aus dem Homeoffice'), null);
  assert.equal(detectLocation('Ich bin in der Pause'), null);
  assert.equal(detectLocation('Austausch'), null);
  assert.equal(detectLocation('kennenlernen'), null);
});

const OPTIONS: PollOption[] = [
  { id: 'o1', text: 'Kurze Impulse' },
  { id: 'o2', text: 'Breakout-Räume' },
  { id: 'o3', text: 'Live-Demos' },
];

test('Umfrage: Kennungen und Antworttexte', () => {
  for (const [text, id] of [
    ['A', 'o1'], ['b', 'o2'], ['B)', 'o2'], ['(c)', 'o3'], ['2', 'o2'], ['Antwort 3', 'o3'],
    ['Live-Demos', 'o3'], ['kurze impulse!', 'o1'], ['C Live-Demos', 'o3'],
  ] as const) {
    const r = matchVote(text, OPTIONS);
    assert.equal(r?.kind, 'gueltig', text);
    assert.equal((r as { optionId: string }).optionId, id, text);
  }
});

test('Umfrage: unklare Antworten werden zur Prüfung vorgelegt', () => {
  assert.deepEqual(matchVote('eher B', OPTIONS), { kind: 'unklar', optionIds: ['o2'] });
  assert.deepEqual(matchVote('B oder C', OPTIONS), { kind: 'unklar', optionIds: ['o2', 'o3'] });
  assert.equal(matchVote('D', OPTIONS), null);
  assert.equal(matchVote('Danke für den Impuls', OPTIONS), null);
});

test('Wortwolke: Filter für Füllwörter, Kurzwörter und unangemessene Begriffe', () => {
  const terms = buildCloud(
    [
      { text: 'Austausch und Methoden', sender: 'a' },
      { text: 'Austausch', sender: 'b' },
      { text: 'verdammt viel Input', sender: 'c' },
      { text: 'B', sender: 'd' },
    ],
    { stopwords: true, shortWords: true, profanity: true, ignoreVotes: true, minCount: 1 },
    ['input'],
  );
  const get = (k: string) => terms.find((t) => t.key === k);
  assert.equal(get('austausch')?.count, 2);
  assert.equal(get('austausch')?.display, 'Austausch');
  assert.equal(get('und')?.excluded, 'fuellwort');
  assert.equal(get('verdammt')?.excluded, 'unangemessen');
  assert.equal(get('b')?.excluded, 'kurz');
  assert.equal(get('input')?.excluded, 'ausgeblendet');
  assert.equal(get('methoden')?.excluded, null);
});

test('Kartenprojektion entspricht der erzeugten Karte (d3 Equal Earth)', () => {
  const d3 = geoEqualEarth().scale(MAP_PROJECTION.scale).translate([MAP_PROJECTION.tx, MAP_PROJECTION.ty]);
  for (const [lon, lat] of [[7.91, 51.55], [16.37, 48.21], [-74, 40.7], [151.2, -33.9], [0, 0]]) {
    const [x, y] = project(lon, lat);
    const [dx, dy] = d3([lon, lat])!;
    assert.ok(Math.abs(x - dx) < 0.01 && Math.abs(y - dy) < 0.01, `${lon},${lat}`);
  }
});

test('Beispieldaten: Warteschlange, Umfrage, Karte und Wortwolke', () => {
  const s = createInitialState(1_800_000_000_000);
  assert.deepEqual(handQueue(s).map((q) => q.participant.id), ['jonas', 'aylin', 'kwame']);

  const poll = analyzePoll(s);
  const count = (id: string) => poll.totals.find((t) => t.option.id === id)!.count;
  assert.deepEqual([count('o1'), count('o2'), count('o3'), count('o4')], [2, 6, 3, 1]);
  assert.equal(poll.totalVotes, 12);
  assert.equal(poll.unclear.length, 2);
  // Jonas hat erst A, dann C gewählt: nur C zählt.
  const jonas = poll.votes.filter((v) => v.message.senderId === 'jonas');
  assert.deepEqual(jonas.map((v) => [v.optionId, v.counted]), [['o3', true], ['o1', false]]);

  const map = analyzeMap(s);
  const werl = map.pins.find((p) => p.place.id === 'werl');
  assert.equal(werl?.people.length, 2);
  const reviewKinds = map.review.map((r) => r.detection?.kind).sort();
  assert.deepEqual(reviewKinds, ['eindeutig', 'mehrdeutig', 'mehrdeutig', 'unbekannt']);

  const cloud = analyzeCloud(s, poll);
  assert.equal(cloud.visible[0].key, 'aufmerksamkeit');
  assert.ok(!cloud.visible.some((t) => t.key === 'b'), 'Umfrage-Stimmen stehen nicht in der Wortwolke');
  assert.ok(!cloud.visible.some((t) => t.key === 'verdammt'));
});
