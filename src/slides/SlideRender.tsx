import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FLAECHE, perspektivePx, rgba, type DreiD, type Element, type Folie, type Hintergrund } from './model.ts';

const fontStack = (f: string) => `'${f.replace(/'/g, '')}', 'Barlow', system-ui, sans-serif`;
const shadowOf = (on: boolean, color: string, blur: number) => (on ? `0 ${Math.round(blur / 4)}px ${blur}px ${rgba(color, 0.55)}` : undefined);

/** Drehung und 3D-Neigung eines Elements (auch für die Griffe im Editor). */
export function elementTransform(e: Pick<Element, 'rot' | 'kippX' | 'kippY'>): string | undefined {
  const parts: string[] = [];
  if (e.kippX || e.kippY) parts.push(`perspective(1400px) rotateX(${e.kippX || 0}deg) rotateY(${e.kippY || 0}deg)`);
  if (e.rot) parts.push(`rotate(${e.rot}deg)`);
  return parts.length ? parts.join(' ') : undefined;
}

/** Stil des äußeren Rahmens (Position, Größe, Drehung, Deckkraft, Animation). */
function frameStyle(e: Element, animate: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: e.x,
    top: e.y,
    width: e.w,
    height: e.h,
    transform: elementTransform(e),
    opacity: e.opacity,
    display: e.hidden ? 'none' : undefined,
    ...(animate && e.anim !== 'keine'
      ? {
          animationName: `sl-${e.anim}`,
          animationDuration: `${e.animDauer}s`,
          animationDelay: `${e.animVerz}s`,
          animationFillMode: 'both',
          animationTimingFunction: 'cubic-bezier(.2,.7,.2,1)',
        }
      : {}),
  };
}

