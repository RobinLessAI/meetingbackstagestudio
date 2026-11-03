import { useId, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  MessageSquareQuote,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  Vote,
  X,
} from 'lucide-react';
import { PollChart } from '../../components/graphics/PollChart.tsx';
import { pollView } from '../../sync/snapshot.ts';
import { Badge, Button, Dialog, Empty, Field, IconButton, Panel, Segmented, Switch } from '../../components/ui.tsx';
import { optionKey } from '../../lib/poll.ts';
import { clock } from '../../lib/time.ts';
import { useCommands } from '../../state/commands.ts';
import { nextId, useStore } from '../../state/store.tsx';
import type { PollDecision, PollOption, PollState } from '../../state/types.ts';
import { GraphicHeader } from './shared.tsx';

function PollEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, notify } = useStore();
  const [kind, setKind] = useState<PollState['kind']>(state.poll.kind);
  const [question, setQuestion] = useState(state.poll.question);
  const [labelStyle, setLabelStyle] = useState<PollState['labelStyle']>(state.poll.labelStyle);
  const [options, setOptions] = useState<PollOption[]>(state.poll.options);
  const [errors, setErrors] = useState<{ question?: string; options?: string }>({});
  const qId = useId();

  const save = (start: boolean) => {
    const cleaned = options.map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text);
    const errs: typeof errors = {};
    if (!question.trim()) errs.question = 'Bitte eine Frage eingeben.';
    if (kind === 'auswahl') {
      if (cleaned.length < 2) errs.options = 'Mindestens zwei Antwortoptionen eintragen.';
      const texts = cleaned.map((o) => o.text.toLowerCase());
      if (new Set(texts).size !== texts.length) errs.options = 'Antwortoptionen müssen sich unterscheiden.';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    dispatch({ type: 'poll/configure', kind, question: question.trim(), options: cleaned, labelStyle });
    if (start) dispatch({ type: 'poll/start', at: Date.now() });
    notify(start ? 'Neue Umfrage gestartet. Antworten aus dem Chat werden ab jetzt gezählt.' : 'Umfrage als Entwurf gespeichert', 'erfolg');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Umfrage anlegen"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => save(false)}>Als Entwurf speichern</Button>
          <Button variant="primary" icon={Play} onClick={() => save(true)}>
            Speichern und starten
          </Button>
        </>
      }
    >
      <Segmented<PollState['kind']>
        label="Art der Frage"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'auswahl', label: 'Auswahl (A, B, C …)' },
          { value: 'offen', label: 'Offene Frage' },
        ]}
      />
      <Field label="Frage" htmlFor={qId} error={errors.question}>
        <input id={qId} className="input" value={question} maxLength={120} onChange={(e) => setQuestion(e.target.value)} autoFocus />
      </Field>
      {kind === 'auswahl' ? (
        <>
          <Segmented<PollState['labelStyle']>
            label="Kennzeichnung"
            value={labelStyle}
            onChange={setLabelStyle}
            options={[
              { value: 'buchstaben', label: 'A, B, C' },
              { value: 'zahlen', label: '1, 2, 3' },
            ]}
          />
          <fieldset className="option-editor">
            <legend className="field-label">Antwortoptionen (2 bis 6)</legend>
            {options.map((o, i) => (
              <div key={o.id} className="option-editor__row">
                <span className="poll-key">{optionKey(i, labelStyle)}</span>
                <label className="sr-only" htmlFor={`opt-${o.id}`}>
                  Option {optionKey(i, labelStyle)}
                </label>
                <input
                  id={`opt-${o.id}`}
                  className="input"
                  value={o.text}
                  maxLength={60}
                  onChange={(e) => setOptions((list) => list.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))}
                />
                <IconButton
                  label={`Option ${optionKey(i, labelStyle)} entfernen`}
                  icon={Trash2}
                  disabled={options.length <= 2}
                  onClick={() => setOptions((list) => list.filter((x) => x.id !== o.id))}
                />
              </div>
            ))}
            {errors.options && (
              <span className="field-error" role="alert">
                {errors.options}
              </span>
            )}
            <Button
              size="sm"
              icon={Plus}
              disabled={options.length >= 6}
              onClick={() => setOptions((list) => [...list, { id: nextId('o'), text: '' }])}
            >
              Option hinzufügen
            </Button>
          </fieldset>
          <p className="field-hint">
            Gültig sind Chat-Nachrichten, die genau einer Kennung (Buchstabe oder Zahl) oder genau dem Antworttext entsprechen.
          </p>
        </>
      ) : (
        <p className="muted">Bei einer offenen Frage wird jede Chat-Nachricht von Teilnehmenden als Antwort gesammelt. Einzelne Antworten lassen sich ausblenden.</p>
      )}
      <p className="field-hint">Beim Speichern werden bisherige Ergebnisse und Prüfentscheidungen zurückgesetzt.</p>
    </Dialog>
  );
}

