import { Copy, Keyboard } from 'lucide-react';
import { SHORTCUTS, useDeckActions } from '../state/deckActions.ts';
import { useStore } from '../state/store.tsx';
import type { DeckActionId } from '../state/types.ts';
import { useSync } from '../sync/SyncProvider.tsx';
import { copyText } from './LiveChat.tsx';
import { Badge, DemoTag, IconButton, Kbd, Panel } from './ui.tsx';

/** Aktionen, die schon heute wirken (Programm-Ausgabe für OBS). */
const PROGRAM: DeckActionId[] = ['karte-anzeigen', 'frage-anzeigen', 'wortwolke-anzeigen', 'highlight-anzeigen', 'rad-anzeigen', 'rad-drehen', 'grafik-aus'];
/** Aktionen für Zoom; die Adressen bleiben gleich, sobald die Regie sie in Zoom ausführen kann. */
/** Spotlight in Zoom über die Regie (Regie muss Co-Host sein). */
const ZOOM: DeckActionId[] = [
  'spotlight-1',
  'spotlight-2',
  'spotlight-3',
  'spotlight-4',
  'spotlight-5',
  'spotlight-6',
  'spotlight-7',
  'spotlight-8',
  'spotlight-9',
  'spotlight-leeren',
  'naechste-hand',
];
/** Folgt später. */
const PLANNED: DeckActionId[] = ['alle-stumm'];

const keyOf = (id: DeckActionId) => Object.entries(SHORTCUTS).find(([, v]) => v === id)?.[0]?.toUpperCase();

/** Stream Deck und Tastenkürzel: Adressen zum Kopieren und Anleitung. */
export function RemoteControlPanel() {
  const actions = useDeckActions();
  const { baseUrl, actionKey, available } = useSync();
  const { notify } = useStore();
  const urlFor = (id: DeckActionId) => `${baseUrl}/aktion/${id}?schluessel=${actionKey ?? '…'}`;

  const row = (id: DeckActionId, planned: boolean) => {
    const a = actions[id];
    const url = urlFor(id);
    const key = keyOf(id);
    return (
      <tr key={id}>
        <th scope="row">
          {a.label.replace(/­/g, '')}
          {planned && <span className="obs-table__desc">Wirkt noch nicht in Zoom (folgt in einem späteren Schritt).</span>}
        </th>
        <td className="remote__key">{key ? <Kbd>{key}</Kbd> : <span className="subtle">–</span>}</td>
        <td>
          <code className="obs-table__url">{url}</code>
        </td>
        <td>
          <IconButton
            label={`Adresse für „${a.label.replace(/­/g, '')}“ kopieren`}
            icon={Copy}
            disabled={!actionKey}
            onClick={async () => notify((await copyText(url)) ? 'Adresse kopiert' : 'Kopieren nicht möglich, bitte markieren', 'info', false)}
          />
        </td>
      </tr>
    );
  };

  return (
    <Panel
      eyebrow="Stream Deck · Tastenkürzel"
      title="Fernsteuerung"
      actions={available ? <Badge tone="ok" icon={Keyboard}>Bereit</Badge> : <DemoTag>Nur mit lokalem Server</DemoTag>}
      flush
    >
      <div className="obs-help">
        <p>
          <strong>Stream Deck:</strong> Aktion „Website“ auf eine Taste ziehen, Adresse einfügen und <em>„GET-Anfrage im Hintergrund“</em>{' '}
          einschalten. Dann wirkt die Taste, auch wenn der Browser mit MeetingBackstage nicht im Vordergrund ist. Die Taste schaltet um:
          einmal drücken blendet ein, nochmal drücken blendet aus.
        </p>
        <p className="subtle">
          <strong>Tastenkürzel</strong> wirken nur, wenn das MeetingBackstage-Fenster im Vordergrund ist. Der Schlüssel in der Adresse verhindert,
          dass fremde Webseiten Aktionen auslösen; gib die Adressen nicht weiter.
        </p>
      </div>
      <div className="table-wrap">
        <table className="table obs-table remote-table">
          <thead>
            <tr>
              <th scope="col">Aktion</th>
              <th scope="col">Taste</th>
              <th scope="col">Adresse für das Stream Deck</th>
              <th scope="col">
                <span className="sr-only">Kopieren</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {PROGRAM.map((id) => row(id, false))}
            <tr className="remote-table__group">
              <th scope="rowgroup" colSpan={4}>
                Zoom: Spotlight (Plätze auf der Seite „Spotlight“; die Regie muss Co-Host sein)
              </th>
            </tr>
            {ZOOM.map((id) => row(id, false))}
            {PLANNED.map((id) => row(id, true))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
