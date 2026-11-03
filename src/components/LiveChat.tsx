import { useId, useState, type ReactNode } from 'react';
import { CircleCheck, CircleDashed, Copy, FolderSearch, Radio, TriangleAlert } from 'lucide-react';
import { clock } from '../lib/time.ts';
import { useStore } from '../state/store.tsx';
import { useSync, type RtmsStatus } from '../sync/SyncProvider.tsx';
import { Badge, Button, DemoTag, Panel, Switch } from './ui.tsx';

export function rtmsLabel(r: RtmsStatus | null, available: boolean): { text: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  if (!available || !r) return { text: 'Live-Chat nicht verfügbar (Vorschau ohne Server)', tone: 'neutral' };
  switch (r.state) {
    case 'verbunden':
      return { text: `Live aus Zoom · ${r.messages} Nachrichten`, tone: 'ok' };
    case 'verbindet':
      return { text: 'Verbinde mit Zoom …', tone: 'warn' };
    case 'bereit':
      return r.configured ? { text: 'Wartet auf Zoom-Meeting', tone: 'neutral' } : { text: 'Live-Chat nicht eingerichtet', tone: 'warn' };
    case 'fehler':
      return { text: 'Live-Chat: Fehler', tone: 'danger' };
    default:
      return { text: 'Live-Chat nicht eingerichtet', tone: 'warn' };
  }
}

/** Kleine Statusanzeige für Chat und Kopfzeile. */
export function LiveChatBadge() {
  const { rtms, available } = useSync();
  const l = rtmsLabel(rtms, available);
  return (
    <Badge tone={l.tone} icon={l.tone === 'ok' ? Radio : l.tone === 'danger' ? TriangleAlert : CircleDashed} title={rtms?.error ?? undefined}>
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
ZOOM_CLIENT_SECRET=
ZOOM_WEBHOOK_SECRET_TOKEN=`;

/** Einrichtung und Status des Live-Chats aus Zoom (Realtime Media Streams). */
export function ZoomLiveChatSetup() {
  const { rtms, available, watch, startWatch, stopWatch, lastImport } = useSync();
  const { notify } = useStore();
  const [folder, setFolder] = useState('');
  const folderId = useId();
  const l = rtmsLabel(rtms, available);
  const step = (done: boolean, text: ReactNode) => (
    <li className={`setup-step${done ? ' is-done' : ''}`}>
      {done ? <CircleCheck size={16} aria-hidden /> : <CircleDashed size={16} aria-hidden />}
      <span>{text}</span>
    </li>
  );

  return (
    <Panel
      eyebrow="Zoom · Realtime Media Streams"
      title="Live-Chat aus Zoom"
      actions={<Badge tone={l.tone}>{l.text}</Badge>}
      className="zoom-setup"
    >
      <div className="zoom-setup__grid">
        <div className="stack">
          <p className="muted">
            Der lokale Server empfängt den Chat deines laufenden Zoom-Meetings und gibt jede Nachricht sofort an Weltkarte, Umfrage und
            Wortwolke weiter. Spotlight und Stummschalten werden dabei nicht gesteuert.
          </p>
          {rtms?.error && (
            <p className="callout callout--danger" role="alert">
              <TriangleAlert size={16} aria-hidden /> {rtms.error}
            </p>
          )}
          {rtms?.state === 'verbunden' && (
            <p className="callout callout--accent">
              <Radio size={16} aria-hidden /> Verbunden seit {rtms.since ? clock(rtms.since, false) : '–'} Uhr · {rtms.messages} Nachrichten empfangen
            </p>
          )}
          <ol className="setup-steps">
            {step(available, 'MeetingBackstage Studio mit „npm start“ auf dem Rechner mit Zoom und OBS starten')}
            {step(!!rtms?.configured, (
              <>
                Zugangsdaten der Zoom-App in <code>.env.local</code> eintragen
                {rtms && !rtms.configured && rtms.missing.length > 0 && <span className="subtle"> (fehlt: {rtms.missing.join(', ')})</span>}
              </>
            ))}
            {step(!!rtms?.lastWebhookAt, (
              <>
                Tunnel starten und in der Zoom-App als Webhook-Adresse <code>https://…/zoom/webhook</code> eintragen
                {rtms?.lastWebhookAt && <span className="subtle"> (zuletzt erreicht {clock(rtms.lastWebhookAt, false)} Uhr)</span>}
              </>
            ))}
            {step(rtms?.state === 'verbunden', 'Meeting starten; der Chat erscheint dann automatisch hier')}
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
        </div>
        <div className="stack">
          <h3 className="eyebrow">Notlösung ohne RTMS</h3>
          <p className="muted">
            Falls RTMS für dein Konto noch nicht freigeschaltet ist: Klicke im Zoom-Chat auf „Chat speichern“. MeetingBackstage übernimmt dann neue
            Nachrichten aus dem Zoom-Ordner. Das ist nicht live, sondern jeweils nach dem Speichern.
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
