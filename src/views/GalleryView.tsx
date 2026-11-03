import { LogOut, PartyPopper, Shuffle, UserPlus } from 'lucide-react';
import { GalleryStage, ringForCount, useStageInfo } from '../components/GalleryStage.tsx';
import { SpotlightList } from '../components/people.tsx';
import { Button, DemoTag, Panel, Segmented, Switch } from '../components/ui.tsx';
import { LAYOUT_LABEL, useCommands } from '../state/commands.ts';
import { useStore } from '../state/store.tsx';
import type { GalleryLayout, GalleryState, TileCount } from '../state/types.ts';

const LAYOUTS: Array<{ id: GalleryLayout; desc: string }> = [
  { id: 'zentrum', desc: 'Robin groß in der Mitte, Teilnehmende rundherum.' },
  { id: 'spotlight', desc: 'Spotlight-Personen groß, alle anderen in einer Leiste.' },
  { id: 'raster', desc: 'Alle Kacheln gleich groß, gut für Gruppenfotos.' },
];

function LayoutGlyph({ id }: { id: GalleryLayout }) {
  // Kleine Skizze des Layouts für die Auswahlschaltfläche
  if (id === 'zentrum') {
    return (
      <svg viewBox="0 0 48 27" aria-hidden className="layout-glyph">
        {[0, 1, 2, 3].map((c) => (
          <rect key={`t${c}`} x={1 + c * 11.75} y="1" width="10.5" height="5.5" rx="0.6" />
        ))}
        {[0, 1, 2, 3].map((c) => (
          <rect key={`b${c}`} x={1 + c * 11.75} y="20.5" width="10.5" height="5.5" rx="0.6" />
        ))}
        <rect x="1" y="7.5" width="10.5" height="5.5" rx="0.6" />
        <rect x="1" y="14" width="10.5" height="5.5" rx="0.6" />
        <rect x="36.25" y="7.5" width="10.5" height="5.5" rx="0.6" />
        <rect x="36.25" y="14" width="10.5" height="5.5" rx="0.6" />
        <rect x="12.75" y="7.5" width="22.25" height="12" rx="0.6" className="is-main" />
      </svg>
    );
  }
  if (id === 'spotlight') {
    return (
      <svg viewBox="0 0 48 27" aria-hidden className="layout-glyph">
        <rect x="1" y="1" width="22.5" height="18" rx="0.6" className="is-main" />
        <rect x="24.5" y="1" width="22.5" height="18" rx="0.6" className="is-main" />
        {[0, 1, 2, 3, 4, 5].map((c) => (
          <rect key={c} x={1 + c * 7.75} y="20.5" width="6.9" height="5.5" rx="0.6" />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 27" aria-hidden className="layout-glyph">
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={`${r}-${c}`} x={1 + c * 11.75} y={1 + r * 6.5} width="10.5" height="5.5" rx="0.6" />
        )),
      )}
    </svg>
  );
}

