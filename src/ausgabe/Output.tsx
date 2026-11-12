import { useEffect, useState, type CSSProperties } from 'react';
import { boxVars, fullBackground, lookVars, placement } from '../components/graphics/look.ts';
import { normalizeLooks } from '../data/graphicLooks.ts';
import { HighlightCard } from '../components/graphics/HighlightCard.tsx';
import { PollChart } from '../components/graphics/PollChart.tsx';
import { WordCloud } from '../components/graphics/WordCloud.tsx';
import { WorldMap } from '../components/graphics/WorldMap.tsx';
import { Wheel } from '../components/graphics/Wheel.tsx';
import type { GraphicKind, GraphicLook, GraphicLooks } from '../state/types.ts';
import type { OutputSnapshot } from '../sync/snapshot.ts';
import { openSyncSocket, type SocketStatus } from '../sync/socket.ts';
import { PresentationFrame } from './Presentation.tsx';

export type OutputGraphic = GraphicKind | 'programm';

export interface OutputOptions {
  grafik: OutputGraphic;
  stil: 'einblendung' | 'vollbild';
  sichtbar: 'immer' | 'programm';
  hintergrund: 'transparent' | 'dunkel';
  /** hintergrund steht ausdrücklich in der Adresse (sonst darf die Karte „Nur Umrisse“ ihn transparent machen). */
  hintergrundFest: boolean;
  debug: boolean;
  /** Präsentationsfenster für die Bildschirmfreigabe (ohne OBS): immer Vollbild, nie durchsichtig. */
  praesentation?: boolean;
  /** Was das Präsentationsfenster zeigt, wenn nichts im Programm ist. */
  leer?: 'titel' | 'schwarz';
}

const GRAPHICS: OutputGraphic[] = ['programm', 'karte', 'umfrage', 'wortwolke', 'highlight', 'gluecksrad'];

/** Liest die Optionen aus der Adresse, z. B. ?grafik=umfrage&stil=vollbild */
export function readOptions(search: string): OutputOptions {
  const p = new URLSearchParams(search);
  if (p.get('modus') === 'praesentation') {
    const pg = p.get('grafik') as OutputGraphic | null;
    return {
      grafik: pg && GRAPHICS.includes(pg) ? pg : 'programm',
      stil: 'vollbild',
      sichtbar: 'programm',
      hintergrund: 'dunkel',
      hintergrundFest: false,
      debug: p.get('debug') === '1',
      praesentation: true,
      leer: p.get('leer') === 'schwarz' ? 'schwarz' : 'titel',
    };
  }
  const g = p.get('grafik') as OutputGraphic | null;
  const grafik = g && GRAPHICS.includes(g) ? g : 'programm';
  const stil = p.get('stil') === 'vollbild' ? 'vollbild' : p.get('stil') === 'einblendung' ? 'einblendung' : grafik === 'programm' ? 'einblendung' : 'vollbild';
  const sichtbar = p.get('sichtbar') === 'programm' ? 'programm' : p.get('sichtbar') === 'immer' ? 'immer' : grafik === 'programm' ? 'programm' : 'immer';
  const hintergrund = p.get('hintergrund') === 'dunkel' ? 'dunkel' : p.get('hintergrund') === 'transparent' ? 'transparent' : stil === 'vollbild' ? 'dunkel' : 'transparent';
  const hintergrundFest = p.get('hintergrund') === 'dunkel' || p.get('hintergrund') === 'transparent';
  return { grafik, stil, sichtbar, hintergrund, hintergrundFest, debug: p.get('debug') === '1', praesentation: false, leer: 'titel' };
}

function title(s: OutputSnapshot, g: GraphicKind, look?: GraphicLook) {
  if (look?.title.trim()) return look.title.trim();
  if (g === 'gluecksrad') return s.wheel?.title || 'Glücksrad';
  return g === 'karte' ? s.map.question : g === 'umfrage' ? s.poll.question : g === 'wortwolke' ? s.cloud.prompt : 'Aus dem Chat';
}

