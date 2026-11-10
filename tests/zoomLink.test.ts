// Meeting in der Zoom-App öffnen bzw. starten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoomAppUrl } from '../src/lib/zoomLink.ts';

test('Einladungslink mit Kenncode wird zur Zoom-App-Adresse', () => {
  assert.equal(zoomAppUrl('https://us06web.zoom.us/j/81234567890?pwd=AbC.1'), 'zoommtg://zoom.us/join?action=join&confno=81234567890&pwd=AbC.1');
});

test('Meeting-ID mit Leerzeichen und persönlicher Raum', () => {
  assert.equal(zoomAppUrl('812 3456 7890'), 'zoommtg://zoom.us/join?action=join&confno=81234567890');
  assert.equal(zoomAppUrl('https://zoom.us/j/3333333333'), 'zoommtg://zoom.us/join?action=join&confno=3333333333');
});

test('Ohne erkennbare Meeting-ID gibt es keine Adresse', () => {
  assert.equal(zoomAppUrl('hallo'), null);
  assert.equal(zoomAppUrl(''), null);
});
