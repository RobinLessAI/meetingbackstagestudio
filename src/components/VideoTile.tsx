import { memo } from 'react';
import { Hand, MicOff, VideoOff } from 'lucide-react';
import type { Participant, SimulatedVideo } from '../state/types.ts';

const SKIN = ['#efc7a8', '#d8a27e', '#b87d58', '#8f5c3d', '#62402a'];
const HAIR = ['#231d1a', '#4a3324', '#7a5638', '#b38c5c', '#d9c59b', '#9b9893'];

export const initials = (name: string) =>
  name
    .replace(/^Dr\.\s*/, '')
    .split(/[\s·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export const avatarColor = (p: Pick<Participant, 'video'>) => `hsl(${p.video.wallHue} 22% 30%)`;

/** Stilisiertes, simuliertes Kamerabild. Es wird kein echtes Video verwendet. */
const SimulatedFrame = memo(function SimulatedFrame({ video, id }: { video: SimulatedVideo; id: string }) {
  const { backdrop, framing, wallHue, skin, hair, offset } = video;
  const wall = `hsl(${wallHue} 14% ${backdrop === 'fenster' ? 30 : 22}%)`;
  const wallDark = `hsl(${wallHue} 14% 15%)`;
  const shirt = `hsl(${(wallHue + 170) % 360} 22% 34%)`;
  const scale = framing === 'nah' ? 1.35 : framing === 'halbnah' ? 1 : 0.7;
  const cx = 80 + offset * 26;
  const headR = 13 * scale;
  const headY = framing === 'weit' ? 50 : framing === 'nah' ? 42 : 45;
  const gradId = `g-${id}`;

  const person = (x: number, y: number, r: number, s: number, h: number, body: string, key?: string) => {
    const sy = y + r * 1.25;
    const sw = r * 2.9;
    return (
      <g key={key}>
        <path
          d={`M${x - sw} 92 C${x - sw} ${sy + r * 0.6} ${x - sw * 0.55} ${sy} ${x} ${sy} C${x + sw * 0.55} ${sy} ${x + sw} ${sy + r * 0.6} ${x + sw} 92 Z`}
          fill={body}
        />
        <rect x={x - r * 0.38} y={y + r * 0.7} width={r * 0.76} height={r * 0.7} fill={SKIN[s]} opacity={0.92} />
        <circle cx={x} cy={y} r={r} fill={SKIN[s]} />
        <path
          d={`M${x - r * 1.02} ${y + r * 0.1} C${x - r * 1.1} ${y - r * 1.25} ${x + r * 1.1} ${y - r * 1.25} ${x + r * 1.02} ${y + r * 0.1} C${x + r * 0.7} ${y - r * 0.55} ${x - r * 0.7} ${y - r * 0.55} ${x - r * 1.02} ${y + r * 0.1} Z`}
          fill={HAIR[h]}
        />
      </g>
    );
  };

  return (
    <svg className="tile__frame" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wall} />
          <stop offset="1" stopColor={wallDark} />
        </linearGradient>
      </defs>
      <rect width="160" height="90" fill={`url(#${gradId})`} />

      {backdrop === 'regal' && (
        <g opacity="0.75">
          <rect x={offset > 0 ? 8 : 112} y="10" width="40" height="64" fill={`hsl(${wallHue} 18% 13%)`} />
          {[22, 40, 58].map((y, i) => (
            <g key={y}>
              <rect x={offset > 0 ? 8 : 112} y={y + 10} width="40" height="2" fill={`hsl(${wallHue} 20% 28%)`} />
              {[0, 1, 2, 3, 4, 5].map((b) => (
                <rect
                  key={b}
                  x={(offset > 0 ? 11 : 115) + b * 6}
                  y={y - 2 + ((b + i) % 3)}
                  width="4.5"
                  height={12 - ((b + i) % 3)}
                  fill={`hsl(${(wallHue + b * 47 + i * 30) % 360} 24% ${30 + ((b * 7) % 14)}%)`}
                />
              ))}
            </g>
          ))}
        </g>
      )}
      {backdrop === 'fenster' && (
        <g>
          <rect x={offset > 0 ? 12 : 100} y="8" width="48" height="52" fill={`hsl(${wallHue} 30% 62%)`} opacity="0.55" />
          <rect x={offset > 0 ? 35 : 123} y="8" width="2" height="52" fill={wallDark} opacity="0.7" />
          <rect x={offset > 0 ? 12 : 100} y="33" width="48" height="2" fill={wallDark} opacity="0.7" />
        </g>
      )}
      {backdrop === 'wand' && (
        <g opacity="0.8">
          <rect x="112" y="14" width="30" height="22" fill={`hsl(${wallHue} 10% 14%)`} />
          <rect x="115" y="17" width="24" height="16" fill={`hsl(${(wallHue + 40) % 360} 18% 32%)`} />
        </g>
      )}
      {backdrop === 'pflanze' && (
        <g opacity="0.85">
          <rect x={offset > 0 ? 18 : 124} y="60" width="16" height="16" fill={`hsl(${wallHue} 12% 30%)`} />
          {[-9, -3, 3, 9].map((dx, i) => (
            <ellipse
              key={dx}
              cx={(offset > 0 ? 26 : 132) + dx}
              cy={52 - (i % 2) * 8}
              rx="5"
              ry="12"
              fill={`hsl(130 22% ${26 + i * 3}%)`}
              transform={`rotate(${dx * 2.5} ${(offset > 0 ? 26 : 132) + dx} ${52 - (i % 2) * 8})`}
            />
          ))}
        </g>
      )}
      {backdrop === 'buero' && (
        <g opacity="0.8">
          <rect x="10" y="12" width="46" height="30" fill={`hsl(${wallHue} 8% 70%)`} opacity="0.35" />
          <path d="M16 22 h22 M16 28 h30 M16 34 h18" stroke={`hsl(${wallHue} 30% 40%)`} strokeWidth="1.5" />
          <rect x="128" y="40" width="3" height="30" fill={`hsl(${wallHue} 8% 40%)`} />
          <path d="M122 40 h15 l-4 -8 h-7 z" fill={`hsl(40 30% 50%)`} opacity="0.7" />
        </g>
      )}
      {backdrop === 'unscharf' && (
        <g opacity="0.55">
          <circle cx="24" cy="22" r="18" fill={`hsl(${(wallHue + 30) % 360} 30% 40%)`} />
          <circle cx="138" cy="30" r="22" fill={`hsl(${(wallHue + 200) % 360} 22% 36%)`} />
          <circle cx="120" cy="80" r="16" fill={`hsl(${(wallHue + 90) % 360} 20% 30%)`} />
        </g>
      )}

      {backdrop === 'raum' ? (
        <g>
          <rect x="50" y="8" width="60" height="30" fill={`hsl(${wallHue} 8% 60%)`} opacity="0.3" />
          <path d="M18 92 L48 60 H112 L142 92 Z" fill={`hsl(${wallHue} 18% 32%)`} />
          {[
            [40, 52, 0, 0],
            [62, 47, 2, 1],
            [98, 47, 1, 3],
            [120, 52, 3, 2],
            [80, 45, 4, 0],
          ].map(([x, y, s, h], i) =>
            person(x, y, 5.5, s, h, `hsl(${(wallHue + i * 60) % 360} 20% 34%)`, `p${i}`),
          )}
        </g>
      ) : (
        person(cx, headY, headR, skin, hair, shirt)
      )}
    </svg>
  );
});

export interface TileProps {
  participant: Participant;
  showName: boolean;
  showReaction: boolean;
  showHand: boolean;
  handPosition?: number;
  inSpotlight: boolean;
  speaking: boolean;
  now: number;
  /** Große Variante für die Moderation in der Mitte. */
  featured?: boolean;
  onClick?: () => void;
  clickLabel?: string;
}

export const VideoTile = memo(function VideoTile({
  participant: p,
  showName,
  showReaction,
  showHand,
  handPosition,
  inSpotlight,
  speaking,
  now,
  featured,
  onClick,
  clickLabel,
}: TileProps) {
  const reactionVisible = showReaction && p.reaction && now - p.reaction.at < 10_000;
  const classes = [
    'tile',
    featured ? 'tile--featured' : '',
    inSpotlight ? 'is-spotlight' : '',
    speaking ? 'is-speaking' : '',
    p.camOn ? '' : 'is-cam-off',
    onClick ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {p.camOn ? (
        <SimulatedFrame video={p.video} id={p.id} />
      ) : (
        <div className="tile__off">
          <span className="tile__initials" style={{ background: avatarColor(p) }}>
            {initials(p.name)}
          </span>
          <span className="tile__off-label">
            <VideoOff size={12} aria-hidden /> Kamera aus
          </span>
        </div>
      )}
      {showHand && p.handRaisedAt !== null && (
        <span className="tile__hand" title={`Hand gehoben, Platz ${handPosition}`}>
          <Hand size={12} strokeWidth={2.4} aria-hidden />
          {handPosition}
        </span>
      )}
      {inSpotlight && <span className="tile__spot">Spotlight</span>}
      {reactionVisible && (
        <span className="tile__reaction" role="img" aria-label={`Reaktion: ${p.reaction!.label}`}>
          {p.reaction!.emoji}
        </span>
      )}
      {showName && (
        <span className="tile__name">
          {!p.micOn && <MicOff className="tile__muted" size={12} strokeWidth={2.4} aria-label="stumm" />}
          <span className="tile__name-text">{p.name}</span>
        </span>
      )}
      {!showName && !p.micOn && (
        <span className="tile__name tile__name--icon">
          <MicOff className="tile__muted" size={12} strokeWidth={2.4} aria-label="stumm" />
        </span>
      )}
    </>
  );

  return onClick ? (
    <button type="button" className={classes} onClick={onClick} aria-label={clickLabel} aria-pressed={inSpotlight}>
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  );
});
