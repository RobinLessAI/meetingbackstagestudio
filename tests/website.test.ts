// Hauptseite: Filter gegen eingeschleusten Code, Adressen prüfen, Blöcke rendern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { cleanHtml, renderSite, safeLink } from '../server/website/render.mjs';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { normalizeContent, normalizePath } from '../server/website/store.mjs';

const seed = JSON.parse(readFileSync(new URL('../website/inhalt-start.json', import.meta.url), 'utf8'));
const ctx = { siteUrl: 'https://meetingbackstage.de', studioUrl: 'https://studio.meetingbackstage.de' };

test('Formatierter Text: nur erlaubte Elemente, keine Skripte, sichere Links', () => {
  const dirty =
    '<h2 onclick="x()">Titel</h2><script>alert(1)</script><p style="color:red">Hallo <b>fett</b> <img src=x onerror=alert(1)>' +
    '<a href="javascript:alert(1)">böse</a> <a href="https://example.org">extern</a> <a href="/hilfe/">intern</a></p><iframe src="https://x"></iframe>';
  const clean = cleanHtml(dirty);
  assert.doesNotMatch(clean, /script|onerror|onclick|iframe|style=|javascript:|<img/i);
  assert.match(clean, /<h2>Titel<\/h2>/);
  assert.match(clean, /<strong>fett<\/strong>/);
  assert.match(clean, /<a href="https:\/\/example\.org" target="_blank" rel="noopener noreferrer">extern<\/a>/);
  assert.match(clean, /<a href="\/hilfe\/">intern<\/a>/);
  assert.equal(safeLink('javascript:alert(1)'), '#');
  assert.equal(safeLink('//boese.example'), '#');
  assert.equal(safeLink('mailto:info@meetingbackstage.de'), 'mailto:info@meetingbackstage.de');
  assert.equal(safeLink('{{studio}}/?konto=neu'), '{{studio}}/?konto=neu');
});

test('Adressen: gültig, reserviert, doppelt', () => {
  assert.equal(normalizePath('preise'), '/preise/');
  assert.equal(normalizePath('/ueber-uns/team/'), '/ueber-uns/team/');
  assert.throws(() => normalizePath('/Über uns/'), /ungültig/);
  assert.throws(() => normalizePath('/api/'), /reserviert/);
  assert.throws(() => normalizePath('/_web/x/'), /ungültig|reserviert/);
  assert.throws(() => normalizePath('/aktion/x/'), /reserviert/);
  const dup = structuredClone(seed);
  dup.seiten.push({ ...dup.seiten[1], id: 'x' });
  assert.throws(() => normalizeContent(dup), /doppelt/);
  const noHome = structuredClone(seed);
  noHome.seiten = noHome.seiten.filter((p: { pfad: string }) => p.pfad !== '/');
  assert.throws(() => normalizeContent(noHome), /Startseite/);
});

test('Startinhalt rendert alle Seiten mit Titel, Beschreibung, Navigation und Sitemap', async () => {
  const content = normalizeContent(seed);
  const site = await renderSite(content, ctx);
  assert.deepEqual([...site.pages.keys()], ['/', '/hilfe/', '/impressum/', '/datenschutz/', '/nutzungsbedingungen/']);
  const home = site.pages.get('/');
  assert.match(home, /<title>MeetingBackstage – Live-Grafiken für Zoom-Workshops<\/title>/);
  assert.match(home, /<h1>Dein Zoom-Chat wird zur <em>Live-Grafik<\/em>\.<\/h1>/);
  assert.match(home, /href="https:\/\/studio\.meetingbackstage\.de\/\?konto=neu"/);
  assert.match(home, /<link rel="canonical" href="https:\/\/meetingbackstage\.de\/">/);
  assert.match(site.pages.get('/hilfe/'), /<title>Hilfe &amp; Support · MeetingBackstage<\/title>/);
  assert.match(site.pages.get('/datenschutz/'), /<nav class="inhalt-nav"/);
  assert.match(site.pages.get('/impressum/'), /DE449133614/);
  assert.match(site.notFound, /noindex/);
  assert.match(site.sitemap, /<loc>https:\/\/meetingbackstage\.de\/hilfe\/<\/loc>/);
  assert.doesNotMatch(site.sitemap, /404/);
  // Texte mit spitzen Klammern werden maskiert
  const evil = structuredClone(content);
  evil.seiten[0].bloecke[0].titel = '<script>alert(1)</script>';
  const out = (await renderSite(normalizeContent(evil), ctx)).pages.get('/');
  assert.doesNotMatch(out, /<script>alert/);
  assert.match(out, /&lt;script&gt;/);
  // Ganze Website aus Suchmaschinen nehmen
  const hidden = structuredClone(content);
  hidden.site.indexieren = false;
  const h = await renderSite(normalizeContent(hidden), ctx);
  assert.match(h.robots, /Disallow: \//);
  assert.match(h.pages.get('/'), /noindex/);
});

test('Produkt-Platzhalter: einmalige Ergänzung lässt Vorhandenes in Ruhe', async () => {
  // @ts-expect-error – JavaScript-Modul ohne Typen
  const { MIGRATIONEN } = await import('../server/website/migrationen.mjs');
  const mig = MIGRATIONEN.find((m: { id: string }) => m.id === 'produkte-2026-11');
  const before = normalizeContent(seed);
  before.seiten[0].bloecke[0].titel = 'Eigener Titel';
  const after = normalizeContent(mig.apply(before));
  for (const p of ['/spotlight/', '/snap/', '/scope/']) assert.ok(after.seiten.some((s: { pfad: string }) => s.pfad === p), p);
  assert.equal(after.seiten[0].bloecke[0].titel, 'Eigener Titel');
  assert.equal(after.seiten.at(-1).pfad, '/404/');
  assert.ok(after.site.navigation.some((n: { link: string }) => n.link === '/#produkte'));
  const home = await renderSite(after, ctx);
  assert.match(home.pages.get('/'), /Die MeetingBackstage-Familie/);
  assert.match(home.pages.get('/'), /<a class="karte karte--link" href="\/spotlight\/">/);
  // Zweimal anwenden verdoppelt nichts
  const twice = normalizeContent(mig.apply(after));
  assert.equal(twice.seiten.length, after.seiten.length);
  assert.equal(twice.seiten[0].bloecke.filter((b: { anker: string }) => b.anker === 'produkte').length, 1);
});
