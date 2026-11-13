import type { ReactNode } from 'react';
import { AlignLeft, CircleHelp, Footprints, Image, LayoutGrid, List, Megaphone, PanelTop, Presentation, Rows3, type LucideIcon } from 'lucide-react';
import { Switch } from '../../components/ui.tsx';
import { BgSelect, IconSelect, ImageField, KnopfFields, ListEditor, TextField } from './fields.tsx';
import { RichText } from './RichText.tsx';
import type { Block, BlockTyp } from './types.ts';

const newId = () => Math.random().toString(36).slice(2, 10);
const knopf = (label = '', link = '') => ({ label, link });

type Of<T extends BlockTyp> = Extract<Block, { typ: T }>;
type Upd<T extends BlockTyp> = (patch: Partial<Of<T>>) => void;

interface BlockDef<T extends BlockTyp> {
  label: string;
  beschreibung: string;
  icon: LucideIcon;
  create: () => Of<T>;
  summary: (b: Of<T>) => string;
  Editor: (p: { b: Of<T>; up: Upd<T> }) => ReactNode;
}

/** Überschriften-Felder, die viele Blöcke teilen. */
function Heading({ b, up, text = true }: { b: { augenbraue: string; titel: string; text: string }; up: (p: { augenbraue?: string; titel?: string; text?: string }) => void; text?: boolean }) {
  return (
    <>
      <div className="ws-row">
        <TextField label="Kleine Zeile darüber" value={b.augenbraue} onChange={(v) => up({ augenbraue: v })} placeholder="z. B. Funktionen" />
        <TextField label="Überschrift" value={b.titel} onChange={(v) => up({ titel: v })} />
      </div>
      {text && <TextField label="Einleitung" value={b.text} onChange={(v) => up({ text: v })} multiline rows={2} />}
    </>
  );
}
const Anchor = ({ b, up }: { b: { anker?: string }; up: (p: { anker: string }) => void }) => (
  <TextField label="Sprungmarke (optional)" value={b.anker ?? ''} onChange={(v) => up({ anker: v })} placeholder="z. B. funktionen" hint="Damit lässt sich dieser Abschnitt direkt verlinken, z. B. /#funktionen." />
);

