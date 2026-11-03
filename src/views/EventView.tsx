import type { ReactNode } from 'react';
import {
  CalendarClock,
  CircleCheck,
  Hand,
  ListChecks,
  MapPin,
  MicOff,
  Star,
  Timer,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { GalleryStage } from '../components/GalleryStage.tsx';
import { NewEventButton } from '../components/NewEvent.tsx';
import { Badge, Button, DemoTag, NotConnected, Panel, Segmented } from '../components/ui.tsx';
import { clock, dateLabel, duration, timecode } from '../lib/time.ts';
import { GRAPHIC_LABEL, SESSION_LABEL, useCommands } from '../state/commands.ts';
import { MUTE_ALL_EXEMPT } from '../state/reducer.ts';
import { useNow, useStore } from '../state/store.tsx';
import type { SessionStatus } from '../state/types.ts';
import { useUi } from '../state/ui.tsx';

interface Todo {
  id: string;
  icon: LucideIcon;
  tone: 'accent' | 'warn' | 'danger' | 'neutral' | 'ok';
  title: ReactNode;
  detail?: ReactNode;
  actions: ReactNode;
}

export function EventView() {
  const { state, derived } = useStore();
  const commands = useCommands();
  const ui = useUi();
  const now = useNow();
  const { session } = state;

  const elapsedMin =
    session.status === 'laeuft' && session.startedAt ? (now - session.startedAt) / 60_000 : session.status === 'beendet' ? Infinity : -1;
  const currentIdx = session.agenda.findIndex(
    (a) => elapsedMin >= a.offsetMin && elapsedMin < a.offsetMin + a.durationMin,
  );
  const nextItem = session.agenda.find((a) => a.offsetMin > elapsedMin);
  const openGuestMics = state.participants.filter(
    (p) => p.micOn && !(MUTE_ALL_EXEMPT as readonly string[]).includes(p.role),
  );
  const firstHand = derived.queue.find((q) => !q.inSpotlight);

  const todos: Todo[] = [];
  if (session.status === 'geplant') {
    todos.push(
      {
        id: 'p1',
        icon: ListChecks,
        tone: 'neutral',
        title: 'Galerie-Layout und Kachelzahl festlegen',
        detail: 'Robin steht im Layout „Moderation im Zentrum“ groß in der Mitte.',
        actions: <Button size="sm" onClick={() => ui.go('galerie')}>Galerie öffnen</Button>,
      },
      {
        id: 'p2',
        icon: Vote,
        tone: 'neutral',
        title: `Umfrage prüfen: „${state.poll.question}“`,
        detail: `${state.poll.options.length} Antwortoptionen`,
        actions: <Button size="sm" onClick={() => ui.go('grafiken', { graphicTab: 'umfrage' })}>Umfrage öffnen</Button>,
      },
      {
        id: 'p3',
        icon: MapPin,
        tone: 'neutral',
        title: `Ortsfrage vorbereiten: „${state.map.question}“`,
        actions: <Button size="sm" onClick={() => ui.go('grafiken', { graphicTab: 'karte' })}>Weltkarte öffnen</Button>,
      },
      {
        id: 'p4',
        icon: CircleCheck,
        tone: 'neutral',
        title: 'Tastenbelegung im Steuerpult testen',
        actions: <Button size="sm" onClick={() => ui.go('steuerpult')}>Steuerpult öffnen</Button>,
      },
    );
  }
  if (session.status !== 'beendet') {
    if (firstHand) {
      todos.push({
        id: 'hands',
        icon: Hand,
        tone: 'accent',
        title: (
          <>
            {derived.queue.length} {derived.queue.length === 1 ? 'Handzeichen wartet' : 'Handzeichen warten'} ·{' '}
            <strong>{firstHand.participant.name}</strong> zuerst
          </>
        ),
        detail: `Hand seit ${clock(firstHand.raisedAt)}, wartet ${duration(now - firstHand.raisedAt)}`,
        actions: (
          <>
            <Button size="sm" variant="primary" icon={Star} onClick={() => commands.toggleSpotlight(firstHand.participant.id)}>
              {firstHand.participant.shortName} ins Spotlight
            </Button>
            <Button size="sm" onClick={() => ui.go('teilnehmende')}>Liste</Button>
          </>
        ),
      });
    }
    if (openGuestMics.length > 0) {
      todos.push({
        id: 'mics',
        icon: MicOff,
        tone: 'danger',
        title: `${openGuestMics.length} Mikrofone bei Teilnehmenden offen`,
        detail: openGuestMics.map((p) => p.shortName).join(', '),
        actions: (
          <Button size="sm" variant="danger" icon={MicOff} onClick={() => ui.setMuteAllOpen(true)}>
            Alle stummschalten
          </Button>
        ),
      });
    }
  }
  if (derived.map.review.length > 0) {
    todos.push({
      id: 'map',
      icon: MapPin,
      tone: 'warn',
      title: `${derived.map.review.length} Ortsangaben zur Prüfung`,
      detail: 'Mehrdeutige oder unbekannte Orte erscheinen erst nach Bestätigung auf der Karte.',
      actions: <Button size="sm" onClick={() => ui.go('grafiken', { graphicTab: 'karte' })}>Prüfen</Button>,
    });
  }
  if (state.poll.status !== 'entwurf') {
    todos.push({
      id: 'poll',
      icon: Vote,
      tone: derived.poll.unclear.length ? 'warn' : 'neutral',
      title: `Umfrage ${state.poll.status === 'laeuft' ? 'läuft' : 'geschlossen'}: ${derived.poll.totalVotes} ${state.poll.kind === 'offen' ? 'Antworten' : 'Stimmen'}`,
      detail: derived.poll.unclear.length ? `${derived.poll.unclear.length} unklare Antworten warten auf Prüfung` : state.poll.question,
      actions: (
        <>
          <Button size="sm" onClick={() => ui.go('grafiken', { graphicTab: 'umfrage' })}>Öffnen</Button>
          {session.status !== 'beendet' && (
            <Button size="sm" pressed={state.program.graphic === 'umfrage'} onClick={() => commands.toggleGraphic('umfrage')}>
              {state.program.graphic === 'umfrage' ? 'Ausblenden' : 'Einblenden'}
            </Button>
          )}
        </>
      ),
    });
  }
  if (session.status === 'laeuft' && nextItem) {
    const startsIn = (session.startedAt ?? now) + nextItem.offsetMin * 60_000 - now;
    todos.push({
      id: 'next',
      icon: Timer,
      tone: 'neutral',
      title: `Als Nächstes: ${nextItem.title}`,
      detail: `in ${duration(startsIn)} · ${nextItem.owner}`,
      actions: nextItem.link ? (
        <Button size="sm" onClick={() => ui.go(nextItem.link!)}>{nextItem.linkLabel}</Button>
      ) : null,
    });
  }

  const duringMin = session.startedAt ? Math.max(0, ((session.endedAt ?? now) - session.startedAt) / 60_000) : 0;
  const progress = session.status === 'beendet' ? 100 : session.status === 'laeuft' ? Math.min(100, (duringMin / session.plannedDurationMin) * 100) : 0;

  return (
    <div className="view view--event">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Veranstaltung</span>
          <h1 className="view__title">{session.title}</h1>
          <p className="view__lead">
            {session.subtitle} · {dateLabel(session.scheduledStart)} · Beginn {clock(session.scheduledStart, false)} Uhr ·{' '}
            {session.plannedDurationMin} Minuten
          </p>
        </div>
        <div className="view__head-side">
          <NewEventButton variant={state.dataMode === 'demo' ? 'primary' : 'secondary'} />
          <Segmented<SessionStatus>
            label="Sitzungsstatus"
            value={session.status}
            onChange={commands.setSessionStatus}
            options={(['geplant', 'laeuft', 'beendet'] as const).map((s) => ({ value: s, label: SESSION_LABEL[s] }))}
          />
        </div>
      </header>

      <div className="event-grid">
        <div className="stack">
          <Panel
            eyebrow={session.status === 'geplant' ? 'Vor dem Start' : session.status === 'beendet' ? 'Nach der Sitzung' : 'Jetzt wichtig'}
            title={session.status === 'beendet' ? 'Zusammenfassung' : 'Anstehende Aktionen'}
            flush
          >
            {session.status === 'beendet' && (
              <dl className="summary">
                <div>
                  <dt>Dauer</dt>
                  <dd className="tabular">{session.startedAt && session.endedAt ? timecode(session.endedAt - session.startedAt) : '–'}</dd>
                </div>
                <div>
                  <dt>Teilnehmende</dt>
                  <dd className="tabular">{state.participants.length}</dd>
                </div>
                <div>
                  <dt>Chat-Beiträge</dt>
                  <dd className="tabular">{state.chat.length}</dd>
                </div>
                <div>
                  <dt>Orte auf der Karte</dt>
                  <dd className="tabular">{derived.map.pins.length}</dd>
                </div>
                <div>
                  <dt>Umfrage-Stimmen</dt>
                  <dd className="tabular">{derived.poll.totalVotes}</dd>
                </div>
                <div>
                  <dt>Begriffe in der Wortwolke</dt>
                  <dd className="tabular">{derived.cloud.visible.length}</dd>
                </div>
              </dl>
            )}
            {todos.length === 0 && session.status !== 'beendet' && (
              <p className="todo-empty">Gerade ist nichts offen. Neue Handzeichen und Prüfaufgaben erscheinen hier.</p>
            )}
            {todos.length > 0 && (
              <ul className="todos">
                {todos.map((t) => (
                  <li key={t.id} className={`todo todo--${t.tone}`}>
                    <span className="todo__icon">
                      <t.icon size={18} strokeWidth={2} aria-hidden />
                    </span>
                    <div className="todo__text">
                      <span className="todo__title">{t.title}</span>
                      {t.detail && <span className="todo__detail">{t.detail}</span>}
                    </div>
                    <div className="todo__actions">{t.actions}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            eyebrow="Galerie"
            title="Vorschau"
            actions={
              <Button size="sm" onClick={() => ui.go('galerie')}>
                Galerie Studio öffnen
              </Button>
            }
          >
            <GalleryStage size="small" />
          </Panel>
        </div>

        <div className="stack">
          <Panel eyebrow="Ablauf" title="Ablaufplan" actions={<span className="subtle tabular">{Math.round(progress)} %</span>}>
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Fortschritt der Veranstaltung">
              <div className="progress__fill" style={{ width: `${progress}%` }} />
            </div>
            {session.agenda.length === 0 && (
              <p className="todo-empty">Kein Ablaufplan hinterlegt. Für eigene Veranstaltungen ist er optional.</p>
            )}
            <ol className="agenda">
              {session.agenda.map((a, i) => {
                const state_ = i === currentIdx ? 'current' : elapsedMin >= a.offsetMin + a.durationMin ? 'done' : 'next';
                const startAt = (session.startedAt ?? session.scheduledStart) + a.offsetMin * 60_000;
                return (
                  <li key={a.id} className={`agenda__item agenda__item--${state_}`} aria-current={state_ === 'current' ? 'step' : undefined}>
                    <span className="agenda__time mono">{clock(startAt, false)}</span>
                    <span className="agenda__marker" aria-hidden />
                    <div className="agenda__text">
                      <span className="agenda__title">{a.title}</span>
                      <span className="agenda__meta">
                        {a.durationMin} Min. · {a.owner}
                        {state_ === 'current' && <Badge tone="accent">läuft</Badge>}
                      </span>
                    </div>
                    {a.link && state_ !== 'done' && (
                      <Button size="sm" variant="ghost" onClick={() => ui.go(a.link!)}>
                        {a.linkLabel}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel eyebrow="Verbindungen" title="Verbindungsstatus" actions={<Button size="sm" variant="ghost" onClick={() => ui.go('integrationen')}>Details</Button>}>
            <ul className="conn-list">
              <li>
                <span>Zoom-Meeting</span>
                <NotConnected />
              </li>
              <li>
                <span>Teilnehmerliste und Chat</span>
                <DemoTag>Beispieldaten</DemoTag>
              </li>
              <li>
                <span>Stream Deck</span>
                <DemoTag>Simulation</DemoTag>
              </li>
              <li>
                <span>Ausgänge (NDI, SRT, SDI, Dante)</span>
                <NotConnected />
              </li>
              <li>
                <span>Eingeblendete Grafik</span>
                {state.program.graphic ? <Badge tone="accent">{GRAPHIC_LABEL[state.program.graphic]}</Badge> : <span className="subtle">keine</span>}
              </li>
            </ul>
          </Panel>

          <Panel eyebrow="Überblick" title="Kennzahlen">
            <dl className="kpis">
              <div>
                <dt>Teilnehmende</dt>
                <dd className="tabular">{state.participants.length}</dd>
              </div>
              <div>
                <dt>Kamera an</dt>
                <dd className="tabular">{state.participants.filter((p) => p.camOn).length}</dd>
              </div>
              <div>
                <dt>Mikro offen</dt>
                <dd className="tabular">{derived.openMics.length}</dd>
              </div>
              <div>
                <dt>Chat</dt>
                <dd className="tabular">{state.chat.length}</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
      <p className="view__foot subtle">
        <CalendarClock size={14} aria-hidden /> Alle Zeiten sind relativ zum Öffnen der Demo berechnet.
      </p>
    </div>
  );
}
