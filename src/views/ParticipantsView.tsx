import { useId, useMemo } from 'react';
import {
  AudioLines,
  Hand,
  ListX,
  LogOut,
  Search,
  Star,
  UserPlus,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import {
  Avatar,
  HandQueue,
  MicStatus,
  MuteAllButton,
  ROLE_LABEL,
  SpeakingBars,
  SpotlightList,
} from '../components/people.tsx';
import { Button, DemoTag, Empty, IconButton, Panel, Segmented, Switch } from '../components/ui.tsx';
import { clock } from '../lib/time.ts';
import { useCommands } from '../state/commands.ts';
import { useStore } from '../state/store.tsx';
import type { Participant, ParticipantFilter, ParticipantView, Role } from '../state/types.ts';

const STATUS_OPTIONS: Array<{ value: ParticipantFilter; label: string }> = [
  { value: 'alle', label: 'Alle' },
  { value: 'hand', label: 'Hand gehoben' },
  { value: 'mikro-an', label: 'Mikro offen' },
  { value: 'mikro-aus', label: 'Stumm' },
  { value: 'kamera-aus', label: 'Kamera aus' },
  { value: 'spricht', label: 'Spricht' },
  { value: 'spotlight', label: 'Im Spotlight' },
];

const ROLE_ORDER: Role[] = ['moderation', 'co-moderation', 'vortrag', 'produktion', 'teilnahme'];

export function ParticipantsView() {
  const { state, derived, dispatch } = useStore();
  const commands = useCommands();
  const view = state.participantView;
  const ids = { search: useId(), role: useId(), sort: useId() };
  const setView = (patch: Partial<ParticipantView>) => dispatch({ type: 'participantView/update', patch });
  const handPos = new Map(derived.queue.map((q) => [q.participant.id, q.position]));
  const firstWaiting = derived.queue.find((q) => !q.inSpotlight)?.participant.id;

  const rows = useMemo(() => {
    const q = view.query.trim().toLowerCase();
    const matches = (p: Participant) => {
      if (q && !`${p.name} ${ROLE_LABEL[p.role]} ${p.device}`.toLowerCase().includes(q)) return false;
      if (view.role !== 'alle' && p.role !== view.role) return false;
      switch (view.status) {
        case 'hand':
          return p.handRaisedAt !== null;
        case 'mikro-an':
          return p.micOn;
        case 'mikro-aus':
          return !p.micOn;
        case 'kamera-aus':
          return !p.camOn;
        case 'spricht':
          return state.activeSpeakerId === p.id;
        case 'spotlight':
          return state.spotlight.includes(p.id);
        default:
          return true;
      }
    };
    const list = state.participants.filter(matches);
    const sorters: Record<ParticipantView['sort'], (a: Participant, b: Participant) => number> = {
      liste: () => 0,
      name: (a, b) => a.name.localeCompare(b.name, 'de'),
      rolle: (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name, 'de'),
      hand: (a, b) =>
        (a.handRaisedAt ?? Number.MAX_SAFE_INTEGER) - (b.handRaisedAt ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name, 'de'),
      beitritt: (a, b) => a.joinedAt - b.joinedAt,
    };
    return [...list].sort(sorters[view.sort]);
  }, [state.participants, state.activeSpeakerId, state.spotlight, view]);

  const filtered = view.query || view.role !== 'alle' || view.status !== 'alle';

  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Teilnehmende</span>
          <h1 className="view__title">Teilnehmende und Spotlight</h1>
          <p className="view__lead">
            Klick auf eine Person in der Handzeichenliste setzt sie ins Spotlight, ein zweiter Klick entfernt sie wieder.
          </p>
        </div>
        <div className="view__head-side">
          <MuteAllButton size="lg" />
        </div>
      </header>

      <div className="people-grid">
        <Panel
          className="people-table-panel"
          title={
            <>
              Teilnehmerliste <span className="subtle tabular">{rows.length} von {state.participants.length}</span>
            </>
          }
          actions={
            <>
              <Button size="sm" icon={UserPlus} onClick={commands.join}>
                Person beitreten lassen
              </Button>
              <Button size="sm" icon={ListX} onClick={commands.lowerAllHands} disabled={!!derived.locked}>
                Alle Hände senken
              </Button>
              <DemoTag />
            </>
          }
          flush
        >
          <div className="filters">
            <div className="filters__search">
              <Search size={15} aria-hidden />
              <label htmlFor={ids.search} className="sr-only">
                Teilnehmende suchen
              </label>
              <input
                id={ids.search}
                className="input"
                type="search"
                placeholder="Name, Rolle oder Gerät suchen"
                value={view.query}
                onChange={(e) => setView({ query: e.target.value })}
              />
            </div>
            <div className="filters__select">
              <label htmlFor={ids.role} className="field-label">
                Rolle
              </label>
              <select id={ids.role} className="select" value={view.role} onChange={(e) => setView({ role: e.target.value as ParticipantView['role'] })}>
                <option value="alle">Alle Rollen</option>
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="filters__select">
              <label htmlFor={ids.sort} className="field-label">
                Sortierung
              </label>
              <select id={ids.sort} className="select" value={view.sort} onChange={(e) => setView({ sort: e.target.value as ParticipantView['sort'] })}>
                <option value="liste">Teilnehmerliste</option>
                <option value="name">Name A–Z</option>
                <option value="rolle">Rolle</option>
                <option value="hand">Handzeichen, älteste zuerst</option>
                <option value="beitritt">Beitrittszeit</option>
              </select>
            </div>
            <div className="filters__status">
              <Segmented<ParticipantFilter>
                label="Status"
                size="sm"
                value={view.status}
                onChange={(status) => setView({ status })}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>

          <p className="table-hint">
            Mikrofon, Kamera und Handzeichen lassen sich per Klick in der Tabelle simulieren. Diese Änderungen betreffen nur die Demo.
          </p>
          {rows.length === 0 ? (
            <Empty icon={Users} title="Keine Person passt zu Suche und Filter">
              <Button size="sm" onClick={() => setView({ query: '', role: 'alle', status: 'alle' })}>
                Filter zurücksetzen
              </Button>
            </Empty>
          ) : (
            <div className="table-wrap people-table-wrap">
              <table className="table people-table">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Mikrofon</th>
                    <th scope="col">Kamera</th>
                    <th scope="col">Handzeichen</th>
                    <th scope="col">Spotlight</th>
                    <th scope="col">
                      <span className="sr-only">Weitere Demo-Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const inSpot = state.spotlight.includes(p.id);
                    const speaking = state.activeSpeakerId === p.id;
                    const pos = handPos.get(p.id);
                    const raised = p.handRaisedAt !== null;
                    return (
                      <tr key={p.id} className={`${inSpot ? 'is-spotlight' : ''}${p.id === firstWaiting ? ' is-next' : ''}`}>
                        <td>
                          <div className="person">
                            <Avatar p={p} />
                            <div className="person__text">
                              <span className="person__name">{p.name}</span>
                              <span className="person__meta">
                                {speaking ? (
                                  <span className="person__speaking">
                                    <SpeakingBars /> spricht
                                  </span>
                                ) : (
                                  <>
                                    {ROLE_LABEL[p.role]} · {p.device}
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="cell-toggle"
                            onClick={() => commands.toggleMic(p.id)}
                            title="Demo: Mikrofon umschalten"
                            aria-label={`Mikrofon von ${p.name} ist ${p.micOn ? 'offen' : 'stumm'}. Umschalten (Demo)`}
                          >
                            <MicStatus on={p.micOn} />
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`cell-toggle cam${p.camOn ? '' : ' cam--off'}`}
                            onClick={() => commands.toggleCam(p.id)}
                            title="Demo: Kamera umschalten"
                            aria-label={`Kamera von ${p.name} ist ${p.camOn ? 'an' : 'aus'}. Umschalten (Demo)`}
                          >
                            {p.camOn ? <Video size={14} aria-hidden /> : <VideoOff size={14} aria-hidden />}
                            {p.camOn ? 'an' : 'aus'}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`cell-toggle cell-toggle--hand${raised ? ' is-raised' : ''}`}
                            onClick={() => commands.toggleHand(p.id)}
                            title={raised ? 'Demo: Hand senken' : 'Demo: Hand heben'}
                            aria-label={
                              raised
                                ? `${p.name}: Hand gehoben um ${clock(p.handRaisedAt!)}, Platz ${pos}. Hand senken (Demo)`
                                : `${p.name} hebt die Hand (Demo)`
                            }
                          >
                            <Hand size={14} strokeWidth={2.4} aria-hidden />
                            {raised ? (
                              <span className="hand-stack">
                                <span className="tabular">
                                  {pos}. · {clock(p.handRaisedAt!)}
                                </span>
                                {p.id === firstWaiting && <span className="hand-cell__next">als Nächstes</span>}
                              </span>
                            ) : (
                              <span>heben</span>
                            )}
                          </button>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant={inSpot ? 'primary' : 'secondary'}
                            icon={Star}
                            onClick={() => commands.toggleSpotlight(p.id)}
                            aria-pressed={inSpot}
                            aria-label={`${p.name} ${inSpot ? 'aus dem Spotlight entfernen' : 'ins Spotlight setzen'}`}
                            disabled={!!derived.locked}
                          >
                            {inSpot ? 'Im Spotlight' : 'Spotlight'}
                          </Button>
                        </td>
                        <td>
                          <div className="row-actions">
                            <IconButton
                              label={speaking ? `${p.name} spricht nicht mehr (Demo)` : `${p.name} als sprechend markieren (Demo)`}
                              icon={AudioLines}
                              pressed={speaking}
                              onClick={() => commands.setSpeaker(p.id)}
                            />
                            <IconButton
                              label={`${p.name} verlässt die Sitzung (Demo)`}
                              icon={LogOut}
                              disabled={p.role === 'moderation'}
                              onClick={() => commands.leave(p.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered && rows.length > 0 && (
            <div className="table-foot">
              <span className="subtle">Filter aktiv</span>
              <Button size="sm" variant="ghost" onClick={() => setView({ query: '', role: 'alle', status: 'alle' })}>
                Filter zurücksetzen
              </Button>
            </div>
          )}
        </Panel>

        <aside className="stack people-aside">
          <Panel
            eyebrow="Handzeichen · älteste zuerst"
            title={
              <>
                Wortmeldungen <span className="subtle tabular">{derived.queue.length}</span>
              </>
            }
            actions={<DemoTag />}
          >
            <HandQueue />
            <div className="aside-note">
              <Switch
                checked={state.settings.lowerHandOnSpotlight}
                onChange={(v) => dispatch({ type: 'settings/update', patch: { lowerHandOnSpotlight: v } })}
                label="Hand beim Spotlight senken"
                description="Aus: Die Person bleibt in der Liste, ein zweiter Klick nimmt das Spotlight zurück."
              />
            </div>
          </Panel>
          <Panel
            eyebrow={`Spotlight · bis zu ${state.settings.maxSpotlight} Personen`}
            title={
              <>
                Im Spotlight <span className="subtle tabular">{state.spotlight.length}</span>
              </>
            }
            actions={
              <Button size="sm" variant="ghost" onClick={commands.clearSpotlight} disabled={state.spotlight.length === 0 || !!derived.locked}>
                Leeren
              </Button>
            }
          >
            <SpotlightList />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
