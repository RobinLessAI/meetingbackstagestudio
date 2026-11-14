import { useMemo, useState } from 'react';
import { ExternalLink, Eye, EyeOff, Palette, Pencil, RotateCcw, RotateCw } from 'lucide-react';
import { matches, TemplateBar } from '../../components/TemplateBar.tsx';
import { DEFAULT_LOOKS, normalizeLooks } from '../../data/graphicLooks.ts';
import { DEFAULT_HIGHLIGHT_STYLE } from '../../data/highlightStyle.ts';
import { OutputView, type OutputOptions } from '../../ausgabe/Output.tsx';
import { focusChatPopup } from '../../components/ChatPopup.tsx';
import { Badge, Button } from '../../components/ui.tsx';
import { useCommands } from '../../state/commands.ts';
import { useStore } from '../../state/store.tsx';
import type { GraphicKind, GraphicLooks, HighlightStyle } from '../../state/types.ts';
import { useUi } from '../../state/ui.tsx';
import { buildSnapshot } from '../../sync/snapshot.ts';
import { GRAPHIC_PAGES } from './pages.ts';
import { graphicAllowed } from '../../state/rights.ts';

/**
 * Übersicht „Live Grafiken“: alle vier Grafiken nebeneinander mit Vorschau wie in OBS,
 * Kennzahlen und den wichtigsten Knöpfen.
 */
export function GraphicsDashboard() {
  const { state, derived, dispatch, notify } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const design = { highlightStyle: state.highlightStyle, looks: state.looks } as unknown as Record<string, unknown>;
  const applyDesign = (data: Record<string, unknown>) => {
    const hs = data.highlightStyle as Partial<HighlightStyle> | undefined;
    if (hs) dispatch({ type: 'highlight/style', patch: { ...DEFAULT_HIGHLIGHT_STYLE, ...hs } });
    const looks = normalizeLooks(data.looks as Partial<GraphicLooks> | undefined);
    (Object.keys(looks) as Array<keyof GraphicLooks>).forEach((g) => dispatch({ type: 'look/update', graphic: g, patch: looks[g] }));
  };
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
      status:
        state.poll.status === 'laeuft'
          ? 'Abstimmung läuft'
          : state.poll.status === 'geschlossen'
            ? 'Abstimmung geschlossen'
            : 'Entwurf, noch nicht gestartet',
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
    gluecksrad: {
      status: state.wheel.history[0] && state.wheel.spin ? `Zuletzt: ${state.wheel.history[0].name}` : state.wheel.source === 'chat' ? 'Namen aus dem Chat' : 'Eigene Liste',
      detail: `${snapshot.wheel?.entries.length ?? 0} im Rad`,
    },
  };

  return (
    <div className="stack">
      <section className="dash-design" aria-label="Design für alle Grafiken">
        <div className="dash-design__head">
          <Palette size={16} aria-hidden />
          <strong>Design für alle Grafiken</strong>
          <span className="subtle">Speichert das Aussehen aller Grafiken zusammen, z. B. pro Kunde.</span>
        </div>
        <TemplateBar kind="alle" current={design} onApply={applyDesign} isActive={(data) => matches(design, data)} />
        <div className="row">
          {confirmReset ? (
            <>
              <span className="subtle">Alle Grafiken auf das Standard-Aussehen setzen?</span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  applyDesign({ highlightStyle: DEFAULT_HIGHLIGHT_STYLE, looks: DEFAULT_LOOKS });
                  setConfirmReset(false);
                  notify('Alle Grafiken auf Standard zurückgesetzt', 'info');
                }}
              >
                Ja, zurücksetzen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                Abbrechen
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
              Alle Grafiken auf Standard zurücksetzen
            </Button>
          )}
        </div>
      </section>
      <div className="dash">
        {GRAPHIC_PAGES.filter((p) => graphicAllowed(p.id)).map((p) => {
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
                {p.id === 'gluecksrad' && (
                  <Button size="sm" variant="ghost" icon={RotateCw} onClick={commands.spinWheel} disabled={!!derived.locked}>
                    Drehen
                  </Button>
                )}
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
    </div>
  );
}
