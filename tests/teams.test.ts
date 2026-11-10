// Microsoft Teams: Anmeldung, Kalender, Live-Chat über Graph-Benachrichtigungen – gegen nachgebildete Microsoft-Dienste.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTeamsAccount,
  createTeamsLive,
  groupTeamsEvents,
  htmlToText,
  normalizeTeamsMessage,
  sameJoinLink,
  startTunnel,
  threadIdFromLink,
  // @ts-expect-error – JavaScript-Modul ohne Typen
} from '../server/teams.mjs';

const MS = 4411;
const RECEIVER = 4412;
const THREAD = '19:meeting_ZmE0NzQ4YjMtNWY2Ny00ZDQ1@thread.v2';
const LINK = `https://teams.microsoft.com/l/meetup-join/${encodeURIComponent(THREAD)}/0?context=%7b%22Tid%22%3a%22abc%22%7d`;
const dir = mkdtempSync(join(tmpdir(), 'mb-teams-'));
let ms: http.Server;
let lastTokenParams: URLSearchParams | null = null;
const subscriptions: { notificationUrl: string; clientState: string; resource: string }[] = [];
let deleted = 0;

before(async () => {
  ms = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/login/token') {
        lastTokenParams = new URLSearchParams(body);
        return json(200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600, scope: 'Chat.Read' });
      }
      if (req.headers.authorization !== 'Bearer tok') return json(401, { error: { message: 'Invalid token' } });
      if (url.pathname === '/graph/me') return json(200, { displayName: 'Robin Test', mail: 'robin@verein.example' });
      if (url.pathname === '/graph/me/calendarView') {
        assert.equal(req.headers.prefer, 'outlook.timezone="UTC"');
        return json(200, {
          value: [
            { id: 'e1', subject: 'Vereinsabend', isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', type: 'occurrence', seriesMasterId: 's1', start: { dateTime: '2026-11-20T18:00:00.0000000' }, end: { dateTime: '2026-11-20T19:30:00.0000000' }, onlineMeeting: { joinUrl: LINK } },
            { id: 'e2', subject: 'Vereinsabend', isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', type: 'occurrence', seriesMasterId: 's1', start: { dateTime: '2026-11-27T18:00:00.0000000' }, end: { dateTime: '2026-11-27T19:30:00.0000000' }, onlineMeeting: { joinUrl: LINK } },
            { id: 'e3', subject: 'Zahnarzt', isOnlineMeeting: false, start: { dateTime: '2026-11-21T08:00:00.0000000' }, end: { dateTime: '2026-11-21T09:00:00.0000000' } },
          ],
        });
      }
      if (url.pathname === '/graph/subscriptions' && req.method === 'POST') {
        const sub = JSON.parse(body);
        // Wie Graph: zuerst die Adresse bestätigen lassen.
        const check = await fetch(`${sub.notificationUrl}?validationToken=${encodeURIComponent('Prüf token 1')}`, { method: 'POST' });
        if ((await check.text()) !== 'Prüf token 1') return json(400, { error: { message: 'Subscription validation request failed' } });
        subscriptions.push(sub);
        return json(201, { id: `sub-${subscriptions.length}`, ...sub });
      }
      if (url.pathname.startsWith('/graph/subscriptions/') && req.method === 'DELETE') {
        deleted += 1;
        res.writeHead(204).end();
        return;
      }
      if (decodeURIComponent(url.pathname) === `/graph/chats/${THREAD}/messages/m1`) {
        return json(200, { id: 'm1', messageType: 'message', createdDateTime: '2026-11-20T18:05:00Z', from: { user: { displayName: 'Anna' } }, body: { contentType: 'html', content: '<p>Grüße aus Köln <emoji id="wave" alt="👋"></emoji></p>' } });
      }
      json(404, { error: { message: 'unbekannt' } });
    });
  });
  await new Promise<void>((r) => ms.listen(MS, '127.0.0.1', r));
});

after(() => {
  ms.closeAllConnections();
  ms.close();
  rmSync(dir, { recursive: true, force: true });
});

