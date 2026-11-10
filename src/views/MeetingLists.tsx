import { useEffect, useId, useState } from 'react';
import {
  Bookmark,
  BookmarkPlus,
  Check,
  ExternalLink,
  LogIn,
  MessageSquareText,
  Play,
  RefreshCw,
  Repeat,
  Trash2,
  Unplug,
  Users,
  X,
} from 'lucide-react';
import { openInZoomApp } from '../lib/zoomLink.ts';
import { isTeamsLink, teamsAppUrl, teamsThreadId } from '../lib/teamsLink.ts';
import { Badge, Button, Segmented } from '../components/ui.tsx';
import { filterMeetings, type MeetingFilter } from './meetingFilter.ts';
import { CategoryChips, CategoryFilter, CategoryPicker, matchesCategory, useCategories } from './meetingCategories.tsx';
import { useStore } from '../state/store.tsx';
import { useSync, type StyleTemplate, type ZoomMeeting, type ZoomMeetingsState } from '../sync/SyncProvider.tsx';

/** Gespeicherte Veranstaltung: Name, Zoom-Link, optional Kenncode. */
interface SavedMeetingData {
  link: string;
  passcode?: string;
}

const idFromLink = (link: string) => (isTeamsLink(link) ? (teamsThreadId(link) ?? link) : zoomIdFromLink(link));
const zoomIdFromLink = (link: string) => link.match(/\/(?:j|w|s|wc\/join|wc)\/(\d{9,12})/)?.[1] ?? link.replace(/\D/g, '').slice(0, 12);
const formatId = (id: string) => id.replace(/^(\d{3})(\d{3,4})(\d{3,4})$/, '$1 $2 $3');

function when(m: ZoomMeeting): string {
  if (m.type === 'pmi') return 'Immer verfügbar';
  if (m.type === 3) return 'Wiederkehrend, ohne feste Zeit';
  if (!m.start) return 'Ohne Termin';
  const d = new Date(m.start);
  const text = d.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return m.type === 8 ? `Wiederkehrend · nächster Termin ${text}` : text;
}

/** Tabs „Gespeichert“ und „Aus meinem Zoom-Konto“ unter dem Eingabefeld. */
type JoinFn = (link: string, passcode?: string, topic?: string) => void;
type ListTab = 'zoom' | 'teams' | 'gespeichert';

/** Beschriftung des Beitreten-Knopfs je nach Plattform. */
function JoinButton({
  link,
  onJoin,
  passcode,
  topic,
  disabled,
}: {
  link: string;
  onJoin: JoinFn;
  passcode?: string;
  topic?: string;
  disabled: boolean;
}) {
  const teams = isTeamsLink(link);
  return (
    <Button
      size="sm"
      variant="primary"
      icon={teams ? MessageSquareText : LogIn}
      disabled={disabled}
      onClick={() => onJoin(link, passcode, topic)}
      title={teams ? 'Den Chat dieses Teams-Meetings live mitlesen' : '„MeetingBackstage (Regie)“ tritt bei und liest den Chat mit'}
    >
      {teams ? 'Chat mitlesen' : 'Beitreten'}
    </Button>
  );
}

export function MeetingLists({
  onJoin,
  onUse,
  currentLink,
  disabled,
}: {
  onJoin: JoinFn;
  /** Link nur ins Feld übernehmen. */
  onUse: (link: string, passcode?: string) => void;
  currentLink: string;
  disabled: boolean;
}) {
  const [tab, setTabState] = useState<ListTab>(() => {
    try {
      const t = localStorage.getItem('mb-meeting-tab');
      return t === 'teams' || t === 'gespeichert' ? t : 'zoom';
    } catch {
      return 'zoom';
    }
  });
  const setTab = (t: ListTab) => {
    setTabState(t);
    try {
      localStorage.setItem('mb-meeting-tab', t);
    } catch {
      /* nur Komfort */
    }
  };
  return (
    <section className="meet-lists" aria-label="Meine Meetings">
      <div className="tabs meet-lists__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'zoom'}
          className={`tab${tab === 'zoom' ? ' is-active' : ''}`}
          onClick={() => setTab('zoom')}
        >
          <Repeat size={15} aria-hidden /> Aus meinem Zoom-Konto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'teams'}
          className={`tab${tab === 'teams' ? ' is-active' : ''}`}
          onClick={() => setTab('teams')}
        >
          <Users size={15} aria-hidden /> Aus Microsoft Teams
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gespeichert'}
          className={`tab${tab === 'gespeichert' ? ' is-active' : ''}`}
          onClick={() => setTab('gespeichert')}
        >
          <Bookmark size={15} aria-hidden /> Meine Veranstaltungen
        </button>
      </div>
      {tab === 'zoom' ? (
        <ZoomMeetings onJoin={onJoin} disabled={disabled} />
      ) : tab === 'teams' ? (
        <TeamsMeetings onJoin={onJoin} disabled={disabled} />
      ) : (
        <SavedMeetings onJoin={onJoin} onUse={onUse} currentLink={currentLink} disabled={disabled} />
      )}
    </section>
  );
}