export function GalleryView() {
  const { state, dispatch } = useStore();
  const commands = useCommands();
  const info = useStageInfo();
  const g = state.gallery;
  const set = (patch: Partial<GalleryState>) => dispatch({ type: 'gallery/update', patch });
  const others = state.participants.filter((p) => p.role !== 'moderation' && (!g.hideNoVideo || p.camOn)).length;
  const autoRing = ringForCount(others);
  const lastGuest = [...state.participants].reverse().find((p) => p.role === 'teilnahme');

  const simulateReactions = () => {
    const pool: Array<[string, string]> = [
      ['👏', 'Applaus'],
      ['👍', 'Daumen hoch'],
      ['❤️', 'Herz'],
      ['😂', 'Lachen'],
      ['🎉', 'Feiern'],
    ];
    const guests = state.participants.filter((p) => p.role === 'teilnahme');
    const chosen = [...guests].sort(() => Math.random() - 0.5).slice(0, 5);
    chosen.forEach((p, i) => {
      const [emoji, label] = pool[i % pool.length];
      commands.react(p.id, emoji, label);
    });
    commands.log(`${chosen.length} Reaktionen simuliert (10 Sekunden sichtbar)`, 'info');
  };

  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Galerie Studio</span>
          <h1 className="view__title">Galerie mit Moderation im Zentrum</h1>
          <p className="view__lead">
            Die Vorschau folgt der Teilnehmerliste. Klick auf eine Kachel schaltet das Spotlight für diese Person um.
          </p>
        </div>
        <div className="view__head-side">
          <div className="layout-picker" role="group" aria-label="Galerieansicht wählen">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`layout-option${g.layout === l.id ? ' is-active' : ''}`}
                aria-pressed={g.layout === l.id}
                onClick={() => commands.setGalleryLayout(l.id)}
                title={l.desc}
              >
                <LayoutGlyph id={l.id} />
                <span>{LAYOUT_LABEL[l.id]}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="gallery-grid">
        <div className="stack">
          <div className="stage-meta">
            <span className="tabular">
              {state.participants.length} Personen · {info.visible} sichtbar
              {info.hidden > 0 && ` · ${info.hidden} weitere ohne Kachel`}
            </span>
            <span className="subtle">{LAYOUTS.find((l) => l.id === g.layout)?.desc}</span>
          </div>
          <GalleryStage size="large" interactive />
        </div>

        <aside className="stack gallery-aside">
          <Panel eyebrow="Darstellung" title="Kacheln und Anzeige">
            <div className="stack">
              <Segmented<TileCount>
                label="Kachelzahl um die Moderation"
                value={g.tileCount}
                onChange={(tileCount) => set({ tileCount })}
                options={[
                  { value: 'auto', label: `Auto (${autoRing})`, title: 'Passt sich der Teilnehmerzahl an' },
                  { value: 8, label: '8' },
                  { value: 12, label: '12' },
                  { value: 16, label: '16' },
                ]}
              />
              <Switch checked={g.showNames} onChange={(v) => set({ showNames: v })} label="Namen anzeigen" />
              <Switch
                checked={g.showReactions}
                onChange={(v) => set({ showReactions: v })}
                label="Reaktionen anzeigen"
                description="Emoji-Reaktionen bleiben 10 Sekunden an der Kachel."
              />
              <Switch
                checked={g.showHands}
                onChange={(v) => set({ showHands: v })}
                label="Handzeichen anzeigen"
                description="Mit Platz in der Warteschlange."
              />
              <Switch
                checked={g.hideNoVideo}
                onChange={(v) => set({ hideNoVideo: v })}
                label="Personen ohne Kamera ausblenden"
              />
            </div>
          </Panel>

          <Panel
            eyebrow="Spotlight"
            title="Auswahl"
            actions={
              <Button size="sm" variant="ghost" onClick={commands.clearSpotlight} disabled={state.spotlight.length === 0}>
                Leeren
              </Button>
            }
          >
            <SpotlightList dense />
          </Panel>

          <Panel eyebrow="Teilnehmerzahl testen" title="Simulation" actions={<DemoTag />}>
            <div className="button-stack">
              <Button icon={UserPlus} onClick={commands.join}>
                Person beitreten lassen
              </Button>
              <Button icon={LogOut} onClick={() => lastGuest && commands.leave(lastGuest.id)} disabled={!lastGuest}>
                {lastGuest ? `${lastGuest.shortName} verlässt die Sitzung` : 'Niemand kann gehen'}
              </Button>
              <Button icon={PartyPopper} onClick={simulateReactions}>
                Reaktionen simulieren
              </Button>
              <Button
                icon={Shuffle}
                onClick={() => {
                  const guests = state.participants.filter((p) => p.role === 'teilnahme');
                  const p = guests[Math.floor(Math.random() * guests.length)];
                  if (p) commands.toggleCam(p.id);
                }}
              >
                Kamera einer Person umschalten
              </Button>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
