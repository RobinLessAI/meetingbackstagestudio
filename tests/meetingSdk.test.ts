// Prüft den kostenfreien Live-Chat über das Regie-Fenster (Zoom Meeting SDK):
// Signatur, Link-Erkennung, Chat-Format und den Weg Regie-Fenster → Server → Steuerung.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { meetingSignature, normalizeSdkChat, parseMeetingLink } from '../server/meetingSdk.mjs';

const PORT = 4399;
const dir = mkdtempSync(join(tmpdir(), 'mb-sdk-'));
const sdkDir = join(dir, 'sdk');
let proc: ChildProcess;

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

function verify(jwt: string, secret: string) {
  const [h, p, s] = jwt.split('.');
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return { ok: expected === s, header: decode(h), payload: decode(p) };
}

const connect = (rolle: string) =>
  new Promise<{ ws: WebSocket; next: (type: string, ms?: number) => Promise<any> }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=${rolle}`);
    const queue: any[] = [];
    const waiters: Array<{ type: string; resolve: (m: any) => void }> = [];
    ws.on('message', (d) => {
      const msg = JSON.parse(String(d));
      const i = waiters.findIndex((w) => w.type === msg.type);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else queue.push(msg);
    });
    const next = (type: string, ms = 4000) =>
      new Promise<any>((res, rej) => {
        const i = queue.findIndex((m) => m.type === type);
        if (i >= 0) return res(queue.splice(i, 1)[0]);
        waiters.push({ type, resolve: res });
        setTimeout(() => rej(new Error(`Zeitüberschreitung beim Warten auf ${type}`)), ms);
      });
    ws.on('open', () => resolve({ ws, next }));
    ws.on('error', reject);
  });

before(async () => {
  mkdirSync(join(sdkDir, 'lib', 'av'), { recursive: true });
  writeFileSync(join(sdkDir, 'zoom-meeting-9.9.9.min.js'), 'window.ZoomMtg={};');
  writeFileSync(join(sdkDir, 'lib', 'av', 'test.wasm'), Buffer.from([0, 97, 115, 109]));
  const env = join(dir, '.env.local');
  writeFileSync(env, 'ZOOM_CLIENT_ID=cid\nZOOM_CLIENT_SECRET=geheim\n');
  proc = spawn(process.execPath, ['server/server.mjs'], {
    env: { ...process.env, PORT: String(PORT), MB_DATA_DIR: join(dir, 'daten'), MB_ENV_FILE: env, MB_ZOOM_SDK_DIR: sdkDir },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/status`)).ok) return;
    } catch {
      /* startet noch */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht');
});

after(() => {
  proc.kill();
  rmSync(dir, { recursive: true, force: true });
});

test('Meeting-Link, Kenncode und Signatur', () => {
  assert.deepEqual(parseMeetingLink('https://us02web.zoom.us/j/81234567890?pwd=abc.1'), { meetingId: '81234567890', passcode: 'abc.1' });
  assert.deepEqual(parseMeetingLink('812 3456 7890'), { meetingId: '81234567890', passcode: '' });
  assert.equal(parseMeetingLink('hallo').meetingId, '');

  const now = Date.UTC(2026, 10, 4, 10);
  const { ok, header, payload } = verify(meetingSignature({ clientId: 'cid', clientSecret: 'geheim', meetingNumber: '81234567890', now }), 'geheim');
  assert.ok(ok);
  assert.equal(header.alg, 'HS256');
  assert.equal(payload.appKey, 'cid');
  assert.equal(payload.sdkKey, 'cid');
  assert.equal(payload.mn, '81234567890');
  assert.equal(payload.role, 0);
  assert.equal(payload.exp - payload.iat, 7200);
  assert.equal(payload.tokenExp, payload.exp);
});

test('Chat-Nachrichten aus verschiedenen SDK-Formaten lesen', () => {
  const now = Date.now();
  const a = normalizeSdkChat({ content: { message: ' Grüße aus Wien ', sender: { name: 'Lea' }, receiver: { name: 'Everyone', userId: 0 }, msgId: 'm1' } }, now);
  assert.equal(a.text, 'Grüße aus Wien');
  assert.equal(a.senderName, 'Lea');
  assert.equal(a.private, false);
  assert.equal(a.key, 'sdk:m1');

  const b = normalizeSdkChat({ senderName: 'Tom', receiverName: 'Robin', receiverId: 16778240, text: 'nur für dich', timestamp: Math.floor(now / 1000) }, now);
  assert.equal(b.private, true);
  assert.ok(Math.abs(b.at - now) < 1000);

  const c = normalizeSdkChat({ sender: 'Ana', receiverId: 0, message: 'Berlin' }, now);
  assert.equal(c.senderName, 'Ana');
  assert.equal(c.private, false);
  assert.match(c.key, /^sdk:[0-9a-f]{16}$/);

  assert.equal(normalizeSdkChat({ sender: 'Ana' }, now), null);
  assert.equal(normalizeSdkChat(null, now), null);
});

