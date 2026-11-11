import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, MonitorUp } from 'lucide-react';
import type { OutputSnapshot } from '../sync/snapshot.ts';
import type { SocketStatus } from '../sync/socket.ts';
import { OutputView, type OutputOptions } from './Output.tsx';

const IDLE_MS = 2500;

/**
 * Präsentationsfenster für die Bildschirmfreigabe in Zoom oder Teams (ohne OBS).
 * Feste 16:9-Bühne, die sich dem Fenster anpasst. Bedienleiste und Mauszeiger
 * verschwinden nach kurzer Zeit, damit in der Freigabe nur die Grafik zu sehen ist.
 */
export function PresentationFrame({
  snapshot,
  options,
  now,
  status,
}: {
  snapshot: OutputSnapshot | null;
  options: OutputOptions;
  now: number;
  status: SocketStatus;
}) {
  const [idle, setIdle] = useState(false);
  const [full, setFull] = useState(false);
  const timer = useRef<number>(0);

  useEffect(() => {
    document.title = 'MeetingBackstage · Präsentation';
    document.body.classList.add('praes-body');
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') toggleFull();
      wake();
    };
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('mousedown', wake);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('mousedown', wake);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, []);

  const empty = !snapshot?.program.graphic && options.grafik === 'programm';

  return (
    <div className={`praes${idle ? ' is-idle' : ''}`}>
      <div className="praes__stage">
        <OutputView snapshot={snapshot} options={options} now={now} status={status} embedded />
        {empty && options.leer === 'titel' && snapshot?.title && (
          <div className="praes__empty">
            <p className="praes__empty-title">{snapshot.title}</p>
          </div>
        )}
      </div>
      <div className="praes__bar" role="toolbar" aria-label="Präsentationsfenster">
        <span className={`praes__dot${status === 'verbunden' ? ' is-on' : ''}`} aria-hidden />
        <span className="praes__hint">
          {status !== 'verbunden' ? (
            'Verbinde mit MeetingBackstage …'
          ) : (
            <>
              <MonitorUp size={14} aria-hidden /> In Zoom: „Bildschirm freigeben“ → dieses Fenster wählen. Die Leiste verschwindet von selbst.
            </>
          )}
        </span>
        <button type="button" className="praes__btn" onClick={toggleFull} title="Vollbild (Taste F)">
          {full ? <Minimize size={15} aria-hidden /> : <Maximize size={15} aria-hidden />}
          {full ? 'Vollbild beenden' : 'Vollbild'}
        </button>
      </div>
    </div>
  );
}

function toggleFull() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}
