// E-Mails: Versand über Brevo und SMTP (nachgebildet) und Protokoll ohne Versanddienst.
import net from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error – JavaScript-Modul ohne Typen
import { brevoTransport, buildMessage, createMailer, MAILS, smtpTransport } from '../server/mailer.mjs';

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

  const failing = brevoTransport({
    apiKey: 'k',
    from: 'x@example.org',
    fetchImpl: async () => new Response('{"message":"sender not verified"}', { status: 400 }),
  });
  await assert.rejects(failing({ to: 'a@example.org', subject: 's', text: 't' }), /400.*sender not verified/);
});

test('Ohne Versanddienst landet die Mail im Protokoll', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mb-mail-'));
  const mailer = createMailer({ dir, log: () => {} });
  await mailer.send({ to: 'ben@example.org', ...MAILS.passwort('https://studio.example/?passwort=abc') });
  assert.match(readFileSync(join(dir, 'mails.log'), 'utf8'), /An: ben@example\.org[\s\S]*passwort=abc/);
  rmSync(dir, { recursive: true, force: true });
});

/** Kleiner nachgebauter Mailserver (ohne Verschlüsselung, nur für den Test). */
function fakeSmtp(opts: { password: string }) {
  const received: { from?: string; to?: string; data?: string; user?: string } = {};
  const server = net.createServer((sock) => {
    sock.setEncoding('utf8');
    let stage = 'cmd';
    let data = '';
    sock.write('220 mail.example ESMTP\r\n');
    sock.on('data', (chunk: string) => {
      if (stage === 'data') {
        data += chunk;
        if (data.endsWith('\r\n.\r\n')) {
          received.data = data;
          stage = 'cmd';
          sock.write('250 OK queued\r\n');
        }
        return;
      }
      for (const line of chunk.split('\r\n').filter(Boolean)) {
        if (stage === 'user') {
          received.user = Buffer.from(line, 'base64').toString();
          stage = 'pass';
          sock.write('334 UGFzc3dvcmQ6\r\n');
        } else if (stage === 'pass') {
          stage = 'cmd';
          sock.write(Buffer.from(line, 'base64').toString() === opts.password ? '235 ok\r\n' : '535 Authentication failed\r\n');
        } else if (line.startsWith('EHLO')) sock.write('250-mail.example\r\n250 AUTH LOGIN PLAIN\r\n');
        else if (line === 'AUTH LOGIN') {
          stage = 'user';
          sock.write('334 VXNlcm5hbWU6\r\n');
        } else if (line.startsWith('MAIL FROM')) {
          received.from = line;
          sock.write('250 ok\r\n');
        } else if (line.startsWith('RCPT TO')) {
          received.to = line;
          sock.write('250 ok\r\n');
        } else if (line === 'DATA') {
          stage = 'data';
          sock.write('354 go\r\n');
        } else if (line === 'QUIT') sock.end('221 bye\r\n');
      }
    });
  });
  return { server, received };
}

