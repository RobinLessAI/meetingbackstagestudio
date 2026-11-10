// Darstellung von Weltkarte, Umfrage und Wortwolke: Grundwerte, ältere Speicherstände, Platzierung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placement, fullBackground } from '../src/components/graphics/look.ts';
import { DEFAULT_LOOKS, normalizeLooks } from '../src/data/graphicLooks.ts';
import { normalizeState } from '../src/data/event.ts';

test('Ältere Speicherstände bekommen alle Darstellungs-Felder', () => {
  const looks = normalizeLooks({ karte: { ...DEFAULT_LOOKS.karte, pin: '#ff0000' } } as never);
  assert.equal(looks.karte.pin, '#ff0000');
  assert.equal(looks.umfrage.showPercent, true);
  assert.equal(looks.wortwolke.maxWords, 40);
  const state = normalizeState({ dataMode: 'eigene' } as never);
  assert.equal(state.looks.karte.position, 'mitte-rechts');
});

test('Platzierung im 3 × 3 Raster', () => {
  const look = { ...DEFAULT_LOOKS.umfrage, position: 'unten-links' as const, width: 40, height: 0, marginX: 5, marginY: 4 };
  assert.deepEqual(placement(look), { width: '40%', left: '5%', height: 'fit-content', maxHeight: '92%', bottom: '4%' });
  const center = placement({ ...look, position: 'mitte', height: 50 });
  assert.equal(center.marginInline, 'auto');
  assert.equal(center.marginBlock, 'auto');
  assert.equal(center.height, '50%');
  assert.equal(placement({ ...look, position: 'oben-rechts' }).right, '5%');
});

test('Vollbild-Hintergrund', () => {
  assert.equal(fullBackground({ ...DEFAULT_LOOKS.karte, fullBackground: 'dunkel' }), null);
  assert.equal(fullBackground({ ...DEFAULT_LOOKS.karte, fullBackground: 'transparent' }), 'transparent');
  assert.equal(fullBackground({ ...DEFAULT_LOOKS.karte, fullBackground: 'farbe', fullColor: '#102030', fullOpacity: 50 }), 'rgb(16 32 48 / 0.5)');
});
