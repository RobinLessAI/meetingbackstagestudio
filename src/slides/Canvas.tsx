import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FLAECHE, type Element, type Folie } from './model.ts';
import { SlideCanvas, useFitScale } from './SlideRender.tsx';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface Drag {
  id: string;
  mode: 'move' | Handle;
  sx: number;
  sy: number;
  start: { x: number; y: number; w: number; h: number };
  ratio: number;
}

/**
 * Arbeitsfläche des Editors: Folie in Originalgröße, verkleinert angezeigt. Elemente lassen sich anklicken,
 * verschieben und an acht Griffen in der Größe ändern; beim Ziehen rasten sie an Mitte, Rändern und anderen Elementen ein.
 */
export function EditorCanvas({
  folie,
  selected,
  onSelect,
  onBegin,
  onPatch,
  onEditText,
}: {
  folie: Folie;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Vor einer Änderung durch Ziehen (für „Rückgängig“). */
  onBegin: () => void;
  onPatch: (id: string, patch: Partial<Element>) => void;
  onEditText: () => void;
}) {
  const { ref, scale } = useFitScale('ganz');
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  const start = (e: ReactPointerEvent, el: Element, mode: Drag['mode']) => {
    e.stopPropagation();
    onSelect(el.id);
    if (el.locked || e.button !== 0) return;
    e.preventDefault();
    onBegin();
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, start: { x: el.x, y: el.y, w: el.w, h: el.h }, ratio: el.w / el.h };
    const move = (ev: PointerEvent) => onMove(ev);
    const up = () => {
      drag.current = null;
      setGuides({ v: [], h: [] });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** Einrastpunkte: Ränder und Mitte der Fläche sowie der anderen sichtbaren Elemente. */
  const targets = (id: string) => {
    const v = [0, FLAECHE.w / 2, FLAECHE.w];
    const h = [0, FLAECHE.h / 2, FLAECHE.h];
    for (const o of folie.elemente) {
      if (o.id === id || o.hidden) continue;
      v.push(o.x, o.x + o.w / 2, o.x + o.w);
      h.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    return { v, h };
  };
  const snap = (points: number[], cands: number[], th: number) => {
    let best: { d: number; at: number } | null = null;
    for (const p of points) for (const c of cands) if (Math.abs(c - p) < th && (!best || Math.abs(c - p) < Math.abs(best.d))) best = { d: c - p, at: c };
    return best;
  };

  const onMove = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (ev.clientX - d.sx) / scale;
    const dy = (ev.clientY - d.sy) / scale;
    const th = 8 / scale;
    const free = ev.altKey; // Alt: ohne Einrasten
    const t = targets(d.id);
    let { x, y, w, h } = d.start;
    const gv: number[] = [];
    const gh: number[] = [];
    if (d.mode === 'move') {
      x += dx;
      y += dy;
      if (!free) {
        const sx = snap([x, x + w / 2, x + w], t.v, th);
        if (sx) {
          x += sx.d;
          gv.push(sx.at);
        }
        const sy = snap([y, y + h / 2, y + h], t.h, th);
        if (sy) {
          y += sy.d;
          gh.push(sy.at);
        }
      }
    } else {
      const m = d.mode;
      if (m.includes('e')) w = d.start.w + dx;
      if (m.includes('w')) {
        w = d.start.w - dx;
        x = d.start.x + dx;
      }
      if (m.includes('s')) h = d.start.h + dy;
      if (m.includes('n')) {
        h = d.start.h - dy;
        y = d.start.y + dy;
      }
      // Umschalt: Seitenverhältnis beibehalten (an Ecken)
      if (ev.shiftKey && m.length === 2) {
        if (Math.abs(dx) > Math.abs(dy)) {
          const nh = w / d.ratio;
          if (m.includes('n')) y += h - nh;
          h = nh;
        } else {
          const nw = h * d.ratio;
          if (m.includes('w')) x += w - nw;
          w = nw;
        }
      }
      if (!free) {
        if (m.includes('e')) {
          const s = snap([x + w], t.v, th);
          if (s) {
            w += s.d;
            gv.push(s.at);
          }
        }
        if (m.includes('w')) {
          const s = snap([x], t.v, th);
          if (s) {
            x += s.d;
            w -= s.d;
            gv.push(s.at);
          }
        }
        if (m.includes('s')) {
          const s = snap([y + h], t.h, th);
          if (s) {
            h += s.d;
            gh.push(s.at);
          }
        }
        if (m.includes('n')) {
          const s = snap([y], t.h, th);
          if (s) {
            y += s.d;
            h -= s.d;
            gh.push(s.at);
          }
        }
      }
      if (w < 10) {
        if (m.includes('w')) x -= 10 - w;
        w = 10;
      }
      if (h < 10) {
        if (m.includes('n')) y -= 10 - h;
        h = 10;
      }
    }
    setGuides({ v: gv, h: gh });
    onPatch(d.id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  };

  const hs = 12 / scale;
  return (
    <div ref={ref} className="sl-canvas" onPointerDown={() => onSelect(null)}>
      <div className="sl-canvas__stage" style={{ width: FLAECHE.w * scale, height: FLAECHE.h * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: FLAECHE.w, height: FLAECHE.h }}>
          <SlideCanvas folie={folie}>
            {folie.elemente.map((el) =>
              el.hidden ? null : (
                <div
                  key={el.id}
                  className={`sl-hit${selected === el.id ? ' is-selected' : ''}${el.locked ? ' is-locked' : ''}`}
                  style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined, outlineWidth: 2 / scale }}
                  onPointerDown={(e) => start(e, el, 'move')}
                  onDoubleClick={() => el.typ === 'text' && onEditText()}
                  title={el.name}
                >
                  {selected === el.id &&
                    !el.locked &&
                    HANDLES.map((h) => (
                      <span
                        key={h}
                        className={`sl-handle sl-handle--${h}`}
                        style={{ width: hs, height: hs, margin: -hs / 2, borderWidth: 2 / scale }}
                        onPointerDown={(e) => start(e, el, h)}
                      />
                    ))}
                </div>
              ),
            )}
            {guides.v.map((v, i) => (
              <div key={`v${i}`} className="sl-guide sl-guide--v" style={{ left: v, width: 1 / scale }} />
            ))}
            {guides.h.map((h, i) => (
              <div key={`h${i}`} className="sl-guide sl-guide--h" style={{ top: h, height: 1 / scale }} />
            ))}
          </SlideCanvas>
        </div>
      </div>
    </div>
  );
}
