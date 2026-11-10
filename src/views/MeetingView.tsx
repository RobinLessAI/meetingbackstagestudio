import { useId, useState, type ReactNode } from 'react';
import { ArrowRight, Check, CircleAlert, Clipboard, LoaderCircle, LogOut, MonitorPlay, Settings, Video } from 'lucide-react';
import { Button } from '../components/ui.tsx';
import { clock } from '../lib/time.ts';
import { useStore } from '../state/store.tsx';
import { useUi } from '../state/ui.tsx';
import { useSync, type RegieStatus } from '../sync/SyncProvider.tsx';
import { MeetingLists } from './MeetingLists.tsx';

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

/** Schritt im Ablauf: 0 = Link eingeben, 1 = tritt bei, 2 = im Warteraum, 4 = verbunden (alle erledigt). */
function stepOf(r: RegieStatus | null): number {
  if (!r) return 0;
  if (r.state === 'verbunden') return 4;
  if (r.state === 'wartet') return 2;
  if (r.state === 'verbindet') return 1;
  return 0;
}

function Step({ n, current, title, children }: { n: number; current: number; title: string; children?: ReactNode }) {
  const done = current > n;
  const active = current === n;
  return (
    <li className={`meet-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`} aria-current={active ? 'step' : undefined}>
      <span className="meet-step__dot" aria-hidden>
        {done ? <Check size={14} /> : active && n > 0 && n < 3 ? <LoaderCircle size={14} className="spin" /> : n + 1}
      </span>
      <span className="meet-step__text">
        <strong>{title}</strong>
        {children && <span className="subtle">{children}</span>}
      </span>
    </li>
  );
}

/**
 * Startseite „Meeting“: Zoom-Link einfügen, Regie beitreten, Fortschritt sehen.
 * Das ist der erste Schritt jeder Sitzung.
 */
