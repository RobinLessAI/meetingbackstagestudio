// Präsentation steuern: im Studio (Seite „Slides“), im Folien-Editor und in der Referentenansicht.
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CircleStop, MonitorPlay, Play, Presentation, SkipBack, SunMoon } from 'lucide-react';
import { Badge, Button } from '../components/ui.tsx';
import { slidesApi } from './api.ts';
import { maxSchritt, type Folie, type FolienState, type KanalState, type Praesentation } from './model.ts';
import { SlideThumb } from './SlideRender.tsx';

export type Befehl = 'weiter' | 'zurueck' | 'anfang' | 'leer' | 'ende';

/** Die Folien einer Präsentation in Reihenfolge (gelöschte fallen weg). */
export const folienVon = (st: FolienState, p: Praesentation | null | undefined): Folie[] =>
  p ? p.folien.map((id) => st.folien.find((f) => f.id === id)).filter((f): f is Folie => !!f) : [];

/** Was gerade läuft und was als Nächstes kommt. */
export function ablaufInfo(st: FolienState, kanal: KanalState) {
  const p = kanal.ablauf ? (st.praesentationen.find((x) => x.id === kanal.ablauf!.id) ?? null) : null;
  const liste = folienVon(st, p);
  const a = kanal.ablauf;
  const jetzt = a ? (liste[a.index] ?? null) : null;
  let naechste: { folie: Folie; schritt: number; text: string } | null = null;
  if (a && jetzt) {
    if (a.schritt < maxSchritt(jetzt))
      naechste = { folie: jetzt, schritt: a.schritt + 1, text: `Nächster Klick (${a.schritt + 1} von ${maxSchritt(jetzt)})` };
    else if (a.index < liste.length - 1)
      naechste = { folie: liste[a.index + 1], schritt: 0, text: `Folie ${a.index + 2}: ${liste[a.index + 1].name}` };
    else if (p?.schleife && liste.length) naechste = { folie: liste[0], schritt: 0, text: 'Wieder von vorn (Schleife)' };
  }
  return { p, liste, jetzt, naechste, schritt: a?.schritt ?? 0 };
}

/** Sekunden bis zum automatischen Weiterschalten (oder null). */
export function useCountdown(kanal: KanalState | null, p: Praesentation | null) {
  const [now, setNow] = useState(Date.now());
  const on = !!(kanal?.ablauf && p?.auto && !kanal.leer);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [on]);
  if (!on || !kanal || !p) return null;
  return Math.max(0, Math.ceil(p.auto - (now - kanal.seit) / 1000));
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/**
 * Tasten wie in PowerPoint – auch für Presenter (Klicker), die Bild auf/ab oder Pfeiltasten senden.
 * extra: zusätzlich Leertaste/Enter/N/P (nur in der Referentenansicht, im Studio sind diese Tasten belegt).
 */
export function usePraesentationsTasten(send: (b: Befehl) => void, aktiv: boolean, extra = false) {
  useEffect(() => {
    if (!aktiv) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const k = e.key;
      let b: Befehl | null = null;
      if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(k) || (extra && [' ', 'Enter', 'n', 'N'].includes(k))) b = 'weiter';
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k) || (extra && ['Backspace', 'p', 'P'].includes(k))) b = 'zurueck';
      else if (k === 'Home') b = 'anfang';
      else if (k === 'b' || k === 'B' || k === '.') b = 'leer';
      if (!b) return;
      e.preventDefault();
      send(b);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send, aktiv, extra]);
}

