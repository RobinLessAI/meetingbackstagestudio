import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FLAECHE, rgba, type Element, type Folie, type Hintergrund } from './model.ts';

const fontStack = (f: string) => `'${f.replace(/'/g, '')}', 'Barlow', system-ui, sans-serif`;
const shadowOf = (on: boolean, color: string, blur: number) => (on ? `0 ${Math.round(blur / 4)}px ${blur}px ${rgba(color, 0.55)}` : undefined);

/** Stil des äußeren Rahmens (Position, Größe, Drehung, Deckkraft, Animation). */
function frameStyle(e: Element, animate: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: e.x,
    top: e.y,
    width: e.w,
    height: e.h,
    transform: e.rot ? `rotate(${e.rot}deg)` : undefined,
    opacity: e.opacity,
    display: e.hidden ? 'none' : undefined,
    ...(animate && e.anim !== 'keine'
      ? { animationName: `sl-${e.anim}`, animationDuration: `${e.animDauer}s`, animationDelay: `${e.animVerz}s`, animationFillMode: 'both', animationTimingFunction: 'cubic-bezier(.2,.7,.2,1)' }
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
    const fill = e.verlauf ? `linear-gradient(${e.winkel}deg, ${rgba(e.fill, e.fillOpacity)}, ${rgba(e.fill2, e.fillOpacity)})` : rgba(e.fill, e.fillOpacity);
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
  if (!e.src) return <div style={frame}><div style={{ ...box, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', fontSize: 32, fontFamily: 'Barlow, sans-serif' }}>{e.typ === 'video' ? 'Video wählen' : 'Bild wählen'}</div></div>;
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
  else if (h.typ === 'bild' && h.src) content = <img src={h.src} alt="" style={{ ...fill, width: '100%', height: '100%', objectFit: h.fit }} draggable={false} />;
  else if (h.typ === 'video' && h.src) content = <video src={h.src} style={{ ...fill, width: '100%', height: '100%', objectFit: h.fit }} autoPlay loop muted={muted} playsInline />;
  return (
    <>
      {content}
      {h.typ !== 'transparent' && h.abdunkeln > 0 && <div style={{ ...fill, background: `rgba(0,0,0,${h.abdunkeln})` }} />}
    </>
  );
}

/** Die Folie in Originalgröße (1920 × 1080). Skaliert wird außen. */
export function SlideCanvas({ folie, animate = false, muted = true, children }: { folie: Folie; animate?: boolean; muted?: boolean; children?: ReactNode }) {
  return (
    <div className="slide-canvas" style={{ width: FLAECHE.w, height: FLAECHE.h }}>
      <Background h={folie.hintergrund} muted={muted} />
      {folie.elemente.map((e) => (
        <ElementView key={animate ? `${folie.id}-${e.id}` : e.id} e={e} animate={animate} muted={muted} />
      ))}
      {children}
    </div>
  );
}

/** Skalierungsfaktor, damit 1920 × 1080 in den Behälter passt. */
export function useFitScale(mode: 'breite' | 'ganz' = 'breite') {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const el = ref.current;
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
  }, [mode]);
  return { ref, scale };
}

/** Verkleinerte Vorschau (z. B. im Studio und in der Folienliste). */
export function SlideThumb({ folie, className = '' }: { folie: Folie; className?: string }) {
  const { ref, scale } = useFitScale('breite');
  return (
    <div ref={ref} className={`slide-thumb ${className}`} style={{ aspectRatio: '16 / 9' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: '0 0', width: FLAECHE.w, height: FLAECHE.h }}>
        <SlideCanvas folie={folie} />
      </div>
    </div>
  );
}
