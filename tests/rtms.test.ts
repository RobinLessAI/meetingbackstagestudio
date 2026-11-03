// Prüft den RTMS-Ablauf gegen einen nachgebildeten Zoom-Server, der sich so verhält,
// wie es die Zoom-Dokumentation beschreibt. Ein Test mit echtem Zoom ersetzt das nicht.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { normalizeChat, rtmsSignature, verifyWebhook } from '../server/rtms.mjs';

const PORT = 4393;
const ZOOM_PORT = 4392;
const CLIENT_ID = 'test-client';
const CLIENT_SECRET = 'test-secret';
const SECRET_TOKEN = 'webhook-token';
const dir = mkdtempSync(join(tmpdir(), 'mb-rtms-'));
let proc: ChildProcess;
let zoom: WebSocketServer;
const seen: { signalingHandshake?: any; mediaHandshake?: any; readyAck?: boolean; keepAliveResp?: boolean } = {};

const sign = (body: string, ts = Math.floor(Date.now() / 1000)) => ({
  'x-zm-request-timestamp': String(ts),
  'x-zm-signature': `v0=${crypto.createHmac('sha256', SECRET_TOKEN).update(`v0:${ts}:${body}`).digest('hex')}`,
});

before(async () => {
  // Nachgebildeter Zoom-RTMS-Server
  zoom = new WebSocketServer({ port: ZOOM_PORT });
  let signalingWs: WebSocket | null = null;
  zoom.on('connection', (ws, req) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      if (req.url === '/signaling') {
        signalingWs = ws;
        if (msg.msg_type === 1) {
          seen.signalingHandshake = msg;
          ws.send(JSON.stringify({ msg_type: 2, status_code: 0, media_server: { server_urls: { all: `ws://127.0.0.1:${ZOOM_PORT}/media` } } }));
          ws.send(JSON.stringify({ msg_type: 12, timestamp: 123 }));
        } else if (msg.msg_type === 7) {
          seen.readyAck = true;
        } else if (msg.msg_type === 13) {
          seen.keepAliveResp = true;
        }
      } else if (req.url === '/media' && msg.msg_type === 3) {
        seen.mediaHandshake = msg;
        ws.send(JSON.stringify({ msg_type: 4, status_code: 0 }));
        setTimeout(() => {
          ws.send(JSON.stringify({ msg_type: 18, content: { user_id: 7, user_name: 'Lea Hoffmann', data: 'Grüße aus Berlin', timestamp: Date.now() } }));
        }, 100);
      }
    });
  });
  void signalingWs;

  const env = join(dir, '.env.local');
  writeFileSync(env, `ZOOM_CLIENT_ID=${CLIENT_ID}\nZOOM_CLIENT_SECRET="${CLIENT_SECRET}"\nZOOM_WEBHOOK_SECRET_TOKEN=${SECRET_TOKEN}\n`);
  proc = spawn(process.execPath, ['server/server.mjs'], {
    env: { ...process.env, PORT: String(PORT), MB_DATA_DIR: dir, MB_ENV_FILE: env },
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
  zoom.close();
  rmSync(dir, { recursive: true, force: true });
});

test('Webhook-Signatur und Chat-Normalisierung', () => {
  const body = '{"event":"x"}';
  assert.equal(verifyWebhook(SECRET_TOKEN, body, sign(body)), true);
  assert.equal(verifyWebhook('falsch', body, sign(body)), false);
  assert.equal(verifyWebhook(SECRET_TOKEN, body, sign(body, 1000)), false, 'zu alter Zeitstempel');
  assert.deepEqual(normalizeChat({ msg_type: 18, content: { user_name: 'A', data: ' Hallo ', timestamp: 1_700_000_000_000 } }), {
    sender: 'A',
    text: 'Hallo',
    at: 1_700_000_000_000,
    userId: null,
  });
  assert.equal(normalizeChat({ msg_type: 18, user_name: 'B', content: 'Text', timestamp: 1_700_000_000 })?.at, 1_700_000_000_000);
  assert.equal(normalizeChat({ msg_type: 18, content: { user_name: 'C' } }), null);
});

test('Zoom-Endpunktprüfung wird korrekt beantwortet, falsche Signaturen abgelehnt', async () => {
  const body = JSON.stringify({ event: 'endpoint.url_validation', payload: { plainToken: 'abc123' } });
  const r = await fetch(`http://127.0.0.1:${PORT}/zoom/webhook`, { method: 'POST', body, headers: sign(body) });
  assert.equal(r.status, 200);
  const json = await r.json();
  assert.equal(json.plainToken, 'abc123');
  assert.equal(json.encryptedToken, crypto.createHmac('sha256', SECRET_TOKEN).update('abc123').digest('hex'));
  const bad = await fetch(`http://127.0.0.1:${PORT}/zoom/webhook`, { method: 'POST', body, headers: { 'x-zm-signature': 'v0=00', 'x-zm-request-timestamp': '1' } });
  assert.equal(bad.status, 401);
});

test('Über den Tunnel ist nur der Webhook erreichbar', async () => {
  // fetch erlaubt keinen eigenen Host-Header, daher direkt über http.request
  const status = await new Promise<number>((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: '/api/status', headers: { Host: 'beispiel.ngrok-free.app' } },
      (res) => resolve(res.statusCode ?? 0),
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 404);
});

test('RTMS-Start: Handshakes, Keep-Alive und Chat kommen bei der Steuerung an', async () => {
  const steuerung = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=steuerung`);
  const received = new Promise<any>((resolve, reject) => {
    steuerung.on('message', (d) => {
      const msg = JSON.parse(String(d));
      if (msg.type === 'live-chat') resolve(msg);
    });
    setTimeout(() => reject(new Error('Kein Live-Chat angekommen')), 5000);
  });
  await new Promise((r) => steuerung.on('open', r));

  const payload = { meeting_uuid: 'meeting-uuid==', rtms_stream_id: 'stream-1', server_urls: `ws://127.0.0.1:${ZOOM_PORT}/signaling` };
  const body = JSON.stringify({ event: 'meeting.rtms_started', payload });
  const r = await fetch(`http://127.0.0.1:${PORT}/zoom/webhook`, { method: 'POST', body, headers: sign(body) });
  assert.equal(r.status, 200);

  const msg = await received;
  assert.equal(msg.messages[0].senderName, 'Lea Hoffmann');
  assert.equal(msg.messages[0].text, 'Grüße aus Berlin');
  assert.equal(seen.signalingHandshake.signature, rtmsSignature(CLIENT_ID, 'meeting-uuid==', 'stream-1', CLIENT_SECRET));
  assert.equal(seen.mediaHandshake.media_type, 16);
  assert.equal(seen.readyAck, true);
  assert.equal(seen.keepAliveResp, true);

  const status = await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json();
  assert.equal(status.rtms.state, 'verbunden');
  assert.equal(status.rtms.configured, true);
  steuerung.close();
});
