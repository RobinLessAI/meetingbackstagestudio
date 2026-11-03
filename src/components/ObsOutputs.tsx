import { Copy, ExternalLink, MonitorPlay } from 'lucide-react';
import { useStore } from '../state/store.tsx';
import type { GraphicKind } from '../state/types.ts';
import { outputUrl, useSync } from '../sync/SyncProvider.tsx';
import { copyText } from './LiveChat.tsx';
import { Badge, Button, DemoTag, IconButton, Panel } from './ui.tsx';

export const OBS_OUTPUTS: Array<{ id: string; label: string; desc: string; params: Record<string, string> }> = [
  { id: 'programm', label: 'Programm', desc: 'Zeigt die gerade eingeblendete Grafik als Einblendung, sonst nichts. Für die Hauptszene über dem Zoom-Bild.', params: { grafik: 'programm' } },
  { id: 'karte', label: 'Weltkarte', desc: 'Vollbild, immer sichtbar.', params: { grafik: 'karte' } },
  { id: 'umfrage', label: 'Umfrage', desc: 'Vollbild, immer sichtbar.', params: { grafik: 'umfrage' } },
  { id: 'wortwolke', label: 'Wortwolke', desc: 'Vollbild, immer sichtbar.', params: { grafik: 'wortwolke' } },
  { id: 'highlight', label: 'Chat-Highlight', desc: 'Bauchbinde unten links, transparent.', params: { grafik: 'highlight', stil: 'einblendung' } },
];

/** OBS-Adresse für eine bestimmte Grafik (Vollbild). */
export function useObsUrl(kind: GraphicKind | 'programm') {
  const { baseUrl } = useSync();
  const def = OBS_OUTPUTS.find((o) => o.id === kind) ?? OBS_OUTPUTS[0];
  return outputUrl(baseUrl, def.params);
}

export function CopyObsUrlButton({ kind }: { kind: GraphicKind }) {
  const url = useObsUrl(kind);
  const { notify } = useStore();
  return (
    <Button
      icon={Copy}
      onClick={async () =>
        notify((await copyText(url)) ? `OBS-Adresse kopiert: ${url}` : `Kopieren nicht möglich. Adresse: ${url}`, 'info', false)
      }
      title={url}
    >
      OBS-URL
    </Button>
  );
}

export function ObsOutputsPanel() {
  const { baseUrl, available, status, outputs } = useSync();
  const { notify } = useStore();
  return (
    <Panel
      eyebrow="OBS · Browserquellen"
      title="Grafiken in OBS einbinden"
      actions={
        available && status === 'verbunden' ? (
          <Badge tone={outputs > 0 ? 'ok' : 'neutral'} icon={MonitorPlay}>
            {outputs === 0 ? 'Keine OBS-Quelle verbunden' : `${outputs} OBS-${outputs === 1 ? 'Quelle' : 'Quellen'} verbunden`}
          </Badge>
        ) : (
          <DemoTag>Erst mit „npm start“ verfügbar</DemoTag>
        )
      }
      flush
    >
      <div className="table-wrap">
        <table className="table obs-table">
          <thead>
            <tr>
              <th scope="col">Ausgabe</th>
              <th scope="col">Adresse für die OBS-Browserquelle</th>
              <th scope="col">
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {OBS_OUTPUTS.map((o) => {
              const url = outputUrl(baseUrl, o.params);
              return (
                <tr key={o.id}>
                  <th scope="row">
                    {o.label}
                    <span className="obs-table__desc">{o.desc}</span>
                  </th>
                  <td>
                    <code className="obs-table__url">{url}</code>
                  </td>
                  <td>
                    <div className="row-actions">
                      <IconButton
                        label={`Adresse für ${o.label} kopieren`}
                        icon={Copy}
                        onClick={async () => notify((await copyText(url)) ? `Adresse für ${o.label} kopiert` : 'Kopieren nicht möglich, bitte markieren', 'info', false)}
                      />
                      <a className="icon-btn" href={url} target="_blank" rel="noreferrer" aria-label={`${o.label} in neuem Fenster öffnen`} title="Im Browser ansehen">
                        <ExternalLink size={16} aria-hidden />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="obs-help">
        <p>
          <strong>In OBS:</strong> Quelle hinzufügen → „Browser“ → Adresse einfügen → Breite 1920, Höhe 1080. Der Hintergrund ist transparent,
          die Grafik liegt also über dem Zoom-Bild (Fensteraufnahme).
        </p>
        <p className="subtle">
          Optionen in der Adresse: <code>stil=einblendung</code> oder <code>stil=vollbild</code>, <code>hintergrund=transparent</code> oder{' '}
          <code>hintergrund=dunkel</code>, <code>sichtbar=programm</code> (nur zeigen, wenn eingeblendet). <code>debug=1</code> zeigt den
          Verbindungsstatus.
        </p>
      </div>
    </Panel>
  );
}
