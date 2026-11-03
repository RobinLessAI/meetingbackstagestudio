import { useEffect, useState } from 'react';
import { HighlightCard } from '../components/graphics/HighlightCard.tsx';
import { PollChart } from '../components/graphics/PollChart.tsx';
import { WordCloud } from '../components/graphics/WordCloud.tsx';
import { WorldMap } from '../components/graphics/WorldMap.tsx';
import type { GraphicKind } from '../state/types.ts';
import type { OutputSnapshot } from '../sync/snapshot.ts';
import { openSyncSocket, type SocketStatus } from '../sync/socket.ts';

export type OutputGraphic = GraphicKind | 'programm';

export interface OutputOptions {
  grafik: OutputGraphic;
  stil: 'einblendung' | 'vollbild';
  sichtbar: 'immer' | 'programm';
  hintergrund: 'transparent' | 'dunkel';
  debug: boolean;
}

const GRAPHICS: OutputGraphic[] = ['programm', 'karte', 'umfrage', 'wortwolke', 'highlight'];

/** Liest die Optionen aus der Adresse, z. B. ?grafik=umfrage&stil=vollbild */
export function readOptions(search: string): OutputOptions {
  const p = new URLSearchParams(search);
  const g = p.get('grafik') as OutputGraphic | null;
  const grafik = g && GRAPHICS.includes(g) ? g : 'programm';
  const stil = p.get('stil') === 'vollbild' ? 'vollbild' : p.get('stil') === 'einblendung' ? 'einblendung' : grafik === 'programm' ? 'einblendung' : 'vollbild';
  const sichtbar = p.get('sichtbar') === 'programm' ? 'programm' : p.get('sichtbar') === 'immer' ? 'immer' : grafik === 'programm' ? 'programm' : 'immer';
  const hintergrund = p.get('hintergrund') === 'dunkel' ? 'dunkel' : p.get('hintergrund') === 'transparent' ? 'transparent' : stil === 'vollbild' ? 'dunkel' : 'transparent';
  return { grafik, stil, sichtbar, hintergrund, debug: p.get('debug') === '1' };
}

function title(s: OutputSnapshot, g: GraphicKind) {
  return g === 'karte' ? s.map.question : g === 'umfrage' ? s.poll.question : g === 'wortwolke' ? s.cloud.prompt : 'Aus dem Chat';
}

function meta(s: OutputSnapshot, g: GraphicKind) {
  if (g === 'karte') return `${s.map.people} ${s.map.people === 1 ? 'Person' : 'Personen'} an ${s.map.pins.length} ${s.map.pins.length === 1 ? 'Ort' : 'Orten'}`;
  if (g === 'umfrage')
    return s.poll.kind === 'offen'
      ? `${s.poll.totalVotes} Antworten`
      : `${s.poll.totalVotes} ${s.poll.totalVotes === 1 ? 'Stimme' : 'Stimmen'}${s.poll.status === 'geschlossen' ? ' · Abstimmung geschlossen' : ''}`;
  if (g === 'wortwolke') return `${s.cloud.messages} Beiträge`;
  return '';
}

function GraphicBody({ s, g, full }: { s: OutputSnapshot; g: GraphicKind; full: boolean }) {
  if (g === 'karte') {
    return (
      <WorldMap
        pins={s.map.pins}
        view={s.map.view}
        variant="present"
        aspect={full ? 2.3 : 1.2}
        renderWidth={full ? 1250 : 440}
      />
    );
  }
  if (g === 'umfrage') return <PollChart data={s.poll} variant={full ? 'present' : 'overlay'} />;
  if (g === 'wortwolke') return <WordCloud terms={full ? s.cloud.terms : s.cloud.terms.slice(0, 20)} variant={full ? 'present' : 'overlay'} />;
  return <HighlightCard message={s.highlight} variant={full ? 'present' : 'overlay'} />;
}

export function Output({ options }: { options: OutputOptions }) {
  const [snapshot, setSnapshot] = useState<OutputSnapshot | null>(null);
  const [status, setStatus] = useState<SocketStatus>('verbinde');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const socket = openSyncSocket('ausgabe', {
      onStatus: setStatus,
      onMessage: (msg) => {
        if (msg.type === 'snapshot' && msg.snapshot?.v === 1) setSnapshot(msg.snapshot);
      },
    });
    return () => socket.close();
  }, []);

  // Reaktionen sind nur kurz sichtbar; dafür die Uhr mitlaufen lassen.
  const reaction = snapshot?.program.reaction;
  useEffect(() => {
    if (!reaction) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [reaction]);

  const g: GraphicKind | null = !snapshot
    ? null
    : options.grafik === 'programm'
      ? snapshot.program.graphic
      : options.sichtbar === 'immer' || snapshot.program.graphic === options.grafik
        ? options.grafik
        : null;
  const full = options.stil === 'vollbild';
  const showReaction = options.grafik === 'programm' && reaction && now - reaction.at < 5000;

  return (
    <div className={`out out--${options.hintergrund}`}>
      {snapshot && g && full && (
        <section className="out-full" key={`full-${g}`}>
          <h1 className="out-full__title">{title(snapshot, g)}</h1>
          <div className={`out-full__body out-full__body--${g}`}>
            <GraphicBody s={snapshot} g={g} full />
          </div>
          {meta(snapshot, g) && <p className="out-full__meta">{meta(snapshot, g)}</p>}
        </section>
      )}
      {snapshot && g && !full && g === 'highlight' && (
        <section className="out-lower" key="lower">
          <GraphicBody s={snapshot} g={g} full={false} />
        </section>
      )}
      {snapshot && g && !full && g !== 'highlight' && (
        <section className={`out-side out-side--${g}`} key={`side-${g}`}>
          <p className="out-side__title">{title(snapshot, g)}</p>
          <div className="out-side__body">
            <GraphicBody s={snapshot} g={g} full={false} />
          </div>
          {meta(snapshot, g) && <p className="out-side__meta">{meta(snapshot, g)}</p>}
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