const account = () =>
  createTeamsAccount({
    clientId: 'app-id',
    tenant: 'verein',
    redirectUri: 'http://localhost:4300/teams/anmeldung',
    dataDir: dir,
    log: () => {},
    loginBase: `http://127.0.0.1:${MS}/login`,
    graphBase: `http://127.0.0.1:${MS}/graph`,
  });

test('Teams-Links: Chat-ID lesen und vergleichen', () => {
  assert.equal(threadIdFromLink(LINK), THREAD);
  assert.equal(threadIdFromLink('https://teams.microsoft.com/meet/123?p=abc'), null);
  assert.equal(sameJoinLink(LINK, decodeURIComponent(LINK)), true);
  assert.equal(sameJoinLink('https://teams.microsoft.com/meet/123?p=abc', 'https://teams.microsoft.com/meet/123?p=ABC/'), true);
});

test('Nachrichten aus Teams werden zu reinem Text, Systemmeldungen fallen weg', () => {
  assert.equal(htmlToText('<p>Hallo&nbsp;<b>alle</b> &amp; willkommen</p><p>Zeile 2</p>'), 'Hallo alle & willkommen\nZeile 2');
  assert.equal(htmlToText('Top <emoji id="1f44d" alt="👍" title="Daumen"></emoji>'), 'Top 👍');
  assert.deepEqual(
    normalizeTeamsMessage({ id: '7', messageType: 'message', createdDateTime: '2026-11-20T18:00:00Z', from: { user: { displayName: 'Ben' } }, body: { contentType: 'text', content: 'Berlin' } }),
    { key: 'teams-7', senderName: 'Ben', text: 'Berlin', at: Date.parse('2026-11-20T18:00:00Z') },
  );
  assert.equal(normalizeTeamsMessage({ id: '8', messageType: 'systemEventMessage', body: { content: 'x' } }), null);
  assert.equal(normalizeTeamsMessage({ id: '9', messageType: 'message', deletedDateTime: '2026-01-01', body: { content: 'x' } }), null);
});

test('Serientermine werden zu einem Eintrag mit dem nächsten Termin', () => {
  const list = groupTeamsEvents(
    [
      { id: 'a', subject: 'Serie', isOnlineMeeting: true, type: 'occurrence', start: { dateTime: '2026-11-01T10:00:00.0000000' }, end: { dateTime: '2026-11-01T11:00:00.0000000' }, onlineMeeting: { joinUrl: LINK } },
      { id: 'b', subject: 'Serie', isOnlineMeeting: true, type: 'occurrence', start: { dateTime: '2026-11-15T10:00:00.0000000' }, end: { dateTime: '2026-11-15T11:00:00.0000000' }, onlineMeeting: { joinUrl: LINK } },
      { id: 'c', subject: 'Serie', isOnlineMeeting: true, type: 'occurrence', start: { dateTime: '2026-11-22T10:00:00.0000000' }, end: { dateTime: '2026-11-22T11:00:00.0000000' }, onlineMeeting: { joinUrl: LINK } },
    ],
    Date.parse('2026-11-10T12:00:00Z'),
  );
  assert.equal(list.length, 1);
  assert.equal(list[0].start, '2026-11-15T10:00:00Z');
  assert.equal(list[0].recurring, true);
  assert.equal(list[0].platform, 'teams');
});

test('Anmeldung mit PKCE, danach Kalender lesen', async () => {
  const acc = account();
  assert.equal(acc.status().connected, false);
  const authUrl = new URL(acc.authorizeUrl());
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.match(authUrl.searchParams.get('scope') ?? '', /Chat\.Read/);
  const state = authUrl.searchParams.get('state') ?? '';
  await acc.handleCallback(new URLSearchParams({ code: 'abc', state }));
  // Der Prüfwert muss zur Challenge passen.
  const verifier = lastTokenParams?.get('code_verifier') ?? '';
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(challenge, authUrl.searchParams.get('code_challenge'));
  assert.equal(lastTokenParams?.get('client_secret'), null);
  assert.equal(acc.status().name, 'Robin Test');
  // Derselbe state darf nicht zweimal funktionieren.
  await assert.rejects(acc.handleCallback(new URLSearchParams({ code: 'abc', state })), /abgelaufen/);

  const meetings = await acc.listMeetings(Date.parse('2026-11-10T12:00:00Z'));
  assert.equal(meetings.length, 1);
  assert.equal(meetings[0].topic, 'Vereinsabend');
  assert.equal(meetings[0].id, THREAD);
  assert.equal(meetings[0].start, '2026-11-20T18:00:00Z');
  assert.equal(meetings[0].duration, 90);
});

