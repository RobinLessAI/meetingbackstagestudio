import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, Copy, Mail, RotateCcw, Save, Send } from 'lucide-react';
import { Badge, Button, Panel, Segmented } from '../../components/ui.tsx';
import { useStore } from '../../state/store.tsx';
import { TextField } from './fields.tsx';
import { websiteApi } from './media.ts';
import { RichText } from './RichText.tsx';

interface Vorlage {
  betreff: string;
  ueberschrift: string;
  inhalt: string;
  knopf: string;
}
interface KatalogEintrag {
  id: string;
  name: string;
  wann: string;
  platzhalter: Array<{ key: string; label: string; beispiel: string }>;
  standard: Vorlage;
}
interface MailState {
  vorlagen: Record<string, Vorlage>;
  eigene: string[];
  fuss: string;
  katalog: KatalogEintrag[];
  standardFuss: string;
}
interface Rendered {
  subject: string;
  text: string;
  html: string;
}

const same = (a: Vorlage, b: Vorlage) => a.betreff === b.betreff && a.ueberschrift === b.ueberschrift && a.inhalt === b.inhalt && a.knopf === b.knopf;

/** Alle Mails des Systems bearbeiten: Betreff, Überschrift, Inhalt, Knopf; Vorschau und Testmail. */
export function MailTemplates() {
  const { notify } = useStore();
  const [state, setState] = useState<MailState | null>(null);
  const [vorlagen, setVorlagen] = useState<Record<string, Vorlage>>({});
  const [fuss, setFuss] = useState('');
  const [sel, setSel] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'speichern' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Rendered | null>(null);
  const [ansicht, setAnsicht] = useState<'html' | 'text'>('html');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    websiteApi
      .get<MailState>('/api/website/mails')
      .then((s) => {
        setState(s);
        setVorlagen(s.vorlagen);
        setFuss(s.fuss);
        setSel(s.katalog[0]?.id ?? '');
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  // Vorschau (vom Server gerendert, genau wie beim Versand), kurz nach jeder Änderung
  const refresh = useCallback(() => {
    if (!sel || !vorlagen[sel]) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        setPreview(await websiteApi.send<Rendered>('/api/website/mails/vorschau', 'POST', { id: sel, vorlage: vorlagen[sel], fuss }));
      } catch (e) {
        setError((e as Error).message);
      }
    }, 400);
  }, [sel, vorlagen, fuss]);
  useEffect(refresh, [refresh]);

  if (error && !state) {
    return (
      <p className="callout callout--danger" role="alert">
        <CircleAlert size={16} aria-hidden /> {error}
      </p>
    );
  }
  if (!state) return <p className="subtle">Lade die E-Mail-Vorlagen …</p>;

  const def = state.katalog.find((k) => k.id === sel)!;
  const v = vorlagen[sel];
  const update = (patch: Partial<Vorlage>) => {
    setVorlagen((all) => ({ ...all, [sel]: { ...all[sel], ...patch } }));
    setDirty(true);
  };
  const save = async () => {
    setBusy('speichern');
    try {
      const s = await websiteApi.send<MailState>('/api/website/mails', 'PUT', { vorlagen, fuss });
      setState(s);
      setDirty(false);
      notify('E-Mail-Vorlagen gespeichert. Ab sofort werden die Mails so verschickt.', 'erfolg');
    } catch (e) {
      notify((e as Error).message, 'fehler');
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy('test');
    try {
      const r = await websiteApi.send<{ an: string }>('/api/website/mails/test', 'POST', { id: sel, vorlage: v, fuss });
      notify(`Testmail an ${r.an} verschickt (mit Beispielwerten).`, 'erfolg');
    } catch (e) {
      notify((e as Error).message, 'fehler');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Panel
        eyebrow="E-Mails"
        title="E-Mail-Vorlagen"
        actions={
          <Button variant="primary" icon={Save} loading={busy === 'speichern'} disabled={!dirty || busy !== null} onClick={save}>
            Speichern
          </Button>
        }
      >
        <p className="muted">
          Diese Mails verschickt das System automatisch. Änderungen gelten nach dem Speichern sofort (ohne „Veröffentlichen“). Platzhalter wie{' '}
          <code>{'{{name}}'}</code> werden beim Versand ersetzt.
        </p>
        <div className="mt-tabs" role="tablist" aria-label="Vorlage wählen">
          {state.katalog.map((k) => {
            const changed = !same(vorlagen[k.id], k.standard);
            return (
              <button key={k.id} type="button" role="tab" aria-selected={sel === k.id} className={`mt-tab${sel === k.id ? ' is-active' : ''}`} onClick={() => setSel(k.id)}>
                <Mail size={15} aria-hidden />
                <span>{k.name}</span>
                {changed && <Badge tone="ok">angepasst</Badge>}
              </button>
            );
          })}
        </div>
        {dirty && <p className="field-hint">Ungespeicherte Änderungen – „Speichern“ nicht vergessen.</p>}
      </Panel>

      <div className="mt-layout">
        <Panel
          eyebrow={def.wann}
          title={def.name}
          actions={
            <Button size="sm" variant="ghost" icon={RotateCcw} disabled={same(v, def.standard)} onClick={() => update({ ...def.standard })}>
              Standardtext
            </Button>
          }
        >
          <TextField label="Betreff" value={v.betreff} onChange={(betreff) => update({ betreff })} max={120} />
          <TextField label="Überschrift in der Mail" value={v.ueberschrift} onChange={(ueberschrift) => update({ ueberschrift })} />
          <div className="field">
            <span className="field-label">Inhalt</span>
            <RichText key={sel} label="Inhalt der Mail" value={v.inhalt} onChange={(inhalt) => update({ inhalt })} minHeight={200} />
          </div>
          <TextField
            label="Beschriftung des Knopfs"
            value={v.knopf}
            onChange={(knopf) => update({ knopf })}
            hint="Der Knopf führt zu {{link}}. Leer lassen = kein Knopf (dann den Link im Text einbauen)."
          />
          <div className="field">
            <span className="field-label">Platzhalter (anklicken zum Kopieren)</span>
            <div className="mt-chips">
              {def.platzhalter.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="mt-chip"
                  title={`${p.label} – z. B. ${p.beispiel}`}
                  onClick={() => {
                    navigator.clipboard?.writeText(`{{${p.key}}}`);
                    notify(`{{${p.key}}} kopiert – im Text einfügen mit ⌘ V`, 'erfolg');
                  }}
                >
                  <Copy size={12} aria-hidden /> {`{{${p.key}}}`}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Vorschau mit Beispielwerten"
          title={preview ? preview.subject : 'Vorschau'}
          actions={
            <>
              <Segmented<'html' | 'text'>
                label="Ansicht"
                hideLabel
                size="sm"
                value={ansicht}
                onChange={setAnsicht}
                options={[
                  { value: 'html', label: 'Gestaltet' },
                  { value: 'text', label: 'Nur Text' },
                ]}
              />
              <Button size="sm" icon={Send} loading={busy === 'test'} disabled={busy !== null} onClick={test}>
                Testmail an mich
              </Button>
            </>
          }
        >
          {preview &&
            (ansicht === 'html' ? (
              <iframe className="mt-preview" title="Vorschau der E-Mail" sandbox="" srcDoc={preview.html} />
            ) : (
              <pre className="mt-text">{preview.text}</pre>
            ))}
        </Panel>
      </div>

      <Panel eyebrow="Für alle Mails" title="Fußzeile">
        <TextField
          label="Text unter jeder Mail"
          value={fuss}
          onChange={(f) => {
            setFuss(f);
            setDirty(true);
          }}
          multiline
          rows={3}
          hint="Zum Beispiel Firmenname, Adresse oder ein Gruß. {{website}} und {{studio}} werden ersetzt."
        />
        <div className="row">
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            disabled={fuss === state.standardFuss}
            onClick={() => {
              setFuss(state.standardFuss);
              setDirty(true);
            }}
          >
            Standard-Fußzeile
          </Button>
        </div>
      </Panel>
    </>
  );
}
