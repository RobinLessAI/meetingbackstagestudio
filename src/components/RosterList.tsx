import { useEffect, useId, useMemo, useState } from 'react';
import { Bookmark, Check, Dices, Hand, MessageCircleQuestion, Mic, NotebookPen, Plus, RotateCcw, Star, Trash2, UserRound, X } from 'lucide-react';
import { matchesTeamName } from '../state/derive.ts';
import { rosterKey } from '../state/reducer.ts';
import { clock } from '../lib/time.ts';
import { useStore } from '../state/store.tsx';
import type { RosterEntry, RosterMark } from '../state/types.ts';
import { useZoomSpotlight } from '../state/zoomSpotlight.ts';
import { useSync, type ZoomPerson } from '../sync/SyncProvider.tsx';
import { Button, Empty, IconButton, Segmented, Switch } from './ui.tsx';
import { focusPortalWindow, PortalWindow } from './PortalWindow.tsx';
import { useUi } from '../state/ui.tsx';

export const MARKS: Array<{ id: RosterMark; label: string; short: string; icon: typeof Mic }> = [
  { id: 'gefragt', label: 'Frage gestellt', short: 'Gefragt', icon: MessageCircleQuestion },
  { id: 'gesprochen', label: 'Hat gesprochen', short: 'Gesprochen', icon: Mic },
  { id: 'merken', label: 'Merken, später nochmal', short: 'Merken', icon: Bookmark },
];

/** Gilt als „schon dran“: gefragt, gesprochen oder im Spotlight gewesen. */
export const wasTurn = (e: RosterEntry) => !!e.marks.gefragt || !!e.marks.gesprochen || e.spotlightAt !== null;

type Filter = 'alle' | 'offen' | 'dran' | 'merken';

/**
 * Hält die Liste mit dem Zoom-Meeting aktuell: Wer neu im Meeting ist, kommt dazu (ohne Host und
 * Team-Namen), wer im Spotlight steht, wird vermerkt. Wer geht, bleibt mit seinen Markierungen stehen.
 */
export function useRosterSync() {
  const { zoomPeople } = useSync();
  const { state, dispatch } = useStore();
  const entries = state.roster.entries;
  const team = state.settings.teamNames;
  useEffect(() => {
    if (!zoomPeople.list.length) return;
    const people = zoomPeople.list.filter((p) => !p.host && !matchesTeamName(p.name, team));
    const names = people.map((p) => p.name);
    const spot = people.filter((p) => zoomPeople.spotlight.includes(p.userId)).map((p) => p.name);
    const now = Date.now();
    const needs =
      names.some((n) => !entries[rosterKey(n)]) ||
      spot.some((n) => {
        const e = entries[rosterKey(n)];
        return !!e && (e.spotlightAt === null || now - e.spotlightAt > 60_000);
      });
    if (needs) dispatch({ type: 'roster/seen', names, spotlightNames: spot, at: now });
  }, [zoomPeople, entries, team, dispatch]);
}

