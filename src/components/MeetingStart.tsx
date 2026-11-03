import { useId, useState } from 'react';
import { CircleCheck, ExternalLink, LogIn, Play, Square, TriangleAlert } from 'lucide-react';
import { useSync } from '../sync/SyncProvider.tsx';
import { Button, Field } from './ui.tsx';

/** Einmal mit Zoom verbinden, dann pro Meeting den Chat-Datenstrom per Link starten. */
export function MeetingStart({ compact = false }: { compact?: boolean }) {
  const { rtms, available, zoomResult, zoomBusy, requestAuthUrl, connectZoom, disconnectZoom, setRtms } = useSync();
  const [pasted, setPasted] = useState('');
  const [meeting, setMeeting] = useState(() => {
    try {
      return localStorage.getItem('mb-letztes-meeting') ?? '';
    } catch {
      return '';
    }
  });
  const ids = { pasted: useId(), meeting: useId() };
  const account = rtms?.account;
  const connected = !!account?.connected;

  if (!available || !rtms) return null;

  const start = (action: 'start' | 'stop') => {
    try {
      localStorage.setItem('mb-letztes-meeting', meeting);
    } catch {
      /* optional */
    }
    setRtms(meeting, action);
  };

  return (
    <div className={`meeting-start${compact ? ' meeting-start--compact' : ''}`}>
      {!connected ? (
        <div className="stack">
          {!compact && <h3 className="eyebrow">Einmalig: mit Zoom verbinden</h3>}
          {!account?.redirectConfigured ? (
            <p className="callout callout--warn">
              <TriangleAlert size={16} aria-hidden /> In <code>.env.local</code> fehlt <code>ZOOM_REDIRECT_URI</code>: dieselbe Adresse, die in der
              Zoom-App als OAuth-Weiterleitungs-URL steht. Danach den Server neu starten.
            </p>
          ) : (
            <>
              <p className="muted">
                1. Bei Zoom erlauben. 2. Danach die komplette Adresse aus der Adresszeile des Browsers kopieren (sie enthält <code>?code=</code>) und hier
                einfügen.
              </p>
              <Button
                icon={ExternalLink}
                onClick={async () => {
                  const url = await requestAuthUrl();
                  if (url) window.open(url, '_blank', 'noopener');
                }}
              >
                Bei Zoom erlauben
              </Button>
              <Field label="Adresse nach dem Erlauben" htmlFor={ids.pasted}>
                <input
                  id={ids.pasted}
                  className="input"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="https://…?code=…"
                />
              </Field>
              <Button variant="primary" icon={LogIn} loading={zoomBusy} disabled={!pasted.trim() || zoomBusy} onClick={() => connectZoom(pasted)}>
                Verbinden
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="stack">
          {!compact && (
            <p className="row">
              <CircleCheck size={16} className="is-ok" aria-hidden /> Mit Zoom verbunden
              <Button size="sm" variant="ghost" onClick={disconnectZoom}>
                Trennen
              </Button>
            </p>
          )}
          <Field
            label="Meeting-Link oder Meeting-ID"
            htmlFor={ids.meeting}
            hint="Das Meeting muss laufen, und du bist dort Host. Es tritt kein zusätzlicher Teilnehmer bei."
          >
            <input
              id={ids.meeting}
              className="input"
              value={meeting}
              onChange={(e) => setMeeting(e.target.value)}
              placeholder="https://zoom.us/j/123456789?pwd=… oder 123 456 789"
            />
          </Field>
          <div className="row">
            <Button variant="primary" icon={Play} loading={zoomBusy} disabled={!meeting.trim() || zoomBusy} onClick={() => start('start')}>
              Chat-Datenstrom starten
            </Button>
            <Button icon={Square} disabled={!meeting.trim() || zoomBusy} onClick={() => start('stop')}>
              Stoppen
            </Button>
          </div>
        </div>
      )}
      {zoomResult && (
        <p className={`callout ${zoomResult.ok ? 'callout--accent' : 'callout--danger'}`} role="status">
          {zoomResult.ok ? <CircleCheck size={16} aria-hidden /> : <TriangleAlert size={16} aria-hidden />} {zoomResult.message}
        </p>
      )}
    </div>
  );
}
