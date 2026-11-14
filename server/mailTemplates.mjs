// E-Mail-Vorlagen: alle Mails, die das System verschickt, mit eigenen Texten aus der Verwaltung (Website → E-Mail-Vorlagen).
//
// Jede Vorlage hat Betreff, Überschrift, formatierten Inhalt und (wo es einen Link gibt) eine Knopf-Beschriftung.
// Platzhalter wie {{name}} oder {{link}} werden beim Versand ersetzt. Verschickt wird eine gestaltete HTML-Mail
// (Logo, Markenfarben) und dieselbe Nachricht als reiner Text für Mailprogramme ohne HTML.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { cleanHtml } from './website/render.mjs';

const COMMON = [
  { key: 'name', label: 'Name (oder Firma) des Kontos – leer, falls nicht angegeben', beispiel: 'Anna Beispiel' },
  { key: 'email', label: 'E-Mail-Adresse des Kontos', beispiel: 'anna@example.org' },
  { key: 'studio', label: 'Adresse des Studios', beispiel: 'https://studio.meetingbackstage.de' },
  { key: 'website', label: 'Adresse der Website', beispiel: 'https://meetingbackstage.de' },
];

/** Alle Mails des Systems mit Standardtexten. */
export const MAIL_KATALOG = [
  {
    id: 'bestaetigen',
    name: 'E-Mail-Adresse bestätigen',
    wann: 'Nach der Registrierung an die neue Kundin oder den neuen Kunden.',
    platzhalter: [...COMMON, { key: 'link', label: 'Bestätigungslink (48 Stunden gültig)', beispiel: 'https://studio.meetingbackstage.de/api/konto/bestaetigen?token=…' }],
    standard: {
      betreff: 'Bitte bestätige deine E-Mail-Adresse',
      ueberschrift: 'Willkommen bei MeetingBackstage',
      inhalt:
        '<p>Hallo {{name}},</p><p>danke für deine Registrierung bei MeetingBackstage Studio. Bitte bestätige deine E-Mail-Adresse mit dem Knopf unten. Der Link ist 48 Stunden gültig.</p><p>Danach prüfen wir dein Konto und schalten es frei.</p><p>War das nicht du? Dann ignoriere diese Mail einfach.</p>',
      knopf: 'E-Mail-Adresse bestätigen',
    },
  },
  {
    id: 'passwort',
    name: 'Passwort zurücksetzen',
    wann: 'Wenn jemand „Passwort vergessen?“ nutzt.',
    platzhalter: [...COMMON, { key: 'link', label: 'Link für ein neues Passwort (2 Stunden gültig)', beispiel: 'https://studio.meetingbackstage.de/?passwort=…' }],
    standard: {
      betreff: 'Neues Passwort für MeetingBackstage',
      ueberschrift: 'Neues Passwort festlegen',
      inhalt:
        '<p>Hallo {{name}},</p><p>über den Knopf unten vergibst du ein neues Passwort. Der Link ist 2 Stunden gültig.</p><p>Hast du das nicht angefordert? Dann ignoriere diese Mail, dein Passwort bleibt unverändert.</p>',
      knopf: 'Neues Passwort festlegen',
    },
  },
  {
    id: 'freigeschaltet',
    name: 'Konto freigeschaltet',
    wann: 'Wenn du ein wartendes Konto in der Verwaltung freischaltest.',
    platzhalter: [...COMMON, { key: 'link', label: 'Adresse des Studios zum Anmelden', beispiel: 'https://studio.meetingbackstage.de' }],
    standard: {
      betreff: 'Dein Konto ist freigeschaltet',
      ueberschrift: 'Dein Konto ist bereit',
      inhalt: '<p>Hallo {{name}},</p><p>dein Konto bei MeetingBackstage Studio ist jetzt freigeschaltet. Melde dich mit deiner E-Mail-Adresse an und leg los.</p><p>Viel Erfolg mit deinen Workshops!</p>',
      knopf: 'Zum Studio',
    },
  },
  {
    id: 'neuesKonto',
    name: 'Neues Konto wartet (an die Verwaltung)',
    wann: 'An dich, wenn jemand seine E-Mail-Adresse bestätigt hat und auf Freischaltung wartet.',
    platzhalter: [...COMMON, { key: 'link', label: 'Link zur Verwaltung', beispiel: 'https://studio.meetingbackstage.de/#verwaltung' }],
    standard: {
      betreff: 'Neues Konto wartet auf Freischaltung',
      ueberschrift: 'Neues Konto',
      inhalt: '<p>Ein neues Konto wartet auf deine Freischaltung:</p><p><strong>{{email}}</strong><br>{{name}}</p>',
      knopf: 'Zur Verwaltung',
    },
  },
];