/** Persönliche Liste „Wer war dran“: Teilnehmende aus Zoom markieren, nur für dich sichtbar. */
export function RosterList({ popup = false }: { popup?: boolean }) {
  const { state, dispatch, notify } = useStore();
  const { zoomPeople, regie } = useSync();
  const zoom = useZoomSpotlight();
  const ids = { search: useId(), add: useId() };
  const [filter, setFilter] = useState<Filter>('alle');
  const [onlyPresent, setOnlyPresent] = useState(false);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const present = useMemo(() => {
    const m = new Map<string, ZoomPerson>();
    for (const p of zoomPeople.list) m.set(rosterKey(p.name), p);
    return m;
  }, [zoomPeople]);
  const all = Object.values(state.roster.entries);
  const live = regie?.state === 'verbunden';
  const isPresent = (e: RosterEntry) => present.has(e.key);
  const doneCount = all.filter(wasTurn).length;
  const presentCount = all.filter(isPresent).length;

  const shown = all
    .filter((e) => {
      if (onlyPresent && !isPresent(e)) return false;
      if (filter === 'offen' && wasTurn(e)) return false;
      if (filter === 'dran' && !wasTurn(e)) return false;
      if (filter === 'merken' && !e.marks.merken) return false;
      const q = query.trim().toLowerCase();
      return !q || e.name.toLowerCase().includes(q) || e.note.toLowerCase().includes(q);
    })
    .sort(
      (a, b) =>
        // Noch nicht dran und anwesend zuerst, dann nach Name.
        Number(wasTurn(a)) - Number(wasTurn(b)) ||
        Number(isPresent(b)) - Number(isPresent(a)) ||
        a.name.localeCompare(b.name, 'de'),
    );

  const mark = (e: RosterEntry, m: RosterMark) => dispatch({ type: 'roster/mark', key: e.key, mark: m, on: !e.marks[m], at: Date.now() });

  /** Zufälliger Vorschlag unter den Anwesenden, die noch nicht dran waren. */
  const suggest = () => {
    const pool = all.filter((e) => isPresent(e) && !wasTurn(e) && e.key !== suggestion);
    const fallback = all.filter((e) => !wasTurn(e) && e.key !== suggestion);
    const list = pool.length ? pool : fallback;
    if (!list.length) {
      notify(all.length ? 'Alle waren schon dran.' : 'Noch niemand in der Liste.', 'info', false);
      setSuggestion(null);
      return;
    }
    setSuggestion(list[Math.floor(Math.random() * list.length)].key);
  };
  const suggested = suggestion ? state.roster.entries[suggestion] : null;
  useEffect(() => {
    if (suggested && wasTurn(suggested)) setSuggestion(null);
  }, [suggested]);

  return (
    <div className={`roster${popup ? ' roster--popup' : ''}`}>
      <div className="roster__summary">
        <div className="roster__progress" aria-label={`${doneCount} von ${all.length} schon dran`}>
          <strong className="tabular">
            {doneCount} von {all.length}
          </strong>{' '}
          schon dran
          {live && <span className="subtle"> · {presentCount} gerade im Meeting</span>}
          <span className="roster__bar" aria-hidden>
            <span style={{ width: `${all.length ? (doneCount / all.length) * 100 : 0}%` }} />
          </span>
        </div>
        <Button variant="primary" icon={Dices} onClick={suggest} disabled={!all.length}>
          Wen als Nächstes?
        </Button>
      </div>

      {suggested && (
        <div className="roster__suggest" role="status">
          <UserRound size={18} aria-hidden />
          <span>
            Vorschlag: <strong>{suggested.name}</strong>
            {!isPresent(suggested) && <span className="subtle"> (gerade nicht im Meeting)</span>}
          </span>
          <span className="roster__suggest-actions">
            {live && present.get(suggested.key) && (
              <Button size="sm" icon={Star} onClick={() => zoom.toggle(present.get(suggested.key)!)}>
                Spotlight
              </Button>
            )}
            <Button size="sm" icon={Check} onClick={() => dispatch({ type: 'roster/mark', key: suggested.key, mark: 'gefragt', on: true, at: Date.now() })}>
              Gefragt
            </Button>
            <Button size="sm" variant="ghost" icon={Dices} onClick={suggest}>
              Anderer
            </Button>
            <IconButton label="Vorschlag schließen" icon={X} onClick={() => setSuggestion(null)} />
          </span>
        </div>
      )}

      <div className="roster__tools">
        <Segmented<Filter>
          label="Zeigen"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'alle', label: 'Alle' },
            { value: 'offen', label: 'Noch nicht dran' },
            { value: 'dran', label: 'Schon dran' },
            { value: 'merken', label: 'Gemerkt' },
          ]}
        />
        <Switch checked={onlyPresent} onChange={setOnlyPresent} label="Nur wer gerade im Meeting ist" />
        <label htmlFor={ids.search} className="sr-only">
          Suchen
        </label>
        <input id={ids.search} className="input input--sm roster__search" value={query} placeholder="Name oder Notiz suchen" onChange={(e) => setQuery(e.target.value)} />
      </div>

      {all.length === 0 ? (
        <Empty icon={UserRound} title="Noch niemand in der Liste" compact>
          <p>
            {live
              ? 'Die Teilnehmenden aus Zoom erscheinen hier gleich von selbst.'
              : 'Sobald die Regie im Zoom-Meeting ist, erscheinen hier alle Teilnehmenden. Du kannst auch selbst Namen hinzufügen.'}
          </p>
        </Empty>
      ) : shown.length === 0 ? (
        <p className="subtle roster__none">Niemand passt zum Filter.</p>
      ) : (
        <ul className="roster__list">
          {shown.map((e) => {
            const p = present.get(e.key);
            const done = wasTurn(e);
            const inSpot = !!p && zoomPeople.spotlight.includes(p.userId);
            return (
              <li key={e.key} className={`roster-row${done ? ' is-done' : ''}${p ? '' : ' is-away'}${suggestion === e.key ? ' is-suggested' : ''}`}>
                <div className="roster-row__main">
                  <span className={`roster-row__dot${p ? ' is-on' : ''}`} title={p ? 'Im Meeting' : 'Gerade nicht im Meeting'} aria-hidden />
                  <strong className="roster-row__name">{e.name}</strong>
                  {done && <Check size={15} className="roster-row__check" aria-label="Schon dran" />}
                  {p?.hand && (
                    <span className="roster-row__hand" title="Hand gehoben">
                      <Hand size={13} aria-hidden /> Hand
                    </span>
                  )}
                  {e.spotlightAt !== null && <span className="roster-row__meta">Spotlight {clock(e.spotlightAt, false)}</span>}
                  {!p && <span className="roster-row__meta">{e.manual ? 'von Hand' : 'nicht im Meeting'}</span>}
                </div>
                <div className="roster-row__marks" role="group" aria-label={`Markierungen für ${e.name}`}>
                  {MARKS.map((m) => {
                    const at = e.marks[m.id];
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`roster-mark roster-mark--${m.id}${at ? ' is-on' : ''}`}
                        aria-pressed={!!at}
                        title={at ? `${m.label} um ${clock(at, false)} Uhr (Klick nimmt es zurück)` : m.label}
                        onClick={() => mark(e, m.id)}
                      >
                        <m.icon size={14} aria-hidden />
                        <span>{m.short}</span>
                        {at && !popup && <span className="roster-mark__time">{clock(at, false)}</span>}
                      </button>
                    );
                  })}
                  <IconButton
                    label={e.note ? `Notiz: ${e.note}` : 'Notiz hinzufügen'}
                    icon={NotebookPen}
                    tone={e.note ? 'accent' : undefined}
                    onClick={() => setNoteOpen(noteOpen === e.key ? null : e.key)}
                  />
                  {live && p && (
                    <IconButton label={inSpot ? `${e.name} aus dem Spotlight nehmen` : `${e.name} ins Spotlight`} icon={Star} tone={inSpot ? 'accent' : undefined} onClick={() => zoom.toggle(p)} />
                  )}
                </div>
                {(noteOpen === e.key || e.note) && (
                  <div className="roster-row__note">
                    {noteOpen === e.key ? (
                      <>
                        <input
                          className="input input--sm"
                          autoFocus
                          value={e.note}
                          maxLength={200}
                          placeholder="z. B. Thema, Frage, Rückmeldung"
                          aria-label={`Notiz zu ${e.name}`}
                          onChange={(ev) => dispatch({ type: 'roster/note', key: e.key, note: ev.target.value })}
                          onKeyDown={(ev) => ev.key === 'Enter' && setNoteOpen(null)}
                        />
                        {e.manual && (
                          <IconButton label={`${e.name} aus der Liste entfernen`} icon={Trash2} onClick={() => dispatch({ type: 'roster/remove', key: e.key })} />
                        )}
                      </>
                    ) : (
                      <button type="button" className="roster-row__note-text" onClick={() => setNoteOpen(e.key)}>
                        {e.note}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="roster__foot">
        <form
          className="roster__add"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!newName.trim()) return;
            dispatch({ type: 'roster/add', name: newName, at: Date.now() });
            setNewName('');
          }}
        >
          <label htmlFor={ids.add} className="sr-only">
            Person hinzufügen
          </label>
          <input id={ids.add} className="input input--sm" value={newName} maxLength={60} placeholder="Person von Hand hinzufügen" onChange={(ev) => setNewName(ev.target.value)} />
          <Button size="sm" type="submit" icon={Plus} disabled={!newName.trim()}>
            Hinzufügen
          </Button>
        </form>
        {confirmReset ? (
          <span className="row">
            <span className="subtle">Alle Markierungen und Notizen löschen?</span>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                dispatch({ type: 'roster/clearMarks' });
                setConfirmReset(false);
                setSuggestion(null);
                notify('Markierungen zurückgesetzt', 'info');
              }}
            >
              Löschen
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              Abbrechen
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)} disabled={!doneCount && !all.some((e) => e.note || e.marks.merken)}>
            Markierungen zurücksetzen
          </Button>
        )}
      </div>
      {!popup && (
        <p className="field-hint">
          Nur für dich: Die Liste erscheint nirgends in OBS oder Zoom. Host und Team-Namen aus den Einstellungen kommen nicht in die Liste. Wer im
          Spotlight war, zählt automatisch als „schon dran“. Nach einem Neustart der App beginnt die Liste leer.
        </p>
      )}
    </div>
  );
}

/** Die Liste als eigenes Fenster, z. B. neben Zoom. */
export function RosterPopupWindow() {
  const { rosterPopupOpen, setRosterPopupOpen } = useUi();
  return (
    <PortalWindow
      name="mb-dran"
      title="MeetingBackstage · Wer war dran"
      open={rosterPopupOpen}
      onClosed={() => setRosterPopupOpen(false)}
      width={460}
      height={860}
      className="roster-popup"
    >
      {(close) => (
        <>
          <header className="roster-popup__head">
            <strong>Wer war dran</strong>
            <Button size="sm" variant="ghost" onClick={close}>
              Fenster schließen
            </Button>
          </header>
          <RosterList popup />
        </>
      )}
    </PortalWindow>
  );
}

export const focusRosterPopup = () => focusPortalWindow('mb-dran');
