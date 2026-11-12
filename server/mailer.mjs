// E-Mails des Web-Modus (Bestätigung, Passwort, Freischaltung).
//
// Ohne Versanddienst (Entwicklung): Die Mail erscheint im Terminal und in <daten>/web/mails.log,
// die Links lassen sich von dort öffnen. Für den Betrieb wird später ein Versanddienst angebunden
// (z. B. Brevo per SMTP); die Schnittstelle bleibt gleich.
import fsp from 'node:fs/promises';
import path from 'node:path';

export function createMailer({ dir, log, from = 'MeetingBackstage <no-reply@meetingbackstage.de>', transport = null }) {
  const file = path.join(dir, 'mails.log');
  const sent = []; // für Tests
  return {
    sent,
    async send({ to, subject, text }) {
      const mail = { to, subject, text, from, at: new Date().toISOString() };
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
      body: JSON.stringify({ sender, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`E-Mail-Versand fehlgeschlagen (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
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
