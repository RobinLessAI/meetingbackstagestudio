// Web-Modus: Kundenkonten, Freischaltung, Trennung der Konten, Sperre, Passwort, Schutz gegen Durchprobieren.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 4431;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'mb-web-'));
let proc: ChildProcess;

before(async () => {
  proc = spawn(process.execPath, ['server/server.mjs'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      MB_WEB: '1',
      MB_PUBLIC_URL: `http://localhost:${PORT}`,
      MB_ADMIN_EMAILS: 'chef@example.org',
      MB_DATA_DIR: dir,
      MB_ENV_FILE: join(dir, 'keine.env'),
      ZOOM_CLIENT_ID: 'cid',
      ZOOM_CLIENT_SECRET: 'cs',
    },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/status`)).ok) return;
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

const post = (path: string, body: unknown, cookie = '', extra: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, ...extra }, body: JSON.stringify(body), redirect: 'manual' });
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];
/** Letzten Link einer Art aus dem Mail-Protokoll holen. */
function lastLink(kind: 'bestaetigen' | 'passwort', to: string): string {
  const mails = readFileSync(join(dir, 'web', 'mails.log'), 'utf8').split('--- ').filter((m) => m.includes(`An: ${to}`));
  const pattern = kind === 'bestaetigen' ? /\/api\/konto\/bestaetigen\?token=([\w-]+)/ : /\/\?passwort=([\w-]+)/;
  const hit = mails.reverse().map((m) => m.match(pattern)).find(Boolean);
  assert.ok(hit, `kein ${kind}-Link für ${to}`);
  return hit![1];
}

async function registerAndVerify(email: string) {
  assert.equal((await post('/api/konto/registrieren', { email, passwort: 'sehr-geheim-123', name: email.split('@')[0] })).status, 200);
  const res = await fetch(`${BASE}/api/konto/bestaetigen?token=${lastLink('bestaetigen', email)}`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  return res.headers.get('location');
}
async function login(email: string, passwort = 'sehr-geheim-123') {
  const res = await post('/api/konto/anmelden', { email, passwort });
  return { res, cookie: cookieOf(res), body: await res.json() };
}

function socket(rolle: string, cookie = '', k = '') {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/sync?rolle=${rolle}${k ? `&k=${k}` : ''}`, { headers: cookie ? { cookie } : {} });
  const msgs: any[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
  const opened = new Promise<boolean>((resolve) => {
    ws.on('open', () => resolve(true));
    ws.on('error', () => resolve(false));
  });
  const next = (type: string, ms = 3000) =>
    new Promise<any>((resolve, reject) => {
      const found = msgs.find((m) => m.type === type);
      if (found) return resolve(found);
      const t = setTimeout(() => reject(new Error(`keine Nachricht ${type}`)), ms);
      ws.on('message', (d) => {
        const m = JSON.parse(String(d));
        if (m.type === type) {
          clearTimeout(t);
          resolve(m);
        }
      });
    });
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  return { ws, msgs, opened, next, closed, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

let admin = '';
let anna = '';
let ben = '';

test('Registrierung, Bestätigung, Freischaltung durch die Verwaltung', async () => {
  assert.deepEqual(await (await fetch(`${BASE}/api/modus`)).json(), { web: true, minPasswort: 10 });
  // Zu kurzes Passwort, ungültige Adresse
  assert.equal((await post('/api/konto/registrieren', { email: 'x@example.org', passwort: 'kurz' })).status, 400);
  assert.equal((await post('/api/konto/registrieren', { email: 'keine-adresse', passwort: 'sehr-geheim-123' })).status, 400);

  // Verwaltung ist sofort aktiv, sobald bestätigt
  assert.equal(await registerAndVerify('chef@example.org'), '/?hinweis=bestaetigt');
  admin = (await login('chef@example.org')).cookie;
  assert.match(admin, /^mb_sitzung=/);
  assert.equal((await (await fetch(`${BASE}/api/konto/ich`, { headers: { cookie: admin } })).json()).user.admin, true);

  // Ohne Bestätigung keine Anmeldung
  await post('/api/konto/registrieren', { email: 'anna@example.org', passwort: 'sehr-geheim-123' });
  assert.equal((await login('anna@example.org')).body.code, 'unbestaetigt');
  await fetch(`${BASE}/api/konto/bestaetigen?token=${lastLink('bestaetigen', 'anna@example.org')}`, { redirect: 'manual' });
  // Bestätigt, aber noch nicht freigeschaltet; die Verwaltung bekommt eine Mail
  assert.equal((await login('anna@example.org')).body.code, 'wartet');
  assert.match(readFileSync(join(dir, 'web', 'mails.log'), 'utf8'), /wartet auf deine Freischaltung: anna@example\.org/);

  const konten = (await (await post('/api/verwaltung/konten', {}, admin)).json()).konten;
  const annaId = konten.find((k: any) => k.email === 'anna@example.org').id;
  // Nur die Verwaltung darf das
  assert.equal((await post('/api/verwaltung/konto', { id: annaId, aktion: 'freischalten' })).status, 403);
  assert.equal((await post('/api/verwaltung/konto', { id: annaId, aktion: 'freischalten' }, admin)).status, 200);
  const a = await login('anna@example.org');
  assert.equal(a.res.status, 200);
  anna = a.cookie;

  await registerAndVerify('ben@example.org');
  const benId = (await (await post('/api/verwaltung/konten', {}, admin)).json()).konten.find((k: any) => k.email === 'ben@example.org').id;
  await post('/api/verwaltung/konto', { id: benId, aktion: 'freischalten' }, admin);
  ben = (await login('ben@example.org')).cookie;
});

test('Konten sind getrennt: Grafiken, OBS-Adressen, Stream Deck', async () => {
  // Ohne Anmeldung keine Verbindung
  const anon = socket('steuerung');
  assert.equal(await anon.opened, false);

  const a = socket('steuerung', anna);
  const b = socket('steuerung', ben);
  assert.ok(await a.opened);
  assert.ok(await b.opened);
  const helloA = await a.next('hello');
  const helloB = await b.next('hello');
  assert.equal(helloA.konto.email, 'anna@example.org');
  assert.notEqual(helloA.ausgabeSchluessel, helloB.ausgabeSchluessel);
  assert.notEqual(helloA.aktionSchluessel, helloB.aktionSchluessel);

  // OBS-Quelle nur mit dem richtigen Schlüssel (OBS hat keine Anmeldung)
  assert.equal(await socket('ausgabe', '', 'falsch').opened, false);
  const obsA = socket('ausgabe', '', helloA.ausgabeSchluessel);
  const obsB = socket('ausgabe', '', helloB.ausgabeSchluessel);
  assert.ok(await obsA.opened);
  assert.ok(await obsB.opened);

  a.send({ type: 'snapshot', snapshot: { v: 1, title: 'Annas Workshop' } });
  assert.equal((await obsA.next('snapshot')).snapshot.title, 'Annas Workshop');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(obsB.msgs.filter((m) => m.type === 'snapshot').length, 0, 'Ben sieht Annas Grafik nicht');

  // Stream Deck: Annas Schlüssel erreicht nur Annas Steuerung
  const r = await fetch(`${BASE}/aktion/karte-anzeigen?schluessel=${helloA.aktionSchluessel}`);
  assert.equal(r.status, 200);
  assert.equal((await a.next('aktion')).id, 'karte-anzeigen');
  assert.equal(b.msgs.filter((m) => m.type === 'aktion').length, 0);
  assert.equal((await fetch(`${BASE}/aktion/karte-anzeigen?schluessel=falsch`)).status, 403);

  // Gespeichert wird ohne Chat (Datenschutz), aber mit allem anderen
  a.send({ type: 'save', state: { session: { title: 'Annas Workshop' }, chat: [{ id: 'm1', text: 'privat' }], highlightId: 'm1' } });
  await a.next('saved');
  const annaId = helloA.konto.id;
  const stored = JSON.parse(readFileSync(join(dir, 'konten', annaId, 'veranstaltung.json'), 'utf8'));
  assert.equal(stored.state.session.title, 'Annas Workshop');
  assert.deepEqual(stored.state.chat, []);

  // Neue Schlüssel: alte OBS-Adresse wird getrennt und gilt nicht mehr
  const closedObs = obsA.closed;
  a.send({ type: 'schluessel-erneuern' });
  const renewed = await a.next('schluessel');
  assert.notEqual(renewed.ausgabeSchluessel, helloA.ausgabeSchluessel);
  assert.equal(await closedObs, 4003);
  assert.equal(await socket('ausgabe', '', helloA.ausgabeSchluessel).opened, false);
  assert.ok(await socket('ausgabe', '', renewed.ausgabeSchluessel).opened);

  for (const s of [a, b, obsB]) s.ws.close();
});

test('Sperre wirkt sofort: Fenster getrennt, keine Anmeldung, OBS aus', async () => {
  const a = socket('steuerung', anna);
  const hello = await a.next('hello');
  const obs = socket('ausgabe', '', hello.ausgabeSchluessel);
  assert.ok(await obs.opened);
  const closedA = a.closed;
  const closedObs = obs.closed;
  assert.equal((await post('/api/verwaltung/konto', { id: hello.konto.id, aktion: 'sperren' }, admin)).status, 200);
  assert.equal(await closedA, 4001);
  assert.equal(await closedObs, 4001);
  assert.equal((await fetch(`${BASE}/api/konto/ich`, { headers: { cookie: anna } })).status, 401);
  assert.equal((await login('anna@example.org')).body.code, 'gesperrt');
  assert.equal(await socket('steuerung', anna).opened, false);
  assert.equal(await socket('ausgabe', '', hello.ausgabeSchluessel).opened, false);
  assert.equal((await fetch(`${BASE}/aktion/karte-anzeigen?schluessel=${hello.aktionSchluessel}`)).status, 403);
  // Entsperren: Anmeldung geht wieder
  await post('/api/verwaltung/konto', { id: hello.konto.id, aktion: 'entsperren' }, admin);
  anna = (await login('anna@example.org')).cookie;
  assert.ok(anna);
});

test('Passwort vergessen: neuer Link, altes Passwort und alte Sitzungen ungültig', async () => {
  // Gleiche Antwort für unbekannte Adressen (verrät nichts)
  assert.equal((await post('/api/konto/passwort-vergessen', { email: 'niemand@example.org' })).status, 200);
  assert.equal((await post('/api/konto/passwort-vergessen', { email: 'ben@example.org' })).status, 200);
  const token = lastLink('passwort', 'ben@example.org');
  assert.equal((await post('/api/konto/passwort-neu', { token, passwort: 'kurz' })).status, 400);
  assert.equal((await post('/api/konto/passwort-neu', { token, passwort: 'ganz-neues-passwort' })).status, 200);
  // Der Link gilt nur einmal
  assert.equal((await post('/api/konto/passwort-neu', { token, passwort: 'noch-ein-passwort' })).status, 400);
  assert.equal((await fetch(`${BASE}/api/konto/ich`, { headers: { cookie: ben } })).status, 401);
  assert.equal((await login('ben@example.org')).res.status, 401);
  assert.equal((await login('ben@example.org', 'ganz-neues-passwort')).res.status, 200);
});

test('Schutz: fremde Seiten, Durchprobieren, Abmelden', async () => {
  // Anfrage von einer fremden Seite wird abgelehnt
  assert.equal((await post('/api/konto/anmelden', { email: 'anna@example.org', passwort: 'sehr-geheim-123' }, '', { origin: 'https://boese.example' })).status, 403);
  // Ohne JSON abgelehnt
  const form = await fetch(`${BASE}/api/konto/anmelden`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=x' });
  assert.equal(form.status, 403);
  // Durchprobieren
  let status = 0;
  for (let i = 0; i < 10; i++) status = (await login('chef@example.org', `falsch-${i}-xxxxx`)).res.status;
  assert.equal(status, 429);
  // Abmelden beendet die Sitzung
  assert.equal((await post('/api/konto/abmelden', {}, anna)).status, 200);
  assert.equal((await fetch(`${BASE}/api/konto/ich`, { headers: { cookie: anna } })).status, 401);
  // Passwörter stehen nie im Klartext in der Datei
  const raw = readFileSync(join(dir, 'web', 'konten.json'), 'utf8');
  assert.ok(!raw.includes('sehr-geheim-123'));
  assert.ok(!raw.includes(anna.split('=')[1]));
});

test('Löschen entfernt Konto und Daten', async () => {
  const konten = (await (await post('/api/verwaltung/konten', {}, admin)).json()).konten;
  const annaId = konten.find((k: any) => k.email === 'anna@example.org').id;
  assert.ok(existsSync(join(dir, 'konten', annaId)));
  assert.equal((await post('/api/verwaltung/konto', { id: annaId, aktion: 'loeschen' }, admin)).status, 200);
  assert.ok(!existsSync(join(dir, 'konten', annaId)));
  assert.equal((await login('anna@example.org')).res.status, 401);
  // Die Verwaltung kann sich nicht selbst sperren
  const chefId = konten.find((k: any) => k.email === 'chef@example.org').id;
  assert.equal((await post('/api/verwaltung/konto', { id: chefId, aktion: 'sperren' }, admin)).status, 400);
});
