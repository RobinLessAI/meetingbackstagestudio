// Web-Modus: Kundenkonten, Freischaltung, Trennung der Konten, Sperre, Passwort, Schutz gegen Durchprobieren,
// „Mit Zoom verbinden“ (nachgebauter Zoom-Server), OBF-Token für die Regie, App-Entfernung über Zoom.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 4431;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'mb-web-'));
let proc: ChildProcess;

// Nachgebauter Zoom-Server: Anmeldung (OAuth), /users/me, OBF-Token, Zurückziehen
const WEBHOOK_SECRET = 'webhook-geheim';
const zoomCalls: string[] = [];
const fakeZoom = http.createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    zoomCalls.push(`${req.method} ${u.pathname}${u.search}`);
    const send = (status: number, data: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    if (u.pathname === '/oauth/token') {
      const p = new URLSearchParams(body);
      if (req.headers.authorization !== `Basic ${Buffer.from('cid:cs').toString('base64')}`) return send(401, { reason: 'client' });
      if (p.get('grant_type') === 'authorization_code' && p.get('code') === 'gut' && p.get('redirect_uri') === `http://localhost:${PORT}/api/zoom/zurueck`) {
        return send(200, { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, scope: 'meeting:read:list_meetings user:read:user user:read:token' });
      }
      return send(400, { reason: 'Invalid authorization code' });
    }
    if (u.pathname === '/oauth/revoke') return send(200, { status: 'success' });
    if (req.headers.authorization !== 'Bearer at-1') return send(401, { message: 'Invalid access token.' });
    if (u.pathname === '/v2/users/me') return send(200, { id: 'zu-anna', account_id: 'acc-anna', email: 'anna@zoom.example' });
    if (u.pathname === '/v2/users/me/token' && u.searchParams.get('type') === 'onbehalf') return send(200, { token: `obf-${u.searchParams.get('meeting_id')}` });
    if (u.pathname === '/v2/users/me/meetings') return send(200, { meetings: [{ id: 81234567890, topic: 'Workshop', type: 2, start_time: '2026-12-01T10:00:00Z' }] });
    send(404, {});
  });
});

