import { useId } from 'react';
import { ExternalLink, RotateCcw, X } from 'lucide-react';
import { focusChatPopup } from '../../components/ChatPopup.tsx';
import { HighlightPickList } from '../../components/HighlightPickList.tsx';
import { matches, TemplateBar } from '../../components/TemplateBar.tsx';
import { HighlightCard } from '../../components/graphics/HighlightCard.tsx';
import { Button, Field, Panel, Segmented, Switch } from '../../components/ui.tsx';
import { DEFAULT_HIGHLIGHT_STYLE, HIGHLIGHT_PRESETS } from '../../data/highlightStyle.ts';
import type { HighlightStyle } from '../../state/types.ts';
import { useStore } from '../../state/store.tsx';
import { useUi } from '../../state/ui.tsx';
import { GraphicHeader } from './shared.tsx';

export function HighlightTab() {
  const { state, dispatch } = useStore();
  const { chatPopupOpen, setChatPopupOpen } = useUi();
  const message = state.chat.find((m) => m.id === state.highlightId) ?? null;

  return (
    <div className="graphic">
      <GraphicHeader
        kind="highlight"
        title="Chat-Highlight"
        status={<span className="subtle">{message ? `Beitrag von ${message.senderName}` : 'Kein Beitrag ausgewählt'}</span>}
      >
        {message && (
          <Button variant="ghost" icon={X} onClick={() => dispatch({ type: 'highlight/set', id: null })}>
            Auswahl aufheben
          </Button>
        )}
      </GraphicHeader>

      <div className="highlight-layout">
        <div className="stack">
          <Panel eyebrow={message ? 'Live-Vorschau' : 'Vorschau mit Beispieltext'} title="Bauchbinde">
            <div className={`highlight-stage highlight-stage--${state.highlightStyle.position}`}>
              <HighlightCard
                message={message ?? { text: 'So sieht ein hervorgehobener Beitrag aus dem Chat aus.', senderName: 'Beispiel', at: Date.now() }}
                variant="preview"
                style={state.highlightStyle}
              />
            </div>
          </Panel>
          <HighlightStyleEditor />
        </div>
        <Panel
          eyebrow="Auswahl · neueste zuerst"
          title={state.highlightSince ? 'Chat-Nachrichten seit dem Leeren' : `Alle Chat-Nachrichten (${state.chat.length})`}
          actions={
            <Button size="sm" icon={ExternalLink} onClick={() => focusChatPopup() || setChatPopupOpen(true)}>
              {chatPopupOpen ? 'Fenster nach vorne' : 'Als Pop-up öffnen'}
            </Button>
          }
          flush
        >
          <HighlightPickList />
        </Panel>
      </div>
    </div>
  );
}

/** Aussehen der Einblendung: Vorlagen, Farben, Größe, Form, Position und Texte. Gilt auch für OBS. */
function HighlightStyleEditor() {
  const { state, dispatch } = useStore();
  const st = state.highlightStyle;
  const set = (patch: Partial<HighlightStyle>) => dispatch({ type: 'highlight/style', patch });
  const ids = { label: useId(), opacity: useId(), size: useId() };
  const colors: Array<[keyof HighlightStyle, string]> = [
    ['background', 'Hintergrund'],
    ['text', 'Text'],
    ['accent', 'Akzent'],
    ['name', 'Name'],
  ];
  const active = HIGHLIGHT_PRESETS.find((p) => Object.entries(p.style).every(([k, v]) => st[k as keyof HighlightStyle] === v));

  return (
    <Panel
      eyebrow="Aussehen · gilt auch für OBS"
      title="Gestaltung"
      actions={
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => set(DEFAULT_HIGHLIGHT_STYLE)}>
          Auf Standard zurücksetzen
        </Button>
      }
    >
      <div className="hl-editor">
        <div className="hl-editor__presets" role="group" aria-label="Vorlagen">
          {HIGHLIGHT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`hl-preset${active?.id === p.id ? ' is-active' : ''}`}
              aria-pressed={active?.id === p.id}
              onClick={() => set(p.style)}
            >
              <span
                className="hl-preset__swatch"
                style={{ background: p.style.background, color: p.style.text, boxShadow: p.style.bar ? `inset 3px 0 0 ${p.style.accent}` : undefined }}
                aria-hidden
              >
                Aa
              </span>
              {p.label}
            </button>
          ))}
        </div>

        <TemplateBar
          kind="highlight"
          current={st as unknown as Record<string, unknown>}
          onApply={(data) => set(data as Partial<HighlightStyle>)}
          isActive={(data) => matches(st as unknown as Record<string, unknown>, data)}
        />

        <div className="hl-editor__colors">
          {colors.map(([key, label]) => (
            <label key={key} className="hl-color">
              <input type="color" value={String(st[key])} onChange={(e) => set({ [key]: e.target.value } as Partial<HighlightStyle>)} />
              <span>
                <span className="field-label">{label}</span>
                <span className="subtle mono">{String(st[key]).toUpperCase()}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="hl-editor__ranges">
          <Field label={`Deckkraft Hintergrund: ${st.backgroundOpacity} %`} htmlFor={ids.opacity}>
            <input
              id={ids.opacity}
              className="range"
              type="range"
              min={0}
              max={100}
              step={5}
              value={st.backgroundOpacity}
              onChange={(e) => set({ backgroundOpacity: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Schriftgröße: ${st.size} %`} htmlFor={ids.size}>
            <input id={ids.size} className="range" type="range" min={60} max={200} step={10} value={st.size} onChange={(e) => set({ size: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="hl-editor__options">
          <Segmented<HighlightStyle['position']>
            label="Position"
            value={st.position}
            onChange={(position) => set({ position })}
            options={[
              { value: 'links', label: 'Links' },
              { value: 'mitte', label: 'Mitte' },
              { value: 'rechts', label: 'Rechts' },
            ]}
          />
          <Segmented<HighlightStyle['corners']>
            label="Ecken"
            value={st.corners}
            onChange={(corners) => set({ corners })}
            options={[
              { value: 'eckig', label: 'Eckig' },
              { value: 'rund', label: 'Rund' },
              { value: 'stark', label: 'Stark rund' },
            ]}
          />
          <Segmented<HighlightStyle['font']>
            label="Schrift"
            value={st.font}
            onChange={(font) => set({ font })}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'schmal', label: 'Schmal' },
              { value: 'serif', label: 'Serif' },
            ]}
          />
        </div>

        <Field label="Überschrift" htmlFor={ids.label} hint="Leer lassen, um sie auszublenden.">
          <input id={ids.label} className="input" value={st.label} maxLength={40} onChange={(e) => set({ label: e.target.value })} />
        </Field>

        <div className="hl-editor__switches">
          <Switch checked={st.bar} onChange={(bar) => set({ bar })} label="Akzentbalken links" />
          <Switch checked={st.showName} onChange={(showName) => set({ showName })} label="Name anzeigen" />
          <Switch checked={st.showTime} onChange={(showTime) => set({ showTime })} label="Uhrzeit anzeigen" />
        </div>
      </div>
    </Panel>
  );
}
