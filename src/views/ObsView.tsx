import { ObsOutputsPanel } from '../components/ObsOutputs.tsx';
import { ProgramMonitor } from '../components/ProgramMonitor.tsx';
import { RemoteControlPanel } from '../components/RemoteControl.tsx';
import { Button, Panel } from '../components/ui.tsx';
import { MonitorUp } from 'lucide-react';
import { openPresentationWindow, presentationUrl } from '../lib/presentation.ts';
import { useStore } from '../state/store.tsx';
import { useSync } from '../sync/SyncProvider.tsx';

/** OBS-Ausgabe: Programm-Vorschau, Erklärung, Adressen und Fernsteuerung. */
export function ObsView() {
  const { baseUrl, available } = useSync();
  const { notify } = useStore();
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

      <Panel eyebrow="Ohne OBS" title="Bildschirm teilen in Zoom oder Teams" className="praes-panel">
        <p className="muted">
          Kein OBS? Dann öffne das Präsentationsfenster und teile es im Meeting. Es zeigt immer das, was im Programm ist, als Vollbild-Grafik. Ist
          nichts im Programm, steht dort der Titel deiner Veranstaltung.
        </p>
        <ol className="program-steps">
          <li>
            <Button
              variant="primary"
              icon={MonitorUp}
              disabled={!available}
              onClick={() => {
                if (!openPresentationWindow(baseUrl)) notify('Das Fenster wurde blockiert. Bitte Pop-ups für localhost erlauben.', 'fehler');
              }}
            >
              Präsentationsfenster öffnen
            </Button>
          </li>
          <li>
            In Zoom auf <strong>„Bildschirm freigeben“</strong> klicken und das Fenster <strong>„MeetingBackstage · Präsentation“</strong> wählen
            (nicht den ganzen Bildschirm). In Teams: <strong>„Teilen“</strong> → Fenster.
          </li>
          <li>
            Wie gewohnt in der App <em>„Ins Programm“</em> klicken: Die Grafik erscheint sofort im geteilten Fenster. Größe des Fensters ist egal,
            die Grafik passt sich an. Mit <strong>F</strong> oder dem Knopf im Fenster geht es in den Vollbildmodus.
          </li>
        </ol>
        <p className="field-hint">
          Adresse zum Öffnen in einem anderen Browser: <code>{presentationUrl(baseUrl)}</code>
        </p>
      </Panel>

      <ObsOutputsPanel />
      <RemoteControlPanel />
    </div>
  );
}
