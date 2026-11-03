import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  Hand,
  Info,
  Mic,
  MicOff,
  Star,
  TriangleAlert,
  X,
} from 'lucide-react';
import { clock, duration } from '../lib/time.ts';
import { useCommands } from '../state/commands.ts';
import { MUTE_ALL_EXEMPT } from '../state/reducer.ts';
import { useNow, useStore } from '../state/store.tsx';
import type { Participant, Role } from '../state/types.ts';
import { useUi } from '../state/ui.tsx';
import { avatarColor, initials } from './VideoTile.tsx';
import { Button, DemoTag, Dialog, Empty, IconButton, Switch } from './ui.tsx';

export const ROLE_LABEL: Record<Role, string> = {
  moderation: 'Moderation',
  'co-moderation': 'Co-Moderation',
  vortrag: 'Vortrag',
  produktion: 'Produktion',
  teilnahme: 'Teilnahme',
};

export function Avatar({ p, size = 30 }: { p: Participant; size?: number }) {
  return (
    <span className="avatar" style={{ background: avatarColor(p), width: size, height: size }} aria-hidden>
      {initials(p.name)}
    </span>
  );
}

export function MicStatus({ on, compact }: { on: boolean; compact?: boolean }) {
  return on ? (
    <span className="mic mic--on">
      <Mic size={14} strokeWidth={2.4} aria-hidden />
      {compact ? <span className="sr-only">Mikrofon offen</span> : 'offen'}
    </span>
  ) : (
    <span className="mic mic--off">
      <MicOff size={14} strokeWidth={2.4} aria-hidden />
      {compact ? <span className="sr-only">Mikrofon stumm</span> : 'stumm'}
    </span>
  );
}

