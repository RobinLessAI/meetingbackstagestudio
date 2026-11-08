import { useId, useState, type ReactNode } from 'react';
import { CircleCheck, CircleDashed, Copy, FolderSearch, LogOut, MonitorPlay, Radio, TriangleAlert } from 'lucide-react';
import { clock } from '../lib/time.ts';
import { useStore } from '../state/store.tsx';
import { useSync, type RegieStatus } from '../sync/SyncProvider.tsx';
import { Badge, Button, DemoTag, Field, Panel, Switch } from './ui.tsx';

export function regieLabel(r: RegieStatus | null, available: boolean): { text: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  if (!available || !r) return { text: 'Live-Chat nicht verfügbar (Vorschau ohne Server)', tone: 'neutral' };
  if (!r.configured) return { text: 'Live-Chat nicht eingerichtet', tone: 'warn' };
  switch (r.state) {
    case 'verbunden':
      return { text: `Live aus Zoom · ${r.messages} Nachrichten`, tone: 'ok' };
    case 'verbindet':
      return { text: 'Regie tritt bei …', tone: 'warn' };
    case 'wartet':
      return { text: 'Regie im Warteraum: in Zoom zulassen', tone: 'warn' };
    case 'fehler':
      return { text: 'Live-Chat: Fehler', tone: 'danger' };
    default:
      return { text: 'Regie nicht im Meeting', tone: 'neutral' };
  }
}

