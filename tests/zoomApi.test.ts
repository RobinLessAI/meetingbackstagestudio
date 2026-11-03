// Prüft Anmeldung bei Zoom und den Start per Meeting-Link gegen nachgebildete Zoom-Dienste.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { parseAuthCode, parseMeetingId } from '../server/zoomApi.mjs';

const PORT = 4397;
const ZOOM_PORT = 4398;
const dir = mkdtempSync(join(tmpdir(), 'mb-api-'));
let proc: ChildProcess;
let zoom: http.Server;
const seen: { tokenBody?: URLSearchParams; patch?: { url: string; auth: string; body: any } } = {};

before(async () => {
  zoom = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/oauth/token') {
        seen.tokenBody = new URLSearchParams(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'user-tok', refresh_token: 'ref', expires_in: 3600, scope: 'meeting:update:participant_rtms_app_status' }));
      } else if (req.url === '/v2/users/me') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'U1' }));
      } else if (req.method === 'PATCH') {
        seen.patch = { url: req.url ?? '', auth: String(req.headers.authorization), body: JSON.parse(body) };
        res.writeHead(204).end();
      } else res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => zoom.listen(ZOOM_PORT, '127.0.0.1', r));
  const env = join(dir, '.env.local');
  writeFileSync(env, 'ZOOM_CLIENT_ID=cid\nZOOM_CLIENT_SECRET=cs\nZOOM_WEBHOOK_SECRET_TOKEN=t\nZOOM_REDIRECT_URI=https://example.org/zoom\n');
  proc = spawn(process.execPath, ['server/server.mjs'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      MB_DATA_DIR: dir,
      MB_ENV_FILE: env,
      MB_ZOOM_OAUTH_BASE: `http://127.0.0.1:${ZOOM_PORT}/oauth`,
      MB_ZOOM_API_URL: `http://127.0.0.1:${ZOOM_PORT}/v2`,
    },
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

test('Meeting-ID und Code aus eingefügten Adressen lesen', () => {
  assert.equal(parseMeetingId('https://us02web.zoom.us/j/81234567890?pwd=abc'), '81234567890');
  assert.equal(parseMeetingId('812 3456 7890'), '81234567890');
  assert.equal(parseMeetingId('https://zoom.us/wc/join/123456789'), '123456789');
  assert.equal(parseMeetingId('hallo'), '');
  assert.equal(parseAuthCode('https://example.org/zoom?code=AbC_123-xyz.987'), 'AbC_123-xyz.987');
  assert.equal(parseAuthCode('https://example.org/zoom'), '');
});

test('Verbinden mit Zoom und Start des Chat-Datenstroms per Meeting-Link', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=steuerung`);
  const results: any[] = [];
  const next = (type: string) =>
    new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Keine Antwort ${type}`)), 4000);
      const on = (d: WebSocket.RawData) => {
        const m = JSON.parse(String(d));
        if (m.type === type) {
          clearTimeout(t);
          ws.off('message', on);
          resolve(m);
        }
      };
      ws.on('message', on);
    });
  await new Promise((r) => ws.on('open', r));

  ws.send(JSON.stringify({ type: 'zoom-auth-url' }));
  const auth = await next('zoom-auth-url');
  assert.match(auth.url, /\/oauth\/authorize\?response_type=code&client_id=cid&redirect_uri=https%3A%2F%2Fexample\.org%2Fzoom/);

  ws.send(JSON.stringify({ type: 'zoom-connect', input: 'https://example.org/zoom?code=CODE12345678' }));
  results.push(await next('zoom-result'));
  assert.equal(results[0].ok, true);
  assert.equal(seen.tokenBody?.get('grant_type'), 'authorization_code');
  assert.equal(seen.tokenBody?.get('redirect_uri'), 'https://example.org/zoom');
  assert.ok(existsSync(join(dir, 'zoom-anmeldung.json')));

  ws.send(JSON.stringify({ type: 'rtms-start', meeting: 'https://zoom.us/j/81234567890?pwd=x' }));
  results.push(await next('zoom-result'));
  assert.equal(results[1].ok, true);
  assert.equal(seen.patch?.url, '/v2/live_meetings/81234567890/rtms_app/status');
  assert.equal(seen.patch?.auth, 'Bearer user-tok');
  assert.deepEqual(seen.patch?.body, { action: 'start', settings: { client_id: 'cid', participant_user_id: 'U1' } });

  ws.send(JSON.stringify({ type: 'rtms-start', meeting: 'kein link' }));
  const bad = await next('zoom-result');
  assert.equal(bad.ok, false);
  ws.close();
});
