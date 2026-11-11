// Spotlight in Zoom: Teilnehmerliste aus dem Regie-Fenster, Plätze per Name, Befehle über den Server an die Regie.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { normalizeAttendees, spotlightError } from '../server/meetingSdk.mjs';
import { findPerson, nextRaisedHand } from '../src/lib/spotlight.ts';
import type { ZoomPerson } from '../src/sync/SyncProvider.tsx';

const PORT = 4421;
const dir = mkdtempSync(join(tmpdir(), 'mb-spotlight-'));
let proc: ChildProcess;

before(async () => {
  const env = join(dir, '.env.local');
  writeFileSync(env, 'ZOOM_CLIENT_ID=cid\nZOOM_CLIENT_SECRET=cs\n');
  proc = spawn(process.execPath, ['server/server.mjs'], { env: { ...process.env, PORT: String(PORT), MB_DATA_DIR: dir, MB_ENV_FILE: env }, stdio: 'pipe' });
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

const RAW = [
  { userId: 100, userName: 'MeetingBackstage (Regie)', isHost: false, isCoHost: true, muted: true, bVideoOn: false },
  { userId: 200, userName: 'Robin Weniger', isHost: true, muted: false, bVideoOn: true },
  { userId: 300, userName: 'Anna Schulz (sie/ihr)', muted: true, bVideoOn: true, bRaiseHand: true },
  { userId: 400, userName: 'Ben', bVideoOn: false },
];
const SELF = { userId: 100, userName: 'MeetingBackstage (Regie)', isCoHost: true };

test('Teilnehmerliste: Regie wird herausgefiltert, Rolle der Regie erkannt', () => {
  const r = normalizeAttendees(RAW, SELF, [200]);
  assert.deepEqual(
    r.list.map((u: ZoomPerson) => u.name),
    ['Robin Weniger', 'Anna Schulz (sie/ihr)', 'Ben'],
  );
  assert.equal(r.role, 'cohost');
  assert.deepEqual(r.spotlight, [200]);
  assert.equal(r.list[1].hand, true);
  assert.equal(r.list[2].video, false);
  assert.equal(normalizeAttendees(RAW, { userId: 100 }, null).role, 'teilnehmer');
  assert.equal(normalizeAttendees(RAW, { userId: 100 }, null).spotlightKnown, false);
  assert.match(spotlightError('x', 1, 'teilnehmer'), /Co-Host/);
});

test('Plätze finden Personen auch bei leicht anderem Zoom-Namen', () => {
  const list = normalizeAttendees(RAW, SELF, []).list as ZoomPerson[];
  assert.equal(findPerson(list, 'Anna')?.userId, 300);
  assert.equal(findPerson(list, 'anna schulz')?.userId, 300);
  assert.equal(findPerson(list, 'Robin Weniger')?.userId, 200);
  assert.equal(findPerson(list, 'Schulz')?.userId, 300);
  assert.equal(findPerson(list, 'Carla'), null);
  assert.equal(findPerson(list, ''), null);
});

test('Nächste Hand: die am längsten wartende ohne Spotlight', () => {
  const p = (userId: number, hand: boolean, handSince: number | null): ZoomPerson => ({ userId, name: `P${userId}`, host: false, cohost: false, video: true, muted: true, hand, handSince });
  const list = [p(1, true, 300), p(2, true, 100), p(3, false, null), p(4, true, 200)];
  assert.equal(nextRaisedHand(list, [])?.userId, 2);
  assert.equal(nextRaisedHand(list, [2])?.userId, 4);
  assert.equal(nextRaisedHand([p(3, false, null)], []), null);
});

function client(rolle: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=${rolle}`);
  const next = (type: string, ms = 4000) =>
    new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`keine Nachricht ${type}`)), ms);
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
  const open = new Promise((r) => ws.on('open', r));
  return { ws, next, open, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

test('Spotlight von der App über den Server an die Regie und zurück', async () => {
  const app = client('steuerung');
  const reg = client('regie');
  await Promise.all([app.open, reg.open]);
  reg.send({ type: 'regie-status', state: 'verbunden' });
  await app.next('regie-status');

  // Teilnehmende aus Zoom kommen in der App an.
  const people = app.next('zoom-teilnehmende');
  reg.send({ type: 'regie-teilnehmende', list: RAW, self: SELF, spotlight: [] });
  const status = (await people).status;
  assert.equal(status.list.length, 3);
  assert.equal(status.role, 'cohost');
  assert.ok(status.list.find((u: ZoomPerson) => u.userId === 300).handSince > 0);

  // App setzt Anna ins Spotlight: Regie bekommt den Befehl.
  const cmd = reg.next('regie-spotlight');
  app.send({ type: 'zoom-spotlight', userId: 300, operate: 'replace' });
  const c = await cmd;
  assert.deepEqual(c.ops, [{ operate: 'replace', userId: 300 }]);
  const done = app.next('zoom-aktion');
  reg.send({ type: 'regie-ergebnis', requestId: c.requestId, ok: true });
  const d = await done;
  assert.equal(d.ok, true);
  assert.match(d.message, /Anna Schulz/);

  // Aufheben: alle im Spotlight werden einzeln entfernt.
  reg.send({ type: 'regie-teilnehmende', list: RAW, self: SELF, spotlight: [300, 200] });
  await app.next('zoom-teilnehmende');
  const clearCmd = reg.next('regie-spotlight');
  app.send({ type: 'zoom-spotlight', userId: null });
  assert.deepEqual((await clearCmd).ops, [
    { operate: 'remove', userId: 300 },
    { operate: 'remove', userId: 200 },
  ]);

  // Zoom lehnt ab: verständliche Meldung.
  const cmd2 = reg.next('regie-spotlight');
  app.send({ type: 'zoom-spotlight', userId: 400 });
  const c2 = await cmd2;
  const fail = app.next('zoom-aktion');
  reg.send({ type: 'regie-ergebnis', requestId: c2.requestId, ok: false, error: 'not allowed', code: 1 });
  const f = await fail;
  assert.equal(f.ok, false);
  assert.match(f.message, /abgelehnt: not allowed \(1\)/);

  // Ohne Co-Host-Rolle gar nicht erst an Zoom schicken.
  reg.send({ type: 'regie-teilnehmende', list: RAW, self: { userId: 100 }, spotlight: [] });
  await app.next('zoom-teilnehmende');
  const noRole = app.next('zoom-aktion');
  app.send({ type: 'zoom-spotlight', userId: 300 });
  assert.match((await noRole).message, /Zum Co-Host machen/);

  // Regie geht: Liste wird geleert.
  const cleared = app.next('zoom-teilnehmende');
  reg.ws.close();
  assert.equal((await cleared).status.list.length, 0);
  app.ws.close();
});