/** Kleine Statusanzeige für Chat und Kopfzeile. */
export function LiveChatBadge() {
  const { regie, available } = useSync();
  const l = regieLabel(regie, available);
  return (
    <Badge tone={l.tone} icon={l.tone === 'ok' ? Radio : l.tone === 'danger' ? TriangleAlert : CircleDashed} title={regie?.error ?? undefined}>
      {l.text}
    </Badge>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const ENV_TEMPLATE = `ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=`;

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

/** Meeting-Link eingeben und das Regie-Fenster öffnen, das dem Meeting beitritt. */
export function RegieStart({ compact = false }: { compact?: boolean }) {
  const { regie, available, openRegie, leaveRegie } = useSync();
  const { notify } = useStore();
  const [meeting, setMeeting] = useState(() => readStored('mb-letztes-meeting'));
  const [passcode, setPasscode] = useState('');
  const ids = { meeting: useId(), passcode: useId() };
  if (!available || !regie) return null;
  const inMeeting = regie.state === 'verbunden' || regie.state === 'wartet' || regie.state === 'verbindet';

  const open = () => {
    try {
      localStorage.setItem('mb-letztes-meeting', meeting);
    } catch {
      /* optional */
    }
    if (!openRegie(meeting, passcode)) notify('Das Regie-Fenster wurde blockiert. Bitte Pop-ups für localhost erlauben.', 'fehler');
  };

  if (!regie.configured) {
    return (
      <p className="callout callout--warn">
        <TriangleAlert size={16} aria-hidden />{' '}
        {!regie.sdkInstalled ? (
          <>
            Das Zoom Meeting SDK fehlt. Im Terminal <code>npm install</code> ausführen und die App neu starten.
          </>
        ) : (
          <>
            In <code>.env.local</code> fehlt: {regie.missing.join(', ')}. Danach die App neu starten.
          </>
        )}
      </p>
    );
  }

  return (
    <div className={`meeting-start${compact ? ' meeting-start--compact' : ''}`}>
      <div className="stack">
        {inMeeting ? (
          <>
            <p className="row">
              <CircleCheck size={16} className="is-ok" aria-hidden />
              {regie.state === 'verbunden'
                ? `„${regie.name}“ ist in Meeting ${regie.meeting ?? ''}${regie.since ? ` seit ${clock(regie.since, false)} Uhr` : ''}`
                : regie.state === 'wartet'
                  ? `„${regie.name}“ wartet im Warteraum. Lass die Regie in Zoom zu.`
                  : `„${regie.name}“ tritt Meeting ${regie.meeting ?? ''} bei …`}
            </p>
            <div className="row">
              <Button icon={LogOut} onClick={leaveRegie}>
                Regie verlassen
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field
              label="Meeting-Link oder Meeting-ID"
              htmlFor={ids.meeting}
              hint="Ein Meeting deines eigenen Zoom-Kontos, das bereits läuft."
            >
              <input
                id={ids.meeting}
                className="input"
                value={meeting}
                onChange={(e) => setMeeting(e.target.value)}
                placeholder="https://zoom.us/j/123456789?pwd=… oder 123 456 789"
              />
            </Field>
            {!compact && (
              <Field label="Kenncode (nur falls nötig)" htmlFor={ids.passcode} hint="Wenn Zoom den Beitritt wegen des Kenncodes ablehnt.">
                <input id={ids.passcode} className="input" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="off" />
              </Field>
            )}
            <div className="row">
              <Button variant="primary" icon={MonitorPlay} disabled={!meeting.trim()} onClick={open}>
                Regie beitreten
              </Button>
            </div>
          </>
        )}
        {regie.state === 'fehler' && regie.error && (
          <p className="callout callout--danger" role="alert">
            <TriangleAlert size={16} aria-hidden /> {regie.error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Einrichtung und Status des Live-Chats aus Zoom (Regie-Fenster über das Meeting SDK). */
export function ZoomLiveChatSetup() {
  const { regie, available, watch, startWatch, stopWatch, lastImport } = useSync();
  const { notify } = useStore();
  const [folder, setFolder] = useState('');
  const folderId = useId();
  const l = regieLabel(regie, available);
  const step = (done: boolean, text: ReactNode) => (
    <li className={`setup-step${done ? ' is-done' : ''}`}>
      {done ? <CircleCheck size={16} aria-hidden /> : <CircleDashed size={16} aria-hidden />}
      <span>{text}</span>
    </li>
  );

  return (
    <Panel eyebrow="Zoom · Meeting SDK" title="Live-Chat aus Zoom" actions={<Badge tone={l.tone}>{l.text}</Badge>} className="zoom-setup">
      <div className="zoom-setup__grid">
        <div className="stack">
          <p className="muted">
            Ein eigenes Regie-Fenster tritt deinem Meeting als sichtbarer Teilnehmer „{regie?.name ?? 'MeetingBackstage (Regie)'}“ bei, ohne Kamera und
            Mikrofon. Jede Chat-Nachricht an alle geht sofort an Weltkarte, Umfrage und Wortwolke. Kostenfrei, ohne Realtime Media Streams.
          </p>
          <ol className="setup-steps">
            {step(available, 'MeetingBackstage Studio mit „npm start“ auf dem Rechner mit Zoom und OBS starten')}
            {step(!!regie?.sdkInstalled, (
              <>
                Zoom Meeting SDK installiert <span className="subtle">(kommt mit „npm install“)</span>
              </>
            ))}
            {step(!!regie && regie.missing.length === 0, (
              <>
                Client-ID und Client-Geheimnis der Zoom-App (mit eingeschaltetem Meeting SDK) in <code>.env.local</code>
                {regie && regie.missing.length > 0 && <span className="subtle"> (fehlt: {regie.missing.join(', ')})</span>}
              </>
            ))}
            {step(regie?.state === 'verbunden', 'Meeting starten, Link einfügen, „Regie beitreten“ und die Regie in Zoom zulassen')}
          </ol>
          <div className="env-template">
            <div className="row row--between">
              <span className="field-label">Vorlage für .env.local</span>
              <Button
                size="sm"
                variant="ghost"
                icon={Copy}
                onClick={async () => notify((await copyText(ENV_TEMPLATE)) ? 'Vorlage kopiert' : 'Kopieren nicht möglich, bitte markieren', 'info', false)}
              >
                Kopieren
              </Button>
            </div>
            <pre>{ENV_TEMPLATE}</pre>
            <p className="field-hint">Die Werte stehen in deiner Zoom-App im Marketplace. Nicht in Chats oder E-Mails weitergeben.</p>
          </div>
          {regie?.appVersion && (
            <p className="subtle mono version-line">
              Version {regie.appVersion}
              {regie.sdkVersion ? ` · Zoom SDK ${regie.sdkVersion}` : ''}
            </p>
          )}
        </div>
        <div className="stack">
          <h3 className="eyebrow">Regie für ein Meeting</h3>
          <RegieStart />
          <div className="divider" />
          <h3 className="eyebrow">Notlösung: Chat-Export</h3>
          <p className="muted">
            Ohne Regie im Meeting: Klicke im Zoom-Chat auf „Chat speichern“. MeetingBackstage übernimmt dann neue Nachrichten aus dem Zoom-Ordner,
            jeweils nach dem Speichern.
          </p>
          <label htmlFor={folderId} className="field-label">
            Zoom-Ordner
          </label>
          <input
            id={folderId}
            className="input"
            placeholder={watch.suggested ?? '~/Documents/Zoom'}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            disabled={!available}
          />
          <Switch
            checked={watch.active}
            disabled={!available}
            onChange={(on) => (on ? startWatch(folder || undefined) : stopWatch())}
            label={
              <>
                <FolderSearch size={14} aria-hidden /> Zoom-Ordner beobachten
              </>
            }
            description={
              watch.active
                ? `Aktiv: ${watch.folder}${lastImport ? ` · zuletzt ${clock(lastImport.at, false)} Uhr, ${lastImport.added} neu` : ''}`
                : watch.error ?? 'Aus'
            }
          />
          {!available && <DemoTag>Nur mit lokalem Server</DemoTag>}
        </div>
      </div>
    </Panel>
  );
}