export const MAIL_STANDARD_FUSS = 'MeetingBackstage · Live-Grafiken und Regie für Online-Workshops\n{{website}}';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const str = (v, max) => String(v ?? '').slice(0, max);

/** Platzhalter in reinem Text ersetzen. */
const fillText = (s, vars) => String(s ?? '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
/** Platzhalter in HTML ersetzen: Werte maskiert; in Link-Zielen nur Adressen. */
const fillHtml = (s, vars) =>
  String(s ?? '')
    .replace(/href="\{\{(\w+)\}\}"/g, (m, k) => (k in vars && /^(https?:|mailto:)/.test(String(vars[k])) ? `href="${esc(vars[k])}"` : 'href="#"'))
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? esc(vars[k]) : m));

/** HTML → lesbarer Text (für die Textfassung der Mail). */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const t = text.replace(/<[^>]+>/g, '');
      return t.trim() === href.trim() || !href || href === '#' ? t : `${t} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/(p|h[1-6]|li|blockquote|ul|ol)>/gi, '\n')
    .replace(/<(p|h[1-6]|ul|ol|blockquote)[^>]*>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n—\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Gestaltete HTML-Mail (Tabellen und Inline-Stile, damit sie in allen Mailprogrammen gleich aussieht). */
function layout({ ueberschrift, inhalt, knopf, link, fuss, logoUrl, siteName }) {
  const button =
    knopf && link
      ? `<tr><td style="padding:8px 40px 8px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:999px;background:#026c75"><a href="${esc(link)}" style="display:inline-block;padding:14px 28px;font:700 16px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:999px">${esc(knopf)}</a></td></tr></table></td></tr>
<tr><td style="padding:12px 40px 0;font:13px/1.5 Arial,Helvetica,sans-serif;color:#536a7a">Falls der Knopf nicht funktioniert, kopiere diese Adresse in deinen Browser:<br><a href="${esc(link)}" style="color:#026c75;word-break:break-all">${esc(link)}</a></td></tr>`
      : '';
  const body = inhalt
    .replace(/<p>/g, '<p style="margin:0 0 14px">')
    .replace(/<h2>/g, '<h2 style="margin:20px 0 10px;font-size:19px;color:#11243c">')
    .replace(/<h3>/g, '<h3 style="margin:16px 0 8px;font-size:16px;color:#11243c">')
    .replace(/<a href=/g, '<a style="color:#026c75" href=')
    .replace(/<(ul|ol)>/g, '<$1 style="margin:0 0 14px;padding-left:22px">')
    .replace(/<blockquote>/g, '<blockquote style="margin:0 0 14px;padding-left:14px;border-left:3px solid #026c75;color:#536a7a">');
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(ueberschrift || siteName)}</title></head>
<body style="margin:0;padding:0;background:#f2f2f2">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f2f2"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="padding:28px 40px 22px;border-bottom:3px solid #026c75">${logoUrl ? `<img src="${esc(logoUrl)}" width="220" alt="${esc(siteName)}" style="display:block;width:220px;max-width:100%;height:auto;border:0">` : `<span style="font:800 22px Arial,Helvetica,sans-serif;color:#11243c">${esc(siteName)}</span>`}</td></tr>
${ueberschrift ? `<tr><td style="padding:30px 40px 6px;font:800 24px/1.25 Arial,Helvetica,sans-serif;color:#11243c">${esc(ueberschrift)}</td></tr>` : ''}
<tr><td style="padding:14px 40px 8px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#3d5568">${body}</td></tr>
${button}
<tr><td style="padding:28px 40px 30px"><div style="border-top:1px solid #d5e0e4;padding-top:16px;font:13px/1.5 Arial,Helvetica,sans-serif;color:#7f9aa3">${esc(fuss).replace(/\n/g, '<br>')}</div></td></tr>
</table></td></tr></table>
</body></html>`;
}

