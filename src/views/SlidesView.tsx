import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Copy, Download, ExternalLink, Pencil, Plus, Presentation, Radio, RefreshCw } from 'lucide-react';
import { Badge, Button, Panel } from '../components/ui.tsx';
import { useStore } from '../state/store.tsx';
import { slidesApi, useSlideEvents } from '../slides/api.ts';
import { Steuerpult, usePraesentationsTasten, type Befehl } from '../slides/Steuerpult.tsx';
import { useSync } from '../sync/SyncProvider.tsx';
import type { FolienState, KanalState } from '../slides/model.ts';
import { SlideThumb } from '../slides/SlideRender.tsx';
import { slidesUrl } from '../web/mode.ts';
import { mitTon, TonButton, useTon } from '../slides/ton.tsx';
import { filterFolien, filterPraes, ordnerName, OrdnerLeiste, useOrdnerWahl } from '../slides/ordner.tsx';
import { ExportDialog } from '../slides/ExportDialog.tsx';

/** Studio-Seite „Slides“: alle Folien mit Vorschau, OBS-Adressen, Kanal; Bearbeiten öffnet den Folien-Editor. */
export function SlidesView() {
  const { notify } = useStore();
  const [st, setSt] = useState<FolienState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ton, setTon] = useTon();
  const [wahl, setWahl] = useOrdnerWahl(st);
  const [suche, setSuche] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const editor = slidesUrl() ?? '/folien';
  const editLink = (id?: string) => `${editor}${id ? `${editor.includes('?') ? '&' : '?'}folie=${id}` : ''}`;

  const { baseUrl, actionKey } = useSync();
  const setKanal = useCallback((kanal: KanalState) => setSt((s) => (s ? { ...s, kanal } : s)), []);
  const send = useCallback(
    async (b: Befehl) => {
      try {
        setKanal((await slidesApi.control(b)).kanal);
      } catch (e) {
        notify((e as Error).message, 'fehler');
      }
    },
    [setKanal, notify],
  );
  // Präsentation läuft: Pfeiltasten und Bild auf/ab (Presenter) schalten weiter
  usePraesentationsTasten(send, !!st?.kanal.ablauf);

  const load = useCallback(async () => {
    try {
      setSt(await slidesApi.state());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
    // Sicherheitsnetz zusätzlich zu den Live-Ereignissen
    const t = window.setInterval(load, 30000);
    window.addEventListener('focus', load);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', load);
    };
  }, [load]);
  useSlideEvents(setKanal, load);

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text);
    notify(`${what} kopiert`, 'erfolg');
  };
  const setLive = async (id: string | null) => {
    try {
      const r = await slidesApi.setLive(id);
      setKanal(r.kanal);
      notify(id ? 'Folie ist im Kanal auf Sendung' : 'Kanal ist leer', 'erfolg');
    } catch (e) {
      notify((e as Error).message, 'fehler');
    }
  };
  const channelUrl = st ? mitTon(`${st.basis}/kanal/${st.kanal.key}`, ton) : '';
  const referentUrl = `${editor}${editor.includes('?') ? '&' : '?'}ansicht=referent`;
  const deckUrl = (id: string) => `${baseUrl}/aktion/${id}?schluessel=${actionKey ?? '…'}`;

  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">MeetingBackstage Slides</span>
          <h1 className="view__title">Slides</h1>
          <p className="view__lead">
            Folien mit Text, Bildern und Videos für OBS. Jede Folie hat eine feste Adresse – unabhängig von Zoom. Gestaltet wird im Folien-Editor.
          </p>
        </div>
        <div className="view__head-side">
          <Button icon={RefreshCw} onClick={load}>
            Aktualisieren
          </Button>
          <Button icon={Download} disabled={!st} onClick={() => setExportOpen(true)}>
            Exportieren
          </Button>
          <a className="btn btn--primary" href={editLink()} target="_blank" rel="noreferrer">
            <Pencil size={16} aria-hidden /> Folien-Editor öffnen
          </a>
        </div>
      </header>

      {error && (
        <p className="callout callout--danger" role="alert">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}

      {st && (
        <Panel eyebrow="Eine Adresse für alles" title="Kanal">
          <p className="muted">
            Lege diese Adresse einmal als Browserquelle in OBS an (1920 × 1080). Sie zeigt immer die Folie, die du unten „auf Sendung“ schaltest. „Mit
            Ton“ gilt für alle kopierten Adressen auf dieser Seite.
          </p>
          <div className="slides-url">
            <input className="input mono" readOnly value={channelUrl} aria-label="Adresse des Kanals" onFocus={(e) => e.target.select()} />
            <Button icon={Copy} onClick={() => copy(channelUrl, 'Kanal-Adresse')}>
              Kopieren
            </Button>
            <TonButton on={ton} onChange={setTon} />
            {st.kanal.liveId && (
              <Button variant="ghost" onClick={() => setLive(null)}>
                Kanal leeren
              </Button>
            )}
          </div>
        </Panel>
      )}

      {st && (
        <div className="slides-filter">
          <OrdnerLeiste
            st={st}
            wahl={wahl}
            onWahl={setWahl}
            suche={suche}
            onSuche={setSuche}
            onState={(fn) => setSt((x) => (x ? fn(x) : x))}
            onError={(m) => notify(m, 'fehler')}
          />
          <span className="subtle">Ordner und Suche gelten für Präsentationen und Folien auf dieser Seite.</span>
        </div>
      )}

      {st && (
        <Panel
          eyebrow="Mehrere Folien nacheinander"
          title="Präsentation"
          actions={
            <a
              className="btn btn--ghost btn--sm"
              href={`${editor}${editor.includes('?') ? '&' : '?'}bereich=praesentationen`}
              target="_blank"
              rel="noreferrer"
            >
              <Presentation size={14} aria-hidden /> Präsentationen bearbeiten
            </a>
          }
        >
          <Steuerpult
            st={st}
            kanal={st.kanal}
            onKanal={setKanal}
            onError={(m) => notify(m, 'fehler')}
            referentUrl={referentUrl}
            praesentationen={filterPraes(st, wahl, suche)}
          />
          <details className="slides-deck">
            <summary>Stream Deck: Weiter, Zurück, Anfang, Schwarz</summary>
            <p className="muted">
              Aktion „Website“ auf eine Taste ziehen, Adresse einfügen und „GET-Anfrage im Hintergrund“ einschalten. Wirkt auch, wenn kein
              Browserfenster offen ist.
            </p>
            {[
              ['folie-weiter', 'Weiter'],
              ['folie-zurueck', 'Zurück'],
              ['folie-anfang', 'Zur ersten Folie'],
              ['folie-leer', 'Schwarz an/aus'],
            ].map(([id, label]) => (
              <div key={id} className="slides-url">
                <span className="slides-deck__label">{label}</span>
                <input
                  className="input mono"
                  readOnly
                  value={deckUrl(id)}
                  aria-label={`Stream-Deck-Adresse: ${label}`}
                  onFocus={(e) => e.target.select()}
                />
                <Button icon={Copy} disabled={!actionKey} onClick={() => copy(deckUrl(id), 'Stream-Deck-Adresse')}>
                  Kopieren
                </Button>
              </div>
            ))}
          </details>
        </Panel>
      )}

      {st && st.folien.length === 0 && (
        <Panel title="Noch keine Folien">
          <p className="muted">Lege im Folien-Editor deine erste Folie an, z. B. eine Bauchbinde mit Namen oder eine Pausenfolie.</p>
          <div className="row">
            <a className="btn btn--primary" href={editLink()} target="_blank" rel="noreferrer">
              <Plus size={16} aria-hidden /> Erste Folie anlegen
            </a>
          </div>
        </Panel>
      )}

      {st && st.folien.length > 0 && (
        <div className="slides-grid">
          {filterFolien(st, wahl, suche).map((f) => {
            const onAir = st.kanal.liveId === f.id;
            const url = mitTon(`${st.basis}/s/${f.key}`, ton);
            return (
              <article key={f.id} className={`slides-card${onAir ? ' is-on-air' : ''}`}>
                <a href={editLink(f.id)} target="_blank" rel="noreferrer" className="slides-card__thumb" aria-label={`${f.name} bearbeiten`}>
                  <SlideThumb folie={f} />
                </a>
                <div className="slides-card__head">
                  <h2>{f.name}</h2>
                  {(wahl === 'alle' || suche) && f.ordner && <span className="subtle slides-card__ordner">{ordnerName(st, f.ordner)}</span>}
                  {onAir && <Badge tone="danger">auf Sendung</Badge>}
                </div>
                <div className="slides-card__actions">
                  <Button size="sm" variant={onAir ? 'secondary' : 'primary'} icon={Radio} onClick={() => setLive(onAir ? null : f.id)}>
                    {onAir ? 'Vom Kanal nehmen' : 'Auf Sendung'}
                  </Button>
                  <a className="btn btn--secondary btn--sm" href={editLink(f.id)} target="_blank" rel="noreferrer">
                    <Pencil size={14} aria-hidden /> Bearbeiten
                  </a>
                  <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(url, 'OBS-Adresse')}>
                    OBS-Adresse
                  </Button>
                  <a className="btn btn--ghost btn--sm" href={url} target="_blank" rel="noreferrer" title="Ausgabe ansehen">
                    <ExternalLink size={14} aria-hidden />
                    <span className="sr-only">Ausgabe ansehen</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {st && <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} st={st} wahl={wahl} />}
    </div>
  );
}