/** Steuerpult: Präsentation starten, weiter/zurück, schwarz, beenden. */
export function Steuerpult({
  st,
  kanal,
  onKanal,
  onError,
  referentUrl,
  praesentationen,
}: {
  /** Nur diese Präsentationen zum Starten anbieten (z. B. gefiltert nach Ordner) */
  praesentationen?: Praesentation[];
  st: FolienState;
  kanal: KanalState;
  onKanal: (k: KanalState) => void;
  onError: (msg: string) => void;
  referentUrl: string;
}) {
  const { p, liste, jetzt, naechste, schritt } = ablaufInfo(st, kanal);
  const countdown = useCountdown(kanal, p);
  const run = async (fn: () => Promise<{ kanal: KanalState }>) => {
    try {
      onKanal((await fn()).kanal);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const send = (b: Befehl) => run(() => slidesApi.control(b));

  if (!p || !kanal.ablauf) {
    return (
      <div className="sp">
        {(praesentationen ?? st.praesentationen).length === 0 ? (
          st.praesentationen.length > 0 ? (
            <p className="muted">In diesem Ordner gibt es keine Präsentation.</p>
          ) : (
            <p className="muted">
              Noch keine Präsentation. Lege im Folien-Editor unter „Präsentationen“ eine an und wähle die Folien in ihrer Reihenfolge.
            </p>
          )
        ) : (
          <ul className="sp-list">
            {(praesentationen ?? st.praesentationen).map((x) => {
              const f = folienVon(st, x);
              return (
                <li key={x.id}>
                  <div className="sp-list__thumb">{f[0] ? <SlideThumb folie={f[0]} schritt={0} /> : null}</div>
                  <div className="sp-list__text">
                    <strong>{x.name}</strong>
                    <span className="subtle">
                      {f.length} {f.length === 1 ? 'Folie' : 'Folien'}
                      {x.auto ? ` · alle ${x.auto} s weiter` : ''}
                      {x.schleife ? ' · Schleife' : ''}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Play}
                    disabled={!f.length}
                    onClick={() => run(() => slidesApi.control('start', { id: x.id }))}
                  >
                    Starten
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="sp sp--live">
      <div className="sp-head">
        <Badge tone="danger">{kanal.leer ? 'schwarz' : 'läuft im Kanal'}</Badge>
        <strong className="sp-head__name">{p.name}</strong>
        <span className="sp-head__pos">
          Folie {kanal.ablauf.index + 1} von {liste.length}
          {jetzt && maxSchritt(jetzt) > 0 ? ` · Klick ${schritt} von ${maxSchritt(jetzt)}` : ''}
          {countdown !== null ? ` · weiter in ${countdown} s` : ''}
        </span>
      </div>
      <div className="sp-views">
        <figure className={`sp-now${kanal.leer ? ' is-black' : ''}`}>
          {jetzt && <SlideThumb folie={jetzt} schritt={schritt} />}
          <figcaption>Jetzt: {jetzt?.name}</figcaption>
        </figure>
        <figure className="sp-next">
          {naechste ? <SlideThumb folie={naechste.folie} schritt={naechste.schritt} /> : <div className="sp-end">Ende</div>}
          <figcaption>{naechste ? naechste.text : 'Letzte Folie'}</figcaption>
        </figure>
      </div>
      <div className="sp-buttons">
        <Button icon={ChevronLeft} onClick={() => send('zurueck')} title="Zurück (Pfeil links, Bild auf)">
          Zurück
        </Button>
        <Button variant="primary" size="lg" className="sp-weiter" onClick={() => send('weiter')} title="Weiter (Pfeil rechts, Bild ab)">
          Weiter <ChevronRight size={18} aria-hidden />
        </Button>
        <Button icon={SkipBack} onClick={() => send('anfang')} title="Zur ersten Folie (Pos1)">
          Anfang
        </Button>
        <Button icon={SunMoon} pressed={kanal.leer} onClick={() => send('leer')} title="Kanal kurz leeren und wieder einblenden (Taste B)">
          {kanal.leer ? 'Wieder zeigen' : 'Schwarz'}
        </Button>
        <a className="btn btn--secondary btn--md" href={referentUrl} target="_blank" rel="noreferrer">
          <MonitorPlay size={16} aria-hidden /> Referentenansicht
        </a>
        <Button variant="ghost" icon={CircleStop} onClick={() => send('ende')}>
          Beenden
        </Button>
      </div>
      <ol className="sp-strip" aria-label="Folien der Präsentation">
        {liste.map((f, i) => (
          <li key={`${f.id}-${i}`}>
            <button
              type="button"
              className={i === kanal.ablauf!.index ? 'is-active' : ''}
              onClick={() => run(() => slidesApi.control('gehe', { index: i }))}
              title={`Zu Folie ${i + 1}: ${f.name}`}
            >
              <SlideThumb folie={f} />
              <span>
                {i + 1}. {f.name}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="subtle sp-keys">
        <Presentation size={13} aria-hidden /> Tasten: Pfeil rechts oder Bild ab = weiter, Pfeil links oder Bild auf = zurück, B = schwarz. Ein
        Presenter (Klicker) funktioniert genauso.
      </p>
    </div>
  );
}
