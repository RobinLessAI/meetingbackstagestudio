import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CloudIcon, MapPin, MessageSquare, MessageSquareQuote, Send, Vote } from 'lucide-react';
import { PLACE_BY_ID } from '../data/places.ts';
import { clock } from '../lib/time.ts';
import { useCommands } from '../state/commands.ts';
import type { MessageTags } from '../state/derive.ts';
import { useStore } from '../state/store.tsx';
import { LiveChatBadge } from './LiveChat.tsx';
import { ROLE_LABEL } from './people.tsx';
import { DemoTag, Empty, Switch } from './ui.tsx';

const EXAMPLES: Array<{ label: string; texts: string[] }> = [
  { label: 'Ort', texts: ['Grüße aus Salzburg', 'Berlin', 'Hallo aus Münster', 'Dortmund', 'Soest', 'Live aus Basel'] },
  { label: 'Mehrdeutiger Ort', texts: ['Frankfurt', 'Sitze in Halle'] },
  { label: 'Unbekannter Ort', texts: ['Grüße aus Kleinkleckersdorf', 'Moin aus Büderich'] },
  { label: 'Stimme', texts: ['A', 'B', 'c', '4', 'Live-Demos', 'Antwort 2'] },
  { label: 'Unklare Stimme', texts: ['eher A', 'B oder D', 'ich schwanke zwischen 1 und 3'] },
  { label: 'Begriff', texts: ['Aufmerksamkeit', 'Pausen', 'Struktur', 'Rituale', 'Beziehung', 'Blickkontakt'] },
];

function TagChips({ tags, onFlag }: { tags: MessageTags; onFlag?: () => void }) {
  const chips: ReactNode[] = [];
  if (tags.team) {
    chips.push(
      <span key="team" className="chip chip--muted">
        Team · nicht ausgewertet
      </span>,
    );
    return <div className="chips">{chips}</div>;
  }
  if (tags.location) {
    const loc = tags.location;
    const label =
      loc.kind === 'eindeutig'
        ? PLACE_BY_ID[loc.placeId]?.name
        : loc.kind === 'mehrdeutig'
          ? `${loc.matched}: mehrdeutig`
          : `${loc.candidate}: unbekannt`;
    const state = tags.locationState === 'bestaetigt' ? 'auf Karte' : tags.locationState === 'verworfen' ? 'verworfen' : 'prüfen';
    chips.push(
      <span key="loc" className={`chip chip--${tags.locationState === 'offen' ? 'warn' : tags.locationState === 'bestaetigt' ? 'ok' : 'muted'}`}>
        <MapPin size={11} aria-hidden /> {label} · {state}
      </span>,
    );
  } else if (tags.locationState === 'offen') {
    chips.push(
      <span key="loc" className="chip chip--warn">
        <MapPin size={11} aria-hidden /> Ort manuell prüfen
      </span>,
    );
  }
  if (tags.vote) {
    const v = tags.vote;
    const text =
      v.state === 'gezaehlt'
        ? `Stimme ${v.label}`
        : v.state === 'ersetzt'
          ? `Stimme ${v.label} · ersetzt`
          : v.state === 'pruefen'
            ? 'Stimme prüfen'
            : 'Stimme verworfen';
    chips.push(
      <span key="vote" className={`chip chip--${v.state === 'gezaehlt' ? 'ok' : v.state === 'pruefen' ? 'warn' : 'muted'}`}>
        <Vote size={11} aria-hidden /> {text}
      </span>,
    );
  }
  if (tags.cloud) {
    chips.push(
      <span key="cloud" className="chip">
        <CloudIcon size={11} aria-hidden /> Wortwolke
      </span>,
    );
  }
  if (onFlag && !tags.location && !tags.locationState) {
    chips.push(
      <button key="flag" type="button" className="chip chip--action chip--flag" onClick={onFlag}>
        <MapPin size={11} aria-hidden /> Als Ort prüfen
      </button>,
    );
  }
  return chips.length ? <div className="chips">{chips}</div> : null;
}

