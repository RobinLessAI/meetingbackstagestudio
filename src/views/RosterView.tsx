import { ExternalLink } from 'lucide-react';
import { focusRosterPopup, RosterList } from '../components/RosterList.tsx';
import { RequestsPanel } from '../components/RequestsPanel.tsx';
import { Button, Panel } from '../components/ui.tsx';
import { useUi } from '../state/ui.tsx';

/** Seite „Wer war dran“: persönliche Liste der Teilnehmenden zum Markieren. */
export function RosterView() {
  const { setRosterPopupOpen } = useUi();
  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Nur für dich</span>
          <h1 className="view__title">Wer war dran</h1>
          <p className="view__lead">
            Alle aus dem Zoom-Meeting, zum Abhaken: wen du gefragt hast, wer gesprochen hat und wen du dir merken willst. So nimmst du nacheinander
            verschiedene Personen dran.
          </p>
        </div>
        <Button icon={ExternalLink} onClick={() => focusRosterPopup() || setRosterPopupOpen(true)}>
          Als Pop-up öffnen
        </Button>
      </header>
      <RequestsPanel />
      <Panel>
        <RosterList />
      </Panel>
    </div>
  );
}
