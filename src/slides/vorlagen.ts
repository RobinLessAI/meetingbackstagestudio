// Vorlagen für neue Folien (danach frei veränderbar).
import { neueForm, neuerText, STANDARD_3D, STANDARD_HINTERGRUND, type Folie } from './model.ts';

export type VorlageId = 'leer' | 'bauchbinde' | 'titel' | 'pause' | 'zitat' | 'punkte';

export const VORLAGEN: Array<{ id: VorlageId; name: string; beschreibung: string }> = [
  { id: 'bauchbinde', name: 'Bauchbinde', beschreibung: 'Name und Rolle unten links über dem Video' },
  { id: 'titel', name: 'Titelfolie', beschreibung: 'Großer Titel mit Untertitel auf Farbverlauf' },
  { id: 'pause', name: 'Pause', beschreibung: '„Gleich geht’s weiter“ als Vollbild' },
  { id: 'punkte', name: 'Aufzählung', beschreibung: 'Überschrift und drei Punkte, die in der Präsentation einzeln per Klick erscheinen' },
  { id: 'zitat', name: 'Zitat', beschreibung: 'Zitat in einem Kasten, durchsichtiger Hintergrund' },
  { id: 'leer', name: 'Leer', beschreibung: 'Durchsichtige Fläche ohne Inhalt' },
];

/** Vorlage als vollständige neue Folie (ohne ID und Adresse, die vergibt der Server). */
export function vorlage(id: VorlageId, name: string): Pick<Folie, 'name' | 'hintergrund' | 'elemente' | 'uebergang' | 'notizen' | 'dreiD'> {
  return {
    uebergang: { typ: 'blende', dauer: 0.6 },
    notizen: '',
    dreiD: { ...STANDARD_3D },
    ...(inhalt(id, name) as Pick<Folie, 'name' | 'hintergrund' | 'elemente'>),
  };
}

function inhalt(id: VorlageId, name: string): Partial<Folie> {
  const hg = { ...STANDARD_HINTERGRUND };
  if (id === 'bauchbinde') {
    const balken = {
      ...neueForm('rechteck'),
      name: 'Balken',
      x: 80,
      y: 820,
      w: 760,
      h: 170,
      radius: 20,
      fill: '#11243c',
      fill2: '#026c75',
      verlauf: true,
      winkel: 90,
      anim: 'von-links' as const,
    };
    const akzent = { ...neueForm('rechteck'), name: 'Akzent', x: 80, y: 820, w: 12, h: 170, radius: 6, fill: '#3cb4bd', anim: 'von-links' as const };
    const n = {
      ...neuerText(),
      name: 'Name',
      text: 'Vorname Nachname',
      x: 120,
      y: 835,
      w: 700,
      h: 80,
      size: 60,
      align: 'left' as const,
      valign: 'middle' as const,
      shadow: false,
      pad: 0,
      anim: 'von-links' as const,
      animVerz: 0.15,
    };
    const r = {
      ...neuerText(),
      name: 'Rolle',
      text: 'Moderation · Firma',
      x: 120,
      y: 912,
      w: 700,
      h: 56,
      size: 34,
      weight: 400 as const,
      color: '#a2bdc3',
      align: 'left' as const,
      valign: 'middle' as const,
      shadow: false,
      pad: 0,
      anim: 'von-links' as const,
      animVerz: 0.3,
    };
    return { name, hintergrund: hg, elemente: [balken, akzent, n, r] };
  }
  if (id === 'titel' || id === 'pause') {
    const t = {
      ...neuerText(),
      name: 'Titel',
      text: id === 'pause' ? 'Gleich geht’s weiter' : 'Titel deines Workshops',
      x: 160,
      y: 360,
      w: 1600,
      h: 220,
      size: id === 'pause' ? 120 : 110,
      font: 'Urbanist',
      anim: 'von-unten' as const,
    };
    const u = {
      ...neuerText(),
      name: 'Untertitel',
      text: id === 'pause' ? 'Wir sind in wenigen Minuten zurück.' : 'Untertitel · Datum',
      x: 160,
      y: 590,
      w: 1600,
      h: 100,
      size: 48,
      weight: 400 as const,
      color: '#a2bdc3',
      shadow: false,
      anim: 'von-unten' as const,
      animVerz: 0.25,
    };
    return { name, hintergrund: { ...hg, typ: 'verlauf', color: '#11243c', color2: '#026c75', winkel: 135 }, elemente: [t, u] };
  }
  if (id === 'zitat') {
    const t = {
      ...neuerText(),
      name: 'Zitat',
      text: '„Hier steht ein Zitat oder eine wichtige Aussage.“',
      x: 360,
      y: 300,
      w: 1200,
      h: 360,
      size: 64,
      font: 'Playfair Display',
      italic: true,
      bg: '#11243c',
      bgOpacity: 0.9,
      pad: 60,
      radius: 28,
      shadow: false,
    };
    const a = {
      ...neuerText(),
      name: 'Quelle',
      text: '– Name',
      x: 360,
      y: 680,
      w: 1200,
      h: 80,
      size: 40,
      weight: 400 as const,
      color: '#ffffff',
      align: 'right' as const,
      shadow: true,
      pad: 0,
      animVerz: 0.3,
    };
    return { name, hintergrund: hg, elemente: [t, a] };
  }
  if (id === 'punkte') {
    const t = {
      ...neuerText(),
      name: 'Überschrift',
      text: 'Drei Punkte für heute',
      x: 160,
      y: 140,
      w: 1600,
      h: 160,
      size: 88,
      font: 'Urbanist',
      align: 'left' as const,
      shadow: false,
      anim: 'von-unten' as const,
    };
    const punkt = (n: number, text: string) => ({
      ...neuerText(),
      name: `Punkt ${n}`,
      text: `•  ${text}`,
      x: 200,
      y: 340 + (n - 1) * 170,
      w: 1520,
      h: 130,
      size: 60,
      weight: 400 as const,
      align: 'left' as const,
      shadow: false,
      anim: 'von-links' as const,
      schritt: n,
    });
    return {
      name,
      hintergrund: { ...hg, typ: 'verlauf', color: '#11243c', color2: '#17364c', winkel: 135 },
      elemente: [t, punkt(1, 'Erster Punkt'), punkt(2, 'Zweiter Punkt'), punkt(3, 'Dritter Punkt')],
    };
  }
  return { name, hintergrund: hg, elemente: [] };
}
