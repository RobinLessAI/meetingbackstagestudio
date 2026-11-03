import type { CSSProperties, ReactNode } from 'react';
import { useCommands } from '../state/commands.ts';
import { useNow, useStore } from '../state/store.tsx';
import type { Participant } from '../state/types.ts';
import { ProgramOverlay } from './graphics/ProgramOverlay.tsx';
import { VideoTile } from './VideoTile.tsx';

const RING = {
  8: { n: 3, start: 2, span: 1, cols: '1fr 1.6fr 1fr' },
  12: { n: 4, start: 2, span: 2, cols: 'repeat(4, 1fr)' },
  16: { n: 5, start: 2, span: 3, cols: 'repeat(5, 1fr)' },
} as const;

type Ring = keyof typeof RING;

export const ringForCount = (n: number): Ring => (n <= 8 ? 8 : n <= 12 ? 12 : 16);

function ringCells(ring: Ring): Array<[row: number, col: number]> {
  const { n, start, span } = RING[ring];
  const cells: Array<[number, number]> = [];
  for (let r = 1; r <= n; r++) {
    for (let c = 1; c <= n; c++) {
      const inCenter = r >= start && r < start + span && c >= start && c < start + span;
      if (!inCenter) cells.push([r, c]);
    }
  }
  return cells;
}

const gridFor = (count: number) => {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  return { cols, rows: Math.max(1, Math.ceil(count / cols)) };
};

export interface StageInfo {
  visible: number;
  hidden: number;
  slots: number;
}

/** Berechnet, wie viele Personen im aktuellen Layout sichtbar sind. */
export function useStageInfo(): StageInfo {
  const { state } = useStore();
  const { gallery, participants, spotlight } = state;
  const moderator = participants.find((p) => p.role === 'moderation') ?? participants[0];
  let others = participants.filter((p) => p.id !== moderator?.id);
  if (gallery.hideNoVideo) others = others.filter((p) => p.camOn);
  if (gallery.layout === 'zentrum') {
    const ring = gallery.tileCount === 'auto' ? ringForCount(others.length) : gallery.tileCount;
    const hidden = others.length > ring ? others.length - (ring - 1) : 0;
    return { slots: ring + 1, visible: others.length - hidden + 1, hidden };
  }
  if (gallery.layout === 'raster') {
    const all = others.length + 1;
    const limit = gallery.tileCount === 'auto' ? 25 : gallery.tileCount + 1;
    const hidden = all > limit ? all - (limit - 1) : 0;
    return { slots: limit, visible: all - hidden, hidden };
  }
  const main = Math.max(1, spotlight.length);
  const strip = participants.length - main;
  const hidden = strip > 8 ? strip - 7 : 0;
  return { slots: main + 8, visible: participants.length - hidden, hidden };
}

