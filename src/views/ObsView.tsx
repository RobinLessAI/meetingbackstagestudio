import { ObsOutputsPanel } from '../components/ObsOutputs.tsx';
import { ProgramMonitor } from '../components/ProgramMonitor.tsx';
import { RemoteControlPanel } from '../components/RemoteControl.tsx';
import { Panel } from '../components/ui.tsx';

/** OBS-Ausgabe: Programm-Vorschau, Erklärung, Adressen und Fernsteuerung. */
export function ObsView() {
  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">OBS · Browserquellen · Stream Deck</span>
          <h1 className="view__title">OBS-Ausgabe</h1>
          <p className="view__lead">
            Die Grafiken kommen als Browserquellen in OBS. Am einfachsten ist eine einzige Quelle „Programm“, die du aus der App oder vom Stream
            Deck steuerst.
          </p>
        </div>
      </header>

      <div className="program-intro">
        <Panel eyebrow="Was läuft gerade" title="Programm-Vorschau">
          <ProgramMonitor />
          <p className="field-hint">Genau das zeigt die OBS-Quelle „Programm“ gerade. Ist nichts im Programm, bleibt sie durchsichtig.</p>
        </Panel>
        <Panel eyebrow="So funktioniert es" title="„Programm“ in drei Schritten">
          <ol className="program-steps">
            <li>
              <strong>Einmalig in OBS:</strong> Eine Browserquelle mit der Adresse „Programm“ (unten) über das Zoom-Bild legen, 1920 × 1080.
            </li>
            <li>
              <strong>In der App:</strong> Bei Weltkarte, Umfrage, Wortwolke oder Chat-Highlight auf <em>„Ins Programm“</em> klicken. Die Grafik
              erscheint sofort in OBS und links unten in der kleinen Vorschau.
            </li>
            <li>
              <strong>Wechseln oder beenden:</strong> „Ins Programm“ bei einer anderen Grafik ersetzt die laufende. <em>„Im Programm“</em> erneut
              klicken oder „Ausblenden“ nimmt sie heraus. Dasselbe geht per Tastenkürzel oder Stream Deck (unten).
            </li>
          </ol>
          <p className="subtle">
            Die Einzel-Adressen (Weltkarte, Umfrage …) zeigen ihre Grafik dagegen immer. Sie sind gedacht, wenn du lieber mit OBS-Szenen arbeitest;
            „Ins Programm“ hat auf sie keine Wirkung.
          </p>
        </Panel>
      </div>

      <ObsOutputsPanel />
      <RemoteControlPanel />
    </div>
  );
}
