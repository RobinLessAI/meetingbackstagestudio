import {
  AudioLines,
  CalendarClock,
  CircleHelp,
  Hand,
  LayoutGrid,
  Plug,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { duration, timecode } from '../lib/time.ts';
import { GRAPHIC_LABEL, SESSION_LABEL } from '../state/commands.ts';
import { useDeckActions, SHORTCUTS } from '../state/deckActions.ts';
import { useNow, useStore } from '../state/store.tsx';
import type { ViewId } from '../state/types.ts';
import { useUi, VIEWS } from '../state/ui.tsx';
import { useSync } from '../sync/SyncProvider.tsx';
import { rtmsLabel } from './LiveChat.tsx';
import { DemoTag, Dialog, Kbd, Switch } from './ui.tsx';

const ICONS: Record<ViewId, LucideIcon> = {
  veranstaltung: CalendarClock,
  teilnehmende: Users,
  galerie: LayoutGrid,
  grafiken: Sparkles,
  steuerpult: SlidersHorizontal,
  audio: AudioLines,
  integrationen: Plug,
};

export function Brand() {
  return (
    <div className="brand">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
        <rect width="32" height="32" rx="5" fill="var(--raised)" />
        <rect x="7" y="7" width="3" height="18" rx="1" fill="var(--text-3)" />
        <rect x="14.5" y="7" width="3" height="18" rx="1" fill="var(--text-3)" />
        <rect x="22" y="7" width="3" height="18" rx="1" fill="var(--text-3)" />
        <rect x="5" y="17" width="7" height="4" rx="1" fill="var(--accent)" />
        <rect x="12.5" y="10" width="7" height="4" rx="1" fill="var(--text)" />
        <rect x="20" y="14" width="7" height="4" rx="1" fill="var(--text)" />
      </svg>
      <div className="brand__text">
        <span className="brand__name">MeetingBackstage</span>
        <span className="brand__tag">Studio</span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { view, go } = useUi();
  const { derived } = useStore();
  const counts: Partial<Record<ViewId, { n: number; label: string; tone?: 'accent' | 'warn' }>> = {
    teilnehmende: derived.queue.length
      ? { n: derived.queue.length, label: 'gehobene Hände', tone: 'accent' }
      : undefined,
    grafiken:
      derived.map.review.length + derived.poll.unclear.length
        ? {
            n: derived.map.review.length + derived.poll.unclear.length,
            label: 'Einträge zur Prüfung',
            tone: 'warn',
          }
        : undefined,
  };
  return (
    <nav className="sidebar" aria-label="Bereiche">
      <Brand />
      <ul className="nav">
        {VIEWS.map((v, i) => {
          const Icon = ICONS[v.id];
          const c = counts[v.id];
          return (
            <li key={v.id}>
              <a
                href={`#${v.id}`}
                className={`nav__link${view === v.id ? ' is-active' : ''}`}
                aria-current={view === v.id ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(v.id);
                }}
                title={`${v.label} (Alt+${i + 1})`}
              >
                <span className="nav__num tabular" aria-hidden>
                  {i + 1}
                </span>
                <Icon size={18} strokeWidth={1.9} aria-hidden />
                <span className="nav__label">{v.label}</span>
                <span className="nav__short" aria-hidden>
                  {v.short}
                </span>
                {c && (
                  <span className={`nav__count nav__count--${c.tone}`} aria-label={`${c.n} ${c.label}`}>
                    {c.n}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
      <div className="sidebar__foot">
        <DemoTag>Teilweise Demo</DemoTag>
        <p>Live: Chat aus Zoom und Grafiken für OBS über den lokalen Server. Simuliert: Teilnehmende, Spotlight, Stummschalten, Audio.</p>
      </div>
    </nav>
  );
}

export function TopBar() {
  const { state, derived, dispatch } = useStore();
  const { go, setHelpOpen } = useUi();
  const now = useNow();
  const { session } = state;
  const spot = state.spotlight.map((id) => derived.byId[id]).filter(Boolean);
  const first = derived.queue.find((q) => !q.inSpotlight);
  const sync = useSync();
  const live = rtmsLabel(sync.rtms, sync.available);

  let timer = '';
  if (session.status === 'laeuft' && session.startedAt) timer = timecode(now - session.startedAt);
  else if (session.status === 'geplant') timer = `Start in ${duration(session.scheduledStart - now)}`;
  else if (session.status === 'beendet' && session.startedAt && session.endedAt)
    timer = `Dauer ${timecode(session.endedAt - session.startedAt)}`;

  return (
    <header className="topbar">
      <div className="topbar__event">
        <span className="topbar__title" title={session.title}>
          {session.title}
        </span>
        <span className="topbar__sub">{session.format}</span>
      </div>

      <div className={`session-pill session-pill--${session.status}`} role="status" aria-label={`Sitzungsstatus: ${SESSION_LABEL[session.status]} ${timer}`}>
        <span className="session-pill__dot" aria-hidden />
        <span className="session-pill__label">{SESSION_LABEL[session.status]}</span>
        <span className="session-pill__time mono">{timer}</span>
      </div>

      <button type="button" className="topbar__chip" onClick={() => go('teilnehmende')} aria-label={`Spotlight: ${spot.length ? spot.map((p) => p.name).join(', ') : 'niemand'}. Teilnehmende öffnen`}>
        <Star size={14} strokeWidth={2.4} className={spot.length ? 'is-accent' : ''} aria-hidden />
        <span className="topbar__chip-label">Spotlight</span>
        <span className="topbar__chip-value">
          {spot.length === 0 ? 'niemand' : spot.slice(0, 2).map((p) => p.shortName).join(', ')}
          {spot.length > 2 && ` +${spot.length - 2}`}
        </span>
      </button>

      <button type="button" className="topbar__chip" onClick={() => go('teilnehmende')} aria-label={`${derived.queue.length} Hände gehoben. Teilnehmende öffnen`}>
        <Hand size={14} strokeWidth={2.4} className={derived.queue.length ? 'is-accent' : ''} aria-hidden />
        <span className="topbar__chip-value tabular">{derived.queue.length}</span>
        {first && (
          <span className="topbar__chip-label">
            {first.participant.shortName} {duration(now - first.raisedAt)}
          </span>
        )}
      </button>

      {state.program.graphic && (
        <button type="button" className="topbar__chip topbar__chip--accent" onClick={() => go('grafiken', { graphicTab: state.program.graphic! })}>
          <Sparkles size={14} aria-hidden />
          <span className="topbar__chip-value">{GRAPHIC_LABEL[state.program.graphic]}</span>
          <span className="topbar__chip-label">eingeblendet</span>
        </button>
      )}

      {state.muteAll && (
        <span className="topbar__chip topbar__chip--danger" role="status">
          Alle stumm
        </span>
      )}

      <div className="topbar__end">
        <button type="button" className="demo-status" onClick={() => go('integrationen')} title="Live-Chat und Integrationen anzeigen">
          {state.dataMode === 'demo' ? <DemoTag>Beispieldaten</DemoTag> : <span className="data-mode">Eigene Veranstaltung</span>}
          <span className={`demo-status__live demo-status__live--${live.tone}`}>{live.text}</span>
        </button>
        <div className="topbar__sim" title="Live-Simulation: erzeugt Beispiel-Chat, Handzeichen und Reaktionen">
          <Switch
            checked={state.settings.autoDemo}
            onChange={(v) => dispatch({ type: 'settings/update', patch: { autoDemo: v } })}
            label="Live-Simulation"
          />
        </div>
        <button type="button" className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="Tastenkürzel anzeigen" title="Tastenkürzel (?)">
          <CircleHelp size={18} aria-hidden />
        </button>
      </div>
    </header>
  );
}

export function ShortcutHelp() {
  const { helpOpen, setHelpOpen } = useUi();
  const actions = useDeckActions();
  const { state } = useStore();
  return (
    <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Tastenkürzel" size="md">
      <p className="muted">
        Kürzel wirken nur, wenn kein Eingabefeld aktiv ist.{' '}
        {!state.settings.shortcuts && <strong>Sie sind derzeit in den Einstellungen ausgeschaltet.</strong>}
      </p>
      <div className="shortcut-grid">
        <div>
          <h3 className="eyebrow">Bereiche</h3>
          <ul className="shortcut-list">
            {VIEWS.map((v, i) => (
              <li key={v.id}>
                <span>{v.label}</span>
                <span>
                  <Kbd>Alt</Kbd> + <Kbd>{i + 1}</Kbd>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="eyebrow">Aktionen</h3>
          <ul className="shortcut-list">
            {Object.entries(SHORTCUTS).map(([key, id]) => (
              <li key={key}>
                <span>{actions[id].label}</span>
                <Kbd>{key.toUpperCase()}</Kbd>
              </li>
            ))}
            <li>
              <span>Diese Hilfe</span>
              <Kbd>?</Kbd>
            </li>
            <li>
              <span>Dialog oder Präsentation schließen</span>
              <Kbd>Esc</Kbd>
            </li>
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
