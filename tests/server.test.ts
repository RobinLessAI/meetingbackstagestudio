import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 4391;
const dataDir = mkdtempSync(join(tmpdir(), 'mb-daten-'));
const zoomDir = mkdtempSync(join(tmpdir(), 'mb-zoom-'));
let proc: ChildProcess;

const connect = (rolle: string) =>
  new Promise<{ ws: WebSocket; next: (type: string) => Promise<any> }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=${rolle}`);
    const queue: any[] = [];
    const waiters: Array<{ type: string; resolve: (m: any) => void }> = [];
    ws.on('message', (d) => {
      const msg = JSON.parse(String(d));
      const i = waiters.findIndex((w) => w.type === msg.type);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else queue.push(msg);
    });
    const next = (type: string) =>
      new Promise<any>((res, rej) => {
        const i = queue.findIndex((m) => m.type === type);
        if (i >= 0) return res(queue.splice(i, 1)[0]);
        waiters.push({ type, resolve: res });
        setTimeout(() => rej(new Error(`Zeitüberschreitung beim Warten auf ${type}`)), 5000);
      });
    ws.on('open', () => resolve({ ws, next }));
    ws.on('error', reject);
  });

before(async () => {
  proc = spawn(process.execPath, ['server/server.mjs'], {
    env: { ...process.env, PORT: String(PORT), MB_DATA_DIR: dataDir },
    stdio: 'pipe',
  });
  // Warten, bis der Server Verbindungen annimmt
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/status`);
      if (r.ok) return;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht');
});

after(() => {
  proc.kill();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(zoomDir, { recursive: true, force: true });
});

test('Server leitet Momentaufnahmen von der Steuerung an OBS-Ausgaben weiter', async () => {
  const steuerung = await connect('steuerung');
  const hello = await steuerung.next('hello');
  assert.equal(hello.saved, null);
  const ausgabe = await connect('ausgabe');
  // Die erste Meldung stammt noch aus der Zeit vor dem Verbinden der Ausgabe.
  let clients = await steuerung.next('clients');
  while (clients.ausgaben < 1) clients = await steuerung.next('clients');
  assert.equal(clients.ausgaben, 1);
  steuerung.ws.send(JSON.stringify({ type: 'snapshot', snapshot: { v: 1, title: 'Test' } }));
  const snap = await ausgabe.next('snapshot');
  assert.equal(snap.snapshot.title, 'Test');
  // Später verbundene Ausgaben bekommen sofort den letzten Stand
  const spaet = await connect('ausgabe');
  assert.equal((await spaet.next('snapshot')).snapshot.title, 'Test');
  steuerung.ws.close();
  ausgabe.ws.close();
  spaet.ws.close();
});

test('Server speichert den Stand und meldet ihn beim nächsten Verbinden', async () => {
  const a = await connect('steuerung');
  await a.next('hello');
  a.ws.send(JSON.stringify({ type: 'save', state: { session: { title: 'Gespeichert' } } }));
  const saved = await a.next('saved');
  assert.ok(saved.savedAt > 0);
  assert.ok(existsSync(join(dataDir, 'veranstaltung.json')));
  assert.equal(JSON.parse(readFileSync(join(dataDir, 'veranstaltung.json'), 'utf8')).state.session.title, 'Gespeichert');
  a.ws.close();
  const b = await connect('steuerung');
  const hello = await b.next('hello');
  assert.equal(hello.saved.state.session.title, 'Gespeichert');
  b.ws.close();
});

test('Server meldet neu gespeicherte Zoom-Chat-Dateien im beobachteten Ordner', async () => {
  const s = await connect('steuerung');
  await s.next('hello');
  s.ws.send(JSON.stringify({ type: 'chat-watch', folder: zoomDir }));
  const status = await s.next('watch-status');
  assert.equal(status.active, true);
  const meeting = join(zoomDir, '2026-11-03 10.00.00 Workshop');
  mkdirSync(meeting);
  writeFileSync(join(meeting, 'meeting_saved_chat.txt'), '10:01:51 From Lea to Everyone:\n\tBerlin\n');
  const file = await s.next('chat-file');
  assert.match(file.content, /Berlin/);
  s.ws.send(JSON.stringify({ type: 'chat-watch-stop' }));
  s.ws.close();
});

test('Server lehnt Verbindungen von fremden Seiten ab', async () => {
  await assert.rejects(
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=steuerung`, { headers: { Origin: 'https://example.com' } });
      ws.on('open', resolve);
      ws.on('error', reject);
    }),
  );
});
