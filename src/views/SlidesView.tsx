import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Copy, ExternalLink, Pencil, Plus, Radio, RefreshCw } from 'lucide-react';
import { Badge, Button, Panel } from '../components/ui.tsx';
import { useStore } from '../state/store.tsx';
import { slidesApi } from '../slides/api.ts';
import type { FolienState } from '../slides/model.ts';
import { SlideThumb } from '../slides/SlideRender.tsx';
import { slidesUrl } from '../web/mode.ts';

/** Studio-Seite „Slides“: alle Folien mit Vorschau, OBS-Adressen, Kanal; Bearbeiten öffnet den Folien-Editor. */
export function SlidesView() {
  const { notify } = useStore();
  const [st, setSt] = useState<FolienState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editor = slidesUrl() ?? '/folien';
  const editLink = (id?: string) => `${editor}${id ? `${editor.includes('?') ? '&' : '?'}folie=${id}` : ''}`;

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
    // Änderungen aus dem Editor (anderer Tab) regelmäßig übernehmen
    const t = window.setInterval(load, 8000);
    window.addEventListener('focus', load);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text);
    notify(`${what} kopiert`, 'erfolg');
  };
  const setLive = async (id: string | null) => {
    try {
      const r = await slidesApi.setLive(id);
      setSt((s) => (s ? { ...s, kanal: r.kanal } : s));
      notify(id ? 'Folie ist im Kanal auf Sendung' : 'Kanal ist leer', 'erfolg');
    } catch (e) {
      notify((e as Error).message, 'fehler');
    }
  };
  const channelUrl = st ? `${st.basis}/kanal/${st.kanal.key}` : '';

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
          <p className="muted">Lege diese Adresse einmal als Browserquelle in OBS an (1920 × 1080). Sie zeigt immer die Folie, die du unten „auf Sendung“ schaltest.</p>
          <div className="slides-url">
            <input className="input mono" readOnly value={channelUrl} aria-label="Adresse des Kanals" onFocus={(e) => e.target.select()} />
            <Button icon={Copy} onClick={() => copy(channelUrl, 'Kanal-Adresse')}>
              Kopieren
            </Button>
            {st.kanal.liveId && (
              <Button variant="ghost" onClick={() => setLive(null)}>
                Kanal leeren
              </Button>
            )}
          </div>
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
          {st.folien.map((f) => {
            const onAir = st.kanal.liveId === f.id;
            const url = `${st.basis}/s/${f.key}`;
            return (
              <article key={f.id} className={`slides-card${onAir ? ' is-on-air' : ''}`}>
                <a href={editLink(f.id)} target="_blank" rel="noreferrer" className="slides-card__thumb" aria-label={`${f.name} bearbeiten`}>
                  <SlideThumb folie={f} />
                </a>
                <div className="slides-card__head">
                  <h2>{f.name}</h2>
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
    </div>
  );
}
