// Prüft die WebSocket-Variante (ohne Tunnel) gegen nachgebildete Zoom-Dienste:
// Token-Ausgabe, Ereignis-WebSocket und RTMS-Datenstrom.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { parseEventMessage, parseSubscriptionId } from '../server/zoomEvents.mjs';

const PORT = 4395;
const ZOOM_PORT = 4396;
const dir = mkdtempSync(join(tmpdir(), 'mb-ws-'));
let proc: ChildProcess;
let zoomHttp: http.Server;
let wss: WebSocketServer;
let eventSocket: WebSocket | null = null;
let tokenGrant = '';
let heartbeat = false;

before(async () => {
  zoomHttp = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      tokenGrant = new URLSearchParams(body).get('grant_type') ?? '';
      const ok = req.headers.authorization === `Basic ${Buffer.from('cid:csecret').toString('base64')}`;
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ok ? { access_token: 'tok123', expires_in: 3600 } : { reason: 'Invalid client' }));
    });
  });
  wss = new WebSocketServer({ server: zoomHttp });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/ws') {
      assert.equal(url.searchParams.get('subscriptionId'), 'sub42');
      assert.equal(url.searchParams.get('access_token'), 'tok123');
      eventSocket = ws;
      ws.on('message', (d) => {
        if (JSON.parse(String(d)).module === 'heart_beat') heartbeat = true;
      });
      return;
    }
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (url.pathname === '/signaling' && m.msg_type === 1)
        ws.send(JSON.stringify({ msg_type: 2, status_code: 0, media_server: { server_urls: { all: `ws://127.0.0.1:${ZOOM_PORT}/media` } } }));
      if (url.pathname === '/media' && m.msg_type === 3) {
        ws.send(JSON.stringify({ msg_type: 4, status_code: 0 }));
        setTimeout(() => ws.send(JSON.stringify({ msg_type: 18, content: { user_name: 'Lea', data: 'Wien', timestamp: Date.now() } })), 100);
      }
    });
  });
  await new Promise<void>((r) => zoomHttp.listen(ZOOM_PORT, '127.0.0.1', r));

  const env = join(dir, '.env.local');
  writeFileSync(env, 'ZOOM_CLIENT_ID=cid\nZOOM_CLIENT_SECRET=csecret\nZOOM_WS_SUBSCRIPTION_ID=wss://ws.zoom.us/ws?subscriptionId=sub42\n');
  proc = spawn(process.execPath, ['server/server.mjs'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      MB_DATA_DIR: dir,
      MB_ENV_FILE: env,
      MB_ZOOM_WS_URL: `ws://127.0.0.1:${ZOOM_PORT}/ws`,
      MB_ZOOM_OAUTH_URL: `http://127.0.0.1:${ZOOM_PORT}/oauth/token`,
    },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50 && !eventSocket; i++) await new Promise((r) => setTimeout(r, 100));
  if (!eventSocket) throw new Error('Server hat sich nicht mit dem Ereignis-WebSocket verbunden');
});

after(() => {
  proc.kill();
  wss.close();
  zoomHttp.close();
  rmSync(dir, { recursive: true, force: true });
});

test('Subscription ID aus Adresse lesen, Ereignisse aus Nachrichten lesen', () => {
  assert.equal(parseSubscriptionId('wss://ws.zoom.us/ws?subscriptionId=abc'), 'abc');
  assert.equal(parseSubscriptionId(' abc '), 'abc');
  const inner = { event: 'meeting.rtms_started', payload: {} };
  assert.deepEqual(parseEventMessage(JSON.stringify({ module: 'message', content: JSON.stringify(inner) })), inner);
  assert.equal(parseEventMessage(JSON.stringify({ module: 'heart_beat', success: true })), null);
});

test('Ohne Tunnel: Ereignis per WebSocket startet den Chat-Datenstrom', async () => {
  assert.equal(tokenGrant, 'client_credentials');
  const status = await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json();
  assert.equal(status.rtms.channel, 'websocket');
  assert.equal(status.rtms.eventSocket.state, 'verbunden');

  const steuerung = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=steuerung`);
  const chat = new Promise<any>((resolve, reject) => {
    steuerung.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (m.type === 'live-chat') resolve(m);
    });
    setTimeout(() => reject(new Error('Kein Chat angekommen')), 5000);
  });
  await new Promise((r) => steuerung.on('open', r));
  eventSocket!.send(
    JSON.stringify({
      module: 'message',
      content: JSON.stringify({
        event: 'meeting.rtms_started',
        payload: { meeting_uuid: 'm==', rtms_stream_id: 's9', server_urls: `ws://127.0.0.1:${ZOOM_PORT}/signaling` },
      }),
    }),
  );
  const m = await chat;
  assert.equal(m.messages[0].text, 'Wien');
  steuerung.close();
  void heartbeat;
});
