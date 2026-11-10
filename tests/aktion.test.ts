// Fernsteuerung (Stream Deck) über /aktion/… und Programm-Vorschau als eigene Rolle.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 4401;
const dir = mkdtempSync(join(tmpdir(), 'mb-aktion-'));
let proc: ChildProcess;

const open = (rolle: string) =>
  new Promise<{ ws: WebSocket; messages: any[] }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=${rolle}`);
    const messages: any[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(String(d))));
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  const env = join(dir, '.env.local');
  writeFileSync(env, '');
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
    await wait(100);
  }
  throw new Error('Server startet nicht');
});

after(() => {
  proc.kill();
  rmSync(dir, { recursive: true, force: true });
});

test('Aktionen brauchen den Schlüssel und gehen an genau eine Steuerung', async () => {
  const key = readFileSync(join(dir, 'aktion-schluessel.txt'), 'utf8').trim();
  assert.match(key, /^[a-f0-9]{10}$/);

  const none = await fetch(`http://127.0.0.1:${PORT}/aktion/karte-anzeigen?schluessel=${key}`);
  assert.equal(none.status, 409);

  const a = await open('steuerung');
  const b = await open('steuerung');
  await wait(100);
  assert.equal(b.messages.find((m) => m.type === 'hello')?.aktionSchluessel, key);

  assert.equal((await fetch(`http://127.0.0.1:${PORT}/aktion/karte-anzeigen`)).status, 403);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/aktion/karte-anzeigen?schluessel=falsch`)).status, 403);
  const ok = await fetch(`http://127.0.0.1:${PORT}/aktion/karte-anzeigen?schluessel=${key}`);
  assert.equal(ok.status, 200);
  await wait(100);
  const got = [a, b].map((c) => c.messages.filter((m) => m.type === 'aktion').map((m) => m.id));
  assert.deepEqual(got, [[], ['karte-anzeigen']]);
  a.ws.close();
  b.ws.close();
});

test('Programm-Vorschau erhält Momentaufnahmen, zählt aber nicht als OBS-Quelle', async () => {
  const s = await open('steuerung');
  const v = await open('vorschau');
  await wait(100);
  s.ws.send(JSON.stringify({ type: 'snapshot', snapshot: { v: 1, test: true } }));
  await wait(150);
  assert.ok(v.messages.some((m) => m.type === 'snapshot' && m.snapshot.test));
  const status = await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json();
  assert.equal(status.ausgaben, 0);
  s.ws.close();
  v.ws.close();
});

test('Eigene Vorlagen werden gespeichert, geprüft und an alle Steuerungen verteilt', async () => {
  const a = await open('steuerung');
  const b = await open('steuerung');
  await wait(100);
  a.ws.send(
    JSON.stringify({
      type: 'vorlagen',
      vorlagen: [
        { id: 'v1', name: 'Kunde Hell', kind: 'umfrage', data: { barColor: '#ff0000' }, at: 1 },
        { id: 'kaputt', kind: 'umfrage' },
      ],
    }),
  );
  await wait(200);
  const got = b.messages.filter((m) => m.type === 'vorlagen').pop();
  assert.deepEqual(got.vorlagen.map((t: any) => t.name), ['Kunde Hell']);
  const file = JSON.parse(readFileSync(join(dir, 'vorlagen.json'), 'utf8'));
  assert.equal(file[0].data.barColor, '#ff0000');
  const c = await open('steuerung');
  await wait(100);
  assert.equal(c.messages.find((m) => m.type === 'hello').vorlagen[0].name, 'Kunde Hell');
  [a, b, c].forEach((x) => x.ws.close());
});