export function MeetingView() {
  const { regie, available, openRegie, leaveRegie } = useSync();
  const { notify, state } = useStore();
  const { go } = useUi();
  const [meeting, setMeeting] = useState(() => readStored('mb-letztes-meeting'));
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const ids = { meeting: useId(), passcode: useId() };
  const step = stepOf(regie);
  const connected = regie?.state === 'verbunden';
  const busy = regie?.state === 'verbindet' || regie?.state === 'wartet';

  const join = (link = meeting, code = passcode) => {
    if (!link.trim()) return;
    setMeeting(link.trim());
    setPasscode(code ?? '');
    try {
      localStorage.setItem('mb-letztes-meeting', link.trim());
    } catch {
      /* optional */
    }
    if (!openRegie(link, code ?? '')) notify('Das Regie-Fenster wurde blockiert. Bitte Pop-ups für localhost erlauben.', 'fehler');
    // Fortschritt und Meldungen stehen in der Karte unten: dorthin scrollen.
    document.getElementById('meet-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setMeeting(text.trim());
    } catch {
      notify('Einfügen nicht möglich. Bitte mit cmd + V ins Feld einfügen.', 'info', false);
    }
  };

  // Ohne lokalen Server (z. B. Handy-Vorschau) oder ohne Einrichtung: klar sagen, was fehlt.
  const blocker = !available
    ? 'Diese Vorschau läuft ohne den Server auf deinem Mac. Ins Meeting geht es nur in der App auf dem Mac (npm start, dann http://localhost:4300).'
    : !regie
      ? 'Verbinde mit dem Server …'
      : !regie.sdkInstalled
        ? 'Das Zoom Meeting SDK fehlt. Im Terminal „npm install“ ausführen und die App neu starten.'
        : regie.missing.length
          ? `In .env.local fehlt: ${regie.missing.join(', ')}. Danach die App neu starten.`
          : null;

  return (
    <div className="view meet">
      {!connected && (
        <MeetingLists
          currentLink={meeting}
          disabled={!!blocker || busy}
          onJoin={(link, code) => join(link, code)}
          onUse={(link, code) => {
            setMeeting(link);
            if (code) {
              setPasscode(code);
              setShowPasscode(true);
            }
            document.getElementById(ids.meeting)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      )}

      <section className="meet-card" aria-labelledby="meet-title">
        <div className="meet-card__icon" aria-hidden>
          <Video size={26} />
        </div>
        <h1 id="meet-title" className="meet-card__title">
          {connected ? 'Mit dem Meeting verbunden' : 'Per Link verbinden'}
        </h1>
        <p className="meet-card__lead">
          {connected
            ? `„${regie?.name}“ ist im Meeting ${regie?.meeting ?? ''}. Der Chat kommt jetzt live in MeetingBackstage an.`
            : 'Starte dein Meeting in Zoom, kopiere den Einladungslink und füge ihn hier ein. MeetingBackstage tritt als „MeetingBackstage (Regie)“ bei und liest den Chat mit.'}
        </p>

        {blocker && (
          <p className="callout callout--warn meet-card__note" role="status">
            <CircleAlert size={16} aria-hidden /> {blocker}
          </p>
        )}

        {connected ? (
          <div className="meet-connected">
            <p className="meet-connected__line">
              <span className="meet-live" aria-hidden /> Live seit {regie?.since ? clock(regie.since, false) : '–'} Uhr · {regie?.messages ?? 0}{' '}
              {regie?.messages === 1 ? 'Nachricht' : 'Nachrichten'} empfangen · {state.chat.length} im Chat
            </p>
            <div className="meet-actions">
              <Button variant="primary" size="lg" icon={ArrowRight} onClick={() => go('grafiken', { graphicTab: 'uebersicht' })}>
                Zu den Live Grafiken
              </Button>
              <Button size="lg" icon={MonitorPlay} onClick={() => go('ausgabe')}>
                OBS-Ausgabe
              </Button>
              <Button variant="ghost" icon={LogOut} onClick={leaveRegie}>
                Meeting verlassen
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="meet-form"
            onSubmit={(e) => {
              e.preventDefault();
              join(meeting, passcode);
            }}
          >
            <label htmlFor={ids.meeting} className="meet-form__label">
              Zoom-Link oder Meeting-ID
            </label>
            <div className="meet-form__row">
              <input
                id={ids.meeting}
                className="input meet-form__input"
                value={meeting}
                onChange={(e) => setMeeting(e.target.value)}
                placeholder="https://zoom.us/j/123456789?pwd=…"
                autoComplete="off"
                disabled={!!blocker || busy}
              />
              <Button type="button" variant="ghost" icon={Clipboard} onClick={paste} disabled={!!blocker || busy} title="Aus der Zwischenablage einfügen">
                Einfügen
              </Button>
            </div>
            {showPasscode ? (
              <div className="meet-form__row">
                <label htmlFor={ids.passcode} className="sr-only">
                  Kenncode
                </label>
                <input
                  id={ids.passcode}
                  className="input"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Kenncode des Meetings"
                  autoComplete="off"
                />
              </div>
            ) : (
              <button type="button" className="meet-form__more" onClick={() => setShowPasscode(true)}>
                Zoom verlangt einen Kenncode?
              </button>
            )}
            <Button type="submit" variant="primary" size="lg" icon={busy ? LoaderCircle : ArrowRight} disabled={!meeting.trim() || !!blocker || busy}>
              {busy ? 'Regie tritt bei …' : 'Meeting beitreten'}
            </Button>
          </form>
        )}

        {regie?.state === 'fehler' && regie.error && (
          <p className="callout callout--danger meet-card__note" role="alert">
            <CircleAlert size={16} aria-hidden /> {regie.error}
          </p>
        )}

        <ol className="meet-steps" aria-label="Ablauf">
          <Step n={0} current={step} title="Link einfügen und „Meeting beitreten“" />
          <Step n={1} current={step} title="Regie-Fenster öffnet sich">
            Lass es offen, solange der Workshop läuft. Kamera und Mikrofon nicht erlauben.
          </Step>
          <Step n={2} current={step} title="In Zoom zulassen">
            „MeetingBackstage (Regie)“ wartet ggf. im Warteraum.
          </Step>
          <Step n={3} current={step} title="Verbunden">
            Chat-Nachrichten an alle kommen live an.
          </Step>
        </ol>
      </section>

      <p className="meet-foot subtle">
        Zugangsdaten, Chat-Export als Notlösung und Team-Namen findest du unter{' '}
        <button type="button" className="link-btn" onClick={() => go('integrationen')}>
          <Settings size={13} aria-hidden /> Zoom & Einstellungen
        </button>
        .
      </p>
    </div>
  );
}
