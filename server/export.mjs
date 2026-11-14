// Export aller Daten eines Kontos als ZIP (Studio-Veranstaltung, Vorlagen, Folien, Präsentationen, Bilder und Videos).
// Das ZIP wird als Datenstrom geschrieben: große Videos landen nie komplett im Speicher.
import fs from 'node:fs';
import zlib from 'node:zlib';

const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};

function dosTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

async function crcOfFile(file) {
  let crc = 0;
  for await (const chunk of fs.createReadStream(file)) crc = zlib.crc32(chunk, crc);
  return crc;
}

/** Sichere Namen im ZIP: keine Pfadteile von außen, keine Steuerzeichen. */
export const zipName = (s) =>
  String(s)
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 80) || 'datei';

/**
 * ZIP schreiben. entries: { name, data } (Text/Buffer, wird komprimiert) oder { name, file } (Datei, unkomprimiert –
 * Bilder und Videos sind schon komprimiert). out: beschreibbarer Datenstrom (z. B. die HTTP-Antwort).
 */
export async function writeZip(out, entries) {
  const { time, date } = dosTime();
  const central = [];
  let offset = 0;
  const write = (buf) =>
    new Promise((resolve, reject) => {
      if (out.destroyed) return reject(new Error('Verbindung getrennt'));
      offset += buf.length;
      out.write(buf) ? resolve() : out.once('drain', resolve);
    });

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    let method = 0;
    let crc;
    let size;
    let body = null;
    if (e.file) {
      size = fs.statSync(e.file).size;
      crc = await crcOfFile(e.file);
    } else {
      const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
      crc = zlib.crc32(raw);
      size = raw.length;
      const packed = zlib.deflateRawSync(raw);
      if (packed.length < raw.length) {
        method = 8;
        body = packed;
      } else body = raw;
    }
    const csize = body ? body.length : size;
    const start = offset;
    // Kopf je Datei; Bit 11 = Namen in UTF-8 (Umlaute)
    await write(
      Buffer.concat([
        u32(0x04034b50),
        u16(20),
        u16(0x0800),
        u16(method),
        u16(time),
        u16(date),
        u32(crc),
        u32(csize),
        u32(size),
        u16(name.length),
        u16(0),
        name,
      ]),
    );
    if (body) await write(body);
    else {
      for await (const chunk of fs.createReadStream(e.file)) await write(chunk);
    }
    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(method),
        u16(time),
        u16(date),
        u32(crc),
        u32(csize),
        u32(size),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(start),
        name,
      ]),
    );
  }
  const cdStart = offset;
  const cd = Buffer.concat(central);
  await write(cd);
  await write(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cd.length), u32(cdStart), u16(0)]));
  out.end();
}

const LIESMICH = (wer, wann) => `MeetingBackstage – Export deiner Daten
=======================================

Konto: ${wer}
Erstellt: ${wann}

Inhalt
------
studio/veranstaltung.json   Deine Veranstaltung im Studio: Titel, Grafiken, Umfragen, Wortwolke,
                            Glücksrad, Aussehen usw. (ohne Chatnachrichten)
studio/vorlagen.json        Deine gespeicherten Vorlagen für das Aussehen der Grafiken
                            (beide fehlen beim Export eines einzelnen Ordners)

slides/folien.json          Alle Folien mit Texten, Positionen, Farben, Übergängen, 3D und Notizen,
                            dazu Ordner, Präsentationen (Reihenfolge der Folien) und die Mediathek
slides/medien/              Alle hochgeladenen Bilder und Videos in Originalqualität.
                            In folien.json verweist "/m/<name>" auf die Datei slides/medien/<name>.
                            Unter "medien" steht zu jeder Datei der ursprüngliche Dateiname.

Die JSON-Dateien sind Textdateien und lassen sich mit jedem Texteditor öffnen.
Folien als Bilder (PNG) gibt es im Folien-Editor unter „Exportieren“.
`;

/** Alle Einträge für den Export eines Kontos. */
export function exportEntries({ wer, studio, folien, mediaFile }) {
  const wann = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const entries = [{ name: 'LIESMICH.txt', data: LIESMICH(wer, wann) }];
  if (studio) {
    entries.push({ name: 'studio/veranstaltung.json', data: JSON.stringify(studio.veranstaltung ?? null, null, 2) });
    entries.push({ name: 'studio/vorlagen.json', data: JSON.stringify(studio.vorlagen ?? [], null, 2) });
  }
  entries.push({
    name: 'slides/folien.json',
    data: JSON.stringify({ ordner: folien.ordner, folien: folien.folien, praesentationen: folien.praesentationen, medien: folien.medien }, null, 2),
  });
  for (const m of folien.medien) {
    const file = mediaFile(m.name);
    if (file) entries.push({ name: `slides/medien/${zipName(m.name)}`, file });
  }
  return entries;
}