const lookOf = (looks: GraphicLooks, g: GraphicKind): GraphicLook | undefined =>
  g === 'karte' || g === 'umfrage' || g === 'wortwolke' || g === 'gluecksrad' ? looks[g] : undefined;

function meta(s: OutputSnapshot, g: GraphicKind) {
  if (g === 'karte') return `${s.map.people} ${s.map.people === 1 ? 'Person' : 'Personen'} an ${s.map.pins.length} ${s.map.pins.length === 1 ? 'Ort' : 'Orten'}`;
  if (g === 'umfrage')
    return s.poll.kind === 'offen'
      ? `${s.poll.totalVotes} Antworten`
      : `${s.poll.totalVotes} ${s.poll.totalVotes === 1 ? 'Stimme' : 'Stimmen'}${s.poll.status === 'geschlossen' ? ' · Abstimmung geschlossen' : ''}`;
  if (g === 'wortwolke') return `${s.cloud.messages} Beiträge`;
  if (g === 'gluecksrad') {
    const n = s.wheel?.spin ? s.wheel.spin.entries.length : (s.wheel?.entries.length ?? 0);
    return `${n} ${n === 1 ? 'Feld' : 'Felder'} im Rad`;
  }
  return '';
}

function GraphicBody({ s, g, full, looks }: { s: OutputSnapshot; g: GraphicKind; full: boolean; looks: GraphicLooks }) {
  if (g === 'karte') {
    const l = looks.karte;
    // Seitenverhältnis der Karte passend zur eingestellten Boxgröße
    const aspect = full ? 2.3 : l.height > 0 ? Math.max(0.6, (l.width * 16) / (l.height * 9 * 0.82)) : 1.2;
    return (
      <WorldMap
        pins={s.map.pins}
        view={s.map.view}
        mapStyle={s.map.style ?? 'gefuellt'}
        variant="present"
        aspect={aspect}
        renderWidth={full ? 1250 : Math.round(19.2 * l.width * 0.9)}
        look={l}
      />
    );
  }
  if (g === 'umfrage') return <PollChart data={s.poll} variant={full ? 'present' : 'overlay'} look={looks.umfrage} />;
  if (g === 'wortwolke') return <WordCloud terms={s.cloud.terms} variant={full ? 'present' : 'overlay'} look={looks.wortwolke} />;
  if (g === 'gluecksrad')
    return (
      <Wheel
        entries={s.wheel?.entries ?? []}
        restDeg={s.wheel?.restDeg ?? 0}
        spin={s.wheel?.spin ?? null}
        look={looks.gluecksrad}
        variant={full ? 'present' : 'overlay'}
      />
    );
  return <HighlightCard message={s.highlight} variant={full ? 'present' : 'overlay'} style={s.highlightStyle} />;
}

export function Output({ options }: { options: OutputOptions }) {
  const [snapshot, setSnapshot] = useState<OutputSnapshot | null>(null);
  const [status, setStatus] = useState<SocketStatus>('verbinde');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Die Programm-Vorschau in der App zählt nicht als OBS-Quelle.
    const params = new URLSearchParams(window.location.search);
    // Im Web-Modus steht der geheime Schlüssel des Kontos in der Adresse (k=…); in der App reicht die Anmeldung.
    const socket = openSyncSocket(
      params.get('vorschau') === '1' ? 'vorschau' : 'ausgabe',
      {
        onStatus: setStatus,
        onMessage: (msg) => {
          if (msg.type === 'snapshot' && msg.snapshot?.v === 1) setSnapshot(msg.snapshot);
        },
      },
      params.get('k'),
    );
    return () => socket.close();
  }, []);

  // Reaktionen sind nur kurz sichtbar; dafür die Uhr mitlaufen lassen.
  const reaction = snapshot?.program.reaction;
  useEffect(() => {
    if (!reaction) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [reaction]);

  if (options.praesentation) return <PresentationFrame snapshot={snapshot} options={options} now={now} status={status} />;
  return <OutputView snapshot={snapshot} options={options} now={now} status={status} />;
}

/**
 * Zeichnet eine Momentaufnahme wie in OBS. Wird von der OBS-Seite und von der
 * Vorschau in der App (embedded) genutzt, damit beide exakt gleich aussehen.
 */
