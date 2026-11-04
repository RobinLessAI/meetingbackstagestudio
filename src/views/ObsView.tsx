import { ObsOutputsPanel } from '../components/ObsOutputs.tsx';

/** OBS-Adressen der Grafiken zum Kopieren. */
export function ObsView() {
  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">OBS · Browserquellen</span>
          <h1 className="view__title">OBS-Ausgabe</h1>
          <p className="view__lead">
            Jede Grafik hat eine eigene Adresse. In OBS als Browserquelle (1920 × 1080) hinzufügen; der Hintergrund ist transparent.
          </p>
        </div>
      </header>
      <ObsOutputsPanel />
    </div>
  );
}
