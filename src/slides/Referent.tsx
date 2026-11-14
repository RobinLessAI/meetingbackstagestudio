// Referentenansicht: aktuelle Folie (wie in OBS), nächste Folie, Notizen, Uhr und Zeit – bedienbar mit Tastatur und Presenter.
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, CircleStop, Minus, Plus, RotateCcw, SkipBack, SunMoon } from 'lucide-react';
import { Button, IconButton } from '../components/ui.tsx';
import { slidesApi, useSlideEvents } from './api.ts';
import { FLAECHE, maxSchritt, type FolienState, type KanalState } from './model.ts';
import { SlideThumb, UebergangsBuehne, useFitScale } from './SlideRender.tsx';
import { ablaufInfo, Steuerpult, useCountdown, usePraesentationsTasten, type Befehl } from './Steuerpult.tsx';

const zweistellig = (n: number) => String(n).padStart(2, '0');
const dauer = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ''}${zweistellig(Math.floor((s % 3600) / 60))}:${zweistellig(s % 60)}`;
};
const lesen = (k: string, d: number) => {
  try {
    const v = Number(window.localStorage.getItem(k));
    return v || d;
  } catch {
    return d;
  }
};

export function Referentenansicht({ editorUrl }: { editorUrl: string }) {
  const [st, setSt] = useState<FolienState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [start, setStart] = useState<number | null>(null);
  const [schrift, setSchrift] = useState(() => lesen('mb-referent-schrift', 22));
  const { ref, scale } = useFitScale('ganz');

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
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [load]);
  const setKanal = useCallback((kanal: KanalState) => setSt((s) => (s ? { ...s, kanal } : s)), []);
  useSlideEvents(setKanal, load);

  const running = !!st?.kanal.ablauf;
  // Stoppuhr startet mit der Präsentation
  useEffect(() => {
    setStart((s) => (running ? (s ?? Date.now()) : null));
  }, [running]);
  useEffect(() => {
    try {
      window.localStorage.setItem('mb-referent-schrift', String(schrift));
    } catch {
      /* egal */
    }
  }, [schrift]);

  const send = useCallback(
    async (b: Befehl) => {
      try {
        setKanal((await slidesApi.control(b)).kanal);
      } catch (e) {
        setError((e as Error).message);
        window.setTimeout(() => setError(null), 4000);
      }
    },
    [setKanal],
  );
  usePraesentationsTasten(send, running, true);

  const info = st ? ablaufInfo(st, st.kanal) : null;
  const countdown = useCountdown(st?.kanal ?? null, info?.p ?? null);
  const uhr = new Date(now).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  if (!st) return <div className="sl-app sl-app--center subtle">{error ?? 'Lade …'}</div>;

  if (!running || !info?.p) {
    return (
      <div className="ref ref--start">
        <header className="ref-top">
          <a className="sl-top__brand" href={editorUrl}>
            <ArrowLeft size={16} aria-hidden /> MeetingBackstage <strong>Slides</strong>
          </a>
          <span className="ref-top__title">Referentenansicht</span>
          <span className="ref-top__clock">{uhr}</span>
        </header>
        <main className="ref-start">
          <h1>Welche Präsentation möchtest du zeigen?</h1>
          <p className="muted">
            Sie läuft über die Kanal-Adresse in OBS. Weiterschalten mit Pfeiltasten, Bild auf/ab, Leertaste oder einem Presenter.
          </p>
          <Steuerpult st={st} kanal={st.kanal} onKanal={setKanal} onError={setError} referentUrl={window.location.href} />
          {error && <p className="callout callout--danger">{error}</p>}
        </main>
      </div>
    );
  }

  const { p, liste, jetzt, naechste, schritt } = info;
  const a = st.kanal.ablauf!;
  return (
    <div className="ref">
      <header className="ref-top">
        <a className="sl-top__brand" href={editorUrl} title="Zum Folien-Editor">
          <ArrowLeft size={16} aria-hidden /> <strong>{p.name}</strong>
        </a>
        <span className="ref-top__pos">
          Folie <strong>{a.index + 1}</strong> von {liste.length}
          {jetzt && maxSchritt(jetzt) > 0 ? ` · Klick ${schritt}/${maxSchritt(jetzt)}` : ''}
        </span>
        {countdown !== null && <span className="ref-top__auto">weiter in {countdown} s</span>}
        {st.kanal.leer && <span className="ref-top__black">Schwarz – Taste B oder Weiter zeigt wieder</span>}
        <span className="ref-top__timer" title="Laufzeit seit Start">
          {dauer(start ? now - start : 0)}
          <IconButton label="Laufzeit zurücksetzen" icon={RotateCcw} onClick={() => setStart(Date.now())} />
        </span>
        <span className="ref-top__clock">{uhr}</span>
      </header>

      <div className="ref-body">
        <section className="ref-now" aria-label="Aktuelle Folie">
          <div ref={ref} className={`ref-now__stage${st.kanal.leer ? ' is-black' : ''}`}>
            <div className="ref-now__scale" style={{ transform: `translate(-50%, -50%) scale(${scale})`, width: FLAECHE.w, height: FLAECHE.h }}>
              <UebergangsBuehne folie={st.kanal.leer ? null : jetzt} schritt={schritt} richtung={st.kanal.richtung} muted />
            </div>
          </div>
        </section>

        <aside className="ref-side">
          <figure className="ref-next">
            <figcaption>Als Nächstes: {naechste ? naechste.text : 'Ende der Präsentation'}</figcaption>
            {naechste ? <SlideThumb folie={naechste.folie} schritt={naechste.schritt} /> : <div className="sp-end">Ende</div>}
          </figure>
          <section className="ref-notes" aria-label="Notizen">
            <div className="ref-notes__head">
              <span>Notizen</span>
              <IconButton label="Schrift kleiner" icon={Minus} onClick={() => setSchrift((v) => Math.max(14, v - 2))} />
              <IconButton label="Schrift größer" icon={Plus} onClick={() => setSchrift((v) => Math.min(48, v + 2))} />
            </div>
            <div className="ref-notes__text" style={{ fontSize: schrift }}>
              {jetzt?.notizen ? (
                jetzt.notizen
              ) : (
                <span className="subtle">Keine Notizen zu dieser Folie. Im Folien-Editor rechts unter „Präsentation“ eintragen.</span>
              )}
            </div>
          </section>
        </aside>
      </div>

      <footer className="ref-bottom">
        <Button icon={SkipBack} onClick={() => send('anfang')}>
          Anfang
        </Button>
        <Button size="lg" icon={ChevronLeft} onClick={() => send('zurueck')}>
          Zurück
        </Button>
        <Button size="lg" variant="primary" className="ref-weiter" onClick={() => send('weiter')}>
          Weiter <ChevronRight size={20} aria-hidden />
        </Button>
        <Button icon={SunMoon} pressed={st.kanal.leer} onClick={() => send('leer')}>
          {st.kanal.leer ? 'Wieder zeigen' : 'Schwarz'}
        </Button>
        <Button variant="ghost" icon={CircleStop} onClick={() => window.confirm('Präsentation beenden? Der Kanal wird leer.') && send('ende')}>
          Beenden
        </Button>
        <ol className="sp-strip ref-strip" aria-label="Folien">
          {liste.map((f, i) => (
            <li key={`${f.id}-${i}`}>
              <button
                type="button"
                className={i === a.index ? 'is-active' : ''}
                onClick={() => slidesApi.control('gehe', { index: i }).then((r) => setKanal(r.kanal))}
              >
                <SlideThumb folie={f} />
                <span>
                  {i + 1}. {f.name}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </footer>
      {error && <p className="ref-error callout callout--danger">{error}</p>}
    </div>
  );
}