export function ChatPanel() {
  const { state, derived, dispatch } = useStore();
  const commands = useCommands();
  const [showTeam, setShowTeam] = useState(true);
  const [senderId, setSenderId] = useState('jonas');
  const [customName, setCustomName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const ids = { sender: useId(), name: useId(), text: useId() };

  const messages = useMemo(
    () => state.chat.filter((m) => showTeam || !derived.tags[m.id]?.team),
    [state.chat, showTeam, derived.tags],
  );

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const participantsSorted = useMemo(
    () => [...state.participants].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [state.participants],
  );
  const team = participantsSorted.filter((p) => p.role !== 'teilnahme');
  const guests = participantsSorted.filter((p) => p.role === 'teilnahme');
  const senderValid = senderId === '__frei' || state.participants.some((p) => p.id === senderId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const isCustom = senderId === '__frei' || !senderValid;
    const name = isCustom ? customName : (state.participants.find((p) => p.id === senderId)?.name ?? '');
    const err = commands.sendChat(isCustom ? null : senderId, name, text);
    setError(err);
    if (!err) {
      setText('');
      stick.current = true;
    }
  };

  const fillExample = (texts: string[]) => {
    const pick = texts[Math.floor(Math.random() * texts.length)];
    const pool = guests.length ? guests : participantsSorted;
    const who = pool[Math.floor(Math.random() * pool.length)];
    if (who) setSenderId(who.id);
    setText(pick);
    setError(null);
    document.getElementById(ids.text)?.focus();
  };

  return (
    <section className="chat panel" aria-labelledby="chat-title">
      <header className="panel__head">
        <div className="panel__titles">
          <span className="eyebrow">Gemeinsamer Chat</span>
          <h2 className="panel__title" id="chat-title">
            Chat {state.dataMode === 'demo' && <DemoTag>Beispieldaten</DemoTag>}
          </h2>
        </div>
        <div className="chat__head-side">
          <LiveChatBadge />
          <span className="subtle tabular">{state.chat.length} Nachrichten</span>
        </div>
      </header>
      <div className="chat__filters">
        <Switch checked={showTeam} onChange={setShowTeam} label="Team-Nachrichten zeigen" />
      </div>
      <ol
        className="chat__list"
        ref={listRef}
        aria-label="Chat-Verlauf"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {messages.length === 0 && (
          <li>
            <Empty icon={MessageSquare} title="Noch keine Nachrichten" compact>
              <p>Unten eine Testnachricht mit Absender eingeben.</p>
            </Empty>
          </li>
        )}
        {messages.map((m) => {
          const tags = derived.tags[m.id];
          const sender = m.senderId ? derived.byId[m.senderId] : undefined;
          const isHighlight = state.highlightId === m.id;
          return (
            <li key={m.id} className={`msg${isHighlight ? ' is-highlight' : ''}${tags?.team ? ' is-team' : ''}`}>
              <div className="msg__head">
                <span className="msg__name">{m.senderName}</span>
                {sender && sender.role !== 'teilnahme' && <span className="msg__role">{ROLE_LABEL[sender.role]}</span>}
                {!sender && <span className="msg__role">nur Chat</span>}
                <span className="msg__time tabular">{clock(m.at, false)}</span>
              </div>
              <p className="msg__text">{m.text}</p>
              <div className="msg__foot">
                {tags && <TagChips tags={tags} onFlag={() => dispatch({ type: 'map/flag', messageId: m.id })} />}
                <button
                  type="button"
                  className={`msg__hl${isHighlight ? ' is-active' : ''}`}
                  aria-pressed={isHighlight}
                  onClick={() => {
                    dispatch({ type: 'highlight/set', id: isHighlight ? null : m.id });
                    commands.log(
                      isHighlight ? 'Chat-Highlight entfernt' : `Chat-Highlight gewählt: ${m.senderName}`,
                      'info',
                    );
                  }}
                >
                  <MessageSquareQuote size={12} aria-hidden />
                  {isHighlight ? 'Highlight' : 'Als Highlight'}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <form className="chat__composer" onSubmit={submit} noValidate>
        <div className="chat__examples" role="group" aria-label="Beispieltext einsetzen">
          <span className="subtle">Beispiel:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className="chip chip--action" onClick={() => fillExample(ex.texts)}>
              {ex.label}
            </button>
          ))}
        </div>
        <div className="chat__sender">
          <label className="sr-only" htmlFor={ids.sender}>
            Absender
          </label>
          <select
            id={ids.sender}
            className="select"
            value={senderValid ? senderId : '__frei'}
            onChange={(e) => setSenderId(e.target.value)}
          >
            <optgroup label="Teilnehmende">
              {guests.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Team (wird nicht ausgewertet)">
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            <option value="__frei">Anderer Name …</option>
          </select>
          {(senderId === '__frei' || !senderValid) && (
            <>
              <label className="sr-only" htmlFor={ids.name}>
                Name des Absenders
              </label>
              <input
                id={ids.name}
                className="input"
                placeholder="Name"
                value={customName}
                maxLength={40}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </>
          )}
        </div>
        <div className="chat__input">
          <label className="sr-only" htmlFor={ids.text}>
            Nachricht
          </label>
          <input
            id={ids.text}
            className={`input${error ? ' has-error' : ''}`}
            placeholder="Testnachricht, z. B. „Grüße aus Werl“ oder „B“"
            value={text}
            maxLength={300}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `${ids.text}-err` : undefined}
          />
          <button type="submit" className="btn btn--primary" aria-label="Nachricht senden">
            <Send size={16} aria-hidden />
            Senden
          </button>
        </div>
        {error && (
          <p className="field-error" id={`${ids.text}-err`} role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
