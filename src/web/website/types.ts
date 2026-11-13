// Inhalt der Hauptseite, wie ihn der Server speichert (server/website/store.mjs prüft jedes Feld).

export interface Knopf {
  label: string;
  link: string;
}
export interface NavLink {
  label: string;
  link: string;
}
export type Hintergrund = 'hell' | 'weiss' | 'navy';

interface BlockBase {
  id: string;
  anker?: string;
}
export type Block =
  | (BlockBase & { typ: 'buehne'; kicker: string; titel: string; text: string; knopf1: Knopf; knopf2: Knopf; hinweis: string; bild: string; bildAlt: string })
  | (BlockBase & { typ: 'seitenkopf'; augenbraue: string; titel: string; text: string; knopf1: Knopf; knopf2: Knopf })
  | (BlockBase & { typ: 'karten'; augenbraue: string; titel: string; text: string; hintergrund: Hintergrund; karten: Array<{ icon: string; titel: string; text: string }> })
  | (BlockBase & { typ: 'schritte'; augenbraue: string; titel: string; text: string; hintergrund: Hintergrund; schritte: Array<{ titel: string; text: string }> })
  | (BlockBase & {
      typ: 'liste';
      augenbraue: string;
      titel: string;
      text: string;
      hintergrund: Hintergrund;
      punkte: Array<{ titel: string; text: string }>;
      kasten: { icon: string; titel: string; punkte: string[] };
    })
  | (BlockBase & { typ: 'fragen'; augenbraue: string; titel: string; text: string; hintergrund: Hintergrund; fragen: Array<{ frage: string; antwort: string }> })
  | (BlockBase & { typ: 'aufruf'; titel: string; text: string; hintergrund: Hintergrund; knopf1: Knopf; knopf2: Knopf })
  | (BlockBase & { typ: 'text'; html: string; inhaltsverzeichnis: boolean; hintergrund: Hintergrund })
  | (BlockBase & { typ: 'bild'; bild: string; alt: string; unterschrift: string; breite: 'voll' | 'text'; hintergrund: Hintergrund })
  | (BlockBase & { typ: 'bildtext'; bild: string; alt: string; augenbraue: string; titel: string; html: string; bildRechts: boolean; hintergrund: Hintergrund; knopf1: Knopf });

export type BlockTyp = Block['typ'];

export interface Seite {
  id: string;
  pfad: string;
  name: string;
  titel: string;
  seoTitel: string;
  beschreibung: string;
  vorschaubild: string;
  indexieren: boolean;
  bloecke: Block[];
}

export interface Favicon {
  svg: string;
  png32: string;
  png180: string;
  png512: string;
}

export interface Site {
  name: string;
  slogan: string;
  startTitel: string;
  titelVorlage: string;
  beschreibung: string;
  kontaktMail: string;
  indexieren: boolean;
  favicon: Favicon | null;
  vorschaubild: string;
  kopfStil: 'hell' | 'dunkel';
  logo: string;
  logoFuss: string;
  navigation: NavLink[];
  kopfKnoepfe: Array<NavLink & { stil: 'primaer' | 'leise' }>;
  fussText: string;
  fussLinks: NavLink[];
  fussKlein: string;
}

export interface Inhalt {
  version: 1;
  site: Site;
  seiten: Seite[];
}

export interface Medium {
  name: string;
  url: string;
  groesse: number;
  at: number;
}

export interface WebsiteState {
  entwurf: Inhalt;
  entwurfAm: number | null;
  veroeffentlichtAm: number | null;
  geaendert: boolean;
  versionen: Array<{ id: string; at: number | null }>;
  medien: Medium[];
  symbole: string[];
  siteUrl: string;
  studioUrl: string;
  medienMax: number;
}
