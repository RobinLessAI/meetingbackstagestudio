import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  History,
  Images,
  Mail,
  Menu,
  Plus,
  RotateCcw,
  Rocket,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import { Badge, Button, Dialog, IconButton, Panel, Segmented, Switch } from '../../components/ui.tsx';
import { useStore } from '../../state/store.tsx';
import { currentUser } from '../mode.ts';
import { BLOCKS, BlockEditor, blockSummary, createBlock } from './blocks.tsx';
import { ImageField, MediaContext, NavListEditor, TextField, ListEditor } from './fields.tsx';
import { MailTemplates } from './MailTemplates.tsx';
import { uploadFavicon, uploadImage, websiteApi } from './media.ts';
import type { Block, BlockTyp, Inhalt, Medium, Seite, Site, WebsiteState } from './types.ts';

type Auswahl = { art: 'allgemein' } | { art: 'navigation' } | { art: 'medien' } | { art: 'versionen' } | { art: 'mails' } | { art: 'seite'; id: string };

const when = (t: number | null) => (t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const newId = () => Math.random().toString(36).slice(2, 10);
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Seitentitel für Google, wie ihn der Server bildet. */
function seoTitle(site: Site, page: Seite) {
  if (page.seoTitel) return page.seoTitel;
  if (page.pfad === '/' && site.startTitel) return site.startTitel;
  return (site.titelVorlage || '%s').replace('%s', page.titel || page.name);
}

/** Verwaltung der Hauptseite: Seiten, Inhalte, Bilder, SEO, Navigation – mit Entwurf, Vorschau und Veröffentlichen. */
export function WebsiteView() {
  const { notify } = useStore();
  const [state, setState] = useState<WebsiteState | null>(null);
  const [draft, setDraft] = useState<Inhalt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'gespeichert' | 'speichert' | 'fehler'>('gespeichert');
  const [changed, setChanged] = useState(false);
  const [sel, setSel] = useState<Auswahl>({ art: 'seite', id: '' });
  const [publishing, setPublishing] = useState(false);
  const [newPage, setNewPage] = useState(false);
  const timer = useRef<number | null>(null);
  const pending = useRef<Inhalt | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await websiteApi.get<WebsiteState>('/api/website');
      setState(s);
      setDraft(s.entwurf);
      setChanged(s.geaendert);
      setSel((cur) => (cur.art === 'seite' && !s.entwurf.seiten.some((p) => p.id === cur.id) ? { art: 'seite', id: s.entwurf.seiten[0]?.id ?? '' } : cur));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Entwurf automatisch speichern (kurz nach der letzten Änderung)
  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const content = pending.current;
    if (!content) return true;
    pending.current = null;
    setSaving('speichert');
    try {
      const r = await websiteApi.send<{ geaendert: boolean }>('/api/website/entwurf', 'PUT', content);
      setChanged(r.geaendert);
      setSaving('gespeichert');
      setError(null);
      return true;
    } catch (e) {
      setSaving('fehler');
      setError((e as Error).message);
      return false;
    }
  }, []);
  const update = useCallback(
    (fn: (d: Inhalt) => Inhalt) => {
      setDraft((d) => {
        if (!d) return d;
        const next = fn(d);
        pending.current = next;
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 800);
        setSaving('speichert');
        return next;
      });
    },
    [flush],
  );
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const media = useMemo(
    () => ({
      medien: state?.medien ?? [],
      upload: async (file: File) => {
        const r = await uploadImage(file);
        setState((s) => (s ? { ...s, medien: r.medien } : s));
        return r.url;
      },
    }),
    [state?.medien],
  );

  if (!currentUser()?.admin) {
    return (
      <div className="view">
        <p className="callout callout--warn">
          <CircleAlert size={16} aria-hidden /> Diese Seite ist nur für die Verwaltung.
        </p>
      </div>
    );
  }
  if (!state || !draft) {
    return (
      <div className="view">
        {error ? (
          <p className="callout callout--danger" role="alert">
            <CircleAlert size={16} aria-hidden /> {error}
          </p>
        ) : (
          <p className="subtle">Lade die Website …</p>
        )}
      </div>
    );
  }

  const page = sel.art === 'seite' ? (draft.seiten.find((p) => p.id === sel.id) ?? draft.seiten[0]) : null;
  const setSite = (patch: Partial<Site>) => update((d) => ({ ...d, site: { ...d.site, ...patch } }));
  const setPage = (id: string, patch: Partial<Seite>) => update((d) => ({ ...d, seiten: d.seiten.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const publish = async () => {
    setPublishing(true);
    try {
      if (!(await flush())) return;
      const s = await websiteApi.send<WebsiteState>('/api/website/veroeffentlichen', 'POST', {});
      setState((cur) => (cur ? { ...cur, ...s } : cur));
      setChanged(false);
      notify('Die Website ist veröffentlicht.', 'erfolg');
    } catch (e) {
      notify((e as Error).message, 'fehler');
    } finally {
      setPublishing(false);
    }
  };
  const preview = async (pfad: string) => {
    await flush();
    window.open(`/api/website/vorschau?pfad=${encodeURIComponent(pfad)}`, 'mb-website-vorschau');
  };

  return (
    <MediaContext.Provider value={media}>
      <div className="view ws">
        <header className="view__head">
          <div className="view__titles">
            <span className="eyebrow">Nur für dich</span>
            <h1 className="view__title">Website</h1>
            <p className="view__lead">
              Inhalte von {state.siteUrl.replace(/^https?:\/\//, '')} bearbeiten. Änderungen werden als Entwurf gespeichert und sind erst nach „Veröffentlichen“ öffentlich.
            </p>
          </div>
          <div className="view__head-side ws-actions">
            <span className={`ws-status ws-status--${saving}`} role="status">
              {saving === 'speichert' ? 'Speichert …' : saving === 'fehler' ? 'Nicht gespeichert' : changed ? 'Entwurf gespeichert · nicht veröffentlicht' : 'Alles veröffentlicht'}
            </span>
            <Button icon={Eye} onClick={() => preview(page?.pfad ?? '/')}>
              Vorschau
            </Button>
            <Button variant="primary" icon={Rocket} loading={publishing} disabled={publishing || (!changed && saving === 'gespeichert')} onClick={publish}>
              Veröffentlichen
            </Button>
          </div>
        </header>
        {error && (
          <p className="callout callout--danger" role="alert">
            <CircleAlert size={16} aria-hidden /> {error}
          </p>
        )}

        <div className="ws-layout">
          <nav className="ws-side" aria-label="Website-Bereiche">
            <p className="eyebrow ws-side__head">Seiten</p>
            <ul className="ws-side__list">
              {draft.seiten.map((p) => (
                <li key={p.id}>
                  <button type="button" className={`ws-side__item${sel.art === 'seite' && page?.id === p.id ? ' is-active' : ''}`} onClick={() => setSel({ art: 'seite', id: p.id })}>
                    <FileText size={15} aria-hidden />
                    <span className="ws-side__name">{p.name}</span>
                    <span className="ws-side__path mono">{p.pfad}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button size="sm" icon={Plus} onClick={() => setNewPage(true)}>
              Neue Seite
            </Button>
            <p className="eyebrow ws-side__head">Einstellungen</p>
            <ul className="ws-side__list">
              {(
                [
                  ['allgemein', 'Allgemein & SEO', Settings],
                  ['navigation', 'Menü & Fußzeile', Menu],
                  ['medien', 'Bilder', Images],
                  ['mails', 'E-Mail-Vorlagen', Mail],
                  ['versionen', 'Frühere Fassungen', History],
                ] as const
              ).map(([art, label, Icon]) => (
                <li key={art}>
                  <button type="button" className={`ws-side__item${sel.art === art ? ' is-active' : ''}`} onClick={() => setSel({ art })}>
                    <Icon size={15} aria-hidden />
                    <span className="ws-side__name">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
            <a className="ws-side__live" href={state.siteUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden /> Öffentliche Seite ansehen
            </a>
          </nav>

          <div className="ws-main">
            {page && (
              <PageEditor
                key={page.id}
                site={draft.site}
                page={page}
                siteUrl={state.siteUrl}
                allPaths={draft.seiten.map((p) => p.pfad)}
                onChange={(patch) => setPage(page.id, patch)}
                onPreview={() => preview(page.pfad)}
                onDelete={() => {
                  update((d) => ({ ...d, seiten: d.seiten.filter((p) => p.id !== page.id) }));
                  setSel({ art: 'seite', id: draft.seiten[0].id });
                }}
                onDuplicate={() => {
                  let pfad = `${page.pfad.replace(/\/$/, '') || '/start'}-kopie/`;
                  while (draft.seiten.some((p) => p.pfad === pfad)) pfad = pfad.replace(/\/$/, '-2/');
                  const copy: Seite = { ...structuredClone(page), id: newId(), pfad, name: `${page.name} (Kopie)` };
                  update((d) => ({ ...d, seiten: [...d.seiten, copy] }));
                  setSel({ art: 'seite', id: copy.id });
                }}
              />
            )}
            {sel.art === 'allgemein' && <GeneralEditor site={draft.site} onChange={setSite} onMedia={(medien) => setState((s) => (s ? { ...s, medien } : s))} />}
            {sel.art === 'navigation' && <NavigationEditor site={draft.site} onChange={setSite} />}
            {sel.art === 'mails' && <MailTemplates />}
            {sel.art === 'medien' && <MediaManager medien={state.medien} onMedia={(medien) => setState((s) => (s ? { ...s, medien } : s))} />}
            {sel.art === 'versionen' && (
              <VersionsPanel
                state={state}
                changed={changed}
                onRestored={async (s) => {
                  setState(s);
                  setDraft(s.entwurf);
                  setChanged(s.geaendert);
                  pending.current = null;
                }}
              />
            )}
          </div>
        </div>

        <NewPageDialog
          open={newPage}
          onClose={() => setNewPage(false)}
          existing={draft.seiten.map((p) => p.pfad)}
          onCreate={(p) => {
            update((d) => ({ ...d, seiten: [...d.seiten, p] }));
            setSel({ art: 'seite', id: p.id });
            setNewPage(false);
          }}
        />
      </div>
    </MediaContext.Provider>
  );
}

// ----------------------------------------------------------------- Eine Seite bearbeiten
function PageEditor({
  site,
  page,
  siteUrl,
  allPaths,
  onChange,
  onPreview,
  onDelete,
  onDuplicate,
}: {
  site: Site;
  page: Seite;
  siteUrl: string;
  allPaths: string[];
  onChange: (patch: Partial<Seite>) => void;
  onPreview: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [open, setOpen] = useState<string | null>(page.bloecke[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pathDraft, setPathDraft] = useState(page.pfad);
  const special = page.pfad === '/' || page.pfad === '/404/';
  const blocks = page.bloecke;
  const setBlocks = (bloecke: Block[]) => onChange({ bloecke });
  const move = (i: number, d: number) => {
    const next = [...blocks];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    setBlocks(next);
  };
  const pathError = (() => {
    const p = pathDraft.trim().toLowerCase();
    const norm = `/${p.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
    if (!/^(\/[a-z0-9]+(-[a-z0-9]+)*)+\/$/.test(norm)) return 'Nur Kleinbuchstaben, Ziffern und Bindestriche, z. B. /preise/.';
    if (norm !== page.pfad && allPaths.includes(norm)) return 'Diese Adresse gibt es schon.';
    if (/^\/(_web|api|assets|zoom-sdk|aktion|sync)\//.test(norm)) return 'Diese Adresse ist reserviert.';
    return null;
  })();
  const title = seoTitle(site, page);
  const desc = page.beschreibung || site.beschreibung;

  return (
    <>
      <Panel
        eyebrow={page.pfad === '/' ? 'Startseite' : page.pfad === '/404/' ? 'Fehlerseite' : 'Seite'}
        title={page.name}
        actions={
          <>
            <Button size="sm" icon={Eye} onClick={onPreview}>
              Vorschau
            </Button>
            <Button size="sm" icon={Copy} onClick={onDuplicate}>
              Duplizieren
            </Button>
            {!special && (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Löschen
              </Button>
            )}
          </>
        }
      >
        <div className="ws-row">
          <TextField label="Name (nur intern, z. B. im Menü dieser Liste)" value={page.name} onChange={(name) => onChange({ name })} />
          <TextField label="Seitentitel" value={page.titel} onChange={(titel) => onChange({ titel })} hint={`Wird im Browser-Tab zu „${(site.titelVorlage || '%s').replace('%s', page.titel || page.name)}“.`} />
        </div>
        {!special && (
          <div className="field">
            <span className="field-label">Adresse</span>
            <div className="ws-path">
              <span className="mono subtle">{siteUrl.replace(/^https?:\/\//, '')}</span>
              <input
                className="input mono"
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                onBlur={() => {
                  if (pathError) return;
                  const norm = `/${pathDraft.trim().toLowerCase().replace(/^\/+|\/+$/g, '')}/`;
                  setPathDraft(norm);
                  if (norm !== page.pfad) onChange({ pfad: norm });
                }}
                aria-invalid={!!pathError}
              />
            </div>
            {pathError ? <span className="field-error">{pathError}</span> : <span className="field-hint">Ändert sich die Adresse, vergiss nicht, Links im Menü und auf anderen Seiten anzupassen.</span>}
          </div>
        )}
        <details className="ws-seo" open={page.pfad !== '/404/'}>
          <summary>Suchmaschinen (SEO) und Vorschaubild</summary>
          <div className="ws-google" aria-label="So könnte die Seite bei Google erscheinen">
            <span className="ws-google__url">{`${siteUrl.replace(/^https?:\/\//, '')}${page.pfad === '/' ? '' : page.pfad.replace(/\/$/, '').replace(/\//g, ' › ')}`}</span>
            <span className="ws-google__title">{title}</span>
            <span className="ws-google__desc">{desc || 'Keine Beschreibung – Google wählt dann selbst einen Ausschnitt.'}</span>
          </div>
          <TextField label="Titel für Google (optional)" value={page.seoTitel} onChange={(seoTitel) => onChange({ seoTitel })} max={60} hint="Leer = Seitentitel mit Vorlage. Ideal: 50–60 Zeichen." />
          <TextField label="Beschreibung für Google" value={page.beschreibung} onChange={(beschreibung) => onChange({ beschreibung })} max={160} multiline rows={2} hint="Ideal: 120–160 Zeichen. Leer = allgemeine Beschreibung aus „Allgemein & SEO“." />
          <ImageField label="Vorschaubild beim Teilen (optional)" value={page.vorschaubild} onChange={(vorschaubild) => onChange({ vorschaubild })} hint="Erscheint, wenn jemand den Link teilt (z. B. LinkedIn, WhatsApp). Ideal: 1200 × 630 Pixel." />
          <Switch checked={page.indexieren} onChange={(indexieren) => onChange({ indexieren })} label="In Suchmaschinen anzeigen" description="Aus: Die Seite ist erreichbar, wird aber nicht in Google aufgenommen und fehlt in der Sitemap." />
        </details>
      </Panel>

      <Panel title={<>Inhalt <span className="subtle tabular">{blocks.length} Abschnitte</span></>} flush>
        <ol className="ws-blocks">
          {blocks.map((b, i) => {
            const def = BLOCKS[b.typ];
            const Icon = def.icon;
            const isOpen = open === b.id;
            return (
              <li key={b.id} className={`ws-block${isOpen ? ' is-open' : ''}`}>
                <div className="ws-block__head">
                  <button type="button" className="ws-block__toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}>
                    {isOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                    <Icon size={16} aria-hidden />
                    <span className="ws-block__type">{def.label}</span>
                    <span className="ws-block__summary">{blockSummary(b)}</span>
                  </button>
                  <IconButton label="Nach oben" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton label="Nach unten" icon={ArrowDown} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} />
                  <IconButton
                    label="Duplizieren"
                    icon={Copy}
                    onClick={() => {
                      const copy = { ...structuredClone(b), id: newId() };
                      setBlocks([...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)]);
                      setOpen(copy.id);
                    }}
                  />
                  <IconButton
                    label="Abschnitt löschen"
                    icon={Trash2}
                    tone="danger"
                    onClick={() => {
                      if (window.confirm(`„${def.label}“ wirklich löschen?`)) setBlocks(blocks.filter((x) => x.id !== b.id));
                    }}
                  />
                </div>
                {isOpen && (
                  <div className="ws-block__body">
                    <BlockEditor block={b} onChange={(nb) => setBlocks(blocks.map((x) => (x.id === b.id ? nb : x)))} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="ws-add">
          {adding ? (
            <div className="ws-add__grid">
              {(Object.keys(BLOCKS) as BlockTyp[]).map((t) => {
                const def = BLOCKS[t];
                const Icon = def.icon;
                return (
                  <button
                    type="button"
                    key={t}
                    className="ws-add__choice"
                    onClick={() => {
                      const nb = createBlock(t);
                      setBlocks([...blocks, nb]);
                      setOpen(nb.id);
                      setAdding(false);
                    }}
                  >
                    <Icon size={18} aria-hidden />
                    <strong>{def.label}</strong>
                    <span>{def.beschreibung}</span>
                  </button>
                );
              })}
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <Button icon={Plus} onClick={() => setAdding(true)}>
              Abschnitt hinzufügen
            </Button>
          )}
        </div>
      </Panel>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`„${page.name}“ löschen?`}
        tone="danger"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger-solid"
              icon={Trash2}
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
            >
              Seite löschen
            </Button>
          </>
        }
      >
        <p>Die Seite verschwindet nach dem nächsten Veröffentlichen. Über „Frühere Fassungen“ lässt sie sich zurückholen. Links im Menü auf {page.pfad} bitte entfernen.</p>
      </Dialog>
    </>
  );
}

// ----------------------------------------------------------------- Neue Seite
function NewPageDialog({ open, onClose, existing, onCreate }: { open: boolean; onClose: () => void; existing: string[]; onCreate: (p: Seite) => void }) {
  const [name, setName] = useState('');
  const [vorlage, setVorlage] = useState<'text' | 'landing' | 'leer'>('text');
  const pfad = `/${slugify(name)}/`;
  const taken = existing.includes(pfad);
  const valid = slugify(name).length > 0 && !taken;
  const create = () => {
    const bloecke: Block[] =
      vorlage === 'leer'
        ? []
        : vorlage === 'text'
          ? [{ ...(createBlock('seitenkopf') as Extract<Block, { typ: 'seitenkopf' }>), titel: name }, createBlock('text')]
          : [{ ...(createBlock('buehne') as Extract<Block, { typ: 'buehne' }>), titel: name }, createBlock('karten'), createBlock('aufruf')];
    onCreate({ id: newId(), pfad, name, titel: name, seoTitel: '', beschreibung: '', vorschaubild: '', indexieren: true, bloecke });
    setName('');
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Neue Seite"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" icon={Plus} disabled={!valid} onClick={create}>
            Seite anlegen
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) create();
        }}
        className="stack"
      >
        <TextField label="Name der Seite" value={name} onChange={setName} placeholder="z. B. Preise" />
        <p className="field-hint">
          Adresse: <span className="mono">{valid || !name ? pfad : '–'}</span>
          {taken && <span className="field-error"> – gibt es schon</span>}
        </p>
        <div className="field">
          <span className="field-label">Vorlage</span>
          <select className="select" value={vorlage} onChange={(e) => setVorlage(e.target.value as typeof vorlage)}>
            <option value="text">Textseite (Seitenkopf und Text)</option>
            <option value="landing">Angebotsseite (Bühne, Karten, Aufruf)</option>
            <option value="leer">Leer</option>
          </select>
        </div>
        <p className="field-hint">Die Seite ist erst nach „Veröffentlichen“ sichtbar. Ins Menü kommt sie über „Menü & Fußzeile“.</p>
      </form>
    </Dialog>
  );
}

// ----------------------------------------------------------------- Allgemein & SEO
function GeneralEditor({ site, onChange, onMedia }: { site: Site; onChange: (p: Partial<Site>) => void; onMedia: (m: Medium[]) => void }) {
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fav = site.favicon?.svg || site.favicon?.png180 || site.favicon?.png32;
  return (
    <>
      <Panel eyebrow="Allgemein" title="Name, Titel und Beschreibung">
        <div className="ws-row">
          <TextField label="Name der Website" value={site.name} onChange={(name) => onChange({ name })} />
          <TextField label="Slogan" value={site.slogan} onChange={(slogan) => onChange({ slogan })} />
        </div>
        <TextField
          label="Titel-Vorlage für Unterseiten"
          value={site.titelVorlage}
          onChange={(titelVorlage) => onChange({ titelVorlage })}
          hint={`%s steht für den Seitentitel. Beispiel: „${(site.titelVorlage || '%s').replace('%s', 'Hilfe')}“.`}
        />
        <TextField label="Titel der Startseite (optional)" value={site.startTitel} onChange={(startTitel) => onChange({ startTitel })} max={60} hint="Leer = Titel aus den SEO-Einstellungen der Startseite." />
        <TextField label="Allgemeine Beschreibung für Google" value={site.beschreibung} onChange={(beschreibung) => onChange({ beschreibung })} max={160} multiline rows={2} hint="Wird genutzt, wenn eine Seite keine eigene Beschreibung hat." />
        <TextField label="Kontakt-E-Mail" value={site.kontaktMail} onChange={(kontaktMail) => onChange({ kontaktMail })} hint="Erscheint in der Fußzeile; in Texten steht {{mail}} für diese Adresse." />
        <Switch checked={site.indexieren} onChange={(indexieren) => onChange({ indexieren })} label="Website in Suchmaschinen anzeigen" description="Aus: Google wird gebeten, keine Seite aufzunehmen (z. B. solange du noch baust)." />
      </Panel>

      <Panel eyebrow="Aussehen" title="Favicon, Logos und Vorschaubild">
        <div className="field">
          <span className="field-label">Favicon (Symbol im Browser-Tab)</span>
          <div className="ws-image">
            {fav ? <img src={fav} alt="" className="ws-image__thumb ws-image__thumb--square" /> : <img src="/_web/favicon.svg" alt="" className="ws-image__thumb ws-image__thumb--square" />}
            <div className="ws-image__actions">
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setBusy(true);
                  try {
                    const r = await uploadFavicon(f);
                    onMedia(r.medien);
                    onChange({ favicon: r.favicon });
                    notify('Favicon hochgeladen. Nach dem Veröffentlichen sichtbar (Browser zeigen es teils erst nach einem Neuladen).', 'erfolg');
                  } catch (err) {
                    notify((err as Error).message, 'fehler');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <Button size="sm" icon={Upload} loading={busy} disabled={busy} onClick={() => input.current?.click()}>
                Favicon hochladen
              </Button>
              {site.favicon && (
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => onChange({ favicon: null })}>
                  Standard (Bildmarke)
                </Button>
              )}
            </div>
          </div>
          <span className="field-hint">Quadratisch, mindestens 512 × 512 Pixel, als PNG oder SVG. Die nötigen Größen werden automatisch erzeugt.</span>
        </div>
        <Segmented<'hell' | 'dunkel'>
          label="Kopfzeile"
          value={site.kopfStil === 'dunkel' ? 'dunkel' : 'hell'}
          onChange={(kopfStil) => onChange({ kopfStil })}
          options={[
            { value: 'hell', label: 'Hell – farbiges Logo' },
            { value: 'dunkel', label: 'Dunkel – weißes Logo' },
          ]}
        />
        <ImageField
          label="Eigenes Logo oben (optional)"
          value={site.logo}
          onChange={(logo) => onChange({ logo })}
          hint={`Leer = MeetingBackstage-Logo ${site.kopfStil === 'dunkel' ? 'in Weiß' : 'in Farbe'}. Passend zur Kopfzeile wählen, am besten SVG oder PNG mit transparentem Hintergrund.`}
        />
        <ImageField label="Logo in der Fußzeile" value={site.logoFuss} onChange={(logoFuss) => onChange({ logoFuss })} hint="Leer = Logo mit Slogan in Weiß." />
        <ImageField label="Standard-Vorschaubild beim Teilen" value={site.vorschaubild} onChange={(vorschaubild) => onChange({ vorschaubild })} hint="1200 × 630 Pixel. Gilt für alle Seiten ohne eigenes Vorschaubild." />
      </Panel>
    </>
  );
}

// ----------------------------------------------------------------- Menü & Fußzeile
function NavigationEditor({ site, onChange }: { site: Site; onChange: (p: Partial<Site>) => void }) {
  return (
    <>
      <Panel eyebrow="Kopfzeile" title="Menü">
        <NavListEditor label="Menüpunkte" items={site.navigation} onChange={(navigation) => onChange({ navigation })} addLabel="Menüpunkt hinzufügen" />
        <ListEditor
          label="Knöpfe rechts oben"
          items={site.kopfKnoepfe}
          onChange={(kopfKnoepfe) => onChange({ kopfKnoepfe })}
          create={() => ({ label: '', link: '/', stil: 'primaer' as const })}
          itemLabel={(k) => k.label}
          addLabel="Knopf hinzufügen"
          max={3}
          render={(k, up) => (
            <div className="ws-row">
              <TextField label="Text" value={k.label} onChange={(label) => up({ label })} />
              <TextField label="Ziel" value={k.link} onChange={(link) => up({ link })} />
              <div className="field">
                <span className="field-label">Stil</span>
                <select className="select" value={k.stil} onChange={(e) => up({ stil: e.target.value as 'primaer' | 'leise' })}>
                  <option value="primaer">Hervorgehoben (Petrol)</option>
                  <option value="leise">Umrandet</option>
                </select>
              </div>
            </div>
          )}
        />
        <p className="field-hint">Ziele: eigene Seiten wie /hilfe/, Abschnitte wie /#funktionen, {'{{studio}}'} für das Studio oder volle Adressen https://…</p>
      </Panel>
      <Panel eyebrow="Fußzeile" title="Fußzeile">
        <TextField label="Text unter dem Logo" value={site.fussText} onChange={(fussText) => onChange({ fussText })} multiline rows={2} />
        <NavListEditor label="Links" items={site.fussLinks} onChange={(fussLinks) => onChange({ fussLinks })} addLabel="Link hinzufügen" />
        <TextField label="Kleingedrucktes" value={site.fussKlein} onChange={(fussKlein) => onChange({ fussKlein })} multiline rows={2} hint="{jahr} wird durch das aktuelle Jahr ersetzt." />
      </Panel>
    </>
  );
}

// ----------------------------------------------------------------- Bilder
function MediaManager({ medien, onMedia }: { medien: Medium[]; onMedia: (m: Medium[]) => void }) {
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Panel
      eyebrow="Mediathek"
      title={<>Bilder <span className="subtle tabular">{medien.length}</span></>}
      actions={
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              setBusy(true);
              for (const f of files) {
                try {
                  onMedia((await uploadImage(f)).medien);
                } catch (err) {
                  notify(`${f.name}: ${(err as Error).message}`, 'fehler');
                }
              }
              setBusy(false);
            }}
          />
          <Button variant="primary" icon={Upload} loading={busy} disabled={busy} onClick={() => input.current?.click()}>
            Bilder hochladen
          </Button>
        </>
      }
    >
      <p className="muted">Fotos werden beim Hochladen auf höchstens 2000 Pixel verkleinert und als WebP gespeichert. Bilder, die auf einer Seite verwendet werden, lassen sich nicht löschen.</p>
      {medien.length === 0 ? (
        <p className="subtle">Noch keine Bilder.</p>
      ) : (
        <div className="ws-media-grid ws-media-grid--manage">
          {medien.map((m) => (
            <figure key={m.name} className="ws-media">
              <img src={m.url} alt="" loading="lazy" />
              <figcaption>
                <span title={m.name}>{m.name}</span>
                <span className="subtle tabular">{Math.max(1, Math.round(m.groesse / 1024))} KB</span>
                <IconButton
                  label="Adresse kopieren"
                  icon={Copy}
                  onClick={() => {
                    navigator.clipboard?.writeText(m.url);
                    notify('Adresse kopiert', 'erfolg');
                  }}
                />
                <IconButton
                  label="Bild löschen"
                  icon={Trash2}
                  tone="danger"
                  onClick={async () => {
                    if (!window.confirm(`${m.name} löschen?`)) return;
                    try {
                      onMedia((await websiteApi.send<{ medien: Medium[] }>(`/api/website/medien/${encodeURIComponent(m.name)}`, 'DELETE')).medien);
                    } catch (err) {
                      notify((err as Error).message, 'fehler');
                    }
                  }}
                />
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------------- Frühere Fassungen
function VersionsPanel({ state, changed, onRestored }: { state: WebsiteState; changed: boolean; onRestored: (s: WebsiteState) => void }) {
  const { notify } = useStore();
  const restore = async (id: string) => {
    try {
      const s = await websiteApi.send<WebsiteState>('/api/website/wiederherstellen', 'POST', { id });
      onRestored({ ...state, ...s });
      notify('Fassung als Entwurf geladen. Prüfen und dann „Veröffentlichen“.', 'erfolg');
    } catch (e) {
      notify((e as Error).message, 'fehler');
    }
  };
  return (
    <Panel eyebrow="Sicherheit" title="Frühere Fassungen">
      <p className="muted">
        Bei jedem Veröffentlichen wird eine Fassung gespeichert (die letzten 40). Eine Fassung zurückholen ersetzt deinen Entwurf; öffentlich wird sie erst mit „Veröffentlichen“.
      </p>
      {changed && (
        <div className="row">
          <Button
            icon={RotateCcw}
            onClick={async () => {
              if (!window.confirm('Alle unveröffentlichten Änderungen verwerfen?')) return;
              try {
                const s = await websiteApi.send<WebsiteState>('/api/website/verwerfen', 'POST', {});
                onRestored({ ...state, ...s });
                notify('Entwurf verworfen – wieder auf dem veröffentlichten Stand.', 'erfolg');
              } catch (e) {
                notify((e as Error).message, 'fehler');
              }
            }}
          >
            Unveröffentlichte Änderungen verwerfen
          </Button>
        </div>
      )}
      <p className="field-hint">Zuletzt veröffentlicht: {when(state.veroeffentlichtAm)}</p>
      {state.versionen.length === 0 ? (
        <p className="subtle">Noch keine Fassungen – die erste entsteht beim ersten Veröffentlichen.</p>
      ) : (
        <ul className="ws-versions">
          {state.versionen.map((v, i) => (
            <li key={v.id}>
              <span>
                {when(v.at)} {i === 0 && <Badge tone="ok">aktuell online</Badge>}
              </span>
              <Button size="sm" icon={RotateCcw} onClick={() => restore(v.id)}>
                Als Entwurf laden
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
