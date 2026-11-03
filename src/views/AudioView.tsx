import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleSlash, Info } from 'lucide-react';
import { ObsOutputsPanel } from '../components/ObsOutputs.tsx';
import { MicStatus } from '../components/people.tsx';
import { Button, DemoTag, NotConnected, Panel } from '../components/ui.tsx';
import { INTEGRATIONS, type IntegrationId } from '../data/integrations.ts';
import { useStore } from '../state/store.tsx';
import type { OutputId, OutputSource, Participant } from '../state/types.ts';
import { IntegrationDialog } from './IntegrationsView.tsx';

interface Source {
  id: string;
  label: string;
  sub: string;
  on: boolean;
  speaking: boolean;
  /** Grundrauschen bzw. Raumklang bei offenem Mikrofon. */
  floor: number;
}

const toDb = (level: number) => (level <= 0.001 ? -60 : Math.max(-60, 20 * Math.log10(level)));

function usePrefersReducedMotion(setting: 'system' | 'reduziert' | 'normal') {
  const [system, setSystem] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return setting === 'reduziert' || (setting === 'system' && system);
}

function Meter({ level, peak, label, sub, status }: { level: number; peak: number; label: string; sub: string; status?: ReactNode }) {
  const db = toDb(level);
  const pct = ((db + 60) / 60) * 100;
  const peakPct = ((toDb(peak) + 60) / 60) * 100;
  return (
    <div className="meter">
      <div className="meter__scale" aria-hidden>
        {[0, -6, -18, -30, -45, -60].map((d) => (
          <span key={d} style={{ bottom: `${((d + 60) / 60) * 100}%` }}>
            {d}
          </span>
        ))}
      </div>
      <div
        className="meter__bar"
        role="meter"
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={Math.round(db)}
        aria-label={`${label}: ${db <= -59 ? 'kein Signal' : `${Math.round(db)} dB`}`}
      >
        <div className="meter__fill" style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }} />
        {peak > 0.01 && <div className="meter__peak" style={{ bottom: `${peakPct}%` }} />}
      </div>
      <div className="meter__info">
        <span className="meter__label">{label}</span>
        <span className="meter__sub">{sub}</span>
        <span className="meter__db mono">{db <= -59 ? '−∞' : `${Math.round(db)} dB`}</span>
        {status}
      </div>
    </div>
  );
}

const OUTPUTS: Array<{ id: OutputId; name: string; purpose: string; status: 'demo' | 'nicht-verbunden'; integration?: IntegrationId; requirement: string }> = [
  { id: 'ndi', name: 'NDI', purpose: 'Video ins lokale Netzwerk', status: 'demo', integration: 'ndi', requirement: 'NDI SDK, native App' },
  { id: 'srt', name: 'SRT', purpose: 'Stream an ein Ziel im Internet', status: 'nicht-verbunden', integration: 'srt', requirement: 'Encoder und SRT-Ziel' },
  { id: 'sdi', name: 'SDI', purpose: 'Video an die Regie per Kabel', status: 'nicht-verbunden', integration: 'sdi', requirement: 'SDI-Karte mit Treiber' },
  { id: 'dante', name: 'Dante', purpose: 'Audio ins Audionetzwerk', status: 'nicht-verbunden', integration: 'audio', requirement: 'Dante-Gerät oder Virtual Soundcard' },
  { id: 'virtuelle-kamera', name: 'Virtuelle Kamera', purpose: 'Galerie als Kamera in anderen Programmen', status: 'nicht-verbunden', requirement: 'Kameratreiber des Betriebssystems' },
  { id: 'aufnahme', name: 'Aufnahme', purpose: 'Lokale Aufzeichnung', status: 'nicht-verbunden', requirement: 'Im Prototyp bewusst nicht enthalten' },
];

const SOURCE_LABEL: Record<OutputSource, string> = {
  programm: 'Programm (Galerie + Grafik)',
  galerie: 'Galerie ohne Grafik',
  grafik: 'Nur Grafik',
  moderation: 'Moderation einzeln',
  'audio-mix': 'Audio-Mix',
};

