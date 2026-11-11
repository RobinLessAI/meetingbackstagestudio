import { useId, useMemo, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { OutputView, type OutputOptions } from '../../ausgabe/Output.tsx';
import { Button, Field, Panel, Segmented, Switch } from '../../components/ui.tsx';
import { DEFAULT_LOOKS, LOOK_PRESETS } from '../../data/graphicLooks.ts';
import { useStore } from '../../state/store.tsx';
import type { CloudLook, GraphicLooks, LookPosition, MapLook, PollLook, WheelLook } from '../../state/types.ts';
import { buildSnapshot } from '../../sync/snapshot.ts';
import { matches, TemplateBar } from '../../components/TemplateBar.tsx';

type LookKind = keyof GraphicLooks;
type AnyLook = MapLook & PollLook & CloudLook & WheelLook;

const POSITIONS: Array<{ id: LookPosition; label: string }> = [
  { id: 'oben-links', label: 'Oben links' },
  { id: 'oben-mitte', label: 'Oben Mitte' },
  { id: 'oben-rechts', label: 'Oben rechts' },
  { id: 'mitte-links', label: 'Mitte links' },
  { id: 'mitte', label: 'Mitte' },
  { id: 'mitte-rechts', label: 'Mitte rechts' },
  { id: 'unten-links', label: 'Unten links' },
  { id: 'unten-mitte', label: 'Unten Mitte' },
  { id: 'unten-rechts', label: 'Unten rechts' },
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="hl-color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>
        <span className="field-label">{label}</span>
        <span className="subtle mono">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => `${v} %`,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <Field label={`${label}: ${format(value)}`} htmlFor={id}>
      <input id={id} className="range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

function Section({ title, children, open = false, onReset }: { title: string; children: ReactNode; open?: boolean; onReset?: () => void }) {
  return (
    <details className="look-section" open={open}>
      <summary>{title}</summary>
      <div className="look-section__body">
        {children}
        {onReset && (
          <button type="button" className="look-section__reset" onClick={onReset}>
            <RotateCcw size={13} aria-hidden /> Diesen Abschnitt auf Standard zurücksetzen
          </button>
        )}
      </div>
    </details>
  );
}

/** Welche Werte zu welchem Abschnitt gehören (für das Zurücksetzen pro Abschnitt). */
const SECTION_KEYS: Record<string, Array<keyof AnyLook>> = {
  platzierung: ['position', 'width', 'height', 'marginX', 'marginY'],
  box: ['background', 'backgroundOpacity', 'border', 'borderColor', 'corners', 'shadow', 'padding'],
  text: ['font', 'scale', 'text', 'muted', 'accent', 'showTitle', 'title', 'titleAlign', 'showMeta'],
  vollbild: ['fullBackground', 'fullColor', 'fullOpacity'],
  karte: ['land', 'ocean', 'oceanOpacity', 'borders', 'pin', 'pinSize', 'showLabels', 'labelColor', 'showCounts'],
  umfrage: ['barColor', 'trackColor', 'trackOpacity', 'highlightLeader', 'multiColor', 'showPercent', 'showCounts', 'showKeys', 'sortByVotes', 'barSize'],
  wortwolke: ['colorMode', 'wordColor', 'maxWords', 'minSize', 'maxSize', 'weight', 'uppercase', 'gap'],
  gluecksrad: ['wheelColors', 'wheelColorA', 'wheelColorB', 'wheelText', 'wheelRim', 'pointerColor', 'showWinner', 'winnerBackground', 'winnerText'],
};

/**
 * Darstellung einer Grafik für OBS: Vorschau im 16:9-Rahmen (genau wie die Ausgabe)
 * und alle Einstellungen für Platzierung, Box, Text, Vollbild und die Grafik selbst.
 */
export function LookPanel({ graphic }: { graphic: LookKind }) {
  const { state, derived, dispatch } = useStore();
  const [mode, setMode] = useState<'einblendung' | 'vollbild'>('einblendung');
  const look = state.looks[graphic] as AnyLook;
  const set = (patch: Partial<AnyLook>) => dispatch({ type: 'look/update', graphic, patch });
  const defaults = DEFAULT_LOOKS[graphic] as AnyLook;
  const resetSection = (section: string) =>
    set(Object.fromEntries(SECTION_KEYS[section].map((k) => [k, defaults[k]])) as Partial<AnyLook>);
  const titleId = useId();
  const snapshot = useMemo(() => buildSnapshot(state, derived), [state, derived]);
  const options: OutputOptions = {
    grafik: graphic,
    stil: mode,
    sichtbar: 'immer',
    hintergrund: mode === 'vollbild' ? 'dunkel' : 'transparent',
    hintergrundFest: false,
    debug: false,
  };
  const active = LOOK_PRESETS.find((p) => Object.entries(p.look).every(([k, v]) => look[k as keyof AnyLook] === v));

  return (
    <Panel
      eyebrow="Darstellung für OBS · gilt für Programm und Einzel-Adresse"
      title="Aussehen"
      actions={
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => set(DEFAULT_LOOKS[graphic] as Partial<AnyLook>)}>
          Alles auf Standard zurücksetzen
        </Button>
      }
      className="look-panel"
    >
      <div className="look-layout">
        <div className="look-preview">
          <Segmented<'einblendung' | 'vollbild'>
            label="Vorschau"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'einblendung', label: 'Einblendung (Programm)' },
              { value: 'vollbild', label: 'Vollbild' },
            ]}
          />
          <div className="look-stage" aria-label="Vorschau wie in OBS">
            <OutputView snapshot={snapshot} options={options} embedded />
          </div>
          <p className="field-hint">
            So erscheint die Grafik in OBS. Das Schachbrett steht für das Zoom-Bild dahinter. „Einblendung“ gilt für die Quelle „Programm“,
            „Vollbild“ für die Einzel-Adresse.
          </p>
        </div>

        <div className="look-editor">
          <div className="hl-editor__presets" role="group" aria-label="Vorlagen">
            {LOOK_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`hl-preset${active?.id === p.id ? ' is-active' : ''}`}
                aria-pressed={active?.id === p.id}
                onClick={() => set(p.look)}
              >
                <span
                  className="hl-preset__swatch"
                  style={{ background: p.look.backgroundOpacity === 0 ? 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50% / 8px 8px' : p.look.background, color: p.look.text }}
                  aria-hidden
                >
                  Aa
                </span>
                {p.label}
              </button>
            ))}
          </div>

          <TemplateBar
            kind={graphic}
            current={look as unknown as Record<string, unknown>}
            onApply={(data) => set(data as Partial<AnyLook>)}
            isActive={(data) => matches(look as unknown as Record<string, unknown>, data)}
          />

          <Section title="Platzierung der Einblendung" open onReset={() => resetSection('platzierung')}>
            <div className="look-positions" role="group" aria-label="Position">
              {POSITIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={look.position === p.id ? 'is-active' : ''}
                  aria-pressed={look.position === p.id}
                  title={p.label}
                  aria-label={p.label}
                  onClick={() => set({ position: p.id })}
                >
                  <span aria-hidden />
                </button>
              ))}
            </div>
            <div className="look-grid">
              <RangeField label="Breite" value={look.width} min={15} max={100} onChange={(width) => set({ width })} />
              <RangeField
                label="Höhe"
                value={look.height}
                min={0}
                max={100}
                format={(v) => (v === 0 ? 'automatisch' : `${v} %`)}
                onChange={(height) => set({ height })}
              />
              <RangeField label="Abstand links/rechts" value={look.marginX} min={0} max={20} onChange={(marginX) => set({ marginX })} />
              <RangeField label="Abstand oben/unten" value={look.marginY} min={0} max={20} onChange={(marginY) => set({ marginY })} />
            </div>
          </Section>

          <Section title="Box" onReset={() => resetSection('box')}>
            <div className="hl-editor__colors">
              <ColorField label="Hintergrund" value={look.background} onChange={(background) => set({ background })} />
              <ColorField label="Rahmen" value={look.borderColor} onChange={(borderColor) => set({ borderColor })} />
            </div>
            <div className="look-grid">
              <RangeField
                label="Deckkraft Hintergrund"
                value={look.backgroundOpacity}
                min={0}
                max={100}
                step={5}
                onChange={(backgroundOpacity) => set({ backgroundOpacity })}
              />
              <RangeField label="Innenabstand" value={look.padding} min={0} max={250} step={10} onChange={(padding) => set({ padding })} />
            </div>
            <Segmented<AnyLook['corners']>
              label="Ecken"
              value={look.corners}
              onChange={(corners) => set({ corners })}
              options={[
                { value: 'eckig', label: 'Eckig' },
                { value: 'rund', label: 'Rund' },
                { value: 'stark', label: 'Stark rund' },
              ]}
            />
            <div className="hl-editor__switches">
              <Switch checked={look.border} onChange={(border) => set({ border })} label="Rahmen" />
              <Switch checked={look.shadow} onChange={(shadow) => set({ shadow })} label="Schatten" />
            </div>
          </Section>

          <Section title="Text und Farben" onReset={() => resetSection('text')}>
            <div className="hl-editor__colors">
              <ColorField label="Text" value={look.text} onChange={(text) => set({ text })} />
              <ColorField label="Nebentext" value={look.muted} onChange={(muted) => set({ muted })} />
              <ColorField label="Akzent" value={look.accent} onChange={(accent) => set({ accent })} />
            </div>
            <RangeField label="Größe" value={look.scale} min={50} max={250} step={5} onChange={(scale) => set({ scale })} />
            <div className="hl-editor__options">
              <Segmented<AnyLook['font']>
                label="Schrift"
                value={look.font}
                onChange={(font) => set({ font })}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'schmal', label: 'Schmal' },
                  { value: 'serif', label: 'Serif' },
                ]}
              />
              <Segmented<AnyLook['titleAlign']>
                label="Ausrichtung Titel"
                value={look.titleAlign}
                onChange={(titleAlign) => set({ titleAlign })}
                options={[
                  { value: 'links', label: 'Links' },
                  { value: 'mitte', label: 'Mitte' },
                ]}
              />
            </div>
            <Field label="Eigener Titel" htmlFor={titleId} hint="Leer lassen, um die Frage aus der Grafik zu zeigen.">
              <input id={titleId} className="input" value={look.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <div className="hl-editor__switches">
              <Switch checked={look.showTitle} onChange={(showTitle) => set({ showTitle })} label="Titel anzeigen" />
              <Switch checked={look.showMeta} onChange={(showMeta) => set({ showMeta })} label="Zusatzzeile (Anzahl) anzeigen" />
            </div>
          </Section>

          <Section title="Vollbild-Hintergrund" onReset={() => resetSection('vollbild')}>
            <Segmented<AnyLook['fullBackground']>
              label="Hintergrund"
              value={look.fullBackground}
              onChange={(fullBackground) => set({ fullBackground })}
              options={[
                { value: 'dunkel', label: 'Dunkel' },
                { value: 'farbe', label: 'Eigene Farbe' },
                { value: 'transparent', label: 'Transparent' },
              ]}
            />
            {look.fullBackground === 'farbe' && (
              <div className="look-grid">
                <ColorField label="Farbe" value={look.fullColor} onChange={(fullColor) => set({ fullColor })} />
                <RangeField label="Deckkraft" value={look.fullOpacity} min={0} max={100} step={5} onChange={(fullOpacity) => set({ fullOpacity })} />
              </div>
            )}
            <p className="field-hint">Steht in der OBS-Adresse „hintergrund=…“, hat das Vorrang.</p>
          </Section>

          {graphic === 'karte' && (
            <Section title="Weltkarte" open onReset={() => resetSection('karte')}>
              <div className="hl-editor__colors">
                <ColorField label="Länder" value={look.land} onChange={(land) => set({ land })} />
                <ColorField label="Meer" value={look.ocean} onChange={(ocean) => set({ ocean })} />
                <ColorField label="Grenzen" value={look.borders} onChange={(borders) => set({ borders })} />
                <ColorField label="Punkte" value={look.pin} onChange={(pin) => set({ pin })} />
                <ColorField label="Ortsnamen" value={look.labelColor} onChange={(labelColor) => set({ labelColor })} />
              </div>
              <div className="look-grid">
                <RangeField label="Deckkraft Meer" value={look.oceanOpacity} min={0} max={100} step={5} onChange={(oceanOpacity) => set({ oceanOpacity })} />
                <RangeField label="Punktgröße" value={look.pinSize} min={40} max={250} step={10} onChange={(pinSize) => set({ pinSize })} />
              </div>
              <div className="hl-editor__switches">
                <Switch checked={look.showLabels} onChange={(showLabels) => set({ showLabels })} label="Ortsnamen anzeigen" />
                <Switch checked={look.showCounts} onChange={(showCounts) => set({ showCounts })} label="Anzahl im Punkt" />
              </div>
              <p className="field-hint">Ausschnitt und „Nur Umrisse“ stellst du oben bei der Karte ein. Bei „Nur Umrisse“ nutzen die Linien die Länderfarbe.</p>
            </Section>
          )}

          {graphic === 'umfrage' && (
            <Section title="Umfrage" open onReset={() => resetSection('umfrage')}>
              <div className="hl-editor__colors">
                <ColorField label="Balken" value={look.barColor} onChange={(barColor) => set({ barColor })} />
                <ColorField label="Balken-Hintergrund" value={look.trackColor} onChange={(trackColor) => set({ trackColor })} />
              </div>
              <div className="look-grid">
                <RangeField label="Deckkraft Balken-Hintergrund" value={look.trackOpacity} min={0} max={100} step={2} onChange={(trackOpacity) => set({ trackOpacity })} />
                <RangeField label="Balkenstärke" value={look.barSize} min={40} max={300} step={10} onChange={(barSize) => set({ barSize })} />
              </div>
              <div className="hl-editor__switches">
                <Switch checked={look.highlightLeader} onChange={(highlightLeader) => set({ highlightLeader })} label="Führende Antwort in Akzentfarbe" />
                <Switch checked={look.multiColor} onChange={(multiColor) => set({ multiColor })} label="Jede Antwort in eigener Farbe" />
                <Switch checked={look.sortByVotes} onChange={(sortByVotes) => set({ sortByVotes })} label="Nach Stimmen sortieren" />
                <Switch checked={look.showPercent} onChange={(showPercent) => set({ showPercent })} label="Prozent" />
                <Switch checked={look.showCounts} onChange={(showCounts) => set({ showCounts })} label="Anzahl Stimmen" />
                <Switch checked={look.showKeys} onChange={(showKeys) => set({ showKeys })} label="Kennungen (A, B …)" />
              </div>
              <p className="field-hint">Balken oder Kreis stellst du oben bei der Umfrage ein.</p>
            </Section>
          )}

          {graphic === 'gluecksrad' && (
            <Section title="Glücksrad" open onReset={() => resetSection('gluecksrad')}>
              <Segmented<WheelLook['wheelColors']>
                label="Farben der Felder"
                value={look.wheelColors}
                onChange={(wheelColors) => set({ wheelColors })}
                options={[
                  { value: 'bunt', label: 'Bunt' },
                  { value: 'zweifarbig', label: 'Zwei Farben' },
                  { value: 'einfarbig', label: 'Eine Farbe' },
                ]}
              />
              <div className="hl-editor__colors">
                {look.wheelColors !== 'bunt' && <ColorField label={look.wheelColors === 'zweifarbig' ? 'Farbe 1' : 'Felder'} value={look.wheelColorA} onChange={(wheelColorA) => set({ wheelColorA })} />}
                {look.wheelColors === 'zweifarbig' && <ColorField label="Farbe 2" value={look.wheelColorB} onChange={(wheelColorB) => set({ wheelColorB })} />}
                {look.wheelColors !== 'bunt' && <ColorField label="Schrift im Rad" value={look.wheelText} onChange={(wheelText) => set({ wheelText })} />}
                <ColorField label="Rand und Mitte" value={look.wheelRim} onChange={(wheelRim) => set({ wheelRim })} />
                <ColorField label="Zeiger" value={look.pointerColor} onChange={(pointerColor) => set({ pointerColor })} />
              </div>
              <div className="hl-editor__switches">
                <Switch checked={look.showWinner} onChange={(showWinner) => set({ showWinner })} label="Gewählten Namen groß einblenden" />
              </div>
              {look.showWinner && (
                <div className="hl-editor__colors">
                  <ColorField label="Namensfeld" value={look.winnerBackground} onChange={(winnerBackground) => set({ winnerBackground })} />
                  <ColorField label="Name" value={look.winnerText} onChange={(winnerText) => set({ winnerText })} />
                </div>
              )}
              <p className="field-hint">Bei „Bunt“ wählt die Schriftfarbe im Rad automatisch hell oder dunkel, damit sie gut lesbar ist.</p>
            </Section>
          )}

          {graphic === 'wortwolke' && (
            <Section title="Wortwolke" open onReset={() => resetSection('wortwolke')}>
              <Segmented<CloudLook['colorMode']>
                label="Farben"
                value={look.colorMode}
                onChange={(colorMode) => set({ colorMode })}
                options={[
                  { value: 'akzent', label: 'Häufigste in Akzent' },
                  { value: 'einfarbig', label: 'Einfarbig' },
                  { value: 'bunt', label: 'Bunt' },
                ]}
              />
              {look.colorMode !== 'bunt' && <ColorField label="Wortfarbe" value={look.wordColor} onChange={(wordColor) => set({ wordColor })} />}
              <div className="look-grid">
                <RangeField label="Höchstens Begriffe" value={look.maxWords} min={5} max={100} step={5} format={(v) => String(v)} onChange={(maxWords) => set({ maxWords })} />
                <RangeField label="Abstand" value={look.gap} min={0} max={300} step={10} onChange={(gap) => set({ gap })} />
                <RangeField label="Kleinste Begriffe" value={look.minSize} min={40} max={250} step={10} onChange={(minSize) => set({ minSize })} />
                <RangeField label="Größte Begriffe" value={look.maxSize} min={40} max={250} step={10} onChange={(maxSize) => set({ maxSize })} />
              </div>
              <div className="hl-editor__options">
                <Segmented<CloudLook['weight']>
                  label="Schriftstärke"
                  value={look.weight}
                  onChange={(weight) => set({ weight })}
                  options={[
                    { value: 'normal', label: 'Normal' },
                    { value: 'fett', label: 'Fett' },
                  ]}
                />
              </div>
              <div className="hl-editor__switches">
                <Switch checked={look.uppercase} onChange={(uppercase) => set({ uppercase })} label="Großbuchstaben" />
              </div>
            </Section>
          )}
        </div>
      </div>
    </Panel>
  );
}
