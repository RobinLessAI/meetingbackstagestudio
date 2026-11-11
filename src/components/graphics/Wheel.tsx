import { useMemo, type CSSProperties } from 'react';
import { inkFor, PALETTE } from '../../lib/color.ts';
import type { WheelLook, WheelSpin } from '../../state/types.ts';

const C = 500;
const R = 480;

/** Punkt auf dem Kreis; Winkel im Uhrzeigersinn ab oben. */
const pt = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
};

function segmentPath(i: number, n: number): string {
  if (n === 1) return `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`;
  const seg = 360 / n;
  const [x1, y1] = pt(i * seg, R);
  const [x2, y2] = pt((i + 1) * seg, R);
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

function colorsFor(n: number, look: WheelLook): string[] {
  if (look.wheelColors === 'einfarbig') return Array.from({ length: n }, () => look.wheelColorA);
  if (look.wheelColors === 'zweifarbig') return Array.from({ length: n }, (_, i) => (i % 2 ? look.wheelColorB : look.wheelColorA));
  const list = Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length]);
  // Erstes und letztes Feld liegen nebeneinander: nicht dieselbe Farbe.
  if (n > 1 && list[n - 1] === list[0]) list[n - 1] = PALETTE[(n + 1) % PALETTE.length] === list[n - 2] ? PALETTE[2] : PALETTE[(n + 1) % PALETTE.length];
  return list;
}

/** Name kürzen, damit er ins Feld passt. */
function fit(name: string, maxChars: number): string {
  return name.length <= maxChars ? name : `${name.slice(0, Math.max(3, maxChars - 1)).trimEnd()}…`;
}

/**
 * Glücksrad als SVG. Die Drehung läuft als CSS-Animation mit festen Werten aus der Drehung,
 * dadurch drehen App, Vorschau und alle OBS-Ausgaben gleich, auch wenn eine Ausgabe erst
 * später geöffnet wird.
 */
export function Wheel({
  entries,
  restDeg,
  spin,
  look,
  variant = 'present',
}: {
  entries: string[];
  restDeg: number;
  spin: WheelSpin | null;
  look: WheelLook;
  variant?: 'present' | 'overlay';
}) {
  const list = spin ? spin.entries : entries;
  const n = list.length;
  // Werte je Drehung nur einmal festlegen, sonst springt die Animation bei jedem neuen Stand.
  const timing = useMemo(() => {
    if (!spin) return null;
    const elapsed = Date.now() - spin.startedAt;
    return { delay: -Math.max(0, elapsed), winIn: Math.max(0, spin.durationMs - elapsed) };
  }, [spin?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (n === 0) {
    return (
      <div className={`wheel wheel--${variant}`}>
        <svg className="wheel__disc" viewBox="0 0 1000 1000" aria-hidden>
          <circle cx={C} cy={C} r={R} fill="var(--raised)" stroke={look.wheelRim} strokeWidth="8" />
        </svg>
        <p className="wheel__empty">Noch keine Namen im Rad</p>
      </div>
    );
  }

  const colors = colorsFor(n, look);
  const seg = 360 / n;
  const fontSize = Math.max(14, Math.min(54, (2 * Math.PI * R * 0.62) / n * 0.62));
  const maxChars = Math.max(4, Math.floor((R * 0.7) / (fontSize * 0.56)));
  const discStyle = (
    spin && timing
      ? {
          '--wheel-from': `${spin.fromDeg}deg`,
          '--wheel-to': `${spin.toDeg}deg`,
          '--wheel-dur': `${spin.durationMs}ms`,
          '--wheel-delay': `${timing.delay}ms`,
        }
      : { transform: `rotate(${restDeg}deg)` }
  ) as CSSProperties;
  const winner = spin ? spin.entries[spin.winnerIndex] : null;

  return (
    <div className={`wheel wheel--${variant}`}>
      <svg
        key={spin?.id ?? 'ruhe'}
        className={`wheel__disc${spin ? ' is-spinning' : ''}`}
        viewBox="0 0 1000 1000"
        style={discStyle}
        role="img"
        aria-label={`Glücksrad mit ${n} Feldern`}
      >
        {list.map((name, i) => {
          const fill = colors[i];
          const ink = look.wheelColors === 'bunt' ? inkFor(fill) : look.wheelText;
          const mid = (i + 0.5) * seg;
          return (
            <g key={`${i}-${name}`}>
              <path d={segmentPath(i, n)} fill={fill} stroke={look.wheelColors === 'einfarbig' ? look.wheelRim : 'rgb(0 0 0 / 0.18)'} strokeWidth={look.wheelColors === 'einfarbig' ? 4 : 2} />
              <text
                x={C + R * 0.9}
                y={C}
                transform={`rotate(${mid - 90} ${C} ${C})`}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={fontSize}
                fill={ink}
                className="wheel__label"
              >
                {fit(name, maxChars)}
              </text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r={R} fill="none" stroke={look.wheelRim} strokeWidth="10" />
        <circle cx={C} cy={C} r={62} fill={look.wheelRim} />
        <circle cx={C} cy={C} r={40} fill={look.pointerColor} />
      </svg>
      <svg className="wheel__pointer" viewBox="0 0 100 100" aria-hidden>
        <path d="M 50 92 L 22 18 Q 50 4 78 18 Z" fill={look.pointerColor} stroke={look.wheelRim} strokeWidth="4" strokeLinejoin="round" />
      </svg>
      {spin && winner && look.showWinner && timing && (
        <div
          key={`gewinner-${spin.id}`}
          className="wheel__winner"
          style={{ '--wheel-win-delay': `${timing.winIn}ms`, background: look.winnerBackground, color: look.winnerText } as CSSProperties}
          aria-live="polite"
        >
          {winner}
        </div>
      )}
    </div>
  );
}
