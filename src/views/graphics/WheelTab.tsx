import { useEffect, useId, useState } from 'react';
import { Disc3, Eraser, ListRestart, RotateCcw, RotateCw, Trophy, Undo2, X } from 'lucide-react';
import { Wheel } from '../../components/graphics/Wheel.tsx';
import { Badge, Button, Empty, Field, Panel, Segmented, Switch } from '../../components/ui.tsx';
import { TemplateBar } from '../../components/TemplateBar.tsx';
import { clock } from '../../lib/time.ts';
import { parseWheelList, spinDone, WHEEL_MAX, wheelCandidates, wheelEntries } from '../../lib/wheel.ts';
import { useCommands } from '../../state/commands.ts';
import { useNow, useStore } from '../../state/store.tsx';
import type { WheelState } from '../../state/types.ts';
import { GraphicHeader } from './shared.tsx';

/** Glücksrad: Namen aus dem Chat oder eigene Einträge, drehen, Ergebnis zeigen. */
export function WheelTab() {
  const { state, dispatch, notify } = useStore();
  const commands = useCommands();
  const now = useNow();
  const w = state.wheel;
  const ids = { title: useId(), keyword: useId(), list: useId() };
  const set = (patch: Partial<WheelState>) => dispatch({ type: 'wheel/update', patch });
  const entries = wheelEntries(state);
  const candidates = wheelCandidates(state);
  const removed = new Set(w.removed);
  const spinning = !!w.spin && !spinDone(w.spin, Date.now());
  const done = spinDone(w.spin, now);
  const winner = w.spin && done ? w.spin.entries[w.spin.winnerIndex] : null;
  const history = w.history.filter((h) => h.at <= now);
  const [confirmReset, setConfirmReset] = useState(false);

  // Eigene Liste als Text bearbeiten; übernommen wird bei jeder Änderung.
  const [text, setText] = useState(() => w.custom.join('\n'));
  useEffect(() => {
    if (parseWheelList(text).join('\n') !== w.custom.join('\n')) setText(w.custom.join('\n'));
    // Nur reagieren, wenn die Liste von außen (Vorlage) wechselt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.custom]);

  return (
    <div className="graphic">
      <GraphicHeader
        kind="gluecksrad"
        title="Glücksrad"
        status={
          <>
            <Badge tone={entries.length >= 2 ? 'ok' : 'warn'}>
              {entries.length} {entries.length === 1 ? 'Feld' : 'Felder'} im Rad
            </Badge>
            <span className="subtle">{w.source === 'chat' ? 'Namen aus dem Chat' : 'Eigene Liste'}</span>
          </>
        }
      >
        <Button variant="primary" icon={RotateCw} onClick={commands.spinWheel} disabled={spinning || entries.length < 2} title="Taste D oder Stream Deck">
          {spinning ? 'Dreht …' : 'Drehen'}
        </Button>
      </GraphicHeader>

      <div className="graphic-tools">
        <div className="field graphic-tools__question">
          <label className="field-label" htmlFor={ids.title}>
            Überschrift
          </label>
          <input id={ids.title} className="input" value={w.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <Segmented<number>
          label="Drehdauer"
          value={w.durationSec}
          onChange={(durationSec) => set({ durationSec })}
          options={[
            { value: 4, label: '4 s' },
            { value: 6, label: '6 s' },
            { value: 9, label: '9 s' },
            { value: 12, label: '12 s' },
          ]}
        />
      </div>

      <div className="wheel-layout">
        <Panel eyebrow="Live-Vorschau" title={w.title || 'Glücksrad'} className="wheel-preview">
          <div className="wheel-preview__stage">
            <Wheel entries={entries} restDeg={w.restDeg} spin={w.spin} look={state.looks.gluecksrad} />
          </div>
          <div className="wheel-result" aria-live="polite">
            {spinning ? (
              <span className="subtle">Das Rad dreht sich …</span>
            ) : winner ? (
              <>
                <Trophy size={18} aria-hidden />
                <span>
                  Gewählt: <strong>{winner}</strong>
                </span>
                <Button size="sm" variant="ghost" icon={Eraser} onClick={() => dispatch({ type: 'wheel/clearResult' })}>
                  Ergebnis ausblenden
                </Button>
              </>
            ) : (
              <span className="subtle">„Drehen“ wählt zufällig einen Eintrag. Das Rad läuft dabei automatisch ins Programm.</span>
            )}
          </div>
          {w.removeWinner && winner && <p className="field-hint">„{winner}“ wird beim nächsten Drehen aus dem Rad genommen.</p>}
        </Panel>

        <div className="stack">
          <Panel eyebrow="Einträge" title="Woher kommen die Felder?">
            <div className="stack">
              <Segmented<WheelState['source']>
                label="Quelle"
                value={w.source}
                onChange={(source) => set({ source })}
                options={[
                  { value: 'chat', label: 'Namen aus dem Chat' },
                  { value: 'eigene', label: 'Eigene Liste' },
                ]}
              />
              {w.source === 'chat' ? (
                <>
                  <Field
                    label="Nur wer dieses Wort schreibt (optional)"
                    htmlFor={ids.keyword}
                    hint={'Z. B. „dabei“: Dann kommen nur Personen ins Rad, die „dabei“ in den Chat schreiben. Leer = alle, die etwas geschrieben haben.'}
                  >
                    <input
                      id={ids.keyword}
                      className="input"
                      value={w.keyword}
                      maxLength={30}
                      placeholder="z. B. dabei"
                      onChange={(e) => set({ keyword: e.target.value })}
                    />
                  </Field>
                  <p className="subtle">
                    Gesammelt seit {clock(w.since, false)} Uhr. Team-Namen aus den Einstellungen kommen nicht ins Rad.
                  </p>
                </>
              ) : (
                <>
                  <Field label="Einträge (einer pro Zeile)" htmlFor={ids.list} hint="Namen, Themen, Preise … Doppelte werden zusammengefasst.">
                    <textarea
                      id={ids.list}
                      className="input wheel-list-input"
                      rows={7}
                      value={text}
                      placeholder={'Anna\nBen\nCarla'}
                      onChange={(e) => {
                        setText(e.target.value);
                        set({ custom: parseWheelList(e.target.value) });
                      }}
                    />
                  </Field>
                  <TemplateBar
                    kind="gluecksrad-liste"
                    saveLabel="Liste als Vorlage speichern"
                    current={{ liste: w.custom } as Record<string, unknown>}
                    onApply={(data) => {
                      const list = Array.isArray(data.liste) ? (data.liste as string[]) : [];
                      set({ custom: list });
                      setText(list.join('\n'));
                      notify('Liste übernommen', 'info', false);
                    }}
                    isActive={(data) => Array.isArray(data.liste) && (data.liste as string[]).join('\n') === w.custom.join('\n')}
                  />
                </>
              )}
              <Switch
                checked={w.removeWinner}
                onChange={(removeWinner) => set({ removeWinner })}
                label="Gewählte aus dem Rad nehmen"
                description="Jede Person bzw. jeder Eintrag wird nur einmal gewählt."
              />
            </div>
          </Panel>

          <Panel
            eyebrow="Klick nimmt heraus oder wieder auf"
            title={
              <>
                Im Rad <span className="subtle tabular">{entries.length}</span>
              </>
            }
            actions={
              w.removed.length > 0 && (
                <Button size="sm" variant="ghost" icon={Undo2} onClick={() => dispatch({ type: 'wheel/restore' })}>
                  Alle wieder aufnehmen
                </Button>
              )
            }
            flush
          >
            {candidates.length === 0 ? (
              <Empty icon={Disc3} title={w.source === 'chat' ? 'Noch niemand im Rad' : 'Noch keine Einträge'} compact>
                <p>
                  {w.source === 'chat'
                    ? w.keyword.trim()
                      ? `Sobald jemand „${w.keyword.trim()}“ in den Chat schreibt, erscheint der Name hier.`
                      : 'Sobald jemand im Chat schreibt, erscheint der Name hier.'
                    : 'Trage oben deine Einträge ein.'}
                </p>
              </Empty>
            ) : (
              <ul className="wheel-names">
                {candidates.map((n) => {
                  const out = removed.has(n.toLowerCase());
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        className={`wheel-names__item${out ? ' is-out' : ''}`}
                        aria-pressed={!out}
                        onClick={() => dispatch({ type: 'wheel/toggleRemoved', name: n })}
                        title={out ? 'Wieder ins Rad nehmen' : 'Aus dem Rad nehmen'}
                      >
                        {n}
                        {out ? <ListRestart size={13} aria-hidden /> : <X size={13} aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {candidates.length > WHEEL_MAX && <p className="field-hint wheel-names__more">Im Rad sind höchstens {WHEEL_MAX} Felder, weitere werden nicht gezeigt.</p>}
          </Panel>

          <Panel
            eyebrow="Ergebnisse"
            title="Bisher gewählt"
            actions={
              confirmReset ? (
                <span className="row">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      dispatch({ type: 'wheel/reset', at: Date.now() });
                      setConfirmReset(false);
                      notify('Glücksrad zurückgesetzt', 'info');
                    }}
                  >
                    Zurücksetzen
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                    Abbrechen
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)} title="Ergebnisse löschen, alle wieder ins Rad, Chat-Namen ab jetzt neu sammeln">
                  Neu starten
                </Button>
              )
            }
          >
            {history.length === 0 ? (
              <p className="subtle">Noch nicht gedreht.</p>
            ) : (
              <ol className="wheel-history">
                {history.map((h, i) => (
                  <li key={`${h.at}-${i}`}>
                    <strong>{h.name}</strong> <span className="subtle tabular">{clock(h.at, false)} Uhr</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
