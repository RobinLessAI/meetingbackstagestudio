// Rollen und Rechte (Web-Modus): Was sieht welches Konto im Studio?
//
// „Admin“ ist fest eingebaut und sieht alles, inklusive Verwaltung und Website. Weitere Rollen (z. B. „Nutzer“,
// später „Basis“ und „Pro“) legt die Verwaltung an und wählt je Rolle die Bereiche. Fehlende Bereiche können
// ausgegraut im Menü erscheinen – mit einem Hinweis, wie man sie bekommt (z. B. kostenpflichtiges Paket).
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

/** Alle Bereiche, die sich je Rolle freischalten lassen (Reihenfolge = Anzeige). */
export const BEREICHE = [
  { id: 'meeting', label: 'Meeting', gruppe: 'Grundlagen' },
  { id: 'grafik:highlight', label: 'Chat-Highlight', gruppe: 'Live Grafiken' },
  { id: 'grafik:umfrage', label: 'Umfrage', gruppe: 'Live Grafiken' },
  { id: 'grafik:karte', label: 'Weltkarte', gruppe: 'Live Grafiken' },
  { id: 'grafik:wortwolke', label: 'Wortwolke', gruppe: 'Live Grafiken' },
  { id: 'grafik:gluecksrad', label: 'Glücksrad', gruppe: 'Live Grafiken' },
  { id: 'spotlight', label: 'Spotlight (Personen in Zoom hervorheben)', gruppe: 'Regie' },
  { id: 'dran', label: 'Wer war dran', gruppe: 'Regie' },
  { id: 'ausgabe', label: 'OBS-Ausgabe', gruppe: 'Ausgabe' },
  { id: 'slides', label: 'Slides (Folien für OBS)', gruppe: 'Ausgabe' },
  { id: 'integrationen', label: 'Zoom & Einstellungen', gruppe: 'Grundlagen' },
  { id: 'produkte', label: 'Weitere Produkte', gruppe: 'Grundlagen' },
];
const ALLE = BEREICHE.map((b) => b.id);
const ADMIN_EXTRA = ['verwaltung', 'website'];

export const STANDARD_HINWEIS =
  'Dieser Bereich ist in deinem Paket nicht enthalten. Schreib uns an info@meetingbackstage.de, wenn du ihn freischalten möchtest.';

const DEFAULT = {
  rollen: [{ id: 'nutzer', name: 'Nutzer', bereiche: ALLE, gesperrteZeigen: true, hinweis: STANDARD_HINWEIS }],
  standard: 'nutzer',
};

export class RoleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function createRoles({ file, log = () => {} }) {
  let data = DEFAULT;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = normalize(raw);
  } catch {
    data = structuredClone(DEFAULT);
  }

  /** authoritative = aus der Verwaltung gespeichert: Haken gelten genau so (keine automatische Freischaltung). */
  function normalize(raw, authoritative = false) {
    const seen = new Set();
    const rollen = (Array.isArray(raw?.rollen) ? raw.rollen : []).slice(0, 20).map((r) => {
      let id = String(r?.id ?? '').trim();
      if (!/^[a-z0-9-]{1,40}$/.test(id) || id === 'admin' || seen.has(id)) id = `rolle-${crypto.randomBytes(3).toString('hex')}`;
      seen.add(id);
      const name = String(r?.name ?? '').trim().slice(0, 40);
      if (!name) throw new RoleError('Jede Rolle braucht einen Namen.');
      if (name.toLowerCase() === 'admin') throw new RoleError('„Admin“ ist fest eingebaut. Bitte einen anderen Namen wählen.');
      return {
        id,
        name,
        bereiche: ALLE.filter((b) => Array.isArray(r?.bereiche) && r.bereiche.includes(b)),
        gesperrteZeigen: r?.gesperrteZeigen !== false,
        hinweis: String(r?.hinweis ?? '').slice(0, 400),
      };
    });
    if (!rollen.length) throw new RoleError('Mindestens eine Rolle wird gebraucht.');
    const standard = rollen.some((r) => r.id === raw?.standard) ? raw.standard : rollen[0].id;
    // Neue Bereiche (seit der Datei gespeichert wurde) sind für alle Rollen erst einmal freigeschaltet.
    const bekannt = authoritative ? ALLE : Array.isArray(raw?.bekannt) ? raw.bekannt : ALLE.filter((b) => b !== 'slides');
    for (const neu of ALLE.filter((b) => !bekannt.includes(b))) for (const r of rollen) if (!r.bereiche.includes(neu)) r.bereiche.push(neu);
    return { rollen, standard, bekannt: ALLE };
  }

  return {
    state: () => ({ ...structuredClone(data), bereiche: BEREICHE, standardHinweis: STANDARD_HINWEIS }),

    async save(raw) {
      const next = normalize(raw, true);
      const tmp = `${file}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(next, null, 1), { mode: 0o600 });
      await fsp.rename(tmp, file);
      data = next;
      log(`Rollen gespeichert: ${next.rollen.map((r) => r.name).join(', ')}`);
      return this.state();
    },

    exists: (id) => id === 'admin' || data.rollen.some((r) => r.id === id),

    /** Rechte eines Kontos für das Studio. */
    permissionsFor(user) {
      if (!user) return { rolle: null, rolleName: '', bereiche: [], gesperrteZeigen: false, hinweis: '' };
      if (user.admin) return { rolle: 'admin', rolleName: 'Admin', bereiche: [...ALLE, ...ADMIN_EXTRA], gesperrteZeigen: false, hinweis: '' };
      const r = data.rollen.find((x) => x.id === user.rolle) ?? data.rollen.find((x) => x.id === data.standard) ?? data.rollen[0];
      return { rolle: r.id, rolleName: r.name, bereiche: [...r.bereiche], gesperrteZeigen: r.gesperrteZeigen, hinweis: r.hinweis };
    },
  };
}