export function SpeakingBars() {
  return (
    <span className="speaking-bars" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

/** Gehobene Hände nach Eingangszeit. Klick schaltet das Spotlight um. */
export function HandQueue({ dense = false }: { dense?: boolean }) {
  const { derived } = useStore();
  const commands = useCommands();
  const now = useNow();
  const firstWaiting = derived.queue.find((q) => !q.inSpotlight);

  if (derived.queue.length === 0) {
    return (
      <Empty icon={Hand} title="Keine Hand gehoben" compact={dense}>
        <p>Neue Handzeichen erscheinen hier in der Reihenfolge ihres Eingangs.</p>
      </Empty>
    );
  }

  return (
    <ol className={`queue${dense ? ' queue--dense' : ''}`} aria-label="Gehobene Hände, älteste zuerst">
      {derived.queue.map((q) => {
        const isNext = q === firstWaiting;
        const p = q.participant;
        return (
          <li key={p.id}>
            <button
              type="button"
              className={`queue__item${q.inSpotlight ? ' is-spotlight' : ''}${isNext ? ' is-next' : ''}`}
              onClick={() => commands.toggleSpotlight(p.id)}
              aria-pressed={q.inSpotlight}
              aria-label={`Platz ${q.position}: ${p.name}, Hand seit ${clock(q.raisedAt)}, wartet ${duration(now - q.raisedAt)}. ${q.inSpotlight ? 'Im Spotlight. Klicken zum Entfernen.' : 'Klicken, um ins Spotlight zu setzen.'}`}
            >
              <span className="queue__pos tabular">{q.position}</span>
              <span className="queue__who">
                <span className="queue__name">{p.name}</span>
                <span className="queue__meta">
                  <span className="tabular">Hand seit {clock(q.raisedAt)}</span>
                  <MicStatus on={p.micOn} compact />
                </span>
              </span>
              <span className="queue__wait tabular" title="Wartezeit">
                {duration(now - q.raisedAt)}
              </span>
              <span className="queue__state">
                {q.inSpotlight ? (
                  <span className="queue__flag queue__flag--spot">
                    <Star size={12} strokeWidth={2.6} aria-hidden /> Spotlight
                  </span>
                ) : isNext ? (
                  <span className="queue__flag queue__flag--next">Als Nächstes</span>
                ) : (
                  <span className="queue__flag">Wartet</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Aktuelle Spotlight-Auswahl als Liste. */
export function SpotlightList({ dense = false }: { dense?: boolean }) {
  const { state, derived } = useStore();
  const commands = useCommands();
  const people = state.spotlight.map((id) => derived.byId[id]).filter(Boolean);

  if (people.length === 0) {
    return (
      <Empty icon={Star} title="Niemand im Spotlight" compact={dense}>
        <p>Person in der Handzeichenliste, der Galerie oder der Stream-Deck-Vorschau anklicken.</p>
      </Empty>
    );
  }
  return (
    <ol className="spotlist" aria-label="Personen im Spotlight">
      {people.map((p, i) => (
        <li key={p.id} className="spotlist__item">
          <span className="spotlist__pos tabular">{i + 1}</span>
          <Avatar p={p} size={26} />
          <span className="spotlist__name">
            {p.name}
            <span className="spotlist__role">{ROLE_LABEL[p.role]}</span>
          </span>
          <MicStatus on={p.micOn} compact />
          {!dense && (
            <>
              <IconButton
                label={`${p.name} im Spotlight nach oben`}
                icon={ArrowUp}
                disabled={i === 0}
                onClick={() => commands.moveSpotlight(p.id, -1)}
              />
              <IconButton
                label={`${p.name} im Spotlight nach unten`}
                icon={ArrowDown}
                disabled={i === people.length - 1}
                onClick={() => commands.moveSpotlight(p.id, 1)}
              />
            </>
          )}
          <IconButton label={`${p.name} aus dem Spotlight entfernen`} icon={X} onClick={() => commands.removeFromSpotlight(p.id)} />
        </li>
      ))}
    </ol>
  );
}

/** Große Aktion „Alle Teilnehmenden stummschalten“ (öffnet die Bestätigung). */
export function MuteAllButton({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { state, derived } = useStore();
  const { setMuteAllOpen } = useUi();
  const open = state.participants.filter(
    (p) => p.micOn && !(MUTE_ALL_EXEMPT as readonly string[]).includes(p.role),
  ).length;
  return (
    <Button
      variant="danger"
      size={size}
      icon={MicOff}
      onClick={() => setMuteAllOpen(true)}
      disabled={!!derived.locked}
      title={derived.locked ?? 'Öffnet eine Bestätigung (Demo)'}
      className="mute-all-btn"
    >
      Alle Teilnehmenden stummschalten
      <span className="mute-all-btn__count tabular">{open} offen</span>
    </Button>
  );
}

export function MuteAllDialog() {
  const { muteAllOpen, setMuteAllOpen } = useUi();
  const { state } = useStore();
  const commands = useCommands();
  const [allowSelf, setAllowSelf] = useState(true);
  const affected = state.participants.filter(
    (p) => !(MUTE_ALL_EXEMPT as readonly string[]).includes(p.role),
  );
  const exempt = state.participants.filter((p) => (MUTE_ALL_EXEMPT as readonly string[]).includes(p.role));
  const openNow = affected.filter((p) => p.micOn);

  return (
    <Dialog
      open={muteAllOpen}
      onClose={() => setMuteAllOpen(false)}
      title="Alle Teilnehmenden stummschalten?"
      size="sm"
      tone="danger"
      footer={
        <>
          <Button variant="ghost" onClick={() => setMuteAllOpen(false)}>
            Abbrechen
          </Button>
          <Button
            variant="danger-solid"
            icon={MicOff}
            autoFocus
            onClick={() => {
              commands.runMuteAll(allowSelf);
              setMuteAllOpen(false);
            }}
          >
            {affected.length} Personen stummschalten
          </Button>
        </>
      }
    >
      <div className="row">
        <DemoTag>Demo · ändert nur die Simulation</DemoTag>
      </div>
      <p>
        Betrifft <strong>{affected.length} Personen</strong>, davon {openNow.length} mit offenem Mikrofon
        {openNow.length > 0 && <>: {openNow.map((p) => p.shortName).join(', ')}</>}.
      </p>
      <p className="muted">
        Ausgenommen: {exempt.map((p) => `${p.name} (${ROLE_LABEL[p.role]})`).join(', ')}.
      </p>
      <Switch
        checked={allowSelf}
        onChange={setAllowSelf}
        label="Teilnehmende dürfen sich selbst wieder freischalten"
        description="Bei einer echten Anbindung würde diese Einstellung an die Konferenzsoftware übergeben."
      />
    </Dialog>
  );
}

/** Deutlicher Hinweis, solange „Alle stumm“ aktiv ist. */
export function MuteAllBanner() {
  const { state } = useStore();
  const commands = useCommands();
  if (!state.muteAll) return null;
  const reopened = state.muteAll.affected
    .map((id) => state.participants.find((p) => p.id === id))
    .filter((p): p is Participant => !!p && p.micOn);
  return (
    <div className="banner banner--danger" role="status">
      <MicOff size={18} strokeWidth={2.4} aria-hidden />
      <div className="banner__text">
        <strong>Alle Teilnehmenden stumm</strong>
        <span>
          seit {clock(state.muteAll.at)} · {state.muteAll.affected.length} Personen ·{' '}
          {state.muteAll.allowSelfUnmute ? 'Selbst freischalten erlaubt' : 'Selbst freischalten gesperrt'}
          {reopened.length > 0 && (
            <> · wieder offen: {reopened.map((p) => p.shortName).join(', ')}</>
          )}
        </span>
      </div>
      <DemoTag />
      <Button size="sm" variant="ghost" onClick={commands.dismissMuteAll}>
        Hinweis schließen
      </Button>
    </div>
  );
}

export function LockedBanner() {
  const { derived, state } = useStore();
  if (state.session.status === 'geplant') {
    return (
      <div className="banner banner--info" role="status">
        <Info size={18} aria-hidden />
        <div className="banner__text">
          <strong>Sitzung ist geplant</strong>
          <span>Vorbereitung mit Beispieldaten. Alle Aktionen sind zum Üben freigegeben.</span>
        </div>
      </div>
    );
  }
  if (!derived.locked) return null;
  return (
    <div className="banner banner--warn" role="status">
      <TriangleAlert size={18} aria-hidden />
      <div className="banner__text">
        <strong>Sitzung beendet</strong>
        <span>Spotlight, Stummschalten und Einblendungen sind gesperrt. Grafiken und Chat bleiben zur Auswertung nutzbar.</span>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => {
        const Icon = t.tone === 'erfolg' ? CircleCheck : t.tone === 'fehler' ? CircleAlert : t.tone === 'warnung' ? TriangleAlert : Info;
        return (
          <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === 'fehler' ? 'alert' : 'status'}>
            <Icon className="toast__icon" size={16} aria-hidden />
            <p className="toast__text">
              <span className="toast__demo">Demo</span>
              {t.text}
            </p>
            <IconButton label="Meldung schließen" icon={X} onClick={() => dismissToast(t.id)} />
          </div>
        );
      })}
    </div>
  );
}
