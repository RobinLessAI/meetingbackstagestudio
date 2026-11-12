// E-Mails: Versand über Brevo (nachgebildet) und Protokoll ohne Versanddienst.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { brevoTransport, createMailer, MAILS } from '../server/mailer.mjs';

test('Brevo: Absender, Empfänger, Betreff und Text werden richtig übergeben', async () => {
  const calls: Array<{ url: string; init: any }> = [];
  const fetchImpl = async (url: string, init: any) => {
    calls.push({ url, init });
    return new Response('{}', { status: 201 });
  };
  const send = brevoTransport({ apiKey: 'xkeysib-test', from: 'MeetingBackstage <no-reply@meetingbackstage.de>', fetchImpl });
  await send({ to: 'anna@example.org', ...MAILS.bestaetigen('https://studio.example/link') });
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].init.headers['api-key'], 'xkeysib-test');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.sender, { name: 'MeetingBackstage', email: 'no-reply@meetingbackstage.de' });
  assert.deepEqual(body.to, [{ email: 'anna@example.org' }]);
  assert.match(body.textContent, /https:\/\/studio\.example\/link/);

  const failing = brevoTransport({ apiKey: 'k', from: 'x@example.org', fetchImpl: async () => new Response('{"message":"sender not verified"}', { status: 400 }) });
  await assert.rejects(failing({ to: 'a@example.org', subject: 's', text: 't' }), /400.*sender not verified/);
});

test('Ohne Versanddienst landet die Mail im Protokoll', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mb-mail-'));
  const mailer = createMailer({ dir, log: () => {} });
  await mailer.send({ to: 'ben@example.org', ...MAILS.passwort('https://studio.example/?passwort=abc') });
  assert.match(readFileSync(join(dir, 'mails.log'), 'utf8'), /An: ben@example\.org[\s\S]*passwort=abc/);
  rmSync(dir, { recursive: true, force: true });
});
