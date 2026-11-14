// E-Mails des Web-Modus (Bestätigung, Passwort, Freischaltung).
//
// Ohne Versanddienst (Entwicklung): Die Mail erscheint im Terminal und in <daten>/web/mails.log,
// die Links lassen sich von dort öffnen. Für den Betrieb wird später ein Versanddienst angebunden
// (Postfach per SMTP oder Brevo); die Schnittstelle bleibt gleich.
import fsp from 'node:fs/promises';
import path from 'node:path';

export function createMailer({ dir, log, from = 'MeetingBackstage <no-reply@meetingbackstage.de>', transport = null }) {
  const file = path.join(dir, 'mails.log');
  const sent = []; // für Tests
  return {
    sent,
    async send({ to, subject, text, html }) {
      const mail = { to, subject, text, html, from, at: new Date().toISOString() };
      sent.push(mail);
      if (sent.length > 50) sent.shift();
      if (transport) return transport(mail);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.appendFile(file, `--- ${mail.at}\nAn: ${to}\nBetreff: ${subject}\n\n${text}\n\n`, { mode: 0o600 });
      log(`E-Mail (nicht versendet, steht in ${path.relative(process.cwd(), file)}): „${subject}“ an ${to}`);
    },
  };
}

/**
 * Versand über Brevo (EU-Anbieter, kostenloser Einstieg) per HTTP-Schnittstelle.
 * Absender-Domain muss bei Brevo bestätigt sein (DNS-Einträge für SPF/DKIM).
 */
export function brevoTransport({ apiKey, from, fetchImpl = fetch, apiUrl }) {
  const url = apiUrl || 'https://api.brevo.com/v3/smtp/email';
  const m = String(from).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const sender = m ? { name: m[1] || 'MeetingBackstage', email: m[2] } : { name: 'MeetingBackstage', email: String(from).trim() };
  return async (mail) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, ...(mail.html ? { htmlContent: mail.html } : {}) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`E-Mail-Versand fehlgeschlagen (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
  };
}

/** Betreff für E-Mails mit Umlauten kodieren (RFC 2047). */
const encodeHeader = (v) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`);

/** Absender „Name <adresse>“ zerlegen. */
function parseFrom(from) {
  const m = String(from).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1], email: m[2] } : { name: '', email: String(from).trim() };
}

/** Text als Base64 in 76-Zeichen-Zeilen (Umlaute kommen so sicher an). */
const b64 = (s) =>
  Buffer.from(String(s).replace(/\r?\n/g, '\r\n'), 'utf8')
    .toString('base64')
    .replace(/.{1,76}/g, '$&\r\n');

/** Fertige Nachricht: nur Text, oder Text und HTML (multipart/alternative). */
export function buildMessage({ from, to, subject, text, html, now = new Date() }) {
  const f = parseFrom(from);
  const domain = f.email.split('@')[1] || 'localhost';
  const body = b64(text);
  const head = [
    `From: ${f.name ? `${encodeHeader(f.name)} ` : ''}<${f.email}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@${domain}>`,
    'MIME-Version: 1.0',
  ];
  if (!html) return [...head, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', body].join('\r\n');
  const boundary = `mb-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/**
 * Versand über einen SMTP-Server mit Anmeldung, z. B. das Postfach des eigenen Webhostings
 * (Hetzner: mail.your-server.de, Port 465, verschlüsselt). Ohne zusätzliche Pakete.
 */
export function smtpTransport({ host, port = 465, user, pass, from, connect, timeoutMs = 20_000 }) {
  const sender = parseFrom(from).email;
  return async (mail) => {
    const socket = connect ? connect() : (await import('node:tls')).connect({ host, port: Number(port), servername: host });
    socket.setEncoding('utf8');
    let buffer = '';
    const waiting = [];
    let failed = null;
    const fail = (e) => {
      failed = e;
      while (waiting.length) waiting.shift().reject(e);
    };
    socket.on('data', (chunk) => {
      buffer += chunk;
      // Vollständige Antworten herausziehen (mehrzeilig: „250-…“ bis „250 …“).
      for (;;) {
        const lines = buffer.split('\r\n');
        const end = lines.findIndex((l) => /^\d{3} /.test(l));
        if (end < 0 || end === lines.length - 1) break;
        const reply = lines.slice(0, end + 1);
        buffer = lines.slice(end + 1).join('\r\n');
        waiting.shift()?.resolve({ code: Number(reply.at(-1).slice(0, 3)), text: reply.join(' ') });
      }
    });
    socket.on('error', fail);
    socket.on('close', () => fail(new Error('Verbindung zum Mailserver beendet')));
    const timer = setTimeout(() => {
      fail(new Error('Mailserver antwortet nicht'));
      socket.destroy();
    }, timeoutMs);
    const reply = () => new Promise((resolve, reject) => (failed ? reject(failed) : waiting.push({ resolve, reject })));
    // step = verständlicher Name des Schritts für Fehlermeldungen (Zugangsdaten erscheinen nie darin).
    const cmd = async (line, ok, step) => {
      const r = reply();
      if (line !== null) socket.write(`${line}\r\n`);
      const res = await r;
      if (!ok.includes(res.code)) throw new Error(`E-Mail-Versand fehlgeschlagen (${step}): ${res.text}`);
      return res;
    };
    try {
      await cmd(null, [220], 'Begrüßung');
      await cmd(`EHLO ${sender.split('@')[1] || 'localhost'}`, [250], 'EHLO');
      await cmd('AUTH LOGIN', [334], 'Anmeldung');
      await cmd(Buffer.from(user).toString('base64'), [334], 'Anmeldung, Benutzer');
      await cmd(Buffer.from(pass).toString('base64'), [235], 'Anmeldung, Passwort');
      await cmd(`MAIL FROM:<${sender}>`, [250], 'Absender');
      await cmd(`RCPT TO:<${mail.to}>`, [250, 251], 'Empfänger');
      await cmd('DATA', [354], 'Nachricht');
      await cmd(`${buildMessage({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html })}\r\n.`, [250], 'Nachricht senden');
      socket.write('QUIT\r\n');
    } finally {
      clearTimeout(timer);
      socket.removeAllListeners('close');
      socket.end();
    }
  };
}

/** Die Texte der Mails an einer Stelle. */
export const MAILS = {
  bestaetigen: (link) => ({
    subject: 'Bitte bestätige deine E-Mail-Adresse',
    text: `Hallo,\n\ndanke für deine Registrierung bei MeetingBackstage Studio.\nBitte bestätige deine E-Mail-Adresse mit diesem Link (48 Stunden gültig):\n\n${link}\n\nDanach prüfen wir dein Konto und schalten es frei.\n\nWar das nicht du? Dann ignoriere diese Mail einfach.`,
  }),
  passwort: (link) => ({
    subject: 'Neues Passwort für MeetingBackstage',
    text: `Hallo,\n\nüber diesen Link vergibst du ein neues Passwort (2 Stunden gültig):\n\n${link}\n\nHast du das nicht angefordert? Dann ignoriere diese Mail, dein Passwort bleibt unverändert.`,
  }),
  freigeschaltet: (link) => ({
    subject: 'Dein Konto ist freigeschaltet',
    text: `Hallo,\n\ndein Konto bei MeetingBackstage Studio ist jetzt freigeschaltet. Hier geht es los:\n\n${link}\n\nViel Erfolg mit deinen Workshops!`,
  }),
  neuesKonto: (email, link) => ({
    subject: 'Neues Konto wartet auf Freischaltung',
    text: `Ein neues Konto wartet auf deine Freischaltung: ${email}\n\nZur Verwaltung: ${link}`,
  }),
};