function ElementView({ e, animate, muted }: { e: Element; animate: boolean; muted: boolean }) {
  const frame = frameStyle(e, animate);
  if (e.typ === 'text') {
    const inner: CSSProperties = {
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: e.valign === 'top' ? 'flex-start' : e.valign === 'bottom' ? 'flex-end' : 'center',
      textAlign: e.align,
      fontFamily: fontStack(e.font),
      fontSize: e.size,
      fontWeight: e.weight,
      fontStyle: e.italic ? 'italic' : 'normal',
      textDecoration: e.underline ? 'underline' : 'none',
      textTransform: e.upper ? 'uppercase' : 'none',
      color: e.color,
      lineHeight: e.lineHeight,
      letterSpacing: e.letterSpacing,
      background: e.bgOpacity > 0 ? rgba(e.bg, e.bgOpacity) : 'transparent',
      padding: e.pad,
      borderRadius: e.radius,
      border: e.borderW ? `${e.borderW}px solid ${e.borderColor}` : undefined,
      textShadow: shadowOf(e.shadow, e.shadowColor, e.shadowBlur),
      WebkitTextStroke: e.outlineW ? `${e.outlineW}px ${e.outlineColor}` : undefined,
      paintOrder: 'stroke fill',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
    };
    return (
      <div style={frame}>
        <div style={inner}>{e.text}</div>
      </div>
    );
  }
  if (e.typ === 'form') {
    const fill = e.verlauf
      ? `linear-gradient(${e.winkel}deg, ${rgba(e.fill, e.fillOpacity)}, ${rgba(e.fill2, e.fillOpacity)})`
      : rgba(e.fill, e.fillOpacity);
    return (
      <div style={frame}>
        <div
          style={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            background: fill,
            borderRadius: e.form === 'ellipse' ? '50%' : e.form === 'linie' ? e.h / 2 : e.radius,
            border: e.borderW ? `${e.borderW}px solid ${e.borderColor}` : undefined,
            boxShadow: shadowOf(e.shadow, e.shadowColor, e.shadowBlur),
          }}
        />
      </div>
    );
  }
  const box: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    objectFit: e.fit,
    display: 'block',
    borderRadius: e.radius,
    border: e.borderW ? `${e.borderW}px solid ${e.borderColor}` : undefined,
    boxShadow: shadowOf(e.shadow, e.shadowColor, e.shadowBlur),
    background: e.src ? undefined : 'rgba(255,255,255,0.08)',
  };
  if (!e.src)
    return (
      <div style={frame}>
        <div style={{ ...box, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', fontSize: 32, fontFamily: 'Barlow, sans-serif' }}>
          {e.typ === 'video' ? 'Video wählen' : 'Bild wählen'}
        </div>
      </div>
    );
  return (
    <div style={frame}>
      {e.typ === 'video' ? (
        <video src={e.src} style={box} autoPlay loop={e.loop} muted={muted || !e.ton} playsInline />
      ) : (
        <img src={e.src} alt="" style={box} draggable={false} />
      )}
    </div>
  );
}

function Background({ h, muted }: { h: Hintergrund; muted: boolean }) {
  const fill: CSSProperties = { position: 'absolute', inset: 0 };
  let content: ReactNode = null;
  if (h.typ === 'farbe') content = <div style={{ ...fill, background: h.color }} />;
  else if (h.typ === 'verlauf') content = <div style={{ ...fill, background: `linear-gradient(${h.winkel}deg, ${h.color}, ${h.color2})` }} />;
  else if (h.typ === 'bild' && h.src)
    content = <img src={h.src} alt="" style={{ ...fill, width: '100%', height: '100%', objectFit: h.fit }} draggable={false} />;
  else if (h.typ === 'video' && h.src)
    content = <video src={h.src} style={{ ...fill, width: '100%', height: '100%', objectFit: h.fit }} autoPlay loop muted={muted} playsInline />;
  return (
    <>
      {content}
      {h.typ !== 'transparent' && h.abdunkeln > 0 && <div style={{ ...fill, background: `rgba(0,0,0,${h.abdunkeln})` }} />}
    </>
  );
}

/**
 * Die Folie in Originalgröße (1920 × 1080). Skaliert wird außen.
 * schritt: bis zu welchem Klick-Schritt Elemente zu sehen sind (Präsentation); ohne Angabe alle.
 * Neu sichtbare Elemente werden frisch eingehängt und spielen so ihre Einblend-Animation.
 */
export function SlideCanvas({
  folie,
  animate = false,
  muted = true,
  schritt = Infinity,
  flach = false,
  children,
}: {
  /** 3D-Perspektive ignorieren (Editor: flach bearbeiten) */
  flach?: boolean;
  folie: Folie;
  animate?: boolean;
  muted?: boolean;
  schritt?: number;
  children?: ReactNode;
}) {
  const d = folie.dreiD?.an && !flach ? folie.dreiD : null;
  const hintergrund = <Background h={folie.hintergrund} muted={muted} />;
  const inhalt = (
    <>
      {folie.elemente
        .filter((e) => (e.schritt ?? 0) <= schritt)
        .map((e) => (
          <ElementView key={animate ? `${folie.id}-${e.id}` : e.id} e={e} animate={animate} muted={muted} />
        ))}
      {children}
    </>
  );
  return (
    <div className="slide-canvas" style={{ width: FLAECHE.w, height: FLAECHE.h }}>
      {d ? (
        <>
          {!d.hintergrundMit && hintergrund}
          {/* 3D: die Folie als geneigte Fläche im Raum. Die Griffe des Editors liegen in derselben Ebene. */}
          <div className="slide-3d" style={{ perspective: `${perspektivePx(d.staerke)}px` }}>
            <div className="slide-3d__ebene" style={dreiDStyle(d)}>
              {d.hintergrundMit && hintergrund}
              {inhalt}
            </div>
          </div>
        </>
      ) : (
        <>
          {hintergrund}
          {inhalt}
        </>
      )}
    </div>
  );
}

function dreiDStyle(d: DreiD): CSSProperties {
  return {
    transform: `translate(${d.x}px, ${d.y}px) rotateZ(${d.drehZ}deg) rotateX(${d.drehX}deg) rotateY(${d.drehY}deg) scale(${d.groesse})`,
    filter: d.schatten ? 'drop-shadow(0 40px 60px rgba(0, 0, 0, 0.5))' : undefined,
  };
}

/**
 * Skalierungsfaktor, damit 1920 × 1080 in den Behälter passt.
 * ref ist ein Callback-Ref: misst auch Behälter, die erst später erscheinen (z. B. nach dem Laden).
 */
export function useFitScale(mode: 'breite' | 'ganz' = 'breite') {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setScale(mode === 'ganz' ? Math.min(w / FLAECHE.w, h / FLAECHE.h) : w / FLAECHE.w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, mode]);
  return { ref: setEl, scale };
}

