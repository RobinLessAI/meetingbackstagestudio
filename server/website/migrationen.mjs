// Einmalige Ergänzungen der Hauptseite, wenn neue Inhalte aus dem Code dazukommen sollen.
//
// Der Inhalt der Hauptseite gehört nach dem ersten Start der Verwaltung (Seite „Website“). Neue Inhalte aus dem Code
// werden deshalb nur einmal ergänzt – im Entwurf und im veröffentlichten Stand – und nie erneut, auch wenn sie später in
// der Verwaltung gelöscht werden. Bereits vorhandene Seiten (gleiche Adresse) werden nicht angetastet.

const id = () => Math.random().toString(36).slice(2, 10);

const PRODUKTE = [
  {
    pfad: '/spotlight/',
    name: 'MeetingBackstage Spotlight',
    icon: 'mouse-pointer-click',
    kurz: 'Hebt deinen Mauszeiger mit einem farbigen Ring hervor und blendet gedrückte Tasten ein – für Schulungen und Software-Demos.',
    text:
      '<p>Wer in Online-Schulungen Software zeigt, kennt das Problem: Die Teilnehmenden sehen nicht, wo die Maus gerade ist und welche Tasten gedrückt werden.</p>' +
      '<p><strong>MeetingBackstage Spotlight</strong> legt einen gut sichtbaren Ring um deinen Mauszeiger und blendet Tastenkombinationen wie <strong>⌘ + C</strong> groß ein – über allen Programmen, während du deinen Bildschirm teilst.</p>' +
      '<ul><li>Ring um den Mauszeiger in Farbe, Größe und Stil nach Wunsch</li><li>Anzeige der gedrückten Tasten, auch als Windows-Kombination</li><li>Läuft als kleine App auf deinem Mac</li></ul>',
  },
  {
    pfad: '/snap/',
    name: 'MeetingBackstage Snap',
    icon: 'camera',
    kurz: 'Ein weiteres Werkzeug für deine Online-Veranstaltungen – in Vorbereitung.',
    text: '<p><strong>MeetingBackstage Snap</strong> ist in Vorbereitung. Hier stellen wir dir bald ein weiteres Werkzeug für deine Online-Veranstaltungen vor.</p>',
  },
  {
    pfad: '/scope/',
    name: 'MeetingBackstage Scope',
    icon: 'scan-search',
    kurz: 'Ein weiteres Werkzeug für deine Online-Veranstaltungen – in Vorbereitung.',
    text: '<p><strong>MeetingBackstage Scope</strong> ist in Vorbereitung. Hier stellen wir dir bald ein weiteres Werkzeug für deine Online-Veranstaltungen vor.</p>',
  },
];

function produktSeite(p) {
  return {
    id: id(),
    pfad: p.pfad,
    name: p.name.replace('MeetingBackstage ', ''),
    titel: p.name,
    seoTitel: '',
    beschreibung: p.kurz,
    vorschaubild: '',
    indexieren: true,
    bloecke: [
      { id: id(), typ: 'seitenkopf', augenbraue: 'Bald verfügbar', titel: p.name, text: p.kurz, knopf1: { label: '', link: '' }, knopf2: { label: '', link: '' } },
      { id: id(), typ: 'text', html: p.text, inhaltsverzeichnis: false, hintergrund: 'hell' },
      {
        id: id(),
        typ: 'aufruf',
        titel: 'Als Erste:r erfahren, wann es losgeht?',
        text: 'Schreib uns kurz – wir melden uns, sobald es verfügbar ist.',
        hintergrund: 'weiss',
        knopf1: { label: 'Benachrichtigen lassen', link: `mailto:{{mail}}?subject=${encodeURIComponent(`${p.name} – bitte benachrichtigen`)}` },
        knopf2: { label: 'Zur Startseite', link: '/' },
      },
    ],
  };
}

export const MIGRATIONEN = [
  {
    id: 'produkte-2026-11',
    apply(content) {
      const c = structuredClone(content);
      const pfade = new Set(c.seiten.map((s) => s.pfad));
      // Produktseiten
      for (const p of PRODUKTE) if (!pfade.has(p.pfad)) c.seiten.splice(Math.max(1, c.seiten.length - 1), 0, produktSeite(p));
      // Abschnitt „Produkte“ auf der Startseite (vor den Fragen)
      const home = c.seiten.find((s) => s.pfad === '/');
      if (home && !home.bloecke.some((b) => b.anker === 'produkte')) {
        const block = {
          id: id(),
          typ: 'karten',
          anker: 'produkte',
          augenbraue: 'Produkte',
          titel: 'Die MeetingBackstage-Familie',
          text: 'Das Studio ist erst der Anfang. Weitere Werkzeuge für deine Online-Veranstaltungen sind in Vorbereitung.',
          hintergrund: 'weiss',
          karten: [
            { icon: 'monitor-play', titel: 'MeetingBackstage Studio', text: 'Live-Grafiken und Regie für deine Zoom-Workshops.', link: '{{studio}}', hinweis: 'Verfügbar' },
            ...PRODUKTE.map((p) => ({ icon: p.icon, titel: p.name, text: p.kurz, link: p.pfad, hinweis: 'Bald verfügbar' })),
          ],
        };
        const fragen = home.bloecke.findIndex((b) => b.typ === 'fragen');
        home.bloecke.splice(fragen >= 0 ? fragen : home.bloecke.length, 0, block);
      }
      // Menüpunkt
      if (!c.site.navigation.some((n) => n.link === '/#produkte')) {
        const hilfe = c.site.navigation.findIndex((n) => n.link === '/hilfe/');
        c.site.navigation.splice(hilfe >= 0 ? hilfe : c.site.navigation.length, 0, { label: 'Produkte', link: '/#produkte' });
      }
      return c;
    },
  },
];
