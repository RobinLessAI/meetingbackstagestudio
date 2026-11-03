import { useId, useState } from 'react';
import { CloudIcon, Eye, EyeOff, Pause, Play, RotateCcw } from 'lucide-react';
import { WordCloud } from '../../components/graphics/WordCloud.tsx';
import { Badge, Button, Dialog, Empty, IconButton, Panel, Segmented, Switch } from '../../components/ui.tsx';
import { clock } from '../../lib/time.ts';
import { EXCLUSION_LABEL } from '../../lib/words.ts';
import { useStore } from '../../state/store.tsx';
import type { CloudFilters } from '../../state/types.ts';
import { CollectStatus, GraphicHeader } from './shared.tsx';

export function CloudTab() {
  const { state, derived, dispatch, notify } = useStore();
  const [resetOpen, setResetOpen] = useState(false);
  const [showExcluded, setShowExcluded] = useState(true);
  const promptId = useId();
  const cloud = state.cloud;
  const c = derived.cloud;
  const setFilter = (filters: Partial<CloudFilters>) => dispatch({ type: 'cloud/update', patch: {}, filters });
  const toggle = (key: string) => {
    const hidden = cloud.hidden.includes(key);
    dispatch({ type: 'cloud/toggleHidden', key });
    const term = c.terms.find((t) => t.key === key);
    notify(`„${term?.display ?? key}“ ${hidden ? 'wieder eingeblendet' : 'ausgeblendet'}`, 'info');
  };
  const since = clock(cloud.status === 'laeuft' ? cloud.startedAt : (cloud.pausedAt ?? cloud.startedAt), false);
  const listed = showExcluded ? c.terms : c.terms.filter((t) => !t.excluded || t.excluded === 'ausgeblendet');

  return (
    <div className="graphic">
      <GraphicHeader
        kind="wortwolke"
        title="Wortwolke"
        status={
          <>
            <CollectStatus status={cloud.status} since={since} />
            <span className="subtle tabular">
              {c.messageCount} Beiträge · {c.visible.length} Begriffe sichtbar · {c.terms.length - c.visible.length} gefiltert
            </span>
          </>
        }
      />

      <div className="graphic-tools">
        <div className="field graphic-tools__question">
          <label className="field-label" htmlFor={promptId}>
            Frage im Chat
          </label>
          <input
            id={promptId}
            className="input"
            value={cloud.prompt}
            maxLength={90}
            onChange={(e) => dispatch({ type: 'cloud/update', patch: { prompt: e.target.value } })}
          />
        </div>
        <div className="row graphic-tools__buttons">
          {cloud.status === 'laeuft' ? (
            <Button icon={Pause} onClick={() => dispatch({ type: 'cloud/pause', at: Date.now() })}>
              Pausieren
            </Button>
          ) : (
            <Button icon={Play} onClick={() => dispatch({ type: 'cloud/resume', at: Date.now() })}>
              Fortsetzen
            </Button>
          )}
          <Button icon={RotateCcw} variant="ghost" onClick={() => setResetOpen(true)}>
            Neu starten
          </Button>
        </div>
      </div>

      <div className="cloud-layout">
        <Panel
          eyebrow="Live-Vorschau · Klick blendet einen Begriff aus"
          title={cloud.prompt}
          className="cloud-preview"
        >
          <WordCloud terms={c.visible} onToggle={toggle} hiddenKeys={cloud.hidden} />
        </Panel>

        <div className="stack">
          <Panel eyebrow="Filter" title="Was angezeigt wird">
            <div className="stack">
              <Switch checked={cloud.filters.stopwords} onChange={(v) => setFilter({ stopwords: v })} label="Füllwörter ausblenden" description="und, der, die, auch, mal …" />
              <Switch
                checked={cloud.filters.shortWords}
                onChange={(v) => setFilter({ shortWords: v })}
                label="Einzelne Buchstaben, Kurzwörter und Zahlen ausblenden"
                description="Wörter mit weniger als drei Zeichen."
              />
              <Switch
                checked={cloud.filters.profanity}
                onChange={(v) => setFilter({ profanity: v })}
                label="Unangemessene Begriffe ausblenden"
                description="Beispielliste; in der Praxis von der Organisation gepflegt."
              />
              <Switch
                checked={cloud.filters.ignoreVotes}
                onChange={(v) => setFilter({ ignoreVotes: v })}
                label="Umfrage-Stimmen nicht übernehmen"
                description="Nachrichten wie „B“ oder „Live-Demos“ zählen dann nur für die Umfrage."
              />
              <Segmented<CloudFilters['minCount']>
                label="Mindestens genannt"
                value={cloud.filters.minCount}
                onChange={(minCount) => setFilter({ minCount })}
                options={[
                  { value: 1, label: '1×' },
                  { value: 2, label: '2×' },
                  { value: 3, label: '3×' },
                ]}
              />
              <p className="subtle">Pro Nachricht zählt jeder Begriff einmal.</p>
            </div>
          </Panel>

          <Panel
            eyebrow="Vor der Anzeige prüfen"
            title={
              <>
                Begriffe <span className="subtle tabular">{c.terms.length}</span>
              </>
            }
            actions={<Switch checked={showExcluded} onChange={setShowExcluded} label="Gefilterte zeigen" />}
            flush
          >
            {listed.length === 0 ? (
              <Empty icon={CloudIcon} title="Noch keine Begriffe" compact>
                <p>Chat-Beiträge seit {clock(cloud.startedAt, false)} Uhr erscheinen hier.</p>
              </Empty>
            ) : (
              <ul className="term-list">
                {listed.map((t) => {
                  const manual = t.excluded === 'ausgeblendet';
                  const canToggle = !t.excluded || manual;
                  return (
                    <li key={t.key} className={t.excluded ? 'is-excluded' : ''}>
                      <span className="term-list__word">{t.display}</span>
                      <span className="term-list__count tabular">{t.count}</span>
                      <span className="term-list__state">
                        {t.excluded ? <Badge tone={t.excluded === 'unangemessen' ? 'danger' : 'neutral'}>{EXCLUSION_LABEL[t.excluded]}</Badge> : <Badge tone="ok">sichtbar</Badge>}
                      </span>
                      {canToggle ? (
                        <IconButton
                          label={manual ? `„${t.display}“ wieder einblenden` : `„${t.display}“ ausblenden`}
                          icon={manual ? Eye : EyeOff}
                          onClick={() => toggle(t.key)}
                        />
                      ) : (
                        <span className="icon-btn-placeholder" aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Wortwolke neu starten?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger-solid"
              icon={RotateCcw}
              onClick={() => {
                dispatch({ type: 'cloud/reset', at: Date.now() });
                setResetOpen(false);
                notify('Wortwolke neu gestartet. Es zählen nur noch neue Chat-Beiträge.', 'info');
              }}
            >
              Neu starten
            </Button>
          </>
        }
      >
        <p>Die Wortwolke beginnt leer und sammelt ab jetzt neue Beiträge. Manuell ausgeblendete Begriffe werden ebenfalls zurückgesetzt.</p>
      </Dialog>
    </div>
  );
}