test('Server liefert das Zoom SDK aus und meldet die Regie als eingerichtet', async () => {
  const status = await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json();
  assert.equal(status.regie.configured, true);
  assert.equal(status.regie.name, 'MeetingBackstage (Regie)');
  const js = await fetch(`http://127.0.0.1:${PORT}/zoom-sdk/zoom-meeting.min.js`);
  assert.equal(js.status, 200);
  assert.equal(await js.text(), 'window.ZoomMtg={};');
  const wasm = await fetch(`http://127.0.0.1:${PORT}/zoom-sdk/lib/av/test.wasm`);
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/zoom-sdk/..%2F.env.local`)).status, 403);
});

test('Regie-Fenster tritt bei und gibt Chat-Nachrichten an alle an die Steuerung weiter', async () => {
  const steuerung = await connect('steuerung');
  const hello = await steuerung.next('hello');
  assert.equal(hello.regie.state, 'bereit');

  const regie = await connect('regie');
  regie.ws.send(JSON.stringify({ type: 'regie-hello', meeting: 'https://zoom.us/j/81234567890?pwd=xyz' }));
  const { join: j } = await regie.next('regie-join');
  assert.equal(j.meetingNumber, '81234567890');
  assert.equal(j.passWord, 'xyz');
  assert.equal(j.userName, 'MeetingBackstage (Regie)');
  assert.equal(j.sdkKey, 'cid');
  assert.ok(verify(j.signature, 'geheim').ok);
  assert.equal((await steuerung.next('regie-status')).status.state, 'verbindet');

  regie.ws.send(JSON.stringify({ type: 'regie-status', state: 'verbunden' }));
  assert.equal((await steuerung.next('regie-status')).status.state, 'verbunden');

  // privat, an alle, doppelt
  regie.ws.send(JSON.stringify({ type: 'regie-chat', data: { senderName: 'Tom', receiverName: 'Regie', receiverId: 5, message: 'psst', msgId: 'p' } }));
  regie.ws.send(JSON.stringify({ type: 'regie-chat', data: { senderName: 'Lea', receiverName: 'Everyone', message: 'Wien', msgId: 'a' } }));
  regie.ws.send(JSON.stringify({ type: 'regie-chat', data: { senderName: 'Lea', receiverName: 'Everyone', message: 'Wien', msgId: 'a' } }));
  const live = await steuerung.next('live-chat');
  assert.deepEqual(
    live.messages.map((m: any) => [m.senderName, m.text, m.key]),
    [['Lea', 'Wien', 'sdk:a']],
  );
  await assert.rejects(steuerung.next('live-chat', 400));

  // Kenncode aus dem Feld hat Vorrang; leerer Link wird abgelehnt
  const regie2 = await connect('regie');
  regie2.ws.send(JSON.stringify({ type: 'regie-hello', meeting: '812 3456 7890', passcode: ' 4711 ' }));
  assert.equal((await regie2.next('regie-join')).join.passWord, '4711');
  regie2.ws.send(JSON.stringify({ type: 'regie-hello', meeting: 'kein link' }));
  assert.match((await regie2.next('regie-error')).message, /Meeting-ID/);

  // Verlassen wird an das Regie-Fenster weitergegeben, Schließen setzt den Status zurück
  steuerung.ws.send(JSON.stringify({ type: 'regie-leave' }));
  await regie.next('regie-leave');
  regie.ws.close();
  regie2.ws.close();
  let state = '';
  for (let i = 0; i < 5 && state !== 'bereit'; i++) state = (await steuerung.next('regie-status')).status.state;
  assert.equal(state, 'bereit');

  // Eine neu geladene Steuerung bekommt die bisherigen Nachrichten
  const neu = await connect('steuerung');
  assert.equal((await neu.next('live-chat')).messages[0].text, 'Wien');
  neu.ws.close();
  steuerung.ws.close();
});
