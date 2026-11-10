// Zoom-Konto verbinden und eigene Meetings abrufen, gegen nachgebildete Zoom-Dienste.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { normalizeMeeting, parseAuthCode } from '../server/zoomAccount.mjs';

const PORT = 4403;
const ZOOM = 4404;
const dir = mkdtempSync(join(tmpdir(), 'mb-konto-'));
let proc: ChildProcess;
let zoom: http.Server;
let scopeMissing = false;

before(async () => {
  zoom = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      if (req.url === '/oauth/token') return json(200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600, scope: 'meeting:read:list_meetings' });
      if (req.headers.authorization !== 'Bearer tok') return json(401, { message: 'Invalid token' });
      if (req.url?.startsWith('/v2/users/me/meetings')) {
        if (scopeMissing) return json(400, { code: 4711, message: 'Invalid access token, does not contain scopes:[meeting:read:list_meetings]' });
        return json(200, {
          meetings: [
            { id: 81111111111, topic: 'Einmal-Workshop', type: 2, start_time: '2026-12-01T09:00:00Z', join_url: 'https://zoom.us/j/81111111111?pwd=a' },
            { id: 82222222222, topic: 'Montagsrunde', type: 8, start_time: '2026-11-16T08:00:00Z', join_url: 'https://zoom.us/j/82222222222?pwd=b' },
          ],
          next_page_token: '',
        });
      }
      if (req.url === '/v2/users/me') return json(200, { pmi: 3333333333, personal_meeting_url: 'https://zoom.us/j/3333333333' });
      json(404, {});
    });
  });
  await new Promise<void>((r) => zoom.listen(ZOOM, '127.0.0.1', r));
  const env = join(dir, '.env.local');
  writeFileSync(env, 'ZOOM_CLIENT_ID=cid\nZOOM_CLIENT_SECRET=cs\nZOOM_REDIRECT_URI=https://example.org/zoom\n');
  proc = spawn(process.execPath, ['server/server.mjs'], {
    env: { ...process.env, PORT: String(PORT), MB_DATA_DIR: dir, MB_ENV_FILE: env, MB_ZOOM_OAUTH_BASE: `http://127.0.0.1:${ZOOM}/oauth`, MB_ZOOM_API_URL: `http://127.0.0.1:${ZOOM}/v2` },
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

test('Hilfsfunktionen', () => {
  assert.equal(parseAuthCode('https://example.org/zoom?code=AbC_123-xyz.987'), 'AbC_123-xyz.987');
  assert.equal(normalizeMeeting({ id: 1, topic: 'X', type: 3 }).recurring, true);
  assert.equal(normalizeMeeting({ id: 5, type: 2 }).link, 'https://zoom.us/j/5');
});

test('Konto verbinden, Meetings mit wiederkehrenden und persönlichem Raum abrufen', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=steuerung`);
  const next = (type: string) =>
    new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`keine Antwort ${type}`)), 4000);
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
  assert.match((await next('zoom-auth-url')).url, /oauth\/authorize\?response_type=code&client_id=cid/);

  ws.send(JSON.stringify({ type: 'zoom-connect', input: 'https://example.org/zoom?code=CODE123456' }));
  assert.equal((await next('zoom-result')).ok, true);
  assert.ok(existsSync(join(dir, 'zoom-anmeldung.json')));

  ws.send(JSON.stringify({ type: 'zoom-meetings' }));
  const list = await next('zoom-meetings');
  assert.equal(list.ok, true);
  assert.deepEqual(list.meetings.map((m: any) => m.topic), ['Persönlicher Meetingraum', 'Montagsrunde', 'Einmal-Workshop']);
  assert.equal(list.meetings[1].recurring, true);

  scopeMissing = true;
  ws.send(JSON.stringify({ type: 'zoom-meetings' }));
  const err = await next('zoom-meetings');
  assert.equal(err.ok, false);
  assert.match(err.error, /meeting:read:list_meetings/);
  ws.close();
});