/** Öffnet das Meeting in der Zoom- bzw. Teams-App; als Gastgeber startet es damit. */
function StartButton({ link }: { link: string }) {
  const { notify } = useStore();
  const teams = isTeamsLink(link);
  const start = () => {
    if (teams) {
      const url = teamsAppUrl(link);
      if (!url) return notify('Dieser Teams-Link lässt sich nicht öffnen.', 'fehler');
      const a = document.createElement('a');
      a.href = url;
      a.click();
      notify('Teams wird geöffnet. Tritt dort dem Meeting bei und klicke hier auf „Chat mitlesen“.', 'info');
      return;
    }
    if (openInZoomApp(link))
      notify('Zoom-App wird geöffnet. Sobald das Meeting läuft, hier auf „Beitreten“ klicken, damit die Regie den Chat mitliest.', 'info');
    else notify('In diesem Link wurde keine Meeting-ID gefunden.', 'fehler');
  };
  return (
    <Button
      size="sm"
      icon={Play}
      title={teams ? 'In deiner Teams-App öffnen' : 'In deiner Zoom-App öffnen. Bist du dort als Gastgeber angemeldet, startet das Meeting.'}
      onClick={start}
    >
      Starten
    </Button>
  );
}

function useSaveMeeting() {
  const { templates, saveTemplates } = useSync();
  const { notify } = useStore();
  return (name: string, data: SavedMeetingData) => {
    const n = name.trim();
    const existing = templates.find((t) => t.kind === 'meeting' && t.name.toLowerCase() === n.toLowerCase());
    const entry: StyleTemplate = {
      id: existing?.id ?? `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: n,
      kind: 'meeting',
      data: { link: data.link.trim(), ...(data.passcode?.trim() ? { passcode: data.passcode.trim() } : {}) },
      at: Date.now(),
    };
    saveTemplates([...templates.filter((t) => t.id !== entry.id), entry]);
    notify(existing ? `„${n}“ aktualisiert` : `„${n}“ gespeichert`, 'erfolg');
  };
}

function SavedMeetings({
  onJoin,
  onUse,
  currentLink,
  disabled,
}: {
  onJoin: JoinFn;
  onUse: (l: string, p?: string) => void;
  currentLink: string;
  disabled: boolean;
}) {
  const { templates, saveTemplates } = useSync();
  const save = useSaveMeeting();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const ids = { name: useId(), link: useId(), pass: useId() };
  const cats = useCategories();
  const [catFilter, setCatFilter] = useState('');
  const all = templates.filter((t) => t.kind === 'meeting').sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const list = all.filter((t) => matchesCategory(cats.of(idFromLink((t.data as unknown as SavedMeetingData).link)), catFilter));

  return (
    <div className="meet-list">
      <CategoryFilter value={catFilter} onChange={setCatFilter} />
      {list.length === 0 && !adding && (
        <p className="subtle meet-list__empty">
          Noch keine Veranstaltungen gespeichert. Lege deine regelmäßigen Workshops mit Zoom-Link an, dann reicht später ein Klick.
        </p>
      )}
      <ul className="meet-items">
        {list.map((t) => {
          const d = t.data as unknown as SavedMeetingData;
          return (
            <li key={t.id} className="meet-item">
              <div className="meet-item__main">
                <strong>
                  {t.name} <CategoryChips meetingId={idFromLink(d.link)} />
                </strong>
                <span className="subtle mono">
                  {isTeamsLink(d.link) ? 'Microsoft Teams' : `ID ${formatId(idFromLink(d.link))}`}
                  {d.passcode ? ' · mit Kenncode' : ''}
                </span>
              </div>
              <div className="meet-item__actions">
                <StartButton link={d.link} />
                <JoinButton link={d.link} passcode={d.passcode} topic={t.name} onJoin={onJoin} disabled={disabled} />
                <Button size="sm" variant="ghost" onClick={() => onUse(d.link, d.passcode)} title="Nur ins Feld oben übernehmen">
                  Übernehmen
                </Button>
                <CategoryPicker meetingId={idFromLink(d.link)} />
                {confirmDelete === t.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={Check}
                      onClick={() => {
                        saveTemplates(templates.filter((x) => x.id !== t.id));
                        setConfirmDelete(null);
                      }}
                    >
                      Löschen
                    </Button>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => setConfirmDelete(null)} aria-label="Nicht löschen" />
                  </>
                ) : (
                  <button
                    type="button"
                    className="tpl__icon meet-item__del"
                    aria-label={`„${t.name}“ löschen`}
                    title="Löschen"
                    onClick={() => setConfirmDelete(t.id)}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {adding ? (
        <form
          className="meet-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !link.trim()) return;
            save(name, { link, passcode });
            setAdding(false);
            setName('');
            setLink('');
            setPasscode('');
          }}
        >
          <label htmlFor={ids.name} className="field-label">
            Name der Veranstaltung
          </label>
          <input
            id={ids.name}
            className="input"
            value={name}
            maxLength={60}
            autoFocus
            placeholder="z. B. Montagsworkshop Team Nord"
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor={ids.link} className="field-label">
            Zoom- oder Teams-Link
          </label>
          <input
            id={ids.link}
            className="input"
            value={link}
            placeholder="https://zoom.us/j/… oder https://teams.microsoft.com/l/meetup-join/…"
            onChange={(e) => setLink(e.target.value)}
          />
          <label htmlFor={ids.pass} className="field-label">
            Kenncode (optional)
          </label>
          <input id={ids.pass} className="input" value={passcode} autoComplete="off" onChange={(e) => setPasscode(e.target.value)} />
          <div className="row">
            <Button type="submit" variant="primary" disabled={!name.trim() || !link.trim()}>
              Speichern
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      ) : (
        <Button
          icon={BookmarkPlus}
          onClick={() => {
            setLink(currentLink);
            setAdding(true);
          }}
        >
          Veranstaltung mit Link speichern
        </Button>
      )}
    </div>
  );
}

function ZoomMeetings({ onJoin, disabled }: { onJoin: JoinFn; disabled: boolean }) {
  const { regie, available, zoomMeetings, loadZoomMeetings, requestAuthUrl, connectZoom, disconnectZoom } = useSync();
  const { notify } = useStore();
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const pasteId = useId();
  const account = regie?.account;
  const connected = !!account?.connected;

  // Beim ersten Öffnen automatisch laden
  useEffect(() => {
    if (connected && !zoomMeetings.at && !zoomMeetings.loading) loadZoomMeetings();
  }, [connected, zoomMeetings.at, zoomMeetings.loading, loadZoomMeetings]);

  if (!available) return <p className="subtle meet-list__empty">Nur in der App auf dem Mac verfügbar.</p>;

  if (!account?.redirectConfigured) {
    return (
      <div className="meet-list">
        <p className="callout callout--warn">Für diese Liste muss MeetingBackstage dein Zoom-Konto lesen dürfen. Einmalig einrichten:</p>
        <ol className="program-steps">
          <li>
            Im Zoom Marketplace in deiner App unter <strong>Scopes</strong> „meeting:read:list_meetings“ und „user:read:user“ hinzufügen.
          </li>
          <li>
            In <code>.env.local</code> die Zeile <code>ZOOM_REDIRECT_URI=…</code> eintragen: dieselbe Adresse wie „OAuth Redirect URL“ in der
            Zoom-App.
          </li>
          <li>Die App neu starten (ctrl + C, dann npm start).</li>
        </ol>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="meet-list">
        <p className="muted">Einmalig dein Zoom-Konto verbinden. Danach erscheinen hier deine geplanten und wiederkehrenden Meetings.</p>
        <p className="field-hint">
          Vorher im Zoom Marketplace in deiner App unter <strong>Scopes</strong> „meeting:read:list_meetings“ und „user:read:user“ hinzufügen.
        </p>
        <ol className="program-steps">
          <li>
            <Button
              size="sm"
              icon={ExternalLink}
              onClick={async () => {
                const url = await requestAuthUrl();
                if (url) window.open(url, '_blank', 'noopener');
                else notify('Die Zoom-Freigabe ließ sich nicht öffnen.', 'fehler');
              }}
            >
              Bei Zoom erlauben
            </Button>
          </li>
          <li>Nach „Erlauben“ die komplette Adresse aus der Adresszeile des Browsers kopieren (sie enthält „?code=“) und hier einfügen:</li>
        </ol>
        <form
          className="meet-form__row"
          style={{ width: '100%' }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await connectZoom(pasted);
            setBusy(false);
            notify(r.message, r.ok ? 'erfolg' : 'fehler');
            if (r.ok) {
              setPasted('');
              loadZoomMeetings();
            }
          }}
        >
          <label htmlFor={pasteId} className="sr-only">
            Adresse nach dem Erlauben
          </label>
          <input
            id={pasteId}
            className="input"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="https://…?code=…"
            style={{ flex: 1 }}
          />
          <Button type="submit" variant="primary" loading={busy} disabled={!pasted.trim() || busy}>
            Verbinden
          </Button>
        </form>
      </div>
    );
  }

  return (
    <AccountList
      data={zoomMeetings}
      reload={loadZoomMeetings}
      disconnect={disconnectZoom}
      disconnectLabel="Zoom-Konto trennen"
      onJoin={onJoin}
      disabled={disabled}
    />
  );
}

/** Liste der Meetings aus einem verbundenen Konto (Zoom oder Teams) mit Filter und Kategorien. */
function AccountList({
  data,
  reload,
  disconnect,
  disconnectLabel,
  accountLabel,
  onJoin,
  disabled,
}: {
  data: ZoomMeetingsState;
  reload: () => void;
  disconnect: () => void;
  disconnectLabel: string;
  accountLabel?: string;
  onJoin: JoinFn;
  disabled: boolean;
}) {
  const save = useSaveMeeting();
  const searchId = useId();
  const [filter, setFilterState] = useState<MeetingFilter>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('mb-meeting-filter') ?? '{}') as Partial<MeetingFilter>;
      return { art: 'alle', zeitraum: 'ab-heute', sortierung: 'datum-auf', ...saved, suche: '' };
    } catch {
      return { art: 'alle', zeitraum: 'ab-heute', sortierung: 'datum-auf', suche: '' };
    }
  });
  const setFilter = (patch: Partial<MeetingFilter>) => {
    setFilterState((f) => {
      const next = { ...f, ...patch };
      try {
        localStorage.setItem('mb-meeting-filter', JSON.stringify({ ...next, suche: '' }));
      } catch {
        /* nur Komfort */
      }
      return next;
    });
  };
  const cats = useCategories();
  const [catFilter, setCatFilter] = useState('');
  const shown = filterMeetings(data.meetings, filter).filter((m) => matchesCategory(cats.of(m.id), catFilter));

  return (
    <div className="meet-list">
      <div className="row meet-list__bar">
        <Button size="sm" icon={RefreshCw} loading={data.loading} onClick={reload}>
          Aktualisieren
        </Button>
        <Button size="sm" variant="ghost" icon={Unplug} onClick={disconnect}>
          {disconnectLabel}
        </Button>
        {accountLabel && <span className="subtle meet-list__account">{accountLabel}</span>}
      </div>
      {data.error && <p className="callout callout--danger">{data.error}</p>}
      {data.meetings.length > 0 && (
        <div className="meet-filter">
          <Segmented<MeetingFilter['art']>
            label="Art"
            size="sm"
            value={filter.art}
            onChange={(art) => setFilter({ art })}
            options={[
              { value: 'alle', label: 'Alle' },
              { value: 'wiederkehrend', label: 'Wiederkehrend' },
              { value: 'einmalig', label: 'Einmalig' },
            ]}
          />
          <Segmented<MeetingFilter['zeitraum']>
            label="Zeitraum"
            size="sm"
            value={filter.zeitraum}
            onChange={(zeitraum) => setFilter({ zeitraum })}
            options={[
              { value: 'heute', label: 'Heute' },
              { value: 'woche', label: '7 Tage' },
              { value: 'monat', label: '30 Tage' },
              { value: 'ab-heute', label: 'Ab heute' },
              { value: 'alle', label: 'Auch vergangene' },
            ]}
          />
          <Segmented<MeetingFilter['sortierung']>
            label="Sortierung"
            size="sm"
            value={filter.sortierung}
            onChange={(sortierung) => setFilter({ sortierung })}
            options={[
              { value: 'datum-auf', label: 'Nächste zuerst' },
              { value: 'datum-ab', label: 'Späteste zuerst' },
              { value: 'name', label: 'Name A–Z' },
            ]}
          />
          <CategoryFilter value={catFilter} onChange={setCatFilter} />
          <div className="meet-filter__search">
            <label htmlFor={searchId} className="field-label">
              Suche
            </label>
            <input
              id={searchId}
              className="input input--sm"
              type="search"
              value={filter.suche}
              placeholder="Name oder Meeting-ID"
              onChange={(e) => setFilter({ suche: e.target.value })}
            />
          </div>
        </div>
      )}
      {!data.loading && data.at && !data.error && (
        <p className="subtle meet-list__empty">
          {data.meetings.length === 0 ? 'Keine geplanten Meetings gefunden.' : `${shown.length} von ${data.meetings.length} Meetings`}
          {data.meetings.length > 0 && shown.length === 0 && ' – kein Meeting passt zum Filter.'}
        </p>
      )}
      <ul className="meet-items">
        {shown.map((m) => (
          <li key={`${m.type}-${m.id}`} className="meet-item">
            <div className="meet-item__main">
              <strong>
                {m.topic} {m.recurring && <Badge tone="info">wiederkehrend</Badge>} <CategoryChips meetingId={m.id} />
              </strong>
              <span className="subtle">
                {when(m)}
                {m.platform === 'teams' ? '' : ` · ID ${formatId(m.id)}`}
              </span>
            </div>
            <div className="meet-item__actions">
              <StartButton link={m.link} />
              <JoinButton link={m.link} topic={m.topic} onJoin={onJoin} disabled={disabled} />
              <CategoryPicker meetingId={m.id} />
              <Button
                size="sm"
                variant="ghost"
                icon={BookmarkPlus}
                onClick={() => save(m.topic, { link: m.link })}
                title="Unter „Meine Veranstaltungen“ speichern"
              >
                Speichern
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Teams-Besprechungen aus dem eigenen Microsoft-Kalender. */
function TeamsMeetings({ onJoin, disabled }: { onJoin: JoinFn; disabled: boolean }) {
  const { teams, available, teamsMeetings, loadTeamsMeetings, disconnectTeams } = useSync();
  const connected = !!teams?.connected;

  useEffect(() => {
    if (connected && !teamsMeetings.at && !teamsMeetings.loading) loadTeamsMeetings();
  }, [connected, teamsMeetings.at, teamsMeetings.loading, loadTeamsMeetings]);

  if (!available || !teams) return <p className="subtle meet-list__empty">Nur in der App auf dem Mac verfügbar.</p>;

  if (!teams.configured) {
    return (
      <div className="meet-list">
        <p className="callout callout--warn">
          Für Teams braucht MeetingBackstage einmalig eine eigene App-Registrierung in deinem Microsoft-Konto (kostenlos).
        </p>
        <ol className="program-steps">
          <li>
            Auf <strong>entra.microsoft.com</strong> mit deinem Vereinskonto anmelden: <strong>App-Registrierungen</strong> →{' '}
            <strong>Neue Registrierung</strong>. Name „MeetingBackstage“, Kontotyp „Nur Konten in diesem Organisationsverzeichnis“.
          </li>
          <li>
            Umleitungs-URI: Plattform <strong>Öffentlicher Client/nativ (mobil und Desktop)</strong>, Adresse <code>{teams.redirectUri}</code>.
          </li>
          <li>
            Unter <strong>Authentifizierung</strong> „Öffentliche Clientflows zulassen“ auf <strong>Ja</strong>. Unter{' '}
            <strong>API-Berechtigungen</strong> → Microsoft Graph → Delegiert: <code>Calendars.Read</code> und <code>Chat.Read</code> hinzufügen (
            <code>User.Read</code> ist schon da).
          </li>
          <li>
            In <code>.env.local</code> eintragen: <code>TEAMS_CLIENT_ID=</code> (Anwendungs-ID) und <code>TEAMS_TENANT_ID=</code> (Verzeichnis-ID),
            beide auf der Übersichtsseite der App. Dann die App neu starten (ctrl + C, npm start).
          </li>
          <li>
            Für den Live-Chat einmalig im Terminal <code>brew install cloudflared</code> ausführen (kostenloser Tunnel, ohne Konto).
          </li>
        </ol>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="meet-list">
        <p className="muted">Einmalig mit deinem Microsoft-Konto anmelden. Danach erscheinen hier deine Teams-Besprechungen aus dem Kalender.</p>
        <Button variant="primary" icon={ExternalLink} onClick={() => window.open('/teams/anmelden', '_blank')}>
          Mit Microsoft anmelden
        </Button>
        <p className="field-hint">Es öffnet sich ein neuer Tab. Nach der Anmeldung kehrst du hierher zurück, die Liste lädt dann automatisch.</p>
      </div>
    );
  }

  return (
    <AccountList
      data={teamsMeetings}
      reload={loadTeamsMeetings}
      disconnect={disconnectTeams}
      disconnectLabel="Teams-Konto trennen"
      accountLabel={teams.name ? `Angemeldet als ${teams.name}${teams.email ? ` (${teams.email})` : ''}` : undefined}
      onJoin={onJoin}
      disabled={disabled}
    />
  );
}