test('Live-Chat: Abo wird bestätigt, Nachrichten kommen an, fremde Meldungen nicht', async () => {
  const acc = account(); // liest die gespeicherten Token
  assert.equal(acc.status().connected, true);
  const received: { senderName: string; text: string }[] = [];
  const states: string[] = [];
  const live = createTeamsLive({
    account: acc,
    log: () => {},
    receiverPort: RECEIVER,
    publicUrl: `http://127.0.0.1:${RECEIVER}`,
    onMessage: (m: { senderName: string; text: string }) => received.push(m),
    onStatus: (s: { state: string }) => states.push(s.state),
    retryDelayMs: 10,
  });
  await live.start(LINK, 'Vereinsabend');
  assert.equal(live.status().state, 'verbunden', live.status().error ?? '');
  assert.equal(subscriptions.length, 1);
  const sub = subscriptions[0];
  assert.equal(sub.resource, `/chats/${THREAD}/messages`);

  const notify = (clientState: string) =>
    fetch(sub.notificationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: [{ clientState, resource: `chats('${THREAD}')/messages('m1')`, resourceData: { id: 'm1' } }] }),
    });
  // Falscher Schlüssel: wird angenommen, aber ignoriert.
  assert.equal((await notify('falsch')).status, 202);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(received.length, 0);

  assert.equal((await notify(sub.clientState)).status, 202);
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(received.map((m) => [m.senderName, m.text]), [['Anna', 'Grüße aus Köln 👋']]);
  // Doppelte Meldung zählt nicht doppelt.
  await notify(sub.clientState);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(received.length, 1);
  assert.equal(live.status().messages, 1);

  // Der Empfänger beantwortet nichts anderes.
  assert.equal((await fetch(`http://127.0.0.1:${RECEIVER}/`)).status, 404);

  await live.stop();
  assert.equal(live.status().state, 'bereit');
  assert.equal(deleted, 1);
  await live.close();
  assert.deepEqual(states.slice(0, 1), ['verbindet']);
});

/** Nachgebautes Programm: meldet eine Zeile oder fehlt (ENOENT). */
function fakeSpawn(lines: Record<string, string | null>) {
  const calls: string[] = [];
  const impl = (cmd: string) => {
    calls.push(cmd);
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: () => {} });
    setTimeout(() => {
      const line = lines[cmd];
      if (line === null || line === undefined) child.emit('error', Object.assign(new Error('nicht gefunden'), { code: 'ENOENT' }));
      else child.stderr.emit('data', Buffer.from(line));
    }, 5);
    return child;
  };
  return { impl, calls };
}

test('Tunnel: cloudflared zuerst, sonst ngrok, sonst klarer Hinweis', async () => {
  const cf = fakeSpawn({ cloudflared: 'INF |  https://blue-sky-42.trycloudflare.com  |' });
  assert.equal((await startTunnel(4302, { spawnImpl: cf.impl })).url, 'https://blue-sky-42.trycloudflare.com');

  const ng = fakeSpawn({ cloudflared: null, ngrok: 't=1 lvl=info msg="started tunnel" url=https://ab12.ngrok-free.app' });
  const r = await startTunnel(4302, { spawnImpl: ng.impl, log: () => {} });
  assert.equal(r.url, 'https://ab12.ngrok-free.app');
  assert.deepEqual(ng.calls, ['cloudflared', 'ngrok']);

  const none = fakeSpawn({ cloudflared: null, ngrok: null });
  await assert.rejects(startTunnel(4302, { spawnImpl: none.impl, log: () => {} }), /brew install cloudflared/);
});
