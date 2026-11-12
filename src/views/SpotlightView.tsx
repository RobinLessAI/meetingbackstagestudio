import { useId, useMemo, useState } from 'react';
import { ArrowRight, CircleAlert, Copy, Crosshair, Crown, Hand, Mic, MicOff, Plus, RefreshCw, Star, StarOff, Video, VideoOff, X } from 'lucide-react';
import { copyText } from '../components/LiveChat.tsx';
import { RequestsPanel } from '../components/RequestsPanel.tsx';
import { Badge, Button, Empty, IconButton, Kbd, Panel, Segmented } from '../components/ui.tsx';
import { duration } from '../lib/time.ts';
import { useNow, useStore } from '../state/store.tsx';
import { useUi } from '../state/ui.tsx';
import { useZoomSpotlight } from '../state/zoomSpotlight.ts';
import { findPerson, SPOTLIGHT_MAX } from '../lib/spotlight.ts';
import { useSync, type ZoomPerson } from '../sync/SyncProvider.tsx';

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Spotlight in Zoom: Live-Liste der Teilnehmenden aus dem Regie-Fenster, Plätze 1–9 für
 * Tasten und Stream Deck. Wirkt nur, wenn die Regie im Meeting Host oder Co-Host ist.
 */
export function SpotlightView() {
  const { state, dispatch, notify } = useStore();
  const { regie, zoomPeople, refreshZoomPeople, baseUrl, actionKey } = useSync();
  const { go } = useUi();
  const zoom = useZoomSpotlight();
  const now = useNow();
  const [query, setQuery] = useState('');
  const ids = { search: useId(), names: useId() };
  const slots = state.settings.spotlightSlots ?? Array(9).fill('');
  const setSlot = (n: number, name: string) => {
    const next = [...slots];
    while (next.length < 9) next.push('');
    next[n - 1] = name;
    dispatch({ type: 'settings/update', patch: { spotlightSlots: next } });
  };
  const inSpot = (p: ZoomPerson) => zoomPeople.spotlight.includes(p.userId);
  const slotOf = (p: ZoomPerson) => SLOTS.find((n) => findPerson([p], slots[n - 1] ?? '') !== null && (slots[n - 1] ?? '').trim() !== '');

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return zoomPeople.list
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(zoomPeople.spotlight.includes(b.userId)) - Number(zoomPeople.spotlight.includes(a.userId)) ||
          Number(b.hand) - Number(a.hand) ||
          a.name.localeCompare(b.name, 'de'),
      );
  }, [zoomPeople, query]);

  const live = regie?.state === 'verbunden';
  const url = (id: string) => `${baseUrl}/aktion/${id}?schluessel=${actionKey ?? '…'}`;
  const copy = async (id: string) => notify((await copyText(url(id))) ? 'Adresse kopiert' : 'Kopieren nicht möglich, bitte markieren', 'info', false);

  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Zoom · über die Regie</span>
          <h1 className="view__title">Spotlight</h1>
          <p className="view__lead">
            Personen in Zoom ins Spotlight setzen: per Klick, mit den Tasten <Kbd>1</Kbd>–<Kbd>9</Kbd> für deine festen Plätze und <Kbd>0</Kbd> zum
            Aufheben, oder per Stream Deck.
          </p>
        </div>
      </header>

      {!live ? (
        <p className="callout callout--warn">
          <CircleAlert size={16} aria-hidden /> Die Regie ist nicht im Meeting. Spotlight funktioniert, sobald „MeetingBackstage (Regie)“ im Zoom-Meeting ist.{' '}
          <Button size="sm" icon={ArrowRight} onClick={() => go('meeting')}>
            Zur Seite „Meeting“
          </Button>
        </p>
      ) : zoomPeople.role === 'teilnehmer' ? (
        <div className="callout callout--warn spot-cohost">
          <CircleAlert size={16} aria-hidden />
          <div>
            <strong>Die Regie muss Co-Host sein.</strong> Zoom lässt Spotlight nur Host und Co-Host setzen. In Zoom: <em>Teilnehmer</em> öffnen →
            bei „MeetingBackstage (Regie)“ auf <em>Mehr</em> → <em>Zum Co-Host machen</em>. Fehlt die Option, im Zoom-Webportal unter
            Einstellungen → Meeting → „Co-Host“ einschalten.
          </div>
        </div>
      ) : (
        <p className="callout spot-ok">
          <Star size={16} aria-hidden /> Regie ist {zoomPeople.role === 'host' ? 'Host' : zoomPeople.role === 'cohost' ? 'Co-Host' : 'im Meeting'} ·{' '}
          {zoomPeople.list.length} {zoomPeople.list.length === 1 ? 'Person' : 'Personen'} im Meeting ·{' '}
          {zoomPeople.spotlight.length ? `${zoomPeople.spotlight.length} im Spotlight` : 'niemand im Spotlight'}
        </p>
      )}

      <RequestsPanel />

      <div className="spot-mode">
        <Segmented<'mehrere' | 'eine'>
          label="Spotlight"
          value={zoom.multi ? 'mehrere' : 'eine'}
          onChange={(v) => dispatch({ type: 'settings/update', patch: { spotlightMulti: v === 'mehrere' } })}
          options={[
            { value: 'mehrere', label: 'Mehrere gleichzeitig', title: `Klick oder Taste nimmt die Person dazu, nochmal nimmt nur sie heraus (bis ${SPOTLIGHT_MAX} Personen)` },
            { value: 'eine', label: 'Nur eine Person', title: 'Klick oder Taste ersetzt die Person im Spotlight' },
          ]}
        />
        <div className="spot-now" aria-live="polite">
          <span className="field-label">Jetzt im Spotlight</span>
          {zoomPeople.spotlight.length === 0 ? (
            <span className="subtle">niemand</span>
          ) : (
            <span className="spot-now__list">
              {zoomPeople.spotlight.map((id) => {
                const p = zoomPeople.list.find((x) => x.userId === id);
                return (
                  <span key={id} className="spot-now__chip">
                    <Star size={13} aria-hidden /> {p?.name ?? 'Unbekannt'}
                    {p && (
                      <button type="button" className="spot-now__x" aria-label={`${p.name} aus dem Spotlight nehmen`} onClick={() => zoom.remove(p)} disabled={!live}>
                        <X size={13} aria-hidden />
                      </button>
                    )}
                  </span>
                );
              })}
              <span className="subtle tabular">
                {zoomPeople.spotlight.length} von {SPOTLIGHT_MAX}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="spot-layout">
        <Panel
          eyebrow="Tasten 1–9 · Stream Deck"
          title="Feste Plätze"
          actions={
            <Button size="sm" icon={StarOff} onClick={zoom.clear} disabled={!live || zoomPeople.spotlight.length === 0} title="Taste 0">
              Spotlight aufheben
            </Button>
          }
        >
          <datalist id={ids.names}>
            {zoomPeople.list.map((p) => (
              <option key={p.userId} value={p.name} />
            ))}
          </datalist>
          <ol className="spot-slots">
            {SLOTS.map((n) => {
              const name = slots[n - 1] ?? '';
              const person = name.trim() ? findPerson(zoomPeople.list, name) : null;
              const on = !!person && inSpot(person);
              return (
                <li key={n} className={`spot-slot${on ? ' is-on' : ''}`}>
                  <Kbd>{n}</Kbd>
                  <input
                    className="input input--sm"
                    value={name}
                    list={ids.names}
                    placeholder="Name aus Zoom"
                    aria-label={`Name für Platz ${n}`}
                    onChange={(e) => setSlot(n, e.target.value)}
                  />
                  <span className={`spot-slot__state${person ? '' : ' is-missing'}`}>
                    {!name.trim() ? '' : on ? 'im Spotlight' : person ? 'im Meeting' : 'nicht da'}
                  </span>
                  <Button size="sm" variant={on ? 'primary' : 'secondary'} icon={Star} disabled={!live || !person} onClick={() => zoom.slot(n)}>
                    {on ? 'Heraus' : zoom.multi && zoomPeople.spotlight.length ? 'Dazu' : 'Spotlight'}
                  </Button>
                  <IconButton label={`Stream-Deck-Adresse für Platz ${n} kopieren`} icon={Copy} disabled={!actionKey} onClick={() => copy(`spotlight-${n}`)} />
                </li>
              );
            })}
          </ol>
          <p className="field-hint">
            Der Name muss nicht exakt stimmen: „Anna“ findet auch „Anna Schulz (sie/ihr)“. Die Plätze bleiben gespeichert, auch für das nächste
            Meeting.
          </p>
        </Panel>

        <Panel
          eyebrow="Live aus Zoom"
          title={
            <>
              Im Meeting <span className="subtle tabular">{zoomPeople.list.length}</span>
            </>
          }
          actions={
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={refreshZoomPeople} disabled={!live}>
              Neu laden
            </Button>
          }
          flush
        >
          <div className="spot-search">
            <label htmlFor={ids.search} className="sr-only">
              Teilnehmende suchen
            </label>
            <input id={ids.search} className="input" value={query} placeholder="Name suchen" onChange={(e) => setQuery(e.target.value)} />
          </div>
          {people.length === 0 ? (
            <Empty icon={Star} title={live ? 'Noch keine Teilnehmenden gelesen' : 'Regie nicht im Meeting'} compact>
              <p>{live ? 'Die Liste kommt aus dem Regie-Fenster und aktualisiert sich von selbst.' : 'Zuerst auf der Seite „Meeting“ beitreten.'}</p>
            </Empty>
          ) : (
            <ul className="spot-people">
              {people.map((p) => {
                const on = inSpot(p);
                const slot = slotOf(p);
                return (
                  <li key={p.userId} className={`spot-person${on ? ' is-on' : ''}`}>
                    <div className="spot-person__name">
                      <strong>{p.name}</strong>
                      <span className="spot-person__icons">
                        {p.host && <Crown size={14} aria-label="Host" />}
                        {p.cohost && <Badge tone="neutral">Co-Host</Badge>}
                        {p.hand && (
                          <Badge tone="accent" icon={Hand}>
                            {p.handSince ? duration(now - p.handSince) : 'Hand'}
                          </Badge>
                        )}
                        {p.video === false && <VideoOff size={14} aria-label="Video aus" />}
                        {p.video === true && <Video size={14} aria-label="Video an" />}
                        {p.muted === true && <MicOff size={14} aria-label="Stumm" />}
                        {p.muted === false && <Mic size={14} aria-label="Mikrofon an" />}
                        {slot && <Kbd>{slot}</Kbd>}
                      </span>
                    </div>
                    <div className="spot-person__actions">
                      <Button size="sm" variant={on ? 'primary' : 'secondary'} icon={Star} disabled={!live} onClick={() => zoom.toggle(p)}>
                        {on ? 'Im Spotlight' : zoom.multi && zoomPeople.spotlight.length ? 'Dazu' : 'Spotlight'}
                      </Button>
                      {zoom.multi
                        ? zoomPeople.spotlight.length > 0 &&
                          !(on && zoomPeople.spotlight.length === 1) && (
                            <IconButton label={`Nur ${p.name} im Spotlight, alle anderen heraus`} icon={Crosshair} disabled={!live} onClick={() => zoom.only(p)} />
                          )
                        : !on &&
                          zoomPeople.spotlight.length > 0 && (
                            <IconButton label={`${p.name} zusätzlich ins Spotlight`} icon={Plus} disabled={!live} onClick={() => zoom.add(p)} />
                          )}
                      <select
                        className="input input--sm spot-person__slot"
                        value={slot ?? ''}
                        aria-label={`Platz für ${p.name}`}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (slot) setSlot(slot, '');
                          if (n) setSlot(n, p.name);
                        }}
                      >
                        <option value="">Platz …</option>
                        {SLOTS.map((n) => (
                          <option key={n} value={n}>
                            Taste {n}
                            {slots[n - 1]?.trim() && findPerson([p], slots[n - 1]) === null ? ` (statt ${slots[n - 1]})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel eyebrow="Auch wenn MeetingBackstage nicht vorne ist" title="Tasten und Stream Deck">
        <ul className="spot-help">
          <li>
            <strong>In der App:</strong> <Kbd>1</Kbd>–<Kbd>9</Kbd> nimmt die Person des Platzes ins Spotlight, nochmal drücken nimmt sie
            wieder heraus. Bei „Mehrere gleichzeitig“ kommen so bis zu {SPOTLIGHT_MAX} Personen zusammen ins Spotlight, bei „Nur eine Person“
            ersetzt jede Taste die vorige.{' '}
            <Kbd>0</Kbd> hebt jedes Spotlight auf, <Kbd>N</Kbd> holt die Hand, die am längsten oben ist. Gilt, solange das Fenster von
            MeetingBackstage vorne ist und du nicht in einem Eingabefeld tippst.
          </li>
          <li>
            <strong>Stream Deck:</strong> Aktion „Website“, Adresse eines Platzes (Kopier-Symbol oben) einfügen und „GET-Anfrage im Hintergrund“
            einschalten. Aufheben:{' '}
            <button type="button" className="link-btn" onClick={() => copy('spotlight-leeren')}>
              Adresse kopieren
            </button>
            , nächste Hand:{' '}
            <button type="button" className="link-btn" onClick={() => copy('naechste-hand')}>
              Adresse kopieren
            </button>
            .
          </li>
          <li>
            <strong>Tastenkürzel überall auf dem Mac (ohne Stream Deck):</strong> In der App „Kurzbefehle“ einen neuen Kurzbefehl mit der Aktion
            „Inhalte von URL abrufen“ anlegen, die kopierte Adresse einsetzen und in den Details einen Tastaturkurzbefehl wie ctrl + alt + 1 vergeben.
            Der wirkt dann auch, während Zoom vorne ist.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
