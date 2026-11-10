// Jeder Neustart beginnt ohne Antworten; Einstellungen und Fragen bleiben erhalten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { resetAnswers } from '../server/resetAnswers.mjs';
import { createEventState } from '../src/data/event.ts';

function filled() {
  const s = createEventState({ title: 'Workshop A', teamNames: ['Robin'], mapQuestion: 'Woher?', cloudPrompt: 'Was nehmt ihr mit?' }, 1000);
  return {
    ...s,
    chat: [{ id: 'm1', senderId: null, senderName: 'Lea', text: 'Werl', at: 2000, source: 'zoom' }],
    highlightId: 'm1',
    program: { graphic: 'karte', reaction: null },
    map: { ...s.map, decisions: { m1: { status: 'bestaetigt', placeId: 'werl', at: 2000 } } },
    poll: { ...s.poll, status: 'laeuft', startedAt: 1500, decisions: { m1: { status: 'verworfen' } } },
    cloud: { ...s.cloud, hidden: ['werl'] },
    looks: { ...s.looks, karte: { ...s.looks.karte, pin: '#ff0000' } },
  };
}

test('Antworten werden entfernt, Einstellungen bleiben', () => {
  const r = resetAnswers(filled(), 9000);
  assert.deepEqual(r.chat, []);
  assert.equal(r.highlightId, null);
  assert.equal(r.program.graphic, null);
  assert.deepEqual(r.map.decisions, {});
  assert.equal(r.map.startedAt, 9000);
  assert.equal(r.poll.status, 'entwurf');
  assert.deepEqual(r.poll.decisions, {});
  assert.deepEqual(r.cloud.hidden, []);
  // bleibt
  assert.equal(r.session.title, 'Workshop A');
  assert.deepEqual(r.settings.teamNames, ['Robin']);
  assert.equal(r.map.question, 'Woher?');
  assert.equal(r.poll.question, filled().poll.question);
  assert.equal(r.poll.options.length, filled().poll.options.length);
  assert.equal(r.looks.karte.pin, '#ff0000');
});

test('Server setzt beim Start die gespeicherte Veranstaltung zurück', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mb-neustart-'));
  writeFileSync(join(dir, 'veranstaltung.json'), JSON.stringify({ savedAt: 1, state: filled() }));
  const env = join(dir, '.env.local');
  writeFileSync(env, '');
  const proc = spawn(process.execPath, ['server/server.mjs'], {
    env: { ...process.env, PORT: '4402', MB_DATA_DIR: dir, MB_ENV_FILE: env },
    stdio: 'pipe',
  });
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch('http://127.0.0.1:4402/api/status')).ok) break;
      } catch {
        /* startet noch */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const saved = JSON.parse(readFileSync(join(dir, 'veranstaltung.json'), 'utf8'));
    assert.deepEqual(saved.state.chat, []);
    assert.equal(saved.state.session.title, 'Workshop A');
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