export function PollTab() {
  const { state, derived, dispatch, notify } = useStore();
  const commands = useCommands();
  const [editorOpen, setEditorOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const poll = state.poll;
  const a = derived.poll;
  const keyOf = (optionId: string) => {
    const i = poll.options.findIndex((o) => o.id === optionId);
    return i >= 0 ? optionKey(i, poll.labelStyle) : '?';
  };
  const textOf = (optionId: string) => poll.options.find((o) => o.id === optionId)?.text ?? '';
  const decide = (messageId: string, decision: PollDecision | null, msg: string) => {
    dispatch({ type: 'poll/decide', messageId, decision });
    notify(msg, 'info');
  };

  const statusBadge =
    poll.status === 'laeuft' ? (
      <Badge tone="ok">Läuft seit {poll.startedAt ? clock(poll.startedAt, false) : '–'}</Badge>
    ) : poll.status === 'geschlossen' ? (
      <Badge tone="neutral" icon={Lock}>
        Geschlossen {poll.closedAt ? clock(poll.closedAt, false) : ''}
      </Badge>
    ) : (
      <Badge tone="neutral">Entwurf, noch nicht gestartet</Badge>
    );

  return (
    <div className="graphic">
      <GraphicHeader
        kind="umfrage"
        title={poll.kind === 'offen' ? 'Offene Frage' : 'Live-Umfrage'}
        status={
          <>
            {statusBadge}
            <span className="subtle tabular">
              {poll.kind === 'offen'
                ? `${a.totalVotes} Antworten von ${a.voters} Personen`
                : `${a.totalVotes} Stimmen · ${a.unclear.length} zur Prüfung`}
            </span>
          </>
        }
      />

      <div className="graphic-tools">
        <div className="row graphic-tools__buttons">
          {poll.status === 'entwurf' && (
            <Button variant="primary" icon={Play} onClick={() => { dispatch({ type: 'poll/start', at: Date.now() }); notify('Umfrage gestartet', 'erfolg'); }}>
              Starten
            </Button>
          )}
          {poll.status === 'laeuft' && (
            <Button icon={Lock} onClick={commands.closePoll}>
              Abstimmung schließen
            </Button>
          )}
          {poll.status === 'geschlossen' && (
            <Button icon={LockOpen} onClick={() => { dispatch({ type: 'poll/reopen', at: Date.now() }); notify('Umfrage wieder geöffnet', 'info'); }}>
              Wieder öffnen
            </Button>
          )}
          <Button icon={RotateCcw} variant="ghost" onClick={() => setResetOpen(true)} disabled={poll.status === 'entwurf'}>
            Zurücksetzen
          </Button>
          <Button icon={Pencil} variant="ghost" onClick={() => setEditorOpen(true)}>
            Neue Frage
          </Button>
        </div>
        {poll.kind === 'auswahl' && (
          <Segmented<PollState['chart']>
            label="Darstellung"
            value={poll.chart}
            onChange={(chart) => dispatch({ type: 'poll/update', patch: { chart } })}
            options={[
              { value: 'balken', label: 'Balken' },
              { value: 'kreis', label: 'Kreis' },
            ]}
          />
        )}
      </div>

      <div className="poll-layout">
        <Panel eyebrow="Live-Vorschau" title={poll.question} className="poll-preview">
          {poll.status === 'entwurf' && (
            <p className="callout callout--info">
              <Vote size={16} aria-hidden /> Die Umfrage ist ein Entwurf. Erst nach dem Start werden Chat-Antworten gezählt.
            </p>
          )}
          <PollChart data={pollView(poll, a)} />
          {poll.kind === 'auswahl' && (
            <div className="poll-rule">
              <Switch
                checked={poll.countRule === 'letzte'}
                onChange={(v) => dispatch({ type: 'poll/update', patch: { countRule: v ? 'letzte' : 'alle' } })}
                label="Pro Person zählt nur die zuletzt abgegebene gültige Antwort"
                description={
                  poll.countRule === 'letzte'
                    ? 'Standard. Wer umentscheidet, wird nicht doppelt gezählt.'
                    : 'Achtung: Jede gültige Nachricht zählt als eigene Stimme.'
                }
              />
              <p className="subtle">
                Gültig: {poll.options.map((_, i) => optionKey(i, 'buchstaben')).join(', ')} oder{' '}
                {poll.options.map((_, i) => optionKey(i, 'zahlen')).join(', ')} oder genau der Antworttext.
              </p>
            </div>
          )}
        </Panel>

        <div className="stack">
          {poll.kind === 'auswahl' ? (
            <>
              <Panel
                eyebrow="Moderation"
                title={
                  <>
                    Zur Prüfung <span className="subtle tabular">{a.unclear.length}</span>
                  </>
                }
                flush
              >
                {a.unclear.length === 0 ? (
                  <Empty icon={Check} title="Keine unklaren Antworten" compact>
                    <p>Nachrichten wie „eher B“ oder „B oder C“ erscheinen hier zur Zuordnung.</p>
                  </Empty>
                ) : (
                  <ul className="review-list">
                    {a.unclear.map((u) => (
                      <li key={u.message.id} className="review">
                        <div className="review__msg">
                          <span className="review__who">
                            {u.message.senderName} <span className="subtle tabular">{clock(u.message.at, false)}</span>
                          </span>
                          <q className="review__text">{u.message.text}</q>
                        </div>
                        <div className="review__actions">
                          {poll.options.map((o) => (
                            <Button
                              key={o.id}
                              size="sm"
                              variant={u.optionIds.includes(o.id) ? 'secondary' : 'ghost'}
                              onClick={() => decide(u.message.id, { status: 'zugeordnet', optionId: o.id }, `Antwort von ${u.message.senderName} als ${keyOf(o.id)} gezählt`)}
                              title={o.text}
                            >
                              {keyOf(o.id)}
                            </Button>
                          ))}
                          <Button size="sm" variant="ghost" icon={X} onClick={() => decide(u.message.id, { status: 'verworfen' }, `Antwort von ${u.message.senderName} verworfen`)}>
                            Verwerfen
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                eyebrow="Gezählte Antworten"
                title={
                  <>
                    Stimmen <span className="subtle tabular">{a.votes.length}</span>
                  </>
                }
                flush
              >
                {a.votes.length === 0 ? (
                  <Empty icon={Vote} title="Noch keine Stimmen" compact>
                    <p>Im Chat-Simulator z. B. „B“ oder „2“ senden.</p>
                  </Empty>
                ) : (
                  <ul className="vote-log">
                    {a.votes.map((v) => (
                      <li key={v.message.id} className={v.counted ? '' : 'is-replaced'}>
                        <span className="poll-key">{keyOf(v.optionId)}</span>
                        <span className="vote-log__who">
                          {v.message.senderName}
                          <span className="subtle">
                            „{v.message.text}“ · {v.manual ? 'manuell zugeordnet' : 'automatisch'} · {textOf(v.optionId)}
                          </span>
                        </span>
                        {!v.counted && <Badge>ersetzt</Badge>}
                        <IconButton
                          label={v.manual ? `Zuordnung für ${v.message.senderName} zurücknehmen` : `Stimme von ${v.message.senderName} verwerfen`}
                          icon={v.manual ? Undo2 : X}
                          onClick={() =>
                            v.manual
                              ? decide(v.message.id, null, `Zuordnung für ${v.message.senderName} zurückgenommen`)
                              : decide(v.message.id, { status: 'verworfen' }, `Stimme von ${v.message.senderName} verworfen`)
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {a.discarded.length > 0 && (
                  <div className="dismissed">
                    <span className="subtle">Verworfen:</span>
                    <ul className="dismissed__list">
                      {a.discarded.map((m) => (
                        <li key={m.id}>
                          <span>
                            {m.senderName}: <q>{m.text}</q>
                          </span>
                          <Button size="sm" variant="ghost" icon={Undo2} onClick={() => decide(m.id, null, `Antwort von ${m.senderName} wiederhergestellt`)}>
                            Wiederherstellen
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>
            </>
          ) : (
            <Panel
              eyebrow="Gesammelte Antworten"
              title={
                <>
                  Antworten <span className="subtle tabular">{a.openAnswers.length}</span>
                </>
              }
              flush
            >
              {a.openAnswers.length === 0 ? (
                <Empty icon={MessageSquareQuote} title="Noch keine Antworten" compact>
                  <p>Jede Chat-Nachricht von Teilnehmenden wird hier gesammelt.</p>
                </Empty>
              ) : (
                <ul className="vote-log">
                  {[...a.openAnswers].reverse().map(({ message, hidden }) => (
                    <li key={message.id} className={hidden ? 'is-replaced' : ''}>
                      <span className="vote-log__who">
                        {message.text}
                        <span className="subtle">
                          {message.senderName} · {clock(message.at, false)}
                        </span>
                      </span>
                      <IconButton
                        label={`Antwort von ${message.senderName} als Highlight wählen`}
                        icon={MessageSquareQuote}
                        pressed={state.highlightId === message.id}
                        onClick={() => dispatch({ type: 'highlight/set', id: message.id })}
                      />
                      <IconButton
                        label={hidden ? `Antwort von ${message.senderName} wieder anzeigen` : `Antwort von ${message.senderName} ausblenden`}
                        icon={hidden ? Eye : EyeOff}
                        onClick={() => decide(message.id, hidden ? null : { status: 'verworfen' }, hidden ? 'Antwort wieder sichtbar' : 'Antwort ausgeblendet')}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      </div>

      {editorOpen && <PollEditor open={editorOpen} onClose={() => setEditorOpen(false)} />}
      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Abstimmung zurücksetzen?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger-solid"
              icon={RotateCcw}
              onClick={() => {
                dispatch({ type: 'poll/reset', at: Date.now() });
                setResetOpen(false);
                notify('Abstimmung zurückgesetzt. Es zählen nur noch neue Chat-Antworten.', 'info');
              }}
            >
              Zurücksetzen
            </Button>
          </>
        }
      >
        <p>
          Alle {a.totalVotes} Stimmen und Prüfentscheidungen werden verworfen. Frage und Antwortoptionen bleiben erhalten. Die Abstimmung läuft
          danach sofort weiter.
        </p>
      </Dialog>
    </div>
  );
}
