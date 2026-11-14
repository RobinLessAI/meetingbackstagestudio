import { useId, useState, type ReactNode } from 'react';
import { ArrowRight, Check, CircleAlert, Clipboard, LoaderCircle, LogOut, MonitorPlay, MonitorUp, Settings, Video } from 'lucide-react';
import { openPresentationWindow } from '../lib/presentation.ts';
import { Button, InfoTip } from '../components/ui.tsx';
import { clock } from '../lib/time.ts';
import { useStore } from '../state/store.tsx';
import { useUi } from '../state/ui.tsx';
import { useSync, type RegieStatus, type TeamsLiveStatus } from '../sync/SyncProvider.tsx';
import { isTeamsLink } from '../lib/teamsLink.ts';
import { isWeb } from '../web/mode.ts';
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

/** Ablauf bei Teams: 0 = Link, 1 = Tunnel und Benachrichtigung, 3 = verbunden. */
function teamsStepOf(t: TeamsLiveStatus | undefined): number {
  if (!t) return 0;
  if (t.state === 'verbunden') return 3;
  if (t.state === 'verbindet') return 1;
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
  const { regie, available, openRegie, leaveRegie, teams, startTeamsLive, stopTeamsLive } = useSync();
  const { notify, state } = useStore();
  const { go } = useUi();
  const [meeting, setMeeting] = useState(() => readStored('mb-letztes-meeting'));
  const [passcode, setPasscode] = useState('');
  const ids = { meeting: useId(), passcode: useId() };
  const tl = teams?.live;
  const teamsActive = !!tl && tl.state !== 'bereit' && tl.state !== 'fehler';
  // Welche Plattform zeigt die Karte: laufendes Teams-Mitlesen, sonst nach dem eingegebenen Link.
  const platform: 'zoom' | 'teams' = teamsActive || (tl?.state === 'fehler' && !!tl.error) || isTeamsLink(meeting) ? 'teams' : 'zoom';
  const step = platform === 'teams' ? teamsStepOf(tl) : stepOf(regie);
  const zoomConnected = regie?.state === 'verbunden';
  const teamsConnected = tl?.state === 'verbunden';
  const connected = zoomConnected || teamsConnected;
  const busy = regie?.state === 'verbindet' || regie?.state === 'wartet' || tl?.state === 'verbindet';

  const join = (link = meeting, code = passcode, topic?: string) => {
    if (!link.trim()) return;
    setMeeting(link.trim());
    setPasscode(code ?? '');
    try {
      localStorage.setItem('mb-letztes-meeting', link.trim());
    } catch {
      /* optional */
    }
    const problem = blockerFor(link);
    if (problem) {
      notify(problem, 'fehler');
      return;
    }
    if (isTeamsLink(link)) {
      if (!startTeamsLive(link, topic)) notify('Keine Verbindung zum Server.', 'fehler');
    } else if (!openRegie(link, code ?? '')) notify('Das Regie-Fenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.', 'fehler');
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
  function blockerFor(link: string): string | null {
    if (!available)
      return 'Diese Vorschau läuft ohne den Server auf deinem Mac. Ins Meeting geht es nur in der App auf dem Mac (npm start, dann http://localhost:4300).';
    if (isTeamsLink(link)) {
      if (!teams) return 'Verbinde mit dem Server …';
      if (!teams.configured) return 'Microsoft Teams ist noch nicht eingerichtet. Die Schritte stehen oben im Reiter „Aus Microsoft Teams“.';
      if (!teams.connected) return 'Bitte zuerst oben im Reiter „Aus Microsoft Teams“ mit Microsoft anmelden.';
      return null;
    }
    if (!regie) return 'Verbinde mit dem Server …';
    if (!regie.sdkInstalled) return 'Das Zoom Meeting SDK fehlt. Im Terminal „npm install“ ausführen und die App neu starten.';
    if (regie.missing.length)
      return isWeb() ? 'Zoom ist auf dem Server noch nicht eingerichtet. Bitte wende dich an den Support.' : `In .env.local fehlt: ${regie.missing.join(', ')}. Danach die App neu starten.`;
    return null;
  }
  const blocker = blockerFor(meeting);

  const isTeams = isTeamsLink(meeting);
  const steps =
    platform === 'teams' ? (
      <ol className="meet-steps" aria-label="Ablauf">
        <Step n={0} current={step} title="Teams-Link einfügen oder Meeting unten wählen, dann „Chat mitlesen“" />
        <Step n={1} current={step} title="Live-Verbindung wird eingerichtet">
          Tunnel und Benachrichtigung bei Microsoft, dauert bis zu einer halben Minute.
        </Step>
        <Step n={2} current={step} title="Verbunden">
          Neue Nachrichten im Meeting-Chat kommen live an. Du selbst musst im Meeting sein, MeetingBackstage erscheint nicht als Teilnehmer.
        </Step>
      </ol>
    ) : (
      <ol className="meet-steps" aria-label="Ablauf">
        <Step n={0} current={step} title="Link oder Meeting-ID einfügen, dann „Meeting beitreten“" />
        <Step n={1} current={step} title="Regie-Fenster öffnet sich">
          Lass es offen, solange der Workshop läuft. Kamera und Mikrofon nicht erlauben.
        </Step>
        <Step n={2} current={step} title="In Zoom zulassen">
          „{regie?.name ?? 'MeetingBackstage (Regie)'}“ wartet ggf. im Warteraum.
        </Step>
        <Step n={3} current={step} title="Verbunden">
          Chat-Nachrichten an alle kommen live an.
        </Step>
      </ol>
    );
  // Kurzer Stand während des Beitretens (die ausführlichen Schritte stehen hinter dem Fragezeichen)
  const progress =
    platform === 'teams'
      ? tl?.state === 'verbindet'
        ? 'Live-Verbindung zu Teams wird eingerichtet … (bis zu einer halben Minute)'
        : null
      : regie?.state === 'verbindet'
        ? 'Das Regie-Fenster ist offen und tritt dem Meeting bei … Bitte offen lassen.'
        : regie?.state === 'wartet'
          ? `„${regie?.name ?? 'MeetingBackstage (Regie)'}“ wartet im Warteraum – bitte in Zoom zulassen.`
          : null;

  return (
    <div className="view meet">
      <section className={`meet-card${connected ? '' : ' meet-card--slim'}`} aria-labelledby="meet-title">
        <div className="meet-card__head">
          <span className="meet-card__icon" aria-hidden>
            <Video size={20} />
          </span>
          <h1 id="meet-title" className="meet-card__title">
            {connected ? 'Mit dem Meeting verbunden' : 'Per Link verbinden'}
          </h1>
          <InfoTip label="So funktioniert’s" wide>
            <strong className="info-tip__title">So funktioniert’s</strong>
            {platform === 'teams'
              ? 'Bei Microsoft Teams liest MeetingBackstage den Meeting-Chat über dein Konto mit.'
              : `„${regie?.name ?? 'MeetingBackstage (Regie)'}“ tritt deinem Zoom-Meeting als Teilnehmer ohne Kamera und Mikrofon bei und liest den Chat mit.`}
            {steps}
          </InfoTip>
        </div>
        {connected && (
          <p className="meet-card__lead">
            {teamsConnected
              ? `Der Chat von „${tl?.meeting ?? 'Teams-Meeting'}“ wird live mitgelesen. Die Nachrichten kommen jetzt in MeetingBackstage an.`
              : `„${regie?.name}“ ist im Meeting ${regie?.meeting ?? ''}. Der Chat kommt jetzt live in MeetingBackstage an.`}
          </p>
        )}

        {blocker && (
          <p className="callout callout--warn meet-card__note" role="status">
            <CircleAlert size={16} aria-hidden /> {blocker}
          </p>
        )}

        {connected ? (
          <div className="meet-connected">
            <p className="meet-connected__line">
              <span className="meet-live" aria-hidden /> {teamsConnected ? 'Teams · ' : ''}Live seit{' '}
              {(() => {
                const since = teamsConnected ? tl?.since : regie?.since;
                return since ? clock(since, false) : '–';
              })()}{' '}
              Uhr · {(teamsConnected ? tl?.messages : regie?.messages) ?? 0}{' '}
              {(teamsConnected ? tl?.messages : regie?.messages) === 1 ? 'Nachricht' : 'Nachrichten'} empfangen · {state.chat.length} im Chat
            </p>
            <div className="meet-actions">
              <Button variant="primary" size="lg" icon={ArrowRight} onClick={() => go('grafiken', { graphicTab: 'uebersicht' })}>
                Zu den Live Grafiken
              </Button>
              <Button size="lg" icon={MonitorPlay} onClick={() => go('ausgabe')}>
                OBS-Ausgabe
              </Button>
              <Button size="lg" icon={MonitorUp} onClick={() => openPresentationWindow(window.location.origin)} title="Fenster zum Teilen in Zoom oder Teams (ohne OBS)">
                Präsentationsfenster
              </Button>
              {teamsConnected ? (
                <Button variant="ghost" icon={LogOut} onClick={stopTeamsLive}>
                  Mitlesen beenden
                </Button>
              ) : (
                <Button variant="ghost" icon={LogOut} onClick={leaveRegie}>
                  Meeting verlassen
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form
            className={`meet-form${isTeams ? ' meet-form--teams' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              join(meeting, isTeams ? '' : passcode);
            }}
          >
            <div className="meet-form__field meet-form__field--link">
              <label htmlFor={ids.meeting} className="meet-form__label">
                {isWeb() ? 'Zoom-Link oder Meeting-ID' : 'Link oder Meeting-ID'}
              </label>
              <div className="meet-form__row">
                <input
                  id={ids.meeting}
                  className="input meet-form__input"
                  value={meeting}
                  onChange={(e) => setMeeting(e.target.value)}
                  placeholder={isWeb() ? 'https://zoom.us/j/… oder 812 3456 7890' : 'https://zoom.us/j/…, 812 3456 7890 oder Teams-Link'}
                  autoComplete="off"
                  disabled={!!blocker || busy}
                />
                <Button type="button" variant="ghost" icon={Clipboard} onClick={paste} disabled={!!blocker || busy} title="Aus der Zwischenablage einfügen">
                  <span className="meet-form__paste">Einfügen</span>
                </Button>
              </div>
            </div>
            {!isTeams && (
              <div className="meet-form__field meet-form__field--code">
                <span className="meet-form__label">
                  <label htmlFor={ids.passcode}>Kenncode</label> <span className="meet-form__optional">optional</span>
                  <InfoTip label="Wann brauche ich einen Kenncode?" align="end">
                    <strong className="info-tip__title">Kenncode (Meeting-Passwort)</strong>
                    Nur nötig, wenn für das Meeting in Zoom ein Kenncode hinterlegt ist. Steht er schon im Link (… ?pwd=…), musst du hier nichts
                    eintragen. Du findest ihn in Zoom unter den Meeting-Informationen.
                  </InfoTip>
                </span>
                <input
                  id={ids.passcode}
                  className="input meet-form__input"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="z. B. 4711"
                  autoComplete="off"
                  disabled={!!blocker || busy}
                />
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="meet-form__submit"
              icon={busy ? LoaderCircle : ArrowRight}
              disabled={!meeting.trim() || !!blocker || busy}
            >
              {busy ? (platform === 'teams' ? 'Wird eingerichtet …' : 'Regie tritt bei …') : platform === 'teams' ? 'Chat mitlesen' : 'Meeting beitreten'}
            </Button>
          </form>
        )}

        {progress && (
          <p className="meet-progress" role="status">
            <LoaderCircle size={15} className="spin" aria-hidden /> {progress}
          </p>
        )}
        {platform === 'zoom' && regie?.state === 'fehler' && regie.error && (
          <p className="callout callout--danger meet-card__note" role="alert">
            <CircleAlert size={16} aria-hidden /> {regie.error}
          </p>
        )}
        {platform === 'teams' && tl?.state === 'fehler' && tl.error && (
          <p className="callout callout--danger meet-card__note" role="alert">
            <CircleAlert size={16} aria-hidden /> {tl.error}
          </p>
        )}
      </section>

      {!connected && (
        <MeetingLists
          currentLink={meeting}
          disabled={!available || busy}
          onJoin={(link, code, topic) => join(link, code, topic)}
          onUse={(link, code) => {
            setMeeting(link);
            if (code) setPasscode(code);
            document.getElementById(ids.meeting)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      )}

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
