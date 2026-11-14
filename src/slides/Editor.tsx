import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  Circle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Minus,
  Plus,
  Radio,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import { Button, Dialog, IconButton, Segmented } from '../components/ui.tsx';
import { mb, slidesApi, uploadMedium } from './api.ts';
import { EditorCanvas } from './Canvas.tsx';
import { ElementInspector, SlideInspector } from './Inspector.tsx';
import { maxSchritt, neueForm, neuerText, neuesBild, type Element, type Folie, type FolienState, type Medium } from './model.ts';
import { SlideThumb } from './SlideRender.tsx';
import { VORLAGEN, vorlage, type VorlageId } from './vorlagen.ts';
import { mitTon, TonButton, useTon } from './ton.tsx';
import { PraesentationenPanel } from './Praesentationen.tsx';
import { ExportDialog } from './ExportDialog.tsx';
import { filterFolien, ordnerName, OrdnerLeiste, useOrdnerWahl, zielOrdner } from './ordner.tsx';

type Toast = { id: number; text: string; tone: 'ok' | 'fehler' };
const newId = () => Math.random().toString(36).slice(2, 10);
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** MeetingBackstage Slides: Folien gestalten, die über eine feste Adresse in OBS erscheinen. */
export function SlidesEditor({ studioUrl }: { studioUrl: string | null }) {
  const [st, setSt] = useState<FolienState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folieId, setFolieId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('folie'));
  const [draft, setDraft] = useState<Folie | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [saving, setSaving] = useState<'ok' | 'speichert' | 'fehler'>('ok');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mediaFor, setMediaFor] = useState<null | { typ: 'bild' | 'video'; ziel: 'neu' | 'element' | 'hintergrund' }>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [ton, setTon] = useTon();
  const [flach, setFlach] = useState(false);
  const [wahl, setWahl] = useOrdnerWahl(st);
  const [suche, setSuche] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [bereich, setBereich] = useState<'folien' | 'praesentationen'>(() =>
    new URLSearchParams(window.location.search).get('bereich') === 'praesentationen' ? 'praesentationen' : 'folien',
  );
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const past = useRef<Folie[]>([]);
  const future = useRef<Folie[]>([]);
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<Folie | null>(null);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'fehler' ? 6000 : 3000);
  }, []);

  // ------------------------------------------------------------- Laden
  const load = useCallback(async () => {
    try {
      const s = await slidesApi.state();
      setSt(s);
      setError(null);
      setFolieId((cur) => (cur && s.folien.some((f) => f.id === cur) ? cur : (s.folien[0]?.id ?? null)));
      if (!s.folien.length) setNewOpen(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!st || !folieId) return setDraft(null);
    const f = st.folien.find((x) => x.id === folieId) ?? null;
    setDraft(f ? structuredClone(f) : null);
    setSel(null);
    past.current = [];
    future.current = [];
    const u = new URL(window.location.href);
    u.searchParams.set('folie', folieId);
    window.history.replaceState(null, '', u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folieId, st?.folien.length]);

  const switchBereich = async (b: 'folien' | 'praesentationen') => {
    await flush();
    setBereich(b);
    const u = new URL(window.location.href);
    if (b === 'praesentationen') u.searchParams.set('bereich', b);
    else u.searchParams.delete('bereich');
    window.history.replaceState(null, '', u);
  };
  const referentUrl = (() => {
    const u = new URL(window.location.href);
    u.search = '?ansicht=referent';
    return u.toString();
  })();

  // ------------------------------------------------------------- Speichern
  const flush = useCallback(async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const f = pending.current;
    if (!f) return;
    pending.current = null;
    try {
      const r = await slidesApi.update(f);
      setSt((s) => (s ? { ...s, folien: s.folien.map((x) => (x.id === r.folie.id ? r.folie : x)) } : s));
      setSaving(pending.current ? 'speichert' : 'ok');
    } catch (e) {
      setSaving('fehler');
      toast((e as Error).message, 'fehler');
    }
  }, [toast]);
  const scheduleSave = (f: Folie) => {
    pending.current = f;
    setSaving('speichert');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 500);
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  /** Änderung übernehmen. key: gleiche Änderung kurz hintereinander = ein Schritt für „Rückgängig“. */
  const commit = useCallback(
    (fn: (f: Folie) => Folie, key?: string, skipHistory = false) => {
      setDraft((cur) => {
        if (!cur) return cur;
        const now = Date.now();
        const coalesce = key && lastKey.current?.key === key && now - lastKey.current.at < 800;
        if (!skipHistory && !coalesce) {
          past.current.push(cur);
          if (past.current.length > 80) past.current.shift();
          future.current = [];
        }
        lastKey.current = key ? { key, at: now } : null;
        const next = fn(cur);
        scheduleSave(next);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const patchEl = (id: string, patch: Partial<Element>, key?: string, skipHistory = false) =>
    commit(
      (f) => ({ ...f, elemente: f.elemente.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)) }),
      key ? `${id}:${key}` : undefined,
      skipHistory,
    );
  const undo = () => {
    const prev = past.current.pop();
    if (!prev || !draft) return;
    future.current.push(draft);
    setDraft(prev);
    scheduleSave(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next || !draft) return;
    past.current.push(draft);
    setDraft(next);
    scheduleSave(next);
  };

  const selected = draft?.elemente.find((e) => e.id === sel) ?? null;
  const addElement = (el: Element) => {
    commit((f) => ({ ...f, elemente: [...f.elemente, el] }));
    setSel(el.id);
  };
  const removeSelected = () => {
    if (!sel) return;
    commit((f) => ({ ...f, elemente: f.elemente.filter((e) => e.id !== sel) }));
    setSel(null);
  };
  const duplicateSelected = () => {
    if (!selected) return;
    const copy = { ...structuredClone(selected), id: newId(), name: `${selected.name} (Kopie)`, x: selected.x + 30, y: selected.y + 30 };
    addElement(copy);
  };
  const order = (dir: 'vorne' | 'hinten') => {
    if (!sel) return;
    commit((f) => {
      const rest = f.elemente.filter((e) => e.id !== sel);
      const me = f.elemente.find((e) => e.id === sel)!;
      return { ...f, elemente: dir === 'vorne' ? [...rest, me] : [me, ...rest] };
    });
  };
  const moveLayer = (id: string, d: number) =>
    commit((f) => {
      const i = f.elemente.findIndex((e) => e.id === id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= f.elemente.length) return f;
      const arr = [...f.elemente];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...f, elemente: arr };
    });

  // ------------------------------------------------------------- Tastatur
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (isTyping(e.target) || document.querySelector('dialog[open]')) return;
      if (!selected || bereich !== 'folien') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelected();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'Escape') setSel(null);
      else if (e.key.startsWith('Arrow') && !selected.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        patchEl(selected.id, { x: selected.x + dx, y: selected.y + dy }, 'pfeil');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ------------------------------------------------------------- Folien verwalten
  const createFolie = async (id: VorlageId) => {
    try {
      await flush();
      const name = VORLAGEN.find((v) => v.id === id)?.name ?? 'Folie';
      const r = await slidesApi.create({ ...vorlage(id, name), ordner: zielOrdner(wahl) });
      setSt((s) => (s ? { ...s, folien: [...s.folien, r.folie] } : s));
      setFolieId(r.folie.id);
      setNewOpen(false);
    } catch (e) {
      toast((e as Error).message, 'fehler');
    }
  };
  const live = st?.kanal.liveId;
  const setLive = async (id: string | null) => {
    try {
      const r = await slidesApi.setLive(id);
      setSt((s) => (s ? { ...s, kanal: r.kanal } : s));
      toast(id ? 'Folie ist jetzt im Kanal auf Sendung.' : 'Kanal ist leer.');
    } catch (e) {
      toast((e as Error).message, 'fehler');
    }
  };
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text);
    toast(`${what} kopiert.`);
  };

  const onMediaPicked = (m: Medium) => {
    const t = mediaFor;
    setMediaFor(null);
    if (!t || !draft) return;
    if (t.ziel === 'neu') addElement(neuesBild(m.url, m.typ));
    else if (t.ziel === 'element' && selected) patchEl(selected.id, { src: m.url } as Partial<Element>);
    else if (t.ziel === 'hintergrund') commit((f) => ({ ...f, hintergrund: { ...f.hintergrund, src: m.url } }));
  };

  const outputUrl = draft && st ? mitTon(`${st.basis}/s/${draft.key}`, ton) : '';
  const channelUrl = st ? mitTon(`${st.basis}/kanal/${st.kanal.key}`, ton) : '';
  const backUrl = studioUrl ?? '/';

  if (error && !st) {
    return (
      <div className="sl-app sl-app--center">
        <div className="locked">
          <span className="locked__icon" aria-hidden>
            <Lock size={26} />
          </span>
          <h1 className="locked__title">MeetingBackstage Slides</h1>
          <p className="locked__text">{error}</p>
          <a className="btn btn--secondary" href={backUrl}>
            <ArrowLeft size={15} aria-hidden /> Zum Studio
          </a>
        </div>
      </div>
    );
  }
  if (!st) return <div className="sl-app sl-app--center subtle">Lade Folien …</div>;

  return (
    <div className="sl-app">
      <header className="sl-top">
        <a className="sl-top__brand" href={backUrl} title="Zurück zum Studio">
          <ArrowLeft size={16} aria-hidden />
          <span>
            MeetingBackstage <strong>Slides</strong>
          </span>
        </a>
        <Segmented
          label="Bereich"
          hideLabel
          size="sm"
          value={bereich}
          onChange={switchBereich}
          options={[
            { value: 'folien', label: 'Folien' },
            { value: 'praesentationen', label: 'Präsentationen' },
          ]}
        />
        <div className="sl-top__tools" role="toolbar" aria-label="Elemente hinzufügen" hidden={bereich !== 'folien'}>
          <Button size="sm" icon={Type} disabled={!draft} onClick={() => addElement(neuerText())}>
            Text
          </Button>
          <Button size="sm" icon={Square} disabled={!draft} onClick={() => addElement(neueForm('rechteck'))}>
            Fläche
          </Button>
          <Button size="sm" icon={Circle} disabled={!draft} onClick={() => addElement(neueForm('ellipse'))}>
            Kreis
          </Button>
          <Button size="sm" icon={Minus} disabled={!draft} onClick={() => addElement(neueForm('linie'))}>
            Linie
          </Button>
          <Button size="sm" icon={ImageIcon} disabled={!draft} onClick={() => setMediaFor({ typ: 'bild', ziel: 'neu' })}>
            Bild
          </Button>
          <Button size="sm" icon={Film} disabled={!draft} onClick={() => setMediaFor({ typ: 'video', ziel: 'neu' })}>
            Video
          </Button>
          <span className="sl-top__sep" />
          <IconButton label="Rückgängig (⌘ Z)" icon={Undo2} onClick={undo} disabled={!past.current.length} />
          <IconButton label="Wiederholen (⇧ ⌘ Z)" icon={Redo2} onClick={redo} disabled={!future.current.length} />
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={Download}
          onClick={async () => {
            await flush();
            setExportOpen(true);
          }}
        >
          Exportieren
        </Button>
        <span className={`sl-top__status sl-top__status--${saving}`} role="status">
          {saving === 'speichert' ? (
            'Speichert …'
          ) : saving === 'fehler' ? (
            'Nicht gespeichert'
          ) : (
            <>
              <Check size={14} aria-hidden /> Gespeichert · live in OBS
            </>
          )}
        </span>
      </header>

      {bereich === 'praesentationen' ? (
        <PraesentationenPanel st={st} onState={(fn) => setSt((s) => (s ? fn(s) : s))} toast={toast} referentUrl={referentUrl} />
      ) : (
        <div className="sl-body">
          <aside className="sl-left" aria-label="Folien und Ebenen">
            <div className="sl-left__head">
              <h2>Folien</h2>
              <Button size="sm" icon={Plus} onClick={() => setNewOpen(true)}>
                Neu
              </Button>
            </div>
            <OrdnerLeiste
              st={st}
              wahl={wahl}
              onWahl={setWahl}
              suche={suche}
              onSuche={setSuche}
              onState={(fn) => setSt((s) => (s ? fn(s) : s))}
              onError={(m) => toast(m, 'fehler')}
            />
            {filterFolien(st, wahl, suche).length === 0 && (
              <p className="sl-hint">{suche ? 'Keine Folie gefunden.' : 'Dieser Ordner ist noch leer. „Neu“ legt eine Folie direkt hier an.'}</p>
            )}
            <ul className="sl-slides">
              {filterFolien(st, wahl, suche).map((f) => {
                const shown = f.id === draft?.id ? draft : f;
                return (
                  <li key={f.id} className={`sl-slide${f.id === folieId ? ' is-active' : ''}`}>
                    <button
                      type="button"
                      className="sl-slide__pick"
                      onClick={async () => {
                        await flush();
                        setFolieId(f.id);
                      }}
                    >
                      <SlideThumb folie={shown} />
                      <span className="sl-slide__name">
                        {live === f.id && <Radio size={13} className="sl-live" aria-label="auf Sendung" />}
                        {shown.name}
                      </span>
                      {(wahl === 'alle' || suche) && shown.ordner && <span className="sl-slide__ordner">{ordnerName(st, shown.ordner)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="sl-channel">
              <h2>Kanal für OBS</h2>
              <p className="sl-hint">Eine Adresse in OBS, die immer die Folie zeigt, die du auf Sendung schaltest.</p>
              <div className="sl-url">
                <input className="input mono" readOnly value={channelUrl} aria-label="Adresse des Kanals" onFocus={(e) => e.target.select()} />
                <IconButton label="Kanal-Adresse kopieren" icon={Copy} onClick={() => copy(channelUrl, 'Kanal-Adresse')} />
              </div>
              <div className="sl-channel__row">
                <TonButton on={ton} onChange={setTon} />
                {live && (
                  <Button size="sm" variant="ghost" icon={EyeOff} onClick={() => setLive(null)}>
                    Kanal leeren
                  </Button>
                )}
              </div>
            </div>

            {draft && (
              <div className="sl-layers">
                <h2>Ebenen</h2>
                {draft.elemente.length === 0 && <p className="sl-hint">Noch leer – oben Text, Fläche, Bild oder Video hinzufügen.</p>}
                <ul>
                  {[...draft.elemente].reverse().map((e) => (
                    <li key={e.id} className={`sl-layer${sel === e.id ? ' is-active' : ''}${e.hidden ? ' is-hidden' : ''}`}>
                      <button type="button" className="sl-layer__pick" onClick={() => setSel(e.id)}>
                        {e.typ === 'text' ? (
                          <Type size={14} />
                        ) : e.typ === 'bild' ? (
                          <ImageIcon size={14} />
                        ) : e.typ === 'video' ? (
                          <Film size={14} />
                        ) : (
                          <Square size={14} />
                        )}
                        <span>{e.name}</span>
                        {(e.schritt ?? 0) > 0 && (
                          <span className="sl-layer__step" title={`Erscheint beim ${e.schritt}. Klick`}>
                            {e.schritt}
                          </span>
                        )}
                        {e.locked && <Lock size={12} aria-label="gesperrt" />}
                      </button>
                      <IconButton
                        label={e.hidden ? 'Einblenden' : 'Ausblenden'}
                        icon={e.hidden ? EyeOff : Eye}
                        onClick={() => patchEl(e.id, { hidden: !e.hidden })}
                      />
                      <IconButton label="Eine Ebene nach vorne" icon={Plus} onClick={() => moveLayer(e.id, 1)} />
                      <IconButton label="Eine Ebene nach hinten" icon={Minus} onClick={() => moveLayer(e.id, -1)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          <main className="sl-main">
            {draft ? (
              <>
                <EditorCanvas
                  folie={draft}
                  selected={sel}
                  onSelect={setSel}
                  onBegin={() => commit((f) => f)}
                  onPatch={(id, patch) => patchEl(id, patch, undefined, true)}
                  onEditText={() => window.setTimeout(() => textRef.current?.focus(), 0)}
                  flach={flach}
                />
                <div className="sl-output">
                  <span className="sl-output__label">OBS-Adresse dieser Folie</span>
                  <input className="input mono" readOnly value={outputUrl} aria-label="OBS-Adresse dieser Folie" onFocus={(e) => e.target.select()} />
                  <Button size="sm" icon={Copy} onClick={() => copy(outputUrl, 'OBS-Adresse')}>
                    Kopieren
                  </Button>
                  <a className="btn btn--ghost btn--sm" href={outputUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} aria-hidden /> Ansehen
                  </a>
                  <TonButton on={ton} onChange={setTon} />
                  <Button
                    size="sm"
                    variant={live === draft.id ? 'secondary' : 'primary'}
                    icon={Radio}
                    onClick={() => setLive(live === draft.id ? null : draft.id)}
                  >
                    {live === draft.id ? 'Auf Sendung' : 'Im Kanal zeigen'}
                  </Button>
                </div>
                <p className="sl-hint sl-hint--center">
                  In OBS: Quelle „Browser“, Adresse einfügen, Breite 1920 und Höhe 1080. Änderungen erscheinen sofort.
                </p>
              </>
            ) : (
              <div className="sl-empty">
                <p>Noch keine Folie.</p>
                <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>
                  Erste Folie anlegen
                </Button>
              </div>
            )}
          </main>

          <aside className="sl-right" aria-label="Eigenschaften">
            {draft && selected ? (
              <ElementInspector
                key={selected.id}
                el={selected}
                textRef={textRef}
                onChange={(patch, key) => patchEl(selected.id, patch, key)}
                onPickMedia={(typ) => setMediaFor({ typ, ziel: 'element' })}
                onDuplicate={duplicateSelected}
                onDelete={removeSelected}
                onOrder={order}
                maxSchritt={maxSchritt(draft)}
              />
            ) : draft ? (
              <>
                <SlideInspector
                  folie={draft}
                  onChange={(patch, key) => commit((f) => ({ ...f, ...patch }), key)}
                  onPickMedia={(typ) => setMediaFor({ typ, ziel: 'hintergrund' })}
                  flach={flach}
                  onFlach={setFlach}
                  ordner={st.ordner}
                />
                <div className="sl-actions sl-actions--slide">
                  <Button
                    size="sm"
                    icon={Copy}
                    onClick={async () => {
                      await flush();
                      const r = await slidesApi.duplicate(draft.id);
                      setSt((s) => (s ? { ...s, folien: [...s.folien, r.folie] } : s));
                      setFolieId(r.folie.id);
                    }}
                  >
                    Folie duplizieren
                  </Button>
                  <Button
                    size="sm"
                    icon={KeyRound}
                    onClick={async () => {
                      if (!window.confirm('Neue OBS-Adresse erzeugen? Die bisherige Adresse zeigt danach nichts mehr.')) return;
                      await flush();
                      const r = await slidesApi.renewKey(draft.id);
                      setSt((s) => (s ? { ...s, folien: s.folien.map((x) => (x.id === r.folie.id ? r.folie : x)) } : s));
                      setDraft((d) => (d ? { ...d, key: r.folie.key } : d));
                      toast('Neue OBS-Adresse erzeugt.');
                    }}
                  >
                    Neue OBS-Adresse
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    onClick={async () => {
                      if (!window.confirm(`Folie „${draft.name}“ löschen?`)) return;
                      pending.current = null;
                      await slidesApi.remove(draft.id);
                      setFolieId(null);
                      load();
                    }}
                  >
                    Folie löschen
                  </Button>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} st={st} wahl={wahl} />

      <MediaLibrary
        open={!!mediaFor}
        typ={mediaFor?.typ ?? 'bild'}
        state={st}
        onState={setSt}
        onClose={() => setMediaFor(null)}
        onPick={onMediaPicked}
        toast={toast}
      />

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="Neue Folie" size="lg">
        <div className="sl-templates">
          {VORLAGEN.map((v) => (
            <button key={v.id} type="button" className="sl-template" onClick={() => createFolie(v.id)}>
              <SlideThumb folie={{ id: v.id, key: '', updatedAt: 0, ...vorlage(v.id, v.name) }} />
              <strong>{v.name}</strong>
              <span>{v.beschreibung}</span>
            </button>
          ))}
        </div>
      </Dialog>

      <div className="sl-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`sl-toast sl-toast--${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mediathek: Bilder und Videos hochladen und auswählen. */
function MediaLibrary({
  open,
  typ,
  state,
  onState,
  onClose,
  onPick,
  toast,
}: {
  open: boolean;
  typ: 'bild' | 'video';
  state: FolienState;
  onState: (s: FolienState) => void;
  onClose: () => void;
  onPick: (m: Medium) => void;
  toast: (t: string, tone?: 'ok' | 'fehler') => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const list = useMemo(() => state.medien.filter((m) => m.typ === typ), [state.medien, typ]);
  const sp = state.speicher;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={typ === 'video' ? 'Video wählen' : 'Bild wählen'}
      size="lg"
      footer={
        <>
          <span className="subtle sl-quota">
            Speicher: {mb(sp.belegt)} von {mb(sp.max)} ·{' '}
            {typ === 'video' ? `Videos (MP4, WebM) bis ${mb(sp.videoMax)}` : `Bilder bis ${mb(sp.bildMax)}, große Fotos werden verkleinert`}
          </span>
          {progress !== null && (
            <span className="sl-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </span>
          )}
          <input
            ref={input}
            type="file"
            hidden
            accept={typ === 'video' ? 'video/mp4,video/webm' : 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setProgress(0);
              try {
                const r = await uploadMedium(f, sp, setProgress);
                onState(r.state);
                onPick(r.medium);
              } catch (err) {
                toast((err as Error).message, 'fehler');
              } finally {
                setProgress(null);
              }
            }}
          />
          <Button variant="primary" icon={Upload} disabled={progress !== null} loading={progress !== null} onClick={() => input.current?.click()}>
            {typ === 'video' ? 'Video hochladen' : 'Bild hochladen'}
          </Button>
        </>
      }
    >
      {list.length === 0 ? (
        <p className="subtle">Noch keine {typ === 'video' ? 'Videos' : 'Bilder'} hochgeladen.</p>
      ) : (
        <div className="sl-media-grid">
          {list.map((m) => (
            <figure key={m.name} className="sl-media">
              <button type="button" onClick={() => onPick(m)} title={m.original || m.name}>
                {m.typ === 'video' ? <video src={m.url} muted preload="metadata" /> : <img src={m.url} alt="" loading="lazy" />}
              </button>
              <figcaption>
                <span>{m.original || m.name}</span>
                <span className="subtle">{mb(m.groesse)}</span>
                <IconButton
                  label="Löschen"
                  icon={Trash2}
                  tone="danger"
                  onClick={async () => {
                    if (!window.confirm(`${m.original || m.name} löschen?`)) return;
                    try {
                      onState(await slidesApi.removeMedia(m.name));
                    } catch (err) {
                      toast((err as Error).message, 'fehler');
                    }
                  }}
                />
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Dialog>
  );
}