export function createMailTemplates({ file, logoUrl = '', siteName = 'MeetingBackstage', baseVars = {} }) {
  let data = { vorlagen: {}, fuss: MAIL_STANDARD_FUSS };
  try {
    data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    /* noch keine eigenen Vorlagen */
  }

  /** Vorlage normalisieren: nur bekannte Felder, Inhalt gefiltert. */
  const normalize = (raw) => ({
    betreff: str(raw?.betreff, 200),
    ueberschrift: str(raw?.ueberschrift, 200),
    inhalt: cleanHtml(str(raw?.inhalt, 20_000)),
    knopf: str(raw?.knopf, 80),
  });

  const effective = (id, override) => {
    const def = MAIL_KATALOG.find((m) => m.id === id);
    if (!def) throw new Error(`Unbekannte E-Mail-Vorlage: ${id}`);
    const own = override ?? data.vorlagen[id];
    return { def, tpl: own ? { ...def.standard, ...normalize(own) } : def.standard };
  };

  return {
    /** Alles für die Verwaltung. */
    state: () => ({
      vorlagen: Object.fromEntries(MAIL_KATALOG.map((m) => [m.id, data.vorlagen[m.id] ? { ...m.standard, ...data.vorlagen[m.id] } : m.standard])),
      eigene: MAIL_KATALOG.filter((m) => data.vorlagen[m.id]).map((m) => m.id),
      fuss: data.fuss,
      katalog: MAIL_KATALOG.map(({ id, name, wann, platzhalter, standard }) => ({ id, name, wann, platzhalter, standard })),
      standardFuss: MAIL_STANDARD_FUSS,
    }),

    /** Eigene Vorlagen speichern ({ vorlagen: { id: {…} }, fuss }). Gleich dem Standard = Standard (nichts gespeichert). */
    async save(raw) {
      const vorlagen = {};
      for (const m of MAIL_KATALOG) {
        const v = raw?.vorlagen?.[m.id];
        if (!v) continue;
        const n = normalize(v);
        const std = { ...m.standard, inhalt: cleanHtml(m.standard.inhalt) };
        if (JSON.stringify(n) !== JSON.stringify(std)) vorlagen[m.id] = n;
      }
      const fuss = str(raw?.fuss ?? MAIL_STANDARD_FUSS, 600);
      data = { vorlagen, fuss };
      const tmp = `${file}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
      await fsp.rename(tmp, file);
    },

    /** Fertige Mail { subject, text, html } für eine Vorlage. override = ungespeicherte Fassung (Vorschau). */
    render(id, vars = {}, override = null, fussOverride = null) {
      const { tpl } = effective(id, override);
      const v = { ...baseVars, ...vars };
      for (const k of Object.keys(v)) v[k] = v[k] ?? '';
      // „Hallo ,“ vermeiden, wenn kein Name angegeben ist
      const inhaltRaw = v.name ? tpl.inhalt : String(tpl.inhalt).replace(/\s*\{\{name\}\}\s*,/g, ',');
      const inhalt = fillHtml(cleanHtml(inhaltRaw), v);
      const ueberschrift = fillText(tpl.ueberschrift, v);
      const knopf = fillText(tpl.knopf, v);
      const fuss = fillText(fussOverride ?? data.fuss, v);
      const subject = fillText(tpl.betreff, v).replace(/[\r\n]+/g, ' ').trim() || 'Nachricht von MeetingBackstage';
      const link = /^(https?:)/.test(String(v.link)) ? String(v.link) : '';
      const textParts = [ueberschrift, htmlToText(inhalt)];
      if (knopf && link) textParts.push(`${knopf}:\n${link}`);
      if (fuss) textParts.push(`--\n${fuss}`);
      return {
        subject,
        text: textParts.filter(Boolean).join('\n\n'),
        html: layout({ ueberschrift, inhalt, knopf, link, fuss, logoUrl, siteName }),
      };
    },

    /** Beispielwerte für Vorschau und Testmail. */
    sampleVars(id, overrides = {}) {
      const def = MAIL_KATALOG.find((m) => m.id === id);
      return { ...Object.fromEntries((def?.platzhalter ?? []).map((p) => [p.key, p.beispiel])), ...baseVars, ...overrides };
    },
  };
}
