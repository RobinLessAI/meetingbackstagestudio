import { createContext, useContext, useId, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  ChartColumn,
  CircleCheck,
  Clock,
  Cloud,
  FerrisWheel,
  Globe,
  GraduationCap,
  Hand,
  Handshake,
  Heart,
  ImagePlus,
  Keyboard,
  Layers,
  LifeBuoy,
  Lightbulb,
  ListChecks,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquareQuote,
  Mic,
  MonitorPlay,
  Palette,
  Phone,
  Plus,
  Presentation,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  Star,
  Target,
  ThumbsUp,
  Trash2,
  Trophy,
  Upload,
  Users,
  Video,
  X,
  Zap,
  ArrowRight,
  MousePointerClick,
  Camera,
  ScanSearch,
  Telescope,
  Package,
  Focus,
  type LucideIcon,
} from 'lucide-react';
import { Button, Dialog, IconButton } from '../../components/ui.tsx';
import type { Hintergrund, Knopf, Medium } from './types.ts';

// ----------------------------------------------------------------- Symbole (gleiche Liste wie im Server)
export const ICON_COMPONENTS: Record<string, LucideIcon> = {
  'message-square-quote': MessageSquareQuote,
  'chart-column': ChartColumn,
  'map-pin': MapPin,
  cloud: Cloud,
  'ferris-wheel': FerrisWheel,
  star: Star,
  hand: Hand,
  'list-checks': ListChecks,
  sparkles: Sparkles,
  'shield-check': ShieldCheck,
  'circle-check': CircleCheck,
  video: Video,
  users: Users,
  presentation: Presentation,
  'monitor-play': MonitorPlay,
  keyboard: Keyboard,
  mic: Mic,
  heart: Heart,
  lightbulb: Lightbulb,
  rocket: Rocket,
  clock: Clock,
  calendar: Calendar,
  globe: Globe,
  lock: Lock,
  server: Server,
  mail: Mail,
  phone: Phone,
  'life-buoy': LifeBuoy,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  briefcase: Briefcase,
  'building-2': Building2,
  handshake: Handshake,
  trophy: Trophy,
  zap: Zap,
  palette: Palette,
  settings: Settings,
  'thumbs-up': ThumbsUp,
  'message-circle': MessageCircle,
  smile: Smile,
  target: Target,
  layers: Layers,
  'arrow-right': ArrowRight,
  'mouse-pointer-click': MousePointerClick,
  camera: Camera,
  'scan-search': ScanSearch,
  telescope: Telescope,
  package: Package,
  focus: Focus,
};

// ----------------------------------------------------------------- Medien (über Kontext aus der Website-Seite)
export interface MediaApi {
  medien: Medium[];
  upload: (file: File) => Promise<string>;
}
export const MediaContext = createContext<MediaApi>({ medien: [], upload: async () => '' });