export const BLOCKS: { [T in BlockTyp]: BlockDef<T> } = {
  buehne: {
    label: 'Bühne (großer Einstieg)',
    beschreibung: 'Große Überschrift mit Text, Knöpfen und Bild – für den Anfang einer Seite.',
    icon: Presentation,
    create: () => ({ id: newId(), typ: 'buehne', kicker: '', titel: 'Neue Überschrift', text: '', knopf1: knopf('Konto anlegen', '{{studio}}/?konto=neu'), knopf2: knopf(), hinweis: '', bild: '', bildAlt: '' }),
    summary: (b) => b.titel,
    Editor: ({ b, up }) => (
      <>
        <TextField label="Kleine Zeile darüber" value={b.kicker} onChange={(v) => up({ kicker: v })} />
        <TextField label="Überschrift" value={b.titel} onChange={(v) => up({ titel: v })} hint="Wörter zwischen *Sternchen* werden farbig hervorgehoben." />
        <TextField label="Text" value={b.text} onChange={(v) => up({ text: v })} multiline />
        <KnopfFields label="Erster Knopf (hervorgehoben)" value={b.knopf1} onChange={(v) => up({ knopf1: v })} />
        <KnopfFields label="Zweiter Knopf" value={b.knopf2} onChange={(v) => up({ knopf2: v })} />
        <TextField label="Hinweis unter den Knöpfen" value={b.hinweis} onChange={(v) => up({ hinweis: v })} />
        <ImageField label="Bild rechts" value={b.bild} onChange={(v) => up({ bild: v })} hint="Ohne eigenes Bild erscheint die Meeting-Darstellung mit Live-Grafiken." />
        {b.bild && <TextField label="Bildbeschreibung (für Screenreader und Google)" value={b.bildAlt} onChange={(v) => up({ bildAlt: v })} />}
      </>
    ),
  },
  seitenkopf: {
    label: 'Seitenkopf',
    beschreibung: 'Schlichter Kopf mit Titel und Text – für Unterseiten.',
    icon: PanelTop,
    create: () => ({ id: newId(), typ: 'seitenkopf', augenbraue: '', titel: 'Seitentitel', text: '', knopf1: knopf(), knopf2: knopf() }),
    summary: (b) => b.titel,
    Editor: ({ b, up }) => (
      <>
        <Heading b={b} up={up} />
        <KnopfFields label="Knopf (optional)" value={b.knopf1} onChange={(v) => up({ knopf1: v })} />
        <KnopfFields label="Zweiter Knopf (optional)" value={b.knopf2} onChange={(v) => up({ knopf2: v })} />
      </>
    ),
  },
  karten: {
    label: 'Karten mit Symbolen',
    beschreibung: 'Raster aus Karten mit Symbol, Titel und kurzem Text – z. B. Funktionen oder Vorteile.',
    icon: LayoutGrid,
    create: () => ({ id: newId(), typ: 'karten', augenbraue: '', titel: 'Überschrift', text: '', hintergrund: 'hell', karten: [{ icon: 'star', titel: 'Titel', text: 'Kurzer Text', link: '', hinweis: '' }] }),
    summary: (b) => `${b.titel} · ${b.karten.length} Karten`,
    Editor: ({ b, up }) => (
      <>
        <Heading b={b} up={up} />
        <ListEditor
          label="Karten"
          items={b.karten}
          onChange={(karten) => up({ karten })}
          create={() => ({ icon: 'star', titel: '', text: '', link: '', hinweis: '' })}
          itemLabel={(k) => k.titel}
          addLabel="Karte hinzufügen"
          render={(k, u) => (
            <>
              <div className="ws-row ws-row--icon">
                <IconSelect value={k.icon} onChange={(icon) => u({ icon })} />
                <TextField label="Titel" value={k.titel} onChange={(titel) => u({ titel })} />
                <TextField label="Text" value={k.text} onChange={(text) => u({ text })} multiline rows={2} />
              </div>
              <div className="ws-row">
                <TextField label="Link (optional)" value={k.link ?? ''} onChange={(link) => u({ link })} placeholder="/spotlight/ · https://…" hint="Mit Link wird die ganze Karte klickbar („Mehr erfahren“)." />
                <TextField label="Hinweis-Etikett (optional)" value={k.hinweis ?? ''} onChange={(hinweis) => u({ hinweis })} placeholder="z. B. Bald verfügbar" />
              </div>
            </>
          )}
        />
        <div className="ws-row">
          <BgSelect value={b.hintergrund} onChange={(hintergrund) => up({ hintergrund })} />
          <Anchor b={b} up={up} />
        </div>
      </>
    ),
  },
  schritte: {
    label: 'Schritte',
    beschreibung: 'Nummerierte Schritte nebeneinander – z. B. „So funktioniert’s“.',
    icon: Footprints,
    create: () => ({ id: newId(), typ: 'schritte', augenbraue: '', titel: 'So funktioniert’s', text: '', hintergrund: 'navy', schritte: [{ titel: 'Erster Schritt', text: '' }] }),
    summary: (b) => `${b.titel} · ${b.schritte.length} Schritte`,
    Editor: ({ b, up }) => (
      <>
        <Heading b={b} up={up} />
        <ListEditor
          label="Schritte"
          items={b.schritte}
          onChange={(schritte) => up({ schritte })}
          create={() => ({ titel: '', text: '' })}
          itemLabel={(s, i) => `${i + 1}. ${s.titel}`}
          addLabel="Schritt hinzufügen"
          max={12}
          render={(s, u) => (
            <>
              <TextField label="Titel" value={s.titel} onChange={(titel) => u({ titel })} />
              <TextField label="Text" value={s.text} onChange={(text) => u({ text })} multiline rows={2} />
            </>
          )}
        />
        <div className="ws-row">
          <BgSelect value={b.hintergrund} onChange={(hintergrund) => up({ hintergrund })} />
          <Anchor b={b} up={up} />
        </div>
      </>
    ),
  },
  liste: {
    label: 'Liste mit Kasten',
    beschreibung: 'Links eine Liste mit Häkchen, rechts ein farbiger Kasten – z. B. „Für wen“ und „Datenschutz“.',
    icon: List,
    create: () => ({ id: newId(), typ: 'liste', augenbraue: '', titel: 'Überschrift', text: '', hintergrund: 'weiss', punkte: [{ titel: 'Punkt', text: '' }], kasten: { icon: 'shield-check', titel: '', punkte: [] } }),
    summary: (b) => b.titel,
    Editor: ({ b, up }) => (
      <>
        <Heading b={b} up={up} />
        <ListEditor
          label="Punkte mit Häkchen"
          items={b.punkte}
          onChange={(punkte) => up({ punkte })}
          create={() => ({ titel: '', text: '' })}
          itemLabel={(p) => p.titel}
          addLabel="Punkt hinzufügen"
          render={(p, u) => (
            <div className="ws-row">
              <TextField label="Titel" value={p.titel} onChange={(titel) => u({ titel })} />
              <TextField label="Text" value={p.text} onChange={(text) => u({ text })} />
            </div>
          )}
        />
        <fieldset className="ws-group">
          <legend>Kasten rechts (leer lassen = kein Kasten)</legend>
          <div className="ws-row ws-row--icon">
            <IconSelect value={b.kasten.icon} onChange={(icon) => up({ kasten: { ...b.kasten, icon } })} />
            <TextField label="Titel" value={b.kasten.titel} onChange={(titel) => up({ kasten: { ...b.kasten, titel } })} />
          </div>
          <TextField
            label="Punkte (einer pro Zeile)"
            value={b.kasten.punkte.join('\n')}
            onChange={(v) => up({ kasten: { ...b.kasten, punkte: v.split('\n') } })}
            multiline
            rows={5}
          />
        </fieldset>
        <div className="ws-row">
          <BgSelect value={b.hintergrund} onChange={(hintergrund) => up({ hintergrund })} />
          <Anchor b={b} up={up} />
        </div>
      </>
    ),
  },
  fragen: {
    label: 'Häufige Fragen',
    beschreibung: 'Fragen zum Aufklappen mit formatierten Antworten.',
    icon: CircleHelp,
    create: () => ({ id: newId(), typ: 'fragen', augenbraue: 'Fragen', titel: 'Häufige Fragen', text: '', hintergrund: 'hell', fragen: [{ frage: 'Neue Frage?', antwort: '' }] }),
    summary: (b) => `${b.titel} · ${b.fragen.length} Fragen`,
    Editor: ({ b, up }) => (
      <>
        <Heading b={b} up={up} />
        <ListEditor
          label="Fragen"
          items={b.fragen}
          onChange={(fragen) => up({ fragen })}
          create={() => ({ frage: '', antwort: '' })}
          itemLabel={(f) => f.frage}
          addLabel="Frage hinzufügen"
          render={(f, u) => (
            <>
              <TextField label="Frage" value={f.frage} onChange={(frage) => u({ frage })} />
              <div className="field">
                <span className="field-label">Antwort</span>
                <RichText label="Antwort" value={f.antwort} onChange={(antwort) => u({ antwort })} minHeight={90} />
              </div>
            </>
          )}
        />
        <div className="ws-row">
          <BgSelect value={b.hintergrund} onChange={(hintergrund) => up({ hintergrund })} />
          <Anchor b={b} up={up} />
        </div>
      </>
    ),
  },
  aufruf: {
    label: 'Aufruf (farbiges Band)',
    beschreibung: 'Petrolfarbenes Band mit Überschrift und Knöpfen – gut am Ende einer Seite.',
    icon: Megaphone,
    create: () => ({ id: newId(), typ: 'aufruf', titel: 'Bereit für deinen nächsten Workshop?', text: '', hintergrund: 'weiss', knopf1: knopf('Konto anlegen', '{{studio}}/?konto=neu'), knopf2: knopf() }),
    summary: (b) => b.titel,
    Editor: ({ b, up }) => (
      <>
        <TextField label="Überschrift" value={b.titel} onChange={(titel) => up({ titel })} />
        <TextField label="Text" value={b.text} onChange={(text) => up({ text })} multiline rows={2} />
        <KnopfFields label="Erster Knopf" value={b.knopf1} onChange={(v) => up({ knopf1: v })} />
        <KnopfFields label="Zweiter Knopf" value={b.knopf2} onChange={(v) => up({ knopf2: v })} />
        <BgSelect value={b.hintergrund} onChange={(hintergrund) => up({ hintergrund })} />
      </>
    ),
  },
  text: {
    label: 'Text',
    beschreibung: 'Formatierter Fließtext mit Zwischenüberschriften, Listen und Links – z. B. für Impressum oder Anleitungen.',
    icon: AlignLeft,
    create: () => ({ id: newId(), typ: 'text', html: '<p>Neuer Text</p>', inhaltsverzeichnis: false, hintergrund: 'hell' }),
    summary: (b) => b.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
    Editor: ({ b, up }) => (
      <>
        <RichText label="Text" value={b.html} onChange={(html) => up({ html })} minHeight={260} />
        <Switch checked={b.inhaltsverzeichnis} onChange={(inhaltsverzeichnis) => up({ inhaltsverzeichnis })} label="Inhaltsverzeichnis anzeigen" description="Aus den Zwischenüberschriften wird oben eine Sprungleiste." />
        <div className="ws-row">
          <BgSelect value={b.hintergrund} onChange={(hintergrund) => up({ hintergrund })} />
          <Anchor b={b} up={up} />
        </div>
      </>
    ),
  },
  bild: {
    label: 'Bild',
    beschreibung: 'Ein großes Bild mit Bildunterschrift.',
    icon: Image,
    create: () => ({ id: newId(), typ: 'bild', bild: '', alt: '', unterschrift: '', breite: 'voll', hintergrund: 'hell' }),
    summary: (b) => b.alt || b.unterschrift || (b.bild ? 'Bild' : 'noch kein Bild'),
    Editor: ({ b, up }) => (
      <>
        <ImageField label="Bild" value={b.bild} onChange={(bild) => up({ bild })} />
        <TextField label="Bildbeschreibung (für Screenreader und Google)" value={b.alt} onChange={(alt) => up({ alt })} />
        <TextField label="Bildunterschrift (optional)" value={b.unterschrift} onChange={(unterschrift) => up({ unterschrift })} />
        <div className="ws-row">
          <div className="field">
            <span className="field-label">Breite</span>
            <select className="select" value={b.breite} onChange={(e) => up({ breite: e.target.value as 'voll' | 'text' })}>
              <option value="voll">Volle Breite</option>
              <option value="text">Textbreite</option>
            </select>
          </div>
          <BgSelect value={b.hintergrund} onChange={(hintergrund) => up({ hintergrund })} />
        </div>
      </>
    ),
  },
  bildtext: {
    label: 'Bild und Text',
    beschreibung: 'Bild auf der einen, Überschrift und Text auf der anderen Seite.',
    icon: Rows3,
    create: () => ({ id: newId(), typ: 'bildtext', bild: '', alt: '', augenbraue: '', titel: 'Überschrift', html: '<p>Text</p>', bildRechts: false, hintergrund: 'weiss', knopf1: knopf() }),
    summary: (b) => b.titel,
    Editor: ({ b, up }) => (
      <>
        <ImageField label="Bild" value={b.bild} onChange={(bild) => up({ bild })} />
        <TextField label="Bildbeschreibung (für Screenreader und Google)" value={b.alt} onChange={(alt) => up({ alt })} />
        <Switch checked={b.bildRechts} onChange={(bildRechts) => up({ bildRechts })} label="Bild rechts statt links" />
        <div className="ws-row">
          <TextField label="Kleine Zeile darüber" value={b.augenbraue} onChange={(augenbraue) => up({ augenbraue })} />
          <TextField label="Überschrift" value={b.titel} onChange={(titel) => up({ titel })} />
        </div>
        <RichText label="Text" value={b.html} onChange={(html) => up({ html })} minHeight={140} />
        <KnopfFields label="Knopf (optional)" value={b.knopf1} onChange={(v) => up({ knopf1: v })} />
        <div className="ws-row">
          <BgSelect value={b.hintergrund} onChange={(hintergrund) => up({ hintergrund })} />
          <Anchor b={b} up={up} />
        </div>
      </>
    ),
  },
};

/** Typ-sicherer Zugriff für eine Liste gemischter Blöcke. */
export function BlockEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const def = BLOCKS[block.typ] as unknown as BlockDef<BlockTyp>;
  const Editor = def.Editor as (p: { b: Block; up: (patch: Partial<Block>) => void }) => ReactNode;
  return <Editor b={block} up={(patch) => onChange({ ...block, ...patch } as Block)} />;
}
export const blockSummary = (b: Block) => (BLOCKS[b.typ] as unknown as BlockDef<BlockTyp>).summary(b as never);
export const createBlock = (typ: BlockTyp): Block => BLOCKS[typ].create() as Block;
