// Folien-Editor, Bereich „Präsentationen“: Folien in eine Reihenfolge bringen, automatisch weiter, Schleife, starten.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { Button, IconButton } from '../components/ui.tsx';
import { slidesApi, useSlideEvents } from './api.ts';
import { maxSchritt, UEBERGAENGE, type FolienState, type KanalState, type Praesentation } from './model.ts';
import { SlideThumb } from './SlideRender.tsx';
import { Steuerpult } from './Steuerpult.tsx';
import { filterFolien, filterPraes, ordnerName, OrdnerLeiste, useOrdnerWahl, zielOrdner } from './ordner.tsx';

export function PraesentationenPanel({
  st,
  onState,
  toast,
  referentUrl,
}: {
  st: FolienState;
  onState: (fn: (s: FolienState) => FolienState) => void;
  toast: (t: string, tone?: 'ok' | 'fehler') => void;
  referentUrl: string;
}) {
  const [selId, setSelId] = useState<string | null>(() => st.kanal.ablauf?.id ?? st.praesentationen[0]?.id ?? null);
  const sel = st.praesentationen.find((p) => p.id === selId) ?? null;
  const timer = useRef<number | undefined>(undefined);
  const [drag, setDrag] = useState<number | null>(null);
  const [wahl, setWahl] = useOrdnerWahl(st);
  const [suche, setSuche] = useState('');
  // Auswahl für „Folien hinzufügen“: startet im Ordner der Präsentation
  const [poolWahl, setPoolWahl] = useState<string>('alle');
  const [poolSuche, setPoolSuche] = useState('');
  useEffect(() => setPoolWahl(sel?.ordner ?? 'alle'), [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useSlideEvents((kanal) => onState((s) => ({ ...s, kanal })));
  useEffect(() => {
    if (!sel && st.praesentationen[0]) setSelId(st.praesentationen[0].id);
  }, [sel, st.praesentationen]);

  const setKanal = (kanal: KanalState) => onState((s) => ({ ...s, kanal }));
  /** Lokal sofort übernehmen, kurz danach speichern (Tippen im Namen = ein Speichervorgang). */
  const change = (p: Praesentation, delay = 0) => {
    onState((s) => ({ ...s, praesentationen: s.praesentationen.map((x) => (x.id === p.id ? p : x)) }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        await slidesApi.updatePraes(p);
      } catch (e) {
        toast((e as Error).message, 'fehler');
      }
    }, delay);
  };
  const create = async () => {
    try {
      const r = await slidesApi.createPraes({ name: `Präsentation ${st.praesentationen.length + 1}`, folien: [], ordner: zielOrdner(wahl) });
      onState((s) => ({ ...s, praesentationen: [...s.praesentationen, r.praesentation] }));
      setSelId(r.praesentation.id);
    } catch (e) {
      toast((e as Error).message, 'fehler');
    }
  };
  const remove = async (p: Praesentation) => {
    if (!window.confirm(`Präsentation „${p.name}“ löschen? Die Folien selbst bleiben erhalten.`)) return;
    try {
      await slidesApi.removePraes(p.id);
      onState((s) => ({ ...s, praesentationen: s.praesentationen.filter((x) => x.id !== p.id) }));
      setSelId(null);
    } catch (e) {
      toast((e as Error).message, 'fehler');
    }
  };
  const move = (from: number, to: number) => {
    if (!sel || from === to || to < 0 || to >= sel.folien.length) return;
    const folien = [...sel.folien];
    const [x] = folien.splice(from, 1);
    folien.splice(to, 0, x);
    change({ ...sel, folien });
  };

  const byId = (id: string) => st.folien.find((f) => f.id === id);
  const uebergangName = (t: string) => UEBERGAENGE.find((u) => u.v === t)?.t.replace(/ \(.*\)$/, '') ?? t;

  return (
    <div className="sl-body sl-body--praes">
      <aside className="sl-left" aria-label="Präsentationen">
        <div className="sl-left__head">
          <h2>Präsentationen</h2>
          <Button size="sm" icon={Plus} onClick={create}>
            Neu
          </Button>
        </div>
        <OrdnerLeiste
          st={st}
          wahl={wahl}
          onWahl={setWahl}
          suche={suche}
          onSuche={setSuche}
          onState={onState}
          onError={(m) => toast(m, 'fehler')}
          zaehlen="praesentationen"
        />
        {st.praesentationen.length === 0 && (
          <p className="sl-hint">
            Eine Präsentation zeigt mehrere Folien nacheinander über die Kanal-Adresse – mit Übergängen und Klick-Animationen.
          </p>
        )}
        <ul className="sl-praes-list">
          {filterPraes(st, wahl, suche).map((p) => (
            <li key={p.id}>
              <button type="button" className={p.id === selId ? 'is-active' : ''} onClick={() => setSelId(p.id)}>
                <strong>{p.name}</strong>
                <span>
                  {p.folien.filter(byId).length} Folien{st.kanal.ablauf?.id === p.id ? ' · läuft' : ''}
                  {(wahl === 'alle' || suche) && p.ordner ? ` · ${ordnerName(st, p.ordner)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="sl-main sl-praes">
        {!sel ? (
          <div className="sl-empty">
            <p>Noch keine Präsentation.</p>
            <Button variant="primary" icon={Plus} onClick={create}>
              Präsentation anlegen
            </Button>
          </div>
        ) : (
          <>
            <section className="sl-praes__card">
              <h2 className="sl-praes__title">Steuerung</h2>
              <Steuerpult st={st} kanal={st.kanal} onKanal={setKanal} onError={(m) => toast(m, 'fehler')} referentUrl={referentUrl} />
            </section>

            <section className="sl-praes__card">
              <div className="sl-praes__settings">
                <div className="sl-field sl-praes__name">
                  <label htmlFor="praes-name">Name</label>
                  <input
                    id="praes-name"
                    className="input"
                    value={sel.name}
                    maxLength={80}
                    onChange={(e) => change({ ...sel, name: e.target.value }, 600)}
                  />
                </div>
                <div className="sl-field">
                  <label htmlFor="praes-auto">Automatisch weiter</label>
                  <div className="sl-num">
                    <select id="praes-auto" className="select" value={sel.auto} onChange={(e) => change({ ...sel, auto: Number(e.target.value) })}>
                      <option value={0}>Aus (per Klick)</option>
                      {[5, 8, 10, 15, 20, 30, 45, 60, 90, 120, 300].map((n) => (
                        <option key={n} value={n}>
                          alle {n < 60 ? `${n} Sekunden` : `${n / 60} ${n === 60 ? 'Minute' : 'Minuten'}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="sl-field">
                  <label htmlFor="praes-ordner">Ordner</label>
                  <select
                    id="praes-ordner"
                    className="select"
                    value={sel.ordner ?? ''}
                    onChange={(e) => change({ ...sel, ordner: e.target.value || null })}
                  >
                    <option value="">Ohne Ordner</option>
                    {st.ordner.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="sl-check">
                  <input type="checkbox" checked={sel.schleife} onChange={(e) => change({ ...sel, schleife: e.target.checked })} />
                  Endlosschleife (nach der letzten Folie wieder die erste)
                </label>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(sel)}>
                  Löschen
                </Button>
              </div>

              <h2 className="sl-praes__title">Ablauf</h2>
              {sel.folien.length === 0 && (
                <p className="sl-hint">Unten Folien anklicken, um sie in den Ablauf zu übernehmen. Eine Folie darf auch mehrmals vorkommen.</p>
              )}
              <ol className="sl-praes__ablauf">
                {sel.folien.map((id, i) => {
                  const f = byId(id);
                  if (!f) return null;
                  return (
                    <li
                      key={`${id}-${i}`}
                      draggable
                      onDragStart={(e) => {
                        setDrag(i);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (drag !== null) move(drag, i);
                        setDrag(null);
                      }}
                      onDragEnd={() => setDrag(null)}
                      className={drag === i ? 'is-dragging' : ''}
                    >
                      <span className="sl-praes__nr">
                        <GripVertical size={14} aria-hidden /> {i + 1}
                      </span>
                      <SlideThumb folie={f} />
                      <strong>{f.name}</strong>
                      <span className="subtle">
                        {uebergangName(f.uebergang.typ)}
                        {maxSchritt(f) > 0 ? ` · ${maxSchritt(f)} ${maxSchritt(f) === 1 ? 'Klick' : 'Klicks'}` : ''}
                      </span>
                      <div className="sl-praes__tools">
                        <IconButton label="Nach vorne" icon={ArrowLeft} disabled={i === 0} onClick={() => move(i, i - 1)} />
                        <IconButton label="Nach hinten" icon={ArrowRight} disabled={i === sel.folien.length - 1} onClick={() => move(i, i + 1)} />
                        <IconButton
                          label="Aus dem Ablauf entfernen"
                          icon={X}
                          onClick={() => change({ ...sel, folien: sel.folien.filter((_, j) => j !== i) })}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="sl-praes__card">
              <h2 className="sl-praes__title">Folien hinzufügen</h2>
              <div className="sl-praes__poolbar">
                <OrdnerLeiste
                  st={st}
                  wahl={poolWahl}
                  onWahl={setPoolWahl}
                  suche={poolSuche}
                  onSuche={setPoolSuche}
                  onState={onState}
                  onError={(m) => toast(m, 'fehler')}
                  verwalten={false}
                />
              </div>
              <div className="sl-praes__pool">
                {filterFolien(st, poolWahl, poolSuche).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => change({ ...sel, folien: [...sel.folien, f.id] })}
                    title={`„${f.name}“ ans Ende anhängen`}
                  >
                    <SlideThumb folie={f} />
                    <span>
                      <Plus size={13} aria-hidden /> {f.name}
                    </span>
                  </button>
                ))}
              </div>
              <p className="sl-hint">
                Übergang, Notizen und „Erscheint beim Klick“ stellst du bei der jeweiligen Folie ein (Bereich „Folien“, rechts unter „Präsentation“
                bzw. beim Element).
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
