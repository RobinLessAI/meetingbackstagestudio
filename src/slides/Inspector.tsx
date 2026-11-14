import { useId, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Italic,
  Lock,
  Maximize,
  Trash2,
  Underline,
  Unlock,
} from 'lucide-react';
import { Button } from '../components/ui.tsx';
import { FLAECHE, SCHRIFTEN, type Animation, type Element, type Folie, type Hintergrund } from './model.ts';

type Patch<T> = (patch: Partial<T>, key?: string) => void;

// ----------------------------------------------------------------- Kleine Felder
function Row({ children }: { children: ReactNode }) {
  return <div className="sl-row">{children}</div>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sl-sec">
      <h3 className="sl-sec__title">{title}</h3>
      {children}
    </section>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  slider,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  slider?: boolean;
}) {
  const id = useId();
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)));
  return (
    <div className={`sl-field${slider ? ' sl-field--slider' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="sl-num">
        {slider && <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} aria-label={label} />}
        <input id={id} type="number" className="input" min={min} max={max} step={step} value={Math.round(value * 100) / 100} onChange={(e) => set(Number(e.target.value))} />
        {unit && <span className="sl-unit">{unit}</span>}
      </div>
    </div>
  );
}
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="sl-field">
      <label htmlFor={id}>{label}</label>
      <div className="sl-color">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input
          className="input mono"
          value={value}
          aria-label={`${label} als Hex-Wert`}
          onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value.toLowerCase())}
          maxLength={7}
        />
      </div>
    </div>
  );
}
function Toggle({ label, on, onChange, icon: Icon }: { label: string; on: boolean; onChange: (v: boolean) => void; icon?: typeof Bold }) {
  return (
    <button type="button" className={`sl-toggle${on ? ' is-on' : ''}`} aria-pressed={on} title={label} onClick={() => onChange(!on)}>
      {Icon ? <Icon size={15} aria-hidden /> : null}
      {!Icon && label}
      {Icon && <span className="sr-only">{label}</span>}
    </button>
  );
}
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ v: T; l: ReactNode; t?: string }>; onChange: (v: T) => void }) {
  return (
    <div className="sl-field">
      <span className="sl-label">{label}</span>
      <div className="sl-choice" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.v} type="button" className={value === o.v ? 'is-on' : ''} aria-pressed={value === o.v} title={o.t} onClick={() => onChange(o.v)}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
function MediaField({ label, value, typ, onPick }: { label: string; value: string; typ: 'bild' | 'video'; onPick: () => void }) {
  return (
    <div className="sl-field">
      <span className="sl-label">{label}</span>
      <div className="sl-media-pick">
        {value ? typ === 'video' ? <video src={value} muted /> : <img src={value} alt="" /> : <span className="subtle">Noch keine Datei</span>}
        <Button size="sm" icon={ImagePlus} onClick={onPick}>
          {value ? 'Ändern' : typ === 'video' ? 'Video wählen' : 'Bild wählen'}
        </Button>
      </div>
    </div>
  );
}

const ANIMS: Array<{ v: Animation; l: string }> = [
  { v: 'keine', l: 'Keine' },
  { v: 'einblenden', l: 'Einblenden' },
  { v: 'von-unten', l: 'Von unten' },
  { v: 'von-oben', l: 'Von oben' },
  { v: 'von-links', l: 'Von links' },
  { v: 'von-rechts', l: 'Von rechts' },
  { v: 'zoom', l: 'Zoom' },
];

// ----------------------------------------------------------------- Element
export function ElementInspector({
  el,
  onChange,
  onPickMedia,
  onDuplicate,
  onDelete,
  onOrder,
  textRef,
}: {
  el: Element;
  onChange: Patch<Element>;
  onPickMedia: (typ: 'bild' | 'video') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOrder: (dir: 'vorne' | 'hinten') => void;
  textRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const any = el as Element & Record<string, never>;
  const setAny = (k: string) => (v: unknown) => onChange({ [k]: v } as Partial<Element>, k);

  return (
    <div className="sl-inspector">
      <div className="sl-inspector__head">
        <input className="input sl-name" value={el.name} onChange={(e) => onChange({ name: e.target.value }, 'name')} aria-label="Name der Ebene" />
        <Toggle label={el.hidden ? 'Einblenden' : 'Ausblenden'} on={el.hidden} onChange={(v) => onChange({ hidden: v }, 'hidden')} icon={el.hidden ? EyeOff : Eye} />
        <Toggle label={el.locked ? 'Entsperren' : 'Sperren'} on={el.locked} onChange={(v) => onChange({ locked: v }, 'locked')} icon={el.locked ? Lock : Unlock} />
      </div>

      {el.typ === 'text' && (
        <Section title="Text">
          <textarea ref={textRef} className="textarea sl-text" rows={4} value={el.text} onChange={(e) => onChange({ text: e.target.value }, 'text')} aria-label="Text" />
          <div className="sl-field">
            <label htmlFor={`font-${el.id}`}>Schriftart</label>
            <select id={`font-${el.id}`} className="select" value={el.font} onChange={(e) => onChange({ font: e.target.value }, 'font')} style={{ fontFamily: `'${el.font}'` }}>
              {SCHRIFTEN.map((s) => (
                <option key={s.name} value={s.name} style={{ fontFamily: `'${s.name}'` }}>
                  {s.name} – {s.art}
                </option>
              ))}
            </select>
          </div>
          <Row>
            <NumberField label="Größe" value={el.size} onChange={setAny('size')} min={6} max={600} unit="px" />
            <div className="sl-field">
              <span className="sl-label">Stil</span>
              <div className="sl-toggles">
                <Toggle label="Fett" on={el.weight === 700} onChange={(v) => onChange({ weight: v ? 700 : 400 }, 'weight')} icon={Bold} />
                <Toggle label="Kursiv" on={el.italic} onChange={setAny('italic')} icon={Italic} />
                <Toggle label="Unterstrichen" on={el.underline} onChange={setAny('underline')} icon={Underline} />
                <Toggle label="AA" on={el.upper} onChange={setAny('upper')} />
              </div>
            </div>
          </Row>
          <ColorField label="Textfarbe" value={el.color} onChange={setAny('color')} />
          <Row>
            <Choice
              label="Ausrichtung"
              value={el.align}
              onChange={setAny('align')}
              options={[
                { v: 'left', l: <AlignLeft size={15} />, t: 'Links' },
                { v: 'center', l: <AlignCenter size={15} />, t: 'Mitte' },
                { v: 'right', l: <AlignRight size={15} />, t: 'Rechts' },
              ]}
            />
            <Choice
              label="Senkrecht"
              value={el.valign}
              onChange={setAny('valign')}
              options={[
                { v: 'top', l: 'Oben' },
                { v: 'middle', l: 'Mitte' },
                { v: 'bottom', l: 'Unten' },
              ]}
            />
          </Row>
          <Row>
            <NumberField label="Zeilenhöhe" value={el.lineHeight} onChange={setAny('lineHeight')} min={0.6} max={4} step={0.05} />
            <NumberField label="Zeichenabstand" value={el.letterSpacing} onChange={setAny('letterSpacing')} min={-20} max={80} unit="px" />
          </Row>
        </Section>
      )}

      {el.typ === 'text' && (
        <Section title="Hintergrundfeld">
          <Row>
            <ColorField label="Farbe" value={el.bg} onChange={setAny('bg')} />
            <NumberField label="Deckkraft" value={Math.round(el.bgOpacity * 100)} onChange={(v) => onChange({ bgOpacity: v / 100 }, 'bgOpacity')} min={0} max={100} unit="%" slider />
          </Row>
          <Row>
            <NumberField label="Innenabstand" value={el.pad} onChange={setAny('pad')} min={0} max={400} unit="px" />
            <NumberField label="Ecken" value={el.radius} onChange={setAny('radius')} min={0} max={500} unit="px" />
          </Row>
          <Row>
            <NumberField label="Umriss der Schrift" value={el.outlineW} onChange={setAny('outlineW')} min={0} max={30} unit="px" />
            <ColorField label="Umrissfarbe" value={el.outlineColor} onChange={setAny('outlineColor')} />
          </Row>
        </Section>
      )}

      {el.typ === 'form' && (
        <Section title="Form">
          <Choice
            label="Art"
            value={el.form}
            onChange={setAny('form')}
            options={[
              { v: 'rechteck', l: 'Rechteck' },
              { v: 'ellipse', l: 'Kreis/Oval' },
              { v: 'linie', l: 'Linie' },
            ]}
          />
          <Row>
            <ColorField label="Füllung" value={el.fill} onChange={setAny('fill')} />
            <NumberField label="Deckkraft" value={Math.round(el.fillOpacity * 100)} onChange={(v) => onChange({ fillOpacity: v / 100 }, 'fillOpacity')} min={0} max={100} unit="%" slider />
          </Row>
          <div className="sl-toggles">
            <Toggle label="Farbverlauf" on={el.verlauf} onChange={setAny('verlauf')} />
          </div>
          {el.verlauf && (
            <Row>
              <ColorField label="Zweite Farbe" value={el.fill2} onChange={setAny('fill2')} />
              <NumberField label="Winkel" value={el.winkel} onChange={setAny('winkel')} min={0} max={360} unit="°" />
            </Row>
          )}
          {el.form === 'rechteck' && <NumberField label="Ecken" value={el.radius} onChange={setAny('radius')} min={0} max={1000} unit="px" />}
        </Section>
      )}

      {(el.typ === 'bild' || el.typ === 'video') && (
        <Section title={el.typ === 'video' ? 'Video' : 'Bild'}>
          <MediaField label="Datei" value={el.src} typ={el.typ} onPick={() => onPickMedia(el.typ as 'bild' | 'video')} />
          <Choice
            label="Einpassen"
            value={el.fit}
            onChange={setAny('fit')}
            options={[
              { v: 'cover', l: 'Ausfüllen' },
              { v: 'contain', l: 'Ganz zeigen' },
            ]}
          />
          <NumberField label="Ecken" value={el.radius} onChange={setAny('radius')} min={0} max={1000} unit="px" />
          {el.typ === 'video' && (
            <div className="sl-toggles">
              <Toggle label="Endlos wiederholen" on={el.loop} onChange={setAny('loop')} />
              <Toggle label="Ton abspielen" on={el.ton} onChange={setAny('ton')} />
            </div>
          )}
          {el.typ === 'video' && el.ton && <p className="sl-hint">In OBS ist der Ton nur zu hören, wenn bei der OBS-Adresse der Knopf „Mit Ton“ eingeschaltet ist.</p>}
        </Section>
      )}

      {el.typ !== 'form' || el.form !== 'linie' ? (
        <Section title="Rahmen und Schatten">
          <Row>
            <NumberField label="Rahmen" value={any.borderW} onChange={setAny('borderW')} min={0} max={60} unit="px" />
            <ColorField label="Rahmenfarbe" value={any.borderColor} onChange={setAny('borderColor')} />
          </Row>
          <div className="sl-toggles">
            <Toggle label="Schatten" on={any.shadow} onChange={setAny('shadow')} />
          </div>
          {any.shadow && (
            <Row>
              <ColorField label="Schattenfarbe" value={any.shadowColor} onChange={setAny('shadowColor')} />
              <NumberField label="Weichheit" value={any.shadowBlur} onChange={setAny('shadowBlur')} min={0} max={120} unit="px" />
            </Row>
          )}
        </Section>
      ) : null}

      <Section title="Position und Größe">
        <Row>
          <NumberField label="X" value={el.x} onChange={setAny('x')} min={-4000} max={6000} />
          <NumberField label="Y" value={el.y} onChange={setAny('y')} min={-4000} max={6000} />
        </Row>
        <Row>
          <NumberField label="Breite" value={el.w} onChange={setAny('w')} min={2} max={8000} />
          <NumberField label="Höhe" value={el.h} onChange={setAny('h')} min={2} max={8000} />
        </Row>
        <Row>
          <NumberField label="Drehung" value={el.rot} onChange={setAny('rot')} min={-360} max={360} unit="°" />
          <NumberField label="Deckkraft" value={Math.round(el.opacity * 100)} onChange={(v) => onChange({ opacity: v / 100 }, 'opacity')} min={0} max={100} unit="%" slider />
        </Row>
        <div className="sl-toggles">
          <Button size="sm" icon={AlignHorizontalJustifyCenter} onClick={() => onChange({ x: Math.round((FLAECHE.w - el.w) / 2) }, 'x')}>
            Waagerecht mittig
          </Button>
          <Button size="sm" icon={AlignVerticalJustifyCenter} onClick={() => onChange({ y: Math.round((FLAECHE.h - el.h) / 2) }, 'y')}>
            Senkrecht mittig
          </Button>
          <Button size="sm" icon={Maximize} onClick={() => onChange({ x: 0, y: 0, w: FLAECHE.w, h: FLAECHE.h, rot: 0 }, 'voll')}>
            Ganze Fläche
          </Button>
        </div>
      </Section>

      <Section title="Animation beim Einblenden">
        <div className="sl-field">
          <label htmlFor={`anim-${el.id}`}>Art</label>
          <select id={`anim-${el.id}`} className="select" value={el.anim} onChange={(e) => onChange({ anim: e.target.value as Animation }, 'anim')}>
            {ANIMS.map((a) => (
              <option key={a.v} value={a.v}>
                {a.l}
              </option>
            ))}
          </select>
        </div>
        {el.anim !== 'keine' && (
          <Row>
            <NumberField label="Dauer" value={el.animDauer} onChange={setAny('animDauer')} min={0.1} max={5} step={0.1} unit="s" />
            <NumberField label="Verzögerung" value={el.animVerz} onChange={setAny('animVerz')} min={0} max={30} step={0.1} unit="s" />
          </Row>
        )}
        <p className="sl-hint">Die Animation läuft in OBS beim Laden und beim Wechsel der Folie im Kanal.</p>
      </Section>

      <div className="sl-actions">
        <Button size="sm" icon={ArrowUpToLine} onClick={() => onOrder('vorne')}>
          Nach vorne
        </Button>
        <Button size="sm" icon={ArrowDownToLine} onClick={() => onOrder('hinten')}>
          Nach hinten
        </Button>
        <Button size="sm" icon={Copy} onClick={onDuplicate}>
          Duplizieren
        </Button>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete}>
          Löschen
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Folie (nichts ausgewählt)
export function SlideInspector({ folie, onChange, onPickMedia }: { folie: Folie; onChange: Patch<Folie>; onPickMedia: (typ: 'bild' | 'video') => void }) {
  const h = folie.hintergrund;
  const setH = (patch: Partial<Hintergrund>, key: string) => onChange({ hintergrund: { ...h, ...patch } }, `hg-${key}`);
  return (
    <div className="sl-inspector">
      <Section title="Folie">
        <div className="sl-field">
          <label htmlFor="folie-name">Name</label>
          <input id="folie-name" className="input" value={folie.name} onChange={(e) => onChange({ name: e.target.value }, 'name')} />
        </div>
      </Section>
      <Section title="Hintergrund">
        <Choice
          label="Art"
          value={h.typ}
          onChange={(typ) => setH({ typ }, 'typ')}
          options={[
            { v: 'transparent', l: 'Durchsichtig', t: 'Für Einblendungen über dem Video in OBS' },
            { v: 'farbe', l: 'Farbe' },
            { v: 'verlauf', l: 'Verlauf' },
            { v: 'bild', l: 'Bild' },
            { v: 'video', l: 'Video' },
          ]}
        />
        {(h.typ === 'farbe' || h.typ === 'verlauf') && <ColorField label={h.typ === 'verlauf' ? 'Farbe 1' : 'Farbe'} value={h.color} onChange={(color) => setH({ color }, 'color')} />}
        {h.typ === 'verlauf' && (
          <Row>
            <ColorField label="Farbe 2" value={h.color2} onChange={(color2) => setH({ color2 }, 'color2')} />
            <NumberField label="Winkel" value={h.winkel} onChange={(winkel) => setH({ winkel }, 'winkel')} min={0} max={360} unit="°" />
          </Row>
        )}
        {(h.typ === 'bild' || h.typ === 'video') && (
          <>
            <MediaField label="Datei" value={h.src} typ={h.typ} onPick={() => onPickMedia(h.typ as 'bild' | 'video')} />
            <Choice
              label="Einpassen"
              value={h.fit}
              onChange={(fit) => setH({ fit }, 'fit')}
              options={[
                { v: 'cover', l: 'Ausfüllen' },
                { v: 'contain', l: 'Ganz zeigen' },
              ]}
            />
          </>
        )}
        {h.typ !== 'transparent' && (
          <NumberField label="Abdunkeln" value={Math.round(h.abdunkeln * 100)} onChange={(v) => setH({ abdunkeln: v / 100 }, 'abdunkeln')} min={0} max={90} unit="%" slider />
        )}
        {h.typ === 'transparent' && <p className="sl-hint">Durchsichtig: In OBS liegt die Folie über deinem Video. Das Karomuster zeigt die durchsichtigen Stellen.</p>}
      </Section>
      <p className="sl-hint">Tipp: Element anklicken, um es zu bearbeiten. Ziehen verschiebt, die Griffe ändern die Größe (Umschalt: Seitenverhältnis halten, Alt: ohne Einrasten).</p>
    </div>
  );
}