export function GalleryStage({
  size = 'large',
  interactive = false,
  showCaption = true,
}: {
  size?: 'large' | 'medium' | 'small';
  interactive?: boolean;
  showCaption?: boolean;
}) {
  const { state, derived } = useStore();
  const commands = useCommands();
  const now = useNow();
  const { gallery, participants, spotlight, activeSpeakerId } = state;
  const handPos = new Map(derived.queue.map((q) => [q.participant.id, q.position]));

  const moderator = participants.find((p) => p.role === 'moderation') ?? participants[0];
  let others = participants.filter((p) => p.id !== moderator?.id);
  if (gallery.hideNoVideo) others = others.filter((p) => p.camOn);

  const tile = (p: Participant, extra?: { featured?: boolean; style?: CSSProperties }) => (
    <div className="stage__cell" style={extra?.style} key={p.id}>
      <VideoTile
        participant={p}
        showName={gallery.showNames}
        showReaction={gallery.showReactions}
        showHand={gallery.showHands}
        handPosition={handPos.get(p.id)}
        inSpotlight={spotlight.includes(p.id)}
        speaking={activeSpeakerId === p.id}
        now={now}
        featured={extra?.featured}
        onClick={interactive ? () => commands.toggleSpotlight(p.id) : undefined}
        clickLabel={
          interactive
            ? `${p.name}: ${spotlight.includes(p.id) ? 'aus dem Spotlight entfernen' : 'ins Spotlight setzen'}`
            : undefined
        }
      />
    </div>
  );

  const overflowCell = (count: number, names: string[], style?: CSSProperties) => (
    <div className="stage__cell" style={style} key="overflow">
      <div className="tile tile--overflow" title={names.join(', ')}>
        <span className="tile__overflow-count">+{count}</span>
        <span className="tile__overflow-label">weitere</span>
      </div>
    </div>
  );

  const emptyCell = (key: string, style?: CSSProperties) => (
    <div className="stage__cell" style={style} key={key}>
      <div className="tile tile--empty" aria-hidden />
    </div>
  );

  let body: ReactNode;
  let notice: string | null = null;

  if (!moderator) {
    body = null;
  } else if (gallery.layout === 'zentrum') {
    const ring = gallery.tileCount === 'auto' ? ringForCount(others.length) : gallery.tileCount;
    const cfg = RING[ring];
    const cells = ringCells(ring);
    const overflow = others.length > ring;
    const shown = overflow ? others.slice(0, ring - 1) : others;
    const hidden = overflow ? others.slice(ring - 1) : [];
    body = (
      <div
        className="stage__grid"
        style={{ gridTemplateColumns: cfg.cols, gridTemplateRows: cfg.cols }}
      >
        {tile(moderator, {
          featured: true,
          style: {
            gridRow: `${cfg.start} / span ${cfg.span}`,
            gridColumn: `${cfg.start} / span ${cfg.span}`,
          },
        })}
        {cells.map(([r, c], i) => {
          const style = { gridRow: r, gridColumn: c };
          if (i < shown.length) return tile(shown[i], { style });
          if (overflow && i === ring - 1) return overflowCell(hidden.length, hidden.map((h) => h.name), style);
          return emptyCell(`e${i}`, style);
        })}
      </div>
    );
  } else if (gallery.layout === 'spotlight') {
    let main = spotlight
      .map((id) => participants.find((p) => p.id === id))
      .filter((p): p is Participant => !!p);
    if (main.length === 0) {
      main = [moderator];
      notice = 'Niemand im Spotlight: Die Moderation wird gezeigt.';
    }
    const mainIds = new Set(main.map((p) => p.id));
    let strip = participants.filter((p) => !mainIds.has(p.id));
    if (gallery.hideNoVideo) strip = strip.filter((p) => p.camOn || p.id === moderator.id);
    const stripOverflow = strip.length > 8;
    const stripShown = stripOverflow ? strip.slice(0, 7) : strip;
    const g = gridFor(main.length);
    body = (
      <div className="stage__spot">
        <div
          className="stage__grid stage__grid--main"
          style={{ gridTemplateColumns: `repeat(${g.cols}, 1fr)`, gridTemplateRows: `repeat(${g.rows}, 1fr)` }}
        >
          {main.map((p) => tile(p, { featured: p.id === moderator.id }))}
        </div>
        <div className="stage__strip">
          {stripShown.map((p) => tile(p))}
          {stripOverflow &&
            overflowCell(strip.length - 7, strip.slice(7).map((p) => p.name))}
        </div>
      </div>
    );
  } else {
    const all = [moderator, ...others];
    const limit = gallery.tileCount === 'auto' ? 25 : gallery.tileCount + 1;
    const overflow = all.length > limit;
    const shown = overflow ? all.slice(0, limit - 1) : all;
    const g = gridFor(overflow ? limit : all.length);
    body = (
      <div
        className="stage__grid"
        style={{ gridTemplateColumns: `repeat(${g.cols}, 1fr)`, gridTemplateRows: `repeat(${g.rows}, 1fr)` }}
      >
        {shown.map((p) => tile(p))}
        {overflow && overflowCell(all.length - shown.length, all.slice(limit - 1).map((p) => p.name))}
      </div>
    );
  }

  return (
    <figure className={`stage stage--${size}`}>
      <div className="stage__screen">
        {body}
        <ProgramOverlay />
        {notice && <div className="stage__notice">{notice}</div>}
      </div>
      {showCaption && (
        <figcaption className="stage__caption">
          <span>Lokale Vorschau · simulierte Kamerabilder</span>
          <span>Grafiken gehen über die OBS-Adressen hinaus, die Videobilder sind simuliert</span>
        </figcaption>
      )}
    </figure>
  );
}
