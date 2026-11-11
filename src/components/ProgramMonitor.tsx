import { EyeOff, MonitorPlay, MonitorUp } from 'lucide-react';
import { openPresentationWindow } from '../lib/presentation.ts';
import { GRAPHIC_LABEL, useCommands } from '../state/commands.ts';
import { useStore } from '../state/store.tsx';
import { useUi } from '../state/ui.tsx';
import { useSync } from '../sync/SyncProvider.tsx';
import { ProgramOverlay } from './graphics/ProgramOverlay.tsx';
import { Button } from './ui.tsx';

/**
 * Vorschaufenster „Programm“: zeigt genau das, was die OBS-Quelle „Programm“ gerade zeigt.
 * Mit lokalem Server ist es die echte Ausgabeseite; ohne Server eine Nachbildung.
 */
export function ProgramMonitor({ compact = false }: { compact?: boolean }) {
  const { state } = useStore();
  const { go } = useUi();
  const sync = useSync();
  const commands = useCommands();
  const g = state.program.graphic;
  const live = sync.available && sync.status === 'verbunden';

  return (
    <section className={`program-monitor${compact ? ' program-monitor--compact' : ''}`} aria-label="Programm-Vorschau">
      <header className="program-monitor__head">
        <span className={`program-monitor__tally${g ? ' is-on' : ''}`} aria-hidden />
        <span className="program-monitor__title">Programm</span>
        <span className="program-monitor__state">{g ? GRAPHIC_LABEL[g] : 'leer'}</span>
        {compact && sync.available && (
          <button
            type="button"
            className="program-monitor__link"
            onClick={() => openPresentationWindow(sync.baseUrl)}
            title="Präsentationsfenster zum Teilen in Zoom öffnen"
          >
            <MonitorUp size={14} aria-hidden />
            <span className="sr-only">Präsentationsfenster öffnen</span>
          </button>
        )}
        {compact && (
          <button type="button" className="program-monitor__link" onClick={() => go('ausgabe')} title="OBS-Ausgabe und Erklärung öffnen">
            <MonitorPlay size={14} aria-hidden />
            <span className="sr-only">OBS-Ausgabe öffnen</span>
          </button>
        )}
      </header>
      <div className="program-monitor__screen">
        {live ? (
          <iframe
            src={`${sync.baseUrl}/ausgabe.html?grafik=programm&vorschau=1`}
            title="Programm-Vorschau (wie in OBS)"
            tabIndex={-1}
            loading="lazy"
          />
        ) : (
          <div className="stage__screen program-monitor__local">
            <ProgramOverlay />
          </div>
        )}
      </div>
      {g && (
        <Button size="sm" icon={EyeOff} onClick={commands.hideGraphic} className="program-monitor__off">
          Ausblenden
        </Button>
      )}
    </section>
  );
}