/** Verkleinerte Vorschau (z. B. im Studio und in der Folienliste). */
export function SlideThumb({ folie, className = '', schritt }: { folie: Folie; className?: string; schritt?: number }) {
  const { ref, scale } = useFitScale('breite');
  return (
    <div ref={ref} className={`slide-thumb ${className}`} style={{ aspectRatio: '16 / 9' }}>
      <div
        style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: '0 0', width: FLAECHE.w, height: FLAECHE.h }}
      >
        <SlideCanvas folie={folie} schritt={schritt} />
      </div>
    </div>
  );
}

type Ebene = { folie: Folie; n: number; rolle: 'neu' | 'alt' };
export type Uebergang = Folie['uebergang'];
const OHNE: Uebergang = { typ: 'keiner', dauer: 0 };

/**
 * Bühne mit Übergängen zwischen Folien (OBS-Ausgabe und Referentenansicht).
 * Wechselt die Folie, bleibt die alte kurz stehen und geht mit dem Übergang der neuen Folie hinaus.
 * richtung: 1 = vorwärts, -1 = zurück (Schieben und Wischen laufen dann andersherum).
 */
export function UebergangsBuehne({
  folie,
  schritt,
  richtung = 1,
  muted = true,
}: {
  folie: Folie | null;
  schritt?: number;
  richtung?: number;
  muted?: boolean;
}) {
  const [ebenen, setEbenen] = useState<Ebene[]>(() => (folie ? [{ folie, n: 0, rolle: 'neu' }] : []));
  const [tr, setTr] = useState<{ u: Uebergang; dir: number }>({ u: OHNE, dir: 1 });
  const zaehler = useRef(1);
  const aufraeumen = useRef<number | undefined>(undefined);
  const aktuell = ebenen.find((e) => e.rolle === 'neu')?.folie ?? null;

  useEffect(() => {
    if (folie && aktuell && folie.id === aktuell.id) {
      // Dieselbe Folie (bearbeitet): an Ort und Stelle aktualisieren, ohne Übergang
      if (folie !== aktuell) setEbenen((list) => list.map((e) => (e.rolle === 'neu' ? { ...e, folie } : e)));
      return;
    }
    if (!folie && !aktuell) return;
    const u: Uebergang = folie ? (folie.uebergang ?? { typ: 'blende', dauer: 0.6 }) : { typ: 'blende', dauer: 0.5 };
    setTr({ u, dir: richtung < 0 ? -1 : 1 });
    const n = zaehler.current++;
    setEbenen((list) => {
      const alt = list.filter((e) => e.rolle === 'neu').map((e) => ({ ...e, rolle: 'alt' as const }));
      return u.typ === 'keiner' ? (folie ? [{ folie, n, rolle: 'neu' }] : []) : [...alt, ...(folie ? [{ folie, n, rolle: 'neu' as const }] : [])];
    });
    window.clearTimeout(aufraeumen.current);
    if (u.typ !== 'keiner')
      aufraeumen.current = window.setTimeout(() => setEbenen((list) => list.filter((e) => e.rolle === 'neu')), u.dauer * 1000 + 80);
  }, [folie, richtung]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(aufraeumen.current), []);

  return (
    <div className={`sl-buehne sl-tr--${tr.u.typ}`} style={{ ['--tr-dauer' as string]: `${tr.u.dauer}s`, ['--tr-dir' as string]: tr.dir }}>
      {ebenen.map((e) => (
        <div key={e.n} className={`sl-ebene sl-ebene--${e.rolle}${e.n === 0 ? ' sl-ebene--start' : ''}`}>
          <SlideCanvas folie={e.folie} animate muted={muted || e.rolle === 'alt'} schritt={e.rolle === 'neu' ? schritt : Infinity} />
        </div>
      ))}
    </div>
  );
}
