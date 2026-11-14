import { useEffect, useState } from 'react';
import { Lock, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Panel, Switch } from '../components/ui.tsx';
import { useStore } from '../state/store.tsx';
import { api } from './mode.ts';

export interface Rolle {
  id: string;
  name: string;
  bereiche: string[];
  gesperrteZeigen: boolean;
  hinweis: string;
}
export interface RollenState {
  rollen: Rolle[];
  standard: string;
  bereiche: Array<{ id: string; label: string; gruppe: string }>;
  standardHinweis: string;
}

/** Rollen anlegen und je Rolle festlegen, welche Bereiche sichtbar sind (Admin ist fest und sieht alles). */
export function RolesPanel({ state, onSaved }: { state: RollenState; onSaved: (s: RollenState) => void }) {
  const { notify } = useStore();
  const [rollen, setRollen] = useState<Rolle[]>(state.rollen);
  const [standard, setStandard] = useState(state.standard);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRollen(state.rollen);
    setStandard(state.standard);
    setDirty(false);
  }, [state]);

  const groups = [...new Set(state.bereiche.map((b) => b.gruppe))];
  const change = (id: string, patch: Partial<Rolle>) => {
    setRollen((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ rollen: RollenState }>('/api/verwaltung/rollen', { rollen, standard });
      onSaved(r.rollen);
      notify('Rollen gespeichert. Angemeldete Konten sehen die Änderungen sofort.', 'erfolg');
    } catch (e) {
      notify((e as Error).message, 'fehler');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      eyebrow="Rollen & Rechte"
      title="Was sieht welche Rolle?"
      actions={
        <>
          <Button
            icon={Plus}
            onClick={() => {
              const base = rollen.find((r) => r.id === standard) ?? rollen[0];
              const id = `rolle-${Math.random().toString(36).slice(2, 8)}`;
              setRollen((all) => [...all, { ...base, id, name: 'Neue Rolle' }]);
              setDirty(true);
            }}
          >
            Rolle hinzufügen
          </Button>
          <Button variant="primary" icon={Save} loading={busy} disabled={!dirty || busy} onClick={save}>
            Speichern
          </Button>
        </>
      }
    >
      <p className="muted">
        Haken = Bereich ist für diese Rolle sichtbar. Fehlende Bereiche lassen sich ausgegraut mit Schloss im Menü zeigen – so sehen Kundinnen
        und Kunden, was es in einem anderen Paket gibt. Ein Klick darauf zeigt deinen Hinweis.
      </p>
      <div className="roles">
        <article className="role role--admin">
          <header className="role__head">
            <ShieldCheck size={18} aria-hidden />
            <strong>Admin</strong>
            <Badge tone="accent">fest</Badge>
          </header>
          <p className="subtle">Sieht alles, inklusive Verwaltung und Website. Deine Adresse aus der Einrichtung ist immer Admin.</p>
        </article>
        {rollen.map((r) => (
          <article key={r.id} className="role">
            <header className="role__head">
              <input
                className="input role__name"
                value={r.name}
                maxLength={40}
                aria-label="Name der Rolle"
                onChange={(e) => change(r.id, { name: e.target.value })}
              />
              <label className="role__standard" title="Neue Konten bekommen diese Rolle">
                <input
                  type="radio"
                  name="rolle-standard"
                  checked={standard === r.id}
                  onChange={() => {
                    setStandard(r.id);
                    setDirty(true);
                  }}
                />{' '}
                Standard für neue Konten
              </label>
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                disabled={rollen.length < 2}
                title={rollen.length < 2 ? 'Mindestens eine Rolle wird gebraucht' : 'Konten mit dieser Rolle bekommen die Standard-Rolle'}
                onClick={() => {
                  if (!window.confirm(`Rolle „${r.name}“ löschen? Konten mit dieser Rolle bekommen die Standard-Rolle.`)) return;
                  const rest = rollen.filter((x) => x.id !== r.id);
                  setRollen(rest);
                  if (standard === r.id) setStandard(rest[0].id);
                  setDirty(true);
                }}
              >
                Löschen
              </Button>
            </header>
            <div className="role__groups">
              {groups.map((g) => (
                <fieldset key={g} className="role__group">
                  <legend>{g}</legend>
                  {state.bereiche
                    .filter((b) => b.gruppe === g)
                    .map((b) => {
                      const on = r.bereiche.includes(b.id);
                      return (
                        <label key={b.id} className={`role__check${on ? '' : ' is-off'}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => change(r.id, { bereiche: e.target.checked ? [...r.bereiche, b.id] : r.bereiche.filter((x) => x !== b.id) })}
                          />
                          <span>{b.label}</span>
                          {!on && <Lock size={12} aria-label="gesperrt" />}
                        </label>
                      );
                    })}
                </fieldset>
              ))}
            </div>
            <Switch
              checked={r.gesperrteZeigen}
              onChange={(gesperrteZeigen) => change(r.id, { gesperrteZeigen })}
              label="Fehlende Bereiche ausgegraut im Menü zeigen"
              description="Aus: Fehlende Bereiche sind für diese Rolle ganz unsichtbar."
            />
            {r.gesperrteZeigen && (
              <div className="field">
                <label className="field-label" htmlFor={`hinweis-${r.id}`}>
                  Hinweis bei gesperrten Bereichen
                </label>
                <textarea
                  id={`hinweis-${r.id}`}
                  className="textarea"
                  rows={2}
                  value={r.hinweis}
                  placeholder={state.standardHinweis}
                  onChange={(e) => change(r.id, { hinweis: e.target.value })}
                />
                <span className="field-hint">z. B. „Gibt es in MeetingBackstage Pro – schreib uns an info@meetingbackstage.de.“ E-Mail-Adressen werden anklickbar.</span>
              </div>
            )}
          </article>
        ))}
      </div>
      {dirty && <p className="field-hint">Ungespeicherte Änderungen – „Speichern“ nicht vergessen.</p>}
    </Panel>
  );
}