test('SMTP: Anmeldung, Absender, Empfänger, Umlaute im Betreff und Text', async () => {
  const { server, received } = fakeSmtp({ password: 'geheim' });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  const send = smtpTransport({
    user: 'no-reply@meetingbackstage.de',
    pass: 'geheim',
    from: 'MeetingBackstage <no-reply@meetingbackstage.de>',
    connect: () => net.connect(port, '127.0.0.1'),
  });
  await send({ to: 'anna@example.org', ...MAILS.bestaetigen('https://studio.example/link') });
  assert.equal(received.user, 'no-reply@meetingbackstage.de');
  assert.equal(received.from, 'MAIL FROM:<no-reply@meetingbackstage.de>');
  assert.equal(received.to, 'RCPT TO:<anna@example.org>');
  assert.match(received.data!, /Subject: =\?UTF-8\?B\?/);
  const body = received.data!.split('\r\n\r\n')[1].replace(/\r\n\.\r\n$/, '');
  assert.match(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8'), /bestätige deine E-Mail-Adresse[\s\S]*studio\.example\/link/);

  // Falsches Passwort: verständlicher Fehler, ohne das Passwort zu nennen
  const wrong = smtpTransport({ user: 'x', pass: 'falsch', from: 'a@b.de', connect: () => net.connect(port, '127.0.0.1') });
  await assert.rejects(
    wrong({ to: 'a@example.org', subject: 's', text: 't' }),
    (e: Error) => /Anmeldung, Passwort/.test(e.message) && !e.message.includes('falsch'),
  );
  server.close();
});

test('Nachricht: Kopfzeilen und Base64-Text', () => {
  const m = buildMessage({
    from: 'MeetingBackstage <no-reply@meetingbackstage.de>',
    to: 'a@example.org',
    subject: 'Hallo',
    text: 'Grüße',
    now: new Date('2026-11-12T10:00:00Z'),
  });
  assert.match(
    m,
    /^From: MeetingBackstage <no-reply@meetingbackstage\.de>\r\nTo: <a@example\.org>\r\nSubject: Hallo\r\nDate: Thu, 12 Nov 2026 10:00:00 \+0000/,
  );
  assert.match(m, /Content-Transfer-Encoding: base64\r\n\r\n/);
});

test('E-Mail-Vorlagen: Platzhalter, Maskierung, Textfassung, HTML-Mail mit Knopf', async () => {
  // @ts-expect-error – JavaScript-Modul ohne Typen
  const { createMailTemplates, htmlToText } = await import('../server/mailTemplates.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'mb-mt-'));
  const t = createMailTemplates({ file: join(dir, 'v.json'), logoUrl: 'https://x.example/logo.png', baseVars: { studio: 'https://studio.example', website: 'https://example.de' } });
  const m = t.render('bestaetigen', { name: '<b>Eve</b>', email: 'eve@example.org', link: 'https://studio.example/api/konto/bestaetigen?token=abc' });
  assert.equal(m.subject, 'Bitte bestätige deine E-Mail-Adresse');
  assert.match(m.html, /Hallo &lt;b&gt;Eve&lt;\/b&gt;,/, 'Werte werden maskiert');
  assert.match(m.html, /href="https:\/\/studio\.example\/api\/konto\/bestaetigen\?token=abc"/);
  assert.match(m.html, /src="https:\/\/x\.example\/logo\.png"/);
  assert.match(m.text, /E-Mail-Adresse bestätigen:\nhttps:\/\/studio\.example\/api\/konto\/bestaetigen\?token=abc/);
  assert.match(m.text, /https:\/\/example\.de/);
  // Ohne Namen kein „Hallo ,“
  assert.match(t.render('passwort', { link: 'https://s/x' }).text, /Hallo,/);
  // Eigene Vorlage, Skript wird entfernt, javascript:-Links unschädlich
  await t.save({ vorlagen: { passwort: { betreff: 'X', ueberschrift: '', inhalt: '<p>Hi</p><script>x()</script><a href="javascript:alert(1)">a</a>', knopf: '' } } });
  const own = t.render('passwort', { link: 'https://s/x' });
  assert.doesNotMatch(own.html, /script|javascript:/);
  assert.doesNotMatch(own.html, /Falls der Knopf/, 'ohne Knopftext kein Knopf');
  assert.deepEqual(t.state().eigene, ['passwort']);
  assert.equal(htmlToText('<p>A <a href="https://x.de">Link</a></p><ul><li>eins</li></ul>'), 'A Link (https://x.de)\n\n- eins');
  rmSync(dir, { recursive: true, force: true });
});

test('Nachricht mit HTML: multipart/alternative mit Text und HTML', () => {
  const msg = buildMessage({ from: 'MB <a@b.de>', to: 'c@d.de', subject: 'Hallo', text: 'Grüße', html: '<p>Grüße</p>' });
  const boundary = msg.match(/boundary="([^"]+)"/)![1];
  assert.match(msg, /Content-Type: multipart\/alternative/);
  assert.equal(msg.split(`--${boundary}`).length, 4);
  assert.match(msg, /Content-Type: text\/html; charset=utf-8/);
  const htmlPart = msg.split(`--${boundary}`)[2].split('\r\n\r\n')[1];
  assert.equal(Buffer.from(htmlPart.replace(/\r\n/g, ''), 'base64').toString('utf8'), '<p>Grüße</p>');
});