before(async () => {
  await new Promise<void>((r) => fakeZoom.listen(0, '127.0.0.1', r));
  const zoomBase = `http://127.0.0.1:${(fakeZoom.address() as AddressInfo).port}`;
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
      ZOOM_WEBHOOK_SECRET_TOKEN: WEBHOOK_SECRET,
      MB_ZOOM_OAUTH_BASE: `${zoomBase}/oauth`,
      MB_ZOOM_API_URL: `${zoomBase}/v2`,
      MB_MAIN_DOMAIN: 'mb.test',
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
  fakeZoom.closeAllConnections();
  fakeZoom.close();
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
  assert.deepEqual(await (await fetch(`${BASE}/api/modus`)).json(), { web: true, minPasswort: 10, hauptseite: 'https://mb.test', slides: 'https://slide.mb.test', studio: `http://localhost:${PORT}` });
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
  assert.match(readFileSync(join(dir, 'web', 'mails.log'), 'utf8'), /Betreff: Neues Konto wartet auf Freischaltung[\s\S]*anna@example\.org/);

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

/** Ereignis so signieren, wie Zoom es tut. */
function zoomEvent(body: unknown, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex')}`;
  return fetch(`${BASE}/api/zoom/ereignis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-zm-request-timestamp': ts, 'x-zm-signature': sig },
    body: raw,
  });
}

test('Mit Zoom verbinden: Weiterleitung, Rückkehr, OBF-Token für die Regie, App-Entfernung', async () => {
  // Ohne Anmeldung zurück zur Startseite
  assert.equal((await fetch(`${BASE}/api/zoom/verbinden`, { redirect: 'manual' })).headers.get('location'), '/');

  const start = await fetch(`${BASE}/api/zoom/verbinden`, { headers: { cookie: anna }, redirect: 'manual' });
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get('location')!);
  assert.match(authorize.pathname, /\/oauth\/authorize$/);
  assert.equal(authorize.searchParams.get('client_id'), 'cid');
  assert.equal(authorize.searchParams.get('redirect_uri'), `http://localhost:${PORT}/api/zoom/zurueck`);
  const state = authorize.searchParams.get('state')!;
  assert.ok(state.length >= 20);

  const back = (q: string, cookie = anna) => fetch(`${BASE}/api/zoom/zurueck?${q}`, { headers: { cookie }, redirect: 'manual' });
  // Fremder state oder anderes Konto: abgelehnt, und der state ist danach verbraucht
  assert.equal((await back('code=gut&state=erfunden')).headers.get('location'), '/?zoom=abgelaufen');
  assert.equal((await back(`code=gut&state=${state}`, admin)).headers.get('location'), '/?zoom=abgelaufen');
  assert.equal((await back(`code=gut&state=${state}`)).headers.get('location'), '/?zoom=abgelaufen');

  // Richtiger Ablauf
  const state2 = new URL((await fetch(`${BASE}/api/zoom/verbinden`, { headers: { cookie: anna }, redirect: 'manual' })).headers.get('location')!).searchParams.get('state')!;
  assert.equal((await back(`code=gut&state=${state2}`)).headers.get('location'), '/?zoom=verbunden');
  const a = socket('steuerung', anna);
  const hello = await a.next('hello');
  assert.equal(hello.regie.account.connected, true);
  assert.equal(hello.regie.account.email, 'anna@zoom.example');
  const annaId = hello.konto.id;
  const tokenFile = join(dir, 'konten', annaId, 'zoom-anmeldung.json');
  assert.equal(JSON.parse(readFileSync(tokenFile, 'utf8')).zoomUserId, 'zu-anna');

  // Meetings aus dem verbundenen Konto
  a.send({ type: 'zoom-meetings' });
  assert.equal((await a.next('zoom-meetings')).meetings[0].topic, 'Workshop');

  // Regie bekommt ein OBF-Token für genau dieses Meeting
  const r = socket('regie', anna);
  assert.ok(await r.opened);
  r.send({ type: 'regie-hello', meeting: 'https://zoom.us/j/81234567890?pwd=abc' });
  const joinData = (await r.next('regie-join')).join;
  assert.equal(joinData.obfToken, 'obf-81234567890');
  assert.ok(zoomCalls.some((c) => c === 'GET /v2/users/me/token?type=onbehalf&meeting_id=81234567890'));

  // Zoom-Ereignisse: falsche Signatur abgelehnt, Adressprüfung beantwortet
  assert.equal((await zoomEvent({ event: 'app_deauthorized', payload: { user_id: 'zu-anna' } }, 'falsch')).status, 401);
  const check = await (await zoomEvent({ event: 'endpoint.url_validation', payload: { plainToken: 'abc' } })).json();
  assert.equal(check.encryptedToken, createHmac('sha256', WEBHOOK_SECRET).update('abc').digest('hex'));

  // App bei Zoom entfernt: Anmeldung weg, Steuerung erfährt es sofort
  assert.equal((await zoomEvent({ event: 'app_deauthorized', payload: { user_id: 'zu-anna', account_id: 'acc-anna' } })).status, 200);
  await new Promise((res) => setTimeout(res, 200));
  assert.ok(!existsSync(tokenFile));
  const last = a.msgs.filter((m) => m.type === 'regie-status').at(-1);
  assert.equal(last.status.account.connected, false);

  // Erneut verbinden (für den Lösch-Test: dort wird die Anmeldung bei Zoom zurückgezogen)
  const state3 = new URL((await fetch(`${BASE}/api/zoom/verbinden`, { headers: { cookie: anna }, redirect: 'manual' })).headers.get('location')!).searchParams.get('state')!;
  assert.equal((await back(`code=gut&state=${state3}`)).headers.get('location'), '/?zoom=verbunden');
  // Abgebrochen bei Zoom
  const state4 = new URL((await fetch(`${BASE}/api/zoom/verbinden`, { headers: { cookie: anna }, redirect: 'manual' })).headers.get('location')!).searchParams.get('state')!;
  assert.equal((await back(`error=access_denied&state=${state4}`)).headers.get('location'), '/?zoom=abgebrochen');
  for (const s of [a, r]) s.ws.close();
});

test('Website: nur die Verwaltung bearbeitet, Veröffentlichen, Bilder, Vorschau, Auslieferung', async () => {
  // fetch überschreibt den Host-Header, daher http.request
  const site = (path: string, host = 'mb.test') =>
    new Promise<{ status: number; headers: { get: (k: string) => string | null }; text: () => Promise<string> }>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port: PORT, path, headers: { host } }, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (body += c));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: { get: (k: string) => (res.headers[k.toLowerCase()] as string | undefined) ?? null },
              text: async () => body,
            }),
          );
        })
        .on('error', reject);
    });
  const call = (path: string, method: string, cookie: string, body?: unknown, extra: Record<string, string> = {}) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  // Hauptseite ist ohne Anmeldung erreichbar, www leitet um, 404 hat eine eigene Seite
  const home = await site('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Dein Zoom-Chat wird zur <em>Live-Grafik<\/em>/);
  assert.equal((await site('/hilfe/', 'www.mb.test')).headers.get('location'), 'https://mb.test/hilfe/');
  assert.equal((await site('/hilfe')).headers.get('location'), '/hilfe/');
  assert.equal((await site('/gibt-es-nicht/')).status, 404);
  assert.equal((await site('/_web/site.css')).status, 200);

  // Nur die Verwaltung darf an die Verwaltung der Website
  assert.equal((await call('/api/website', 'GET', '')).status, 403);
  assert.equal((await call('/api/website', 'GET', anna)).status, 403);
  const state = await (await call('/api/website', 'GET', admin)).json();
  assert.equal(state.entwurf.seiten[0].pfad, '/');

  // Entwurf: eingeschleuster Code wird entfernt, neue Seite angelegt
  const draft = structuredClone(state.entwurf);
  draft.seiten.push({
    id: 'p1',
    pfad: '/preise/',
    name: 'Preise',
    titel: 'Preise',
    seoTitel: '',
    beschreibung: 'Unsere Preise',
    vorschaubild: '',
    indexieren: true,
    bloecke: [{ id: 'b1', typ: 'text', html: '<h2>Pakete</h2><script>alert(1)</script><p><a href="javascript:alert(1)">x</a></p>', inhaltsverzeichnis: false }],
  });
  assert.equal((await call('/api/website/entwurf', 'PUT', admin, { ...draft, seiten: [...draft.seiten, { ...draft.seiten[1], id: 'z' }] })).status, 400, 'doppelte Adresse');
  assert.equal((await call('/api/website/entwurf', 'PUT', admin, draft, { origin: 'https://boese.example' })).status, 403);
  const saved = await (await call('/api/website/entwurf', 'PUT', admin, draft)).json();
  assert.equal(saved.geaendert, true);
  // Vor dem Veröffentlichen ist die Seite nicht öffentlich, aber in der Vorschau sichtbar
  assert.equal((await site('/preise/')).status, 404);
  const preview = await (await call('/api/website/vorschau?pfad=%2Fpreise%2F', 'GET', admin)).text();
  assert.match(preview, /Pakete/);
  assert.match(preview, /noindex/);
  assert.equal((await call('/api/website/vorschau?pfad=%2F', 'GET', anna)).status, 403);

  // Veröffentlichen
  const pub = await (await call('/api/website/veroeffentlichen', 'POST', admin, {})).json();
  assert.equal(pub.geaendert, false);
  assert.equal(pub.versionen.length, 1);
  const live = await (await site('/preise/')).text();
  assert.match(live, /<h2 id="pakete">Pakete<\/h2>/);
  assert.doesNotMatch(live, /<script>alert|javascript:/);
  assert.match(live, /<title>Preise · MeetingBackstage<\/title>/);
  assert.match(await (await site('/sitemap.xml')).text(), /https:\/\/mb\.test\/preise\//);

  // Bilder: PNG wird angenommen und harmlos ausgeliefert, SVG mit Skript abgelehnt
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const up = await call('/api/website/medien', 'POST', admin, undefined, { 'Content-Type': 'image/png', 'X-Dateiname': encodeURIComponent('Mein Foto.png') });
  assert.equal(up.status, 400, 'leere Datei');
  const up2 = await fetch(`${BASE}/api/website/medien`, { method: 'POST', headers: { cookie: admin, 'Content-Type': 'image/png', 'X-Dateiname': 'Mein%20Foto.png' }, body: png });
  const media = await up2.json();
  assert.match(media.url, /^\/_web\/medien\/mein-foto-[a-f0-9]{8}\.png$/);
  const served = await site(media.url);
  assert.equal(served.status, 200);
  assert.match(served.headers.get('content-security-policy') ?? '', /sandbox/);
  const svg = await fetch(`${BASE}/api/website/medien`, { method: 'POST', headers: { cookie: admin, 'Content-Type': 'image/svg+xml' }, body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' });
  assert.equal(svg.status, 400);
  assert.equal((await fetch(`${BASE}/api/website/medien`, { method: 'POST', headers: { cookie: admin, 'Content-Type': 'text/html' }, body: '<p>' })).status, 415);
  assert.equal((await fetch(`${BASE}/api/website/medien`, { method: 'POST', headers: { cookie: anna, 'Content-Type': 'image/png' }, body: png })).status, 403);

  // Verwendetes Bild lässt sich nicht löschen; nach dem Entfernen schon
  draft.seiten[0].vorschaubild = media.url;
  await call('/api/website/entwurf', 'PUT', admin, draft);
  const name = media.url.split('/').pop();
  assert.equal((await call(`/api/website/medien/${name}`, 'DELETE', admin)).status, 409);
  draft.seiten[0].vorschaubild = '';
  await call('/api/website/entwurf', 'PUT', admin, draft);
  assert.equal((await call(`/api/website/medien/${name}`, 'DELETE', admin)).status, 200);
  assert.equal((await site(media.url)).status, 404);

  // Frühere Fassung zurückholen und verwerfen
  const restored = await (await call('/api/website/wiederherstellen', 'POST', admin, { id: pub.versionen[0].id })).json();
  assert.ok(restored.entwurf.seiten.some((p: { pfad: string }) => p.pfad === '/preise/'));
  assert.equal((await call('/api/website/wiederherstellen', 'POST', admin, { id: '../x' })).status, 404);
});

test('E-Mail-Vorlagen: nur die Verwaltung, eigene Texte werden verschickt', async () => {
  const call = (path: string, method: string, cookie: string, body?: unknown) =>
    fetch(`${BASE}${path}`, { method, headers: { cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal((await call('/api/website/mails', 'GET', anna)).status, 403);
  const state = await (await call('/api/website/mails', 'GET', admin)).json();
  assert.deepEqual(state.katalog.map((k: { id: string }) => k.id), ['bestaetigen', 'passwort', 'freigeschaltet', 'neuesKonto']);
  assert.deepEqual(state.eigene, []);
  // Vorschau mit ungespeicherter Fassung
  const pv = await (await call('/api/website/mails/vorschau', 'POST', admin, { id: 'passwort', vorlage: { ...state.vorlagen.passwort, betreff: 'Hallo {{name}}' } })).json();
  assert.match(pv.subject, /^Hallo /);
  assert.match(pv.html, /<table/);
  // Eigene Vorlage speichern (mit eingeschleustem Skript)
  const vorlagen = { ...state.vorlagen, passwort: { betreff: 'Eigenes Passwort-Thema für {{email}}', ueberschrift: 'Los gehts', inhalt: '<p>Servus {{name}}!</p><script>alert(1)</script>', knopf: 'Jetzt ändern' } };
  const saved = await (await call('/api/website/mails', 'PUT', admin, { vorlagen, fuss: 'Grüße aus Werl' })).json();
  assert.deepEqual(saved.eigene, ['passwort']);
  assert.doesNotMatch(JSON.stringify(saved.vorlagen.passwort), /script/);
  // Testmail landet im Protokoll (ohne Versanddienst)
  assert.equal((await call('/api/website/mails/test', 'POST', admin, { id: 'passwort' })).status, 200);
  assert.match(readFileSync(join(dir, 'web', 'mails.log'), 'utf8'), /Betreff: \[Test\] Eigenes Passwort-Thema für chef@example\.org/);
  // Echter Ablauf nutzt die eigene Vorlage
  await post('/api/konto/passwort-vergessen', { email: 'anna@example.org' });
  const log = readFileSync(join(dir, 'web', 'mails.log'), 'utf8');
  assert.match(log, /Betreff: Eigenes Passwort-Thema für anna@example\.org[\s\S]*Jetzt ändern:\nhttp:\/\/localhost:\d+\/\?passwort=[\w-]+[\s\S]*Grüße aus Werl/);
  // Zurück auf Standard
  const reset = await (await call('/api/website/mails', 'PUT', admin, { vorlagen: Object.fromEntries(state.katalog.map((k: { id: string; standard: unknown }) => [k.id, k.standard])), fuss: state.standardFuss })).json();
  assert.deepEqual(reset.eigene, []);
});

test('Rollen: Bereiche je Rolle, Zuweisung, gesperrtes Spotlight, feste Admins', async () => {
  const me = async (cookie: string) => (await (await fetch(`${BASE}/api/konto/ich`, { headers: { cookie } })).json()).rechte;
  // Standard: Rolle „Nutzer“ mit allen Bereichen; Admin sieht zusätzlich Verwaltung und Website
  assert.equal((await me(anna)).rolleName, 'Nutzer');
  assert.ok((await me(admin)).bereiche.includes('website'));
  const konten = await (await post('/api/verwaltung/konten', {}, admin)).json();
  assert.ok(konten.konten.find((k: { email: string }) => k.email === 'chef@example.org').festAdmin);
  // Neue Rolle „Basis“ ohne Spotlight und Glücksrad, gesperrte Bereiche sichtbar
  const alle = konten.rollen.bereiche.map((b: { id: string }) => b.id);
  const rollen = [
    ...konten.rollen.rollen,
    { id: 'basis', name: 'Basis', bereiche: alle.filter((b: string) => b !== 'spotlight' && b !== 'grafik:gluecksrad'), gesperrteZeigen: true, hinweis: 'Gibt es in Pro.' },
  ];
  assert.equal((await post('/api/verwaltung/rollen', { rollen: [{ id: 'x', name: 'Admin', bereiche: [] }] }, admin)).status, 400);
  assert.equal((await post('/api/verwaltung/rollen', { rollen, standard: 'nutzer' }, anna)).status, 403);
  assert.equal((await post('/api/verwaltung/rollen', { rollen, standard: 'nutzer' }, admin)).status, 200);
  const annaId = konten.konten.find((k: { email: string }) => k.email === 'anna@example.org').id;
  const a = socket('steuerung', anna);
  await a.next('hello');
  assert.equal((await post('/api/verwaltung/konto', { id: annaId, aktion: 'rolle', rolle: 'gibt-es-nicht' }, admin)).status, 400);
  assert.equal((await post('/api/verwaltung/konto', { id: annaId, aktion: 'rolle', rolle: 'basis' }, admin)).status, 200);
  await a.next('rechte'); // offene Steuerung wird informiert
  const r = await me(anna);
  assert.equal(r.rolleName, 'Basis');
  assert.ok(!r.bereiche.includes('spotlight'));
  assert.equal(r.hinweis, 'Gibt es in Pro.');
  // Spotlight-Befehl wird vom Server abgelehnt
  a.send({ type: 'zoom-spotlight', userId: 1 });
  assert.match((await a.next('zoom-aktion')).message, /nicht enthalten/);
  // Fest eingerichtete Admins bleiben Admin; das eigene Konto lässt sich nicht ändern
  const chefId = konten.konten.find((k: { email: string }) => k.email === 'chef@example.org').id;
  assert.equal((await post('/api/verwaltung/konto', { id: chefId, aktion: 'rolle', rolle: 'basis' }, admin)).status, 400);
  // Zum Admin machen und zurück
  assert.equal((await post('/api/verwaltung/konto', { id: annaId, aktion: 'rolle', rolle: 'admin' }, admin)).status, 200);
  assert.equal((await me(anna)).rolle, 'admin');
  assert.equal((await post('/api/verwaltung/konto', { id: annaId, aktion: 'rolle', rolle: 'nutzer' }, admin)).status, 200);
  assert.equal((await me(anna)).rolleName, 'Nutzer');
  a.ws.close();
});

test('Slides: Folien je Konto, feste OBS-Adressen mit Live-Aktualisierung, Kanal, Medien', async () => {
  const call = (path: string, method: string, cookie: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${BASE}${path}`, { method, headers: { cookie, ...(body === undefined || body instanceof Buffer ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body) });
  const host = (path: string, h: string) =>
    new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: PORT, path, headers: { host: h } }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      }).on('error', reject);
    });
  // Ohne Anmeldung kein Zugriff
  assert.equal((await call('/api/slides', 'GET', '')).status, 401);
  const st = await (await call('/api/slides', 'GET', anna)).json();
  assert.deepEqual(st.folien, []);
  assert.equal(st.basis, 'https://slide.mb.test');
  // Folie anlegen: Felder werden gefiltert (Farben, Schriften, fremde Bildadressen)
  const created = await (await call('/api/slides', 'POST', anna, {
    name: 'Bauchbinde',
    hintergrund: { typ: 'farbe', color: 'red; background:url(x)' },
    elemente: [
      { typ: 'text', text: '<script>alert(1)</script>Hallo', font: 'Comic Sans', size: 99999, color: '#abcdef' },
      { typ: 'bild', src: 'https://evil.example/x.png' },
      { typ: 'unbekannt' },
    ],
  })).json();
  const f = created.folie;
  assert.equal(f.hintergrund.color, '#11243c');
  assert.equal(f.elemente.length, 2);
  assert.equal(f.elemente[0].font, 'Barlow');
  assert.equal(f.elemente[0].size, 600);
  assert.equal(f.elemente[0].color, '#abcdef');
  assert.equal(f.elemente[1].src, '');
  assert.match(f.key, /^[a-f0-9]{24}$/);
  // Andere Konten sehen die Folie nicht
  assert.equal((await call(`/api/slides/${f.id}`, 'PUT', admin, f)).status, 404);
  // Öffentliche OBS-Adresse (ohne Anmeldung) und Live-Aktualisierung
  const pub = await (await fetch(`${BASE}/s/${f.key}.json`)).json();
  assert.equal(pub.folie.name, 'Bauchbinde');
  assert.equal((await fetch(`${BASE}/s/${'0'.repeat(24)}.json`)).status, 404);
  const page = await host(`/s/${f.key}`, 'slide.mb.test');
  assert.equal(page.status, 200);
  assert.match(page.body, /<base href="\/">/);
  const ac = new AbortController();
  const live = await fetch(`${BASE}/s/${f.key}/live`, { signal: ac.signal });
  const reader = live.body!.getReader();
  const next = async () => {
    let txt = '';
    while (!txt.includes('\n\n')) txt += new TextDecoder().decode((await reader.read()).value);
    return JSON.parse(txt.split('data: ')[1].split('\n')[0]);
  };
  assert.equal((await next()).folie.elemente[0].text, '<script>alert(1)</script>Hallo');
  await call(`/api/slides/${f.id}`, 'PUT', anna, { ...f, elemente: [{ ...f.elemente[0], text: 'Neu' }] });
  assert.equal((await next()).folie.elemente[0].text, 'Neu');
  ac.abort();
  // Kanal: zeigt die Folie auf Sendung
  const kanal = st.kanal.key;
  assert.equal((await (await fetch(`${BASE}/kanal/${kanal}.json`)).json()).folie, null);
  await call('/api/slides/kanal', 'POST', anna, { liveId: f.id });
  assert.equal((await (await fetch(`${BASE}/kanal/${kanal}.json`)).json()).folie.id, f.id);
  // Medien: PNG ok, falscher Inhalt abgelehnt, Video mit Bereichsanfrage
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
  const upPng = await call('/api/slides/medien', 'POST', anna, png, { 'Content-Type': 'image/png', 'X-Dateiname': 'logo.png' });
  const medium = (await upPng.json()).medium;
  assert.match(medium.url, /^\/m\/logo-[a-f0-9]{16}\.png$/);
  assert.equal((await call('/api/slides/medien', 'POST', anna, Buffer.from('<html>nein</html>'), { 'Content-Type': 'image/png' })).status, 415);
  assert.equal((await call('/api/slides/medien', 'POST', anna, Buffer.from('x'), { 'Content-Type': 'application/zip' })).status, 415);
  const mp4 = Buffer.concat([Buffer.from('00000018667479706d703432', 'hex'), Buffer.alloc(2000, 1)]);
  const vid = (await (await call('/api/slides/medien', 'POST', anna, mp4, { 'Content-Type': 'video/mp4', 'X-Dateiname': 'clip.mp4' })).json()).medium;
  const part = await fetch(`${BASE}${vid.url}`, { headers: { range: 'bytes=0-99' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-99/${mp4.length}`);
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  // Verwendete Medien lassen sich nicht löschen
  await call(`/api/slides/${f.id}`, 'PUT', anna, { ...f, elemente: [{ typ: 'bild', src: medium.url }] });
  assert.equal((await call(`/api/slides/medien/${medium.url.slice(3)}`, 'DELETE', anna)).status, 409);
  // Neue OBS-Adresse: alte zeigt nichts mehr
  const renewed = (await (await call(`/api/slides/${f.id}/schluessel`, 'POST', anna, {})).json()).folie;
  assert.notEqual(renewed.key, f.key);
  assert.equal((await fetch(`${BASE}/s/${f.key}.json`)).status, 404);
  // Folien-Editor auf der Slide-Adresse (dieselbe App)
  const editor = await host('/', 'slide.mb.test');
  assert.equal(editor.status, 200);
  assert.match(editor.body, /<div id="root">/);
  // Ohne Recht „slides“ kein Zugriff
  const k = await (await post('/api/verwaltung/konten', {}, admin)).json();
  const ohne = k.rollen.rollen.map((r: { id: string; bereiche: string[] }) => ({ ...r, bereiche: r.bereiche.filter((b: string) => b !== 'slides') }));
  await post('/api/verwaltung/rollen', { rollen: ohne, standard: k.rollen.standard }, admin);
  assert.equal((await call('/api/slides', 'GET', anna)).status, 403);
  await post('/api/verwaltung/rollen', { rollen: k.rollen.rollen, standard: k.rollen.standard }, admin);
  assert.equal((await call('/api/slides', 'GET', anna)).status, 200);
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
  // Die Zoom-Anmeldung wurde bei Zoom zurückgezogen
  assert.ok(zoomCalls.includes('POST /oauth/revoke'));
  assert.equal((await login('anna@example.org')).res.status, 401);
  // Die Verwaltung kann sich nicht selbst sperren
  const chefId = konten.find((k: any) => k.email === 'chef@example.org').id;
  assert.equal((await post('/api/verwaltung/konto', { id: chefId, aktion: 'sperren' }, admin)).status, 400);
});
