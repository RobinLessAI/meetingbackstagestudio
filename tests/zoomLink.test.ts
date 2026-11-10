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

import { isTeamsLink, teamsAppUrl, teamsThreadId } from '../src/lib/teamsLink.ts';

const TEAMS = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZmE0NzQ4YjMtNWY2Ny00ZDQ1%40thread.v2/0?context=%7b%22Tid%22%3a%22abc%22%7d';

test('Teams-Link erkennen, Chat-ID lesen und in der Teams-App öffnen', () => {
  assert.equal(isTeamsLink(TEAMS), true);
  assert.equal(isTeamsLink('https://zoom.us/j/81234567890'), false);
  assert.equal(teamsThreadId(TEAMS), '19:meeting_ZmE0NzQ4YjMtNWY2Ny00ZDQ1@thread.v2');
  assert.equal(teamsAppUrl(TEAMS)?.startsWith('msteams:/l/meetup-join/19%3ameeting_'), true);
  assert.equal(teamsAppUrl('https://zoom.us/j/1'), null);
});