export function OutputView({
  snapshot,
  options,
  now = Date.now(),
  status = 'verbunden',
  embedded = false,
}: {
  snapshot: OutputSnapshot | null;
  options: OutputOptions;
  now?: number;
  status?: SocketStatus;
  embedded?: boolean;
}) {
  const reaction = snapshot?.program.reaction;
  const looks = normalizeLooks(snapshot?.looks);
  const g: GraphicKind | null = !snapshot
    ? null
    : options.grafik === 'programm'
      ? snapshot.program.graphic
      : options.sichtbar === 'immer' || snapshot.program.graphic === options.grafik
        ? options.grafik
        : null;
  const full = options.stil === 'vollbild';
  const look = g ? lookOf(looks, g) : undefined;
  // Hintergrund: Adresse (hintergrund=…) hat Vorrang, sonst die Darstellung der Grafik im Vollbild.
  let background = options.hintergrund;
  let backgroundStyle: CSSProperties | undefined;
  if (!options.hintergrundFest && look && full) {
    const custom = fullBackground(look);
    if (custom === 'transparent') background = 'transparent';
    else if (custom) {
      background = 'transparent';
      backgroundStyle = { background: custom };
    } else background = g === 'karte' && snapshot?.map.style === 'umrisse' ? 'transparent' : 'dunkel';
  }
  const showReaction = options.grafik === 'programm' && reaction && now - reaction.at < 5000;

  return (
    <div className={`out out--${background}${embedded ? ' out--embedded' : ''}`} style={backgroundStyle}>
      {snapshot && g && full && (
        <section className={`out-full${look ? ' out-look' : ''}`} key={`full-${g}`} style={look ? lookVars(look) : undefined}>
          {(!look || look.showTitle) && <h1 className="out-full__title">{title(snapshot, g, look)}</h1>}
          <div className={`out-full__body out-full__body--${g}${g === 'highlight' ? ` is-${snapshot.highlightStyle?.position ?? 'links'}` : ''}`}>
            <GraphicBody s={snapshot} g={g} full looks={looks} />
          </div>
          {(!look || look.showMeta) && meta(snapshot, g) && <p className="out-full__meta">{meta(snapshot, g)}</p>}
        </section>
      )}
      {snapshot && g && !full && g === 'highlight' && (
        <section className={`out-lower out-lower--${snapshot.highlightStyle?.position ?? 'links'}`} key="lower">
          <GraphicBody s={snapshot} g={g} full={false} looks={looks} />
        </section>
      )}
      {snapshot && g && !full && g !== 'highlight' && (
        <section
          className={`out-side out-side--${g}${look ? ' out-look' : ''}${look && look.height === 0 ? ' out-side--auto' : ''}`}
          key={`side-${g}-${look?.position ?? ''}`}
          style={look ? { ...lookVars(look), ...boxVars(look), ...placement(look) } : undefined}
        >
          {(!look || look.showTitle) && <p className="out-side__title">{title(snapshot, g, look)}</p>}
          <div className="out-side__body">
            <GraphicBody s={snapshot} g={g} full={false} looks={looks} />
          </div>
          {(!look || look.showMeta) && meta(snapshot, g) && <p className="out-side__meta">{meta(snapshot, g)}</p>}
        </section>
      )}
      {showReaction && (
        <div className="out-reaction" key={reaction.at}>
          <span className="out-reaction__emoji" aria-hidden>
            {reaction.emoji}
          </span>
          <span className="out-reaction__label">{reaction.label}</span>
        </div>
      )}
      {options.debug && (
        <p className="out-debug">
          {status === 'verbunden' ? 'Verbunden' : status === 'verbinde' ? 'Verbinde …' : 'Getrennt, verbinde neu …'} ·{' '}
          {snapshot ? `Stand ${new Date(snapshot.at).toLocaleTimeString('de-DE')}` : 'noch keine Daten'} · grafik={options.grafik} · stil=
          {options.stil}
        </p>
      )}
    </div>
  );
}
