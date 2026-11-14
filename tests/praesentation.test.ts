// Präsentationen: Reihenfolge, Klick-Schritte, Weiter/Zurück, Schleife, „schwarz“, automatisch weiter, Notizen privat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { createSlides, maxSchritt } from '../server/slides.mjs';

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mb-praes-'));
  const slides = createSlides({ dataDir: dir, ownerDir: (o: string) => path.join(dir, o) });
  return { dir, slides };
}

const text = (t: string, schritt = 0) => ({ typ: 'text', text: t, schritt });

test('Klick-Schritte, Weiter und Zurück wie in PowerPoint', async () => {
  const { dir, slides } = setup();
  try {
    const a = await slides.create('o', {
      name: 'A',
      notizen: 'Geheim: Begrüßung',
      elemente: [text('Titel'), text('Punkt 1', 1), text('Punkt 2', 2)],
    });
    const b = await slides.create('o', { name: 'B', uebergang: { typ: 'schieben', dauer: 0.8 }, elemente: [text('B')] });
    assert.equal(maxSchritt(a), 2);
    assert.equal(b.uebergang.typ, 'schieben');
    assert.equal(a.uebergang.typ, 'blende'); // Standard
    const p = await slides.createPraesentation('o', { name: 'Vortrag', folien: [a.id, b.id, 'ffffffffff', '<x>'] });
    assert.deepEqual(p.folien, [a.id, b.id, 'ffffffffff']);
    await assert.rejects(slides.control('o', 'weiter'), /keine Präsentation/);

    let k = await slides.control('o', 'start', { id: p.id });
    assert.deepEqual([k.liveId, k.ablauf.index, k.ablauf.schritt, k.ablauf.anzahl, k.ablauf.maxSchritt], [a.id, 0, 0, 2, 2]);
    const pub = () => slides.byChannelKey(k.key);
    assert.equal(pub().folie.notizen, undefined, 'Notizen nie über die öffentliche OBS-Adresse');
    assert.equal(pub().schritt, 0);
    k = await slides.control('o', 'weiter');
    k = await slides.control('o', 'weiter');
    assert.deepEqual([k.liveId, k.ablauf.schritt], [a.id, 2]);
    k = await slides.control('o', 'weiter');
    assert.deepEqual([k.liveId, k.ablauf.index, k.ablauf.schritt, k.richtung], [b.id, 1, 0, 1]);
    // Ende ohne Schleife: bleibt auf der letzten Folie
    k = await slides.control('o', 'weiter');
    assert.equal(k.liveId, b.id);
    // Zurück: vorherige Folie komplett aufgebaut
    k = await slides.control('o', 'zurueck');
    assert.deepEqual([k.liveId, k.ablauf.schritt, k.richtung], [a.id, 2, -1]);
    assert.equal(pub().richtung, -1);
    // Schwarz: Kanal leer, nächster Tastendruck holt die Folie zurück
    k = await slides.control('o', 'leer');
    assert.equal(pub().folie, null);
    k = await slides.control('o', 'weiter');
    assert.deepEqual([k.leer, k.liveId, k.ablauf.schritt], [false, a.id, 2]);
    // Gehe zu, Anfang
    k = await slides.control('o', 'gehe', { index: 1 });
    assert.equal(k.liveId, b.id);
    k = await slides.control('o', 'anfang');
    assert.deepEqual([k.liveId, k.ablauf.schritt], [a.id, 0]);
    // Schleife: von der letzten Folie wieder zur ersten
    await slides.updatePraesentation('o', p.id, { ...p, schleife: true });
    await slides.control('o', 'gehe', { index: 1 });
    k = await slides.control('o', 'weiter');
    assert.equal(k.liveId, a.id);
    // Folie aus der Präsentation löschen: läuft weiter mit dem Rest
    await slides.remove('o', b.id);
    assert.deepEqual(slides.state('o', '').praesentationen[0].folien, [a.id, 'ffffffffff']);
    // Einzelne Folie auf Sendung beendet die Präsentation
    k = await slides.setLive('o', a.id);
    assert.equal(k.ablauf, null);
    assert.equal(pub().schritt, 99);
    // Ende
    await slides.control('o', 'start', { id: p.id });
    k = await slides.control('o', 'ende');
    assert.equal(k.liveId, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Automatisch weiter und Neustart des Servers', async () => {
  const { dir, slides } = setup();
  try {
    const a = await slides.create('o', { name: 'A' });
    const b = await slides.create('o', { name: 'B' });
    const p = await slides.createPraesentation('o', { name: 'Pause', folien: [a.id, b.id], auto: 1, schleife: true });
    await slides.control('o', 'start', { id: p.id });
    await new Promise((r) => setTimeout(r, 1150));
    assert.equal(slides.kanalState('o').liveId, b.id);
    await slides.control('o', 'ende');
    // Nach einem Neustart weiß der Server noch, was lief
    await slides.control('o', 'start', { id: p.id, index: 1 });
    await slides.updatePraesentation('o', p.id, { ...p, auto: 0 });
    await new Promise((r) => setTimeout(r, 50));
    const again = createSlides({ dataDir: dir, ownerDir: (o: string) => path.join(dir, o), owners: () => ['o'] });
    const k = again.kanalState('o');
    assert.deepEqual([k.liveId, k.ablauf.index], [b.id, 1]);
    await again.control('o', 'ende');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('3D-Perspektive: Werte werden begrenzt, alte Folien bekommen Standardwerte', async () => {
  const { dir, slides } = setup();
  try {
    const f = await slides.create('o', {
      name: '3D',
      dreiD: { an: true, drehX: 500, drehY: -30, staerke: 'viel', groesse: 0.01, hintergrundMit: 'ja' },
      elemente: [{ typ: 'text', text: 'x', kippX: 20, kippY: -999 }],
    });
    assert.deepEqual(
      [f.dreiD.an, f.dreiD.drehX, f.dreiD.drehY, f.dreiD.staerke, f.dreiD.groesse, f.dreiD.hintergrundMit],
      [true, 80, -30, 50, 0.2, true],
    );
    assert.deepEqual([f.elemente[0].kippX, f.elemente[0].kippY], [20, -80]);
    const alt = await slides.create('o', { name: 'Alt' });
    assert.equal(alt.dreiD.an, false);
    assert.equal(slides.bySlideKey(f.key).dreiD.drehY, -30, 'öffentliche Adresse liefert den Winkel mit');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
