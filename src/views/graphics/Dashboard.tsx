import { useMemo } from 'react';
import { ExternalLink, Eye, EyeOff, Pencil } from 'lucide-react';
import { OutputView, type OutputOptions } from '../../ausgabe/Output.tsx';
import { focusChatPopup } from '../../components/ChatPopup.tsx';
import { Badge, Button } from '../../components/ui.tsx';
import { useCommands } from '../../state/commands.ts';
import { useStore } from '../../state/store.tsx';
import type { GraphicKind } from '../../state/types.ts';
import { useUi } from '../../state/ui.tsx';
import { buildSnapshot } from '../../sync/snapshot.ts';
import { GRAPHIC_PAGES } from './pages.ts';

/**
 * Übersicht „Live Grafiken“: alle vier Grafiken nebeneinander mit Vorschau wie in OBS,
 * Kennzahlen und den wichtigsten Knöpfen.
 */
export function GraphicsDashboard() {
  const { state, derived } = useStore();
  const { setGraphicTab, setChatPopupOpen } = useUi();
  const commands = useCommands();
  const snapshot = useMemo(() => buildSnapshot(state, derived), [state, derived]);
  const highlight = state.chat.find((m) => m.id === state.highlightId) ?? null;

  const info: Record<GraphicKind, { status: string; detail: string; warn?: string }> = {
    highlight: {
      status: highlight ? `Gewählt: ${highlight.senderName}` : 'Kein Beitrag gewählt',
      detail: `${state.chat.length} Chat-Nachrichten`,
    },
    umfrage: {
      status: state.poll.status === 'laeuft' ? 'Abstimmung läuft' : state.poll.status === 'geschlossen' ? 'Abstimmung geschlossen' : 'Entwurf, noch nicht gestartet',
      detail: `${derived.poll.totalVotes} ${derived.poll.totalVotes === 1 ? 'Stimme' : 'Stimmen'}`,
      warn: derived.poll.unclear.length ? `${derived.poll.unclear.length} zur Prüfung` : undefined,
    },
    karte: {
      status: state.map.status === 'laeuft' ? 'Sammelt Orte' : 'Pausiert',
      detail: `${derived.map.peopleOnMap} ${derived.map.peopleOnMap === 1 ? 'Person' : 'Personen'} an ${derived.map.pins.length} ${derived.map.pins.length === 1 ? 'Ort' : 'Orten'}`,
      warn: derived.map.review.length ? `${derived.map.review.length} zur Prüfung` : undefined,
    },
    wortwolke: {
      status: state.cloud.status === 'laeuft' ? 'Sammelt Begriffe' : 'Pausiert',
      detail: `${derived.cloud.visible.length} Begriffe aus ${derived.cloud.messageCount} Beiträgen`,
    },
  };

  return (
    <div className="dash">
      {GRAPHIC_PAGES.map((p) => {
        const onAir = state.program.graphic === p.id;
        const i = info[p.id];
        const options: OutputOptions = {
          grafik: p.id,
          stil: p.id === 'highlight' ? 'einblendung' : 'vollbild',
          sichtbar: 'immer',
          hintergrund: p.id === 'highlight' ? 'transparent' : 'dunkel',
          hintergrundFest: false,
          debug: false,
        };
        return (
          <article key={p.id} className={`dash-card${onAir ? ' is-on-air' : ''}`} aria-labelledby={`dash-${p.id}`}>
            <header className="dash-card__head">
              <p.icon size={18} aria-hidden />
              <h2 id={`dash-${p.id}`} className="dash-card__title">
                <button type="button" onClick={() => setGraphicTab(p.id)}>
                  {p.label}
                </button>
              </h2>
              {onAir && <span className="tab__live">im Programm</span>}
              {i.warn && <Badge tone="warn">{i.warn}</Badge>}
            </header>
            <button type="button" className="dash-card__stage" onClick={() => setGraphicTab(p.id)} aria-label={`${p.label} bearbeiten`}>
              <OutputView snapshot={snapshot} options={options} embedded />
            </button>
            <div className="dash-card__meta">
              <span>{i.status}</span>
              <span className="subtle">{i.detail}</span>
            </div>
            <footer className="dash-card__actions">
              <Button
                size="sm"
                variant={onAir ? 'primary' : 'secondary'}
                icon={onAir ? EyeOff : Eye}
                onClick={() => commands.toggleGraphic(p.id)}
                disabled={!!derived.locked}
              >
                {onAir ? 'Im Programm' : 'Ins Programm'}
              </Button>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setGraphicTab(p.id)}>
                Bearbeiten
              </Button>
              {p.id === 'highlight' && (
                <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => focusChatPopup() || setChatPopupOpen(true)}>
                  Chat als Pop-up
                </Button>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