export function AudioView() {
  const { state, dispatch, notify } = useStore();
  const reduced = usePrefersReducedMotion(state.settings.motion);
  const [detail, setDetail] = useState<IntegrationId | null>(null);

  const sources = useMemo<Source[]>(() => {
    const by = (id: string) => state.participants.find((p) => p.id === id);
    const strip = (p: Participant | undefined, label: string, sub: string, floor = 0.06): Source | null =>
      p ? { id: p.id, label, sub, on: p.micOn, speaking: state.activeSpeakerId === p.id, floor } : null;
    const named = ['robin', 'henrike', 'mara', 'raum'];
    const rest = state.participants.filter((p) => !named.includes(p.id));
    const restOpen = rest.filter((p) => p.micOn);
    return [
      strip(by('robin'), 'Robin', 'Moderation'),
      strip(by('henrike'), 'H. Vogt', 'Vortrag'),
      strip(by('mara'), 'Mara', 'Co-Moderation'),
      strip(by('raum'), 'Raum 2.14', 'Raummikrofon', 0.16),
      {
        id: 'rest',
        label: 'Teilnehmende',
        sub: `${restOpen.length} von ${rest.length} offen`,
        on: restOpen.length > 0,
        speaking: restOpen.some((p) => p.id === state.activeSpeakerId),
        floor: Math.min(0.2, 0.05 * restOpen.length),
      },
    ].filter((s): s is Source => !!s);
  }, [state.participants, state.activeSpeakerId]);

  const [levels, setLevels] = useState<Record<string, { level: number; peak: number }>>({});
  const srcRef = useRef(sources);
  srcRef.current = sources;

  useEffect(() => {
    const tick = () => {
      setLevels((prev) => {
        const next: Record<string, { level: number; peak: number }> = {};
        let mix = 0;
        for (const s of srcRef.current) {
          const target = !s.on ? 0 : s.speaking ? 0.45 + Math.random() * 0.45 : s.floor * (0.6 + Math.random() * 0.8);
          const old = prev[s.id] ?? { level: 0, peak: 0 };
          const level = reduced ? target : old.level * 0.35 + target * 0.65;
          const peak = Math.max(level, old.peak * (reduced ? 0.5 : 0.94));
          next[s.id] = { level, peak };
          mix = Math.max(mix, level);
        }
        for (const ch of ['L', 'R']) {
          const old = prev[`mix-${ch}`] ?? { level: 0, peak: 0 };
          const level = mix * (0.9 + Math.random() * 0.1);
          next[`mix-${ch}`] = { level, peak: Math.max(level, old.peak * (reduced ? 0.5 : 0.94)) };
        }
        return next;
      });
    };
    tick();
    const t = window.setInterval(tick, reduced ? 1000 : 110);
    return () => window.clearInterval(t);
  }, [reduced]);

  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Audio und Ausgabe</span>
          <h1 className="view__title">Ausgabe für OBS</h1>
          <p className="view__lead">
            Die Grafiken laufen als Browserquellen in OBS. Die Audiopegel weiter unten sind simuliert; es werden keine Audiogeräte geöffnet.
          </p>
        </div>
      </header>

      <ObsOutputsPanel />

      <Panel
        eyebrow="Eingänge · simuliert"
        title="Audiopegel"
        actions={reduced ? <span className="subtle">Reduzierte Bewegung: Aktualisierung einmal pro Sekunde</span> : undefined}
      >
        <div className="meters">
          {sources.map((s) => (
            <Meter
              key={s.id}
              level={levels[s.id]?.level ?? 0}
              peak={levels[s.id]?.peak ?? 0}
              label={s.label}
              sub={s.sub}
              status={s.id === 'rest' ? undefined : <MicStatus on={s.on} />}
            />
          ))}
          <div className="meters__sep" aria-hidden />
          <Meter level={levels['mix-L']?.level ?? 0} peak={levels['mix-L']?.peak ?? 0} label="Programm L" sub="Summe" />
          <Meter level={levels['mix-R']?.level ?? 0} peak={levels['mix-R']?.peak ?? 0} label="Programm R" sub="Summe" />
        </div>
      </Panel>

      <Panel eyebrow="Ausgänge" title="Mögliche Ausgänge" actions={<span className="subtle">Keine Aufnahme- oder Übertragungsfunktion im Prototyp</span>} flush>
        <div className="table-wrap">
          <table className="table outputs-table">
            <thead>
              <tr>
                <th scope="col">Ausgang</th>
                <th scope="col">Zweck</th>
                <th scope="col">Quelle (geplant)</th>
                <th scope="col">Status</th>
                <th scope="col">Voraussetzung</th>
                <th scope="col">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {OUTPUTS.map((o) => (
                <tr key={o.id}>
                  <th scope="row" className="outputs-table__name">
                    {o.name}
                  </th>
                  <td>{o.purpose}</td>
                  <td>
                    {o.id === 'aufnahme' ? (
                      <span className="subtle">
                        <CircleSlash size={13} aria-hidden /> nicht verfügbar
                      </span>
                    ) : (
                      <>
                        <label htmlFor={`src-${o.id}`} className="sr-only">
                          Quelle für {o.name}
                        </label>
                        <select
                          id={`src-${o.id}`}
                          className="select select--sm"
                          value={state.outputs[o.id]}
                          onChange={(e) => {
                            const source = e.target.value as OutputSource;
                            dispatch({ type: 'output/source', id: o.id, source });
                            notify(`${o.name}: Quelle „${SOURCE_LABEL[source]}“ vorgemerkt. Es wird nichts ausgegeben.`, 'info');
                          }}
                        >
                          {(o.id === 'dante' ? (['audio-mix'] as OutputSource[]) : (['programm', 'galerie', 'grafik', 'moderation'] as OutputSource[])).map((s) => (
                            <option key={s} value={s}>
                              {SOURCE_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </td>
                  <td>{o.status === 'demo' ? <DemoTag>Demo</DemoTag> : <NotConnected />}</td>
                  <td className="subtle">{o.requirement}</td>
                  <td>
                    {o.integration ? (
                      <Button size="sm" variant="ghost" icon={Info} onClick={() => setDetail(o.integration!)}>
                        Details
                      </Button>
                    ) : (
                      <span className="subtle">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <IntegrationDialog integration={INTEGRATIONS.find((i) => i.id === detail) ?? null} onClose={() => setDetail(null)} />
    </div>
  );
}
