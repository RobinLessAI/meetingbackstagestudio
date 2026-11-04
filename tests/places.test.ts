// Ortserkennung mit dem deutschen Ortsverzeichnis (GeoNames): typische Chat-Sätze.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_BY_ID } from '../src/data/places.ts';
import { detectLocation, searchPlaces } from '../src/lib/places.ts';

/** Name (und Bundesland/Region) des erkannten Ortes, „?“ bei Auswahl, „–“ ohne Treffer. */
function found(text: string): string {
  const r = detectLocation(text);
  if (!r) return '–';
  if (r.kind === 'unbekannt') return `unbekannt: ${r.candidate}`;
  if (r.kind === 'mehrdeutig') return `? ${r.placeIds.map((id) => PLACE_BY_ID[id].name).join(' | ')}`;
  const p = PLACE_BY_ID[r.placeId];
  return `${p.name} (${p.region})`;
}

test('Deutsche Orte in typischen Grußformeln', () => {
  assert.equal(found('Werl'), 'Werl (Nordrhein-Westfalen)');
  assert.equal(found('Liebe Grüße aus Bad Salzuflen'), 'Bad Salzuflen (Nordrhein-Westfalen)');
  assert.equal(found('Hallo zusammen aus Mönchengladbach'), 'Mönchengladbach (Nordrhein-Westfalen)');
  assert.equal(found('Ich bin aus Schwäbisch Gmünd'), 'Schwäbisch Gmünd (Baden-Württemberg)');
  assert.equal(found('Ich sitze in Bad Kreuznach'), 'Bad Kreuznach (Rheinland-Pfalz)');
  assert.equal(found('Aus Rheda-Wiedenbrück'), 'Rheda-Wiedenbrück (Nordrhein-Westfalen)');
  assert.equal(found('Zuhause in Fürth'), 'Fürth (Bayern)');
  assert.equal(found('Wir waren gestern in Köln'), 'Köln (Nordrhein-Westfalen)');
});

test('Schreibweisen, Abkürzungen, Postleitzahlen', () => {
  assert.equal(found('Hallo aus Muenchen'), 'München (Bayern)');
  assert.equal(found('Munich'), 'München (Bayern)');
  assert.equal(found('Frankfurt a.M.'), 'Frankfurt am Main (Hessen)');
  assert.equal(found('frankfurt (oder)'), 'Frankfurt (Oder) (Brandenburg)');
  assert.equal(found('St. Ingbert'), 'Sankt Ingbert (Saarland)');
  assert.equal(found('Bad Homburg'), 'Bad Homburg vor der Höhe (Hessen)');
  assert.equal(found('Freiburg im Breisgau'), found('Freiburg'));
  assert.equal(found('Moin aus 20095'), 'Hamburg (Hamburg)');
  assert.equal(found('Grüße aus 33602'), 'Bielefeld (Nordrhein-Westfalen)');
});

test('Gleichnamige Orte: großer Ort gewinnt, sonst Auswahl; Zusätze grenzen ein', () => {
  assert.equal(found('Frankfurt'), 'Frankfurt am Main (Hessen)');
  assert.equal(found('Halle'), 'Halle (Saale) (Sachsen-Anhalt)');
  assert.match(found('Neustadt'), /^\? Neustadt.*\|/);
  assert.equal(found('Neustadt bei Coburg'), 'Neustadt bei Coburg (Bayern)');
  assert.equal(found('Grüße aus Neustadt in Sachsen'), 'Neustadt in Sachsen (Sachsen)');
  assert.equal(found('Grüße aus Kleinmachnow bei Berlin'), 'Kleinmachnow (Brandenburg)');
  assert.equal(found('Hamburg Eißendorf'), 'Eißendorf (Hamburg, Hamburg)');
  assert.match(found('Berlin, aber eigentlich Wien'), /^\? /);
});

test('Bundesländer, Regionen und Orte außerhalb Deutschlands', () => {
  assert.equal(found('aus Bayern'), 'Bayern (Bundesland)');
  assert.equal(found('Gruß aus NRW'), 'Nordrhein-Westfalen (Bundesland)');
  assert.equal(found('Viele Grüße aus dem schönen Allgäu'), 'Allgäu (Region, Deutschland)');
  assert.equal(found('Grüße aus dem Ruhrpott'), 'Ruhrgebiet (Region, Deutschland)');
  assert.equal(found('Grüße aus Wien!'), 'Wien (Österreich)');
  assert.equal(found('Wien-Floridsdorf'), 'Wien (Österreich)');
});

test('Keine Fehltreffer bei Wörtern, die auch Orte sind', () => {
  assert.equal(found('Ich habe Essen mitgebracht'), '–');
  assert.equal(found('Grüße aus Essen'), 'Essen (Nordrhein-Westfalen)');
  for (const word of ['Mut', 'Kreativität', 'Danke', 'Super', 'Ja', 'B', 'Liebe', 'Sonne', 'Hoffnung', 'Energie', 'Neugier']) {
    assert.equal(found(word), '–', word);
  }
  assert.equal(found('Guten Morgen aus dem Homeoffice'), '–');
});

test('Tippfehler werden vorgeschlagen, nie automatisch gesetzt', () => {
  assert.equal(found('Dortmunt'), '? Dortmund');
  assert.equal(found('Grüße aus Dortmunt'), '? Dortmund');
  assert.equal(found('Grüße aus Hintertupfingen'), 'unbekannt: Hintertupfingen');
});

test('Suche für die manuelle Zuordnung', () => {
  assert.equal(searchPlaces('dortm')[0].name, 'Dortmund');
  assert.equal(searchPlaces('Mün')[0].name, 'München');
});

test('Frühere Orts-IDs aus gespeicherten Veranstaltungen bleiben gültig', () => {
  assert.equal(PLACE_BY_ID.werl.name, 'Werl');
  assert.equal(PLACE_BY_ID['frankfurt-main'].name, 'Frankfurt am Main');
  assert.equal(PLACE_BY_ID['halle-saale'].name, 'Halle (Saale)');
  assert.equal(PLACE_BY_ID.koeln.name, 'Köln');
});