// ----------------------------------------------------------------- Einfache Felder
export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  max,
  multiline,
  rows = 3,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  max?: number;
  multiline?: boolean;
  rows?: number;
}) {
  const id = useId();
  const count = max ? (
    <span className={`ws-count${value.length > max ? ' is-over' : ''}`}>
      {value.length}/{max}
    </span>
  ) : null;
  return (
    <div className="field">
      <label className="field-label ws-label" htmlFor={id}>
        <span>{label}</span>
        {count}
      </label>
      {multiline ? (
        <textarea id={id} className="textarea" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function KnopfFields({ label, value, onChange }: { label: string; value: Knopf; onChange: (v: Knopf) => void }) {
  return (
    <fieldset className="ws-group">
      <legend>{label}</legend>
      <div className="ws-row">
        <TextField label="Beschriftung" value={value.label} onChange={(v) => onChange({ ...value, label: v })} placeholder="leer = kein Knopf" />
        <LinkInput value={value.link} onChange={(v) => onChange({ ...value, link: v })} />
      </div>
    </fieldset>
  );
}

export function LinkInput({ value, onChange, label = 'Ziel' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return <TextField label={label} value={value} onChange={onChange} placeholder="/hilfe/ · /#funktionen · https://… · mailto:…" />;
}

export function BgSelect({ value, onChange }: { value: Hintergrund; onChange: (v: Hintergrund) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        Hintergrund
      </label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as Hintergrund)}>
        <option value="hell">Hellgrau</option>
        <option value="weiss">Weiß</option>
        <option value="navy">Navy</option>
      </select>
    </div>
  );
}

export function IconSelect({ value, onChange, label = 'Symbol' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const Current = ICON_COMPONENTS[value];
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <button type="button" className="ws-icon-btn" onClick={() => setOpen(true)} aria-label={`${label} wählen`}>
        {Current ? <Current size={20} aria-hidden /> : <span className="subtle">keins</span>}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Symbol wählen" size="md">
        <div className="ws-icon-grid">
          <button
            type="button"
            className={`ws-icon-choice${!value ? ' is-active' : ''}`}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            <X size={18} aria-hidden />
            <span>keins</span>
          </button>
          {Object.entries(ICON_COMPONENTS).map(([name, Icon]) => (
            <button
              type="button"
              key={name}
              className={`ws-icon-choice${value === name ? ' is-active' : ''}`}
              title={name}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              <Icon size={20} aria-hidden />
            </button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------- Bild wählen / hochladen
export function ImageField({ label, value, onChange, hint }: { label: string; value: string; onChange: (url: string) => void; hint?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="ws-image">
        {value ? <img src={value} alt="" className="ws-image__thumb" /> : <div className="ws-image__empty">Kein Bild</div>}
        <div className="ws-image__actions">
          <Button size="sm" icon={ImagePlus} onClick={() => setOpen(true)}>
            {value ? 'Anderes Bild' : 'Bild wählen'}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => onChange('')}>
              Entfernen
            </Button>
          )}
        </div>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
      <MediaDialog
        open={open}
        onClose={() => setOpen(false)}
        onPick={(url) => {
          onChange(url);
          setOpen(false);
        }}
        selected={value}
      />
    </div>
  );
}

/** Mediathek: hochgeladene Bilder wählen oder neues hochladen. */
export function MediaDialog({ open, onClose, onPick, selected }: { open: boolean; onClose: () => void; onPick: (url: string) => void; selected?: string }) {
  const { medien, upload } = useContext(MediaContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Bild wählen"
      size="lg"
      footer={
        <>
          {error && <span className="field-error">{error}</span>}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy(true);
              setError(null);
              try {
                onPick(await upload(f));
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button variant="primary" icon={Upload} loading={busy} disabled={busy} onClick={() => input.current?.click()}>
            Neues Bild hochladen
          </Button>
        </>
      }
    >
      {medien.length === 0 ? (
        <p className="subtle">Noch keine Bilder hochgeladen.</p>
      ) : (
        <div className="ws-media-grid">
          {medien.map((m) => (
            <button type="button" key={m.name} className={`ws-media${selected === m.url ? ' is-active' : ''}`} onClick={() => onPick(m.url)} title={m.name}>
              <img src={m.url} alt="" loading="lazy" />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

// ----------------------------------------------------------------- Listen (Karten, Schritte, Fragen, Links …)
export function ListEditor<T>({
  label,
  items,
  onChange,
  create,
  render,
  itemLabel,
  addLabel = 'Hinzufügen',
  max = 60,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  itemLabel: (item: T, index: number) => string;
  addLabel?: string;
  max?: number;
}) {
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <fieldset className="ws-group ws-list">
      <legend>{label}</legend>
      {items.map((item, i) => (
        <div className="ws-list__item" key={i}>
          <div className="ws-list__head">
            <span className="ws-list__title">{itemLabel(item, i) || `Eintrag ${i + 1}`}</span>
            <IconButton label="Nach oben" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton label="Nach unten" icon={ArrowDown} disabled={i === items.length - 1} onClick={() => move(i, 1)} />
            <IconButton label="Entfernen" icon={Trash2} tone="danger" onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
          {render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}
        </div>
      ))}
      {items.length < max && (
        <Button size="sm" icon={Plus} onClick={() => onChange([...items, create()])}>
          {addLabel}
        </Button>
      )}
    </fieldset>
  );
}

/** Link-Liste (Navigation, Fuß). */
export function NavListEditor({ label, items, onChange, addLabel }: { label: string; items: Array<{ label: string; link: string }>; onChange: (v: Array<{ label: string; link: string }>) => void; addLabel: string }) {
  return (
    <ListEditor
      label={label}
      items={items}
      onChange={onChange}
      create={() => ({ label: '', link: '/' })}
      itemLabel={(n) => n.label}
      addLabel={addLabel}
      render={(n, up) => (
        <div className="ws-row">
          <TextField label="Text" value={n.label} onChange={(v) => up({ label: v })} />
          <LinkInput value={n.link} onChange={(v) => up({ link: v })} />
        </div>
      )}
    />
  );
}
