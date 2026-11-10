import { useId, useState } from 'react';
import { Bookmark, BookmarkPlus, Check, Trash2, X } from 'lucide-react';
import { useStore } from '../state/store.tsx';
import { useSync, type StyleTemplate } from '../sync/SyncProvider.tsx';
import { Button } from './ui.tsx';

/**
 * Eigene Vorlagen einer Art (z. B. „umfrage“): anwenden, unter einem Namen speichern
 * (gleicher Name überschreibt), löschen. Gespeichert wird im Ordner daten/ auf diesem Rechner.
 */
export function TemplateBar({
  kind,
  current,
  onApply,
  isActive,
}: {
  kind: StyleTemplate['kind'];
  /** Aktuelle Einstellungen, die beim Speichern übernommen werden. */
  current: Record<string, unknown>;
  onApply: (data: Record<string, unknown>) => void;
  /** Ob eine Vorlage den aktuellen Einstellungen entspricht (für die Markierung). */
  isActive?: (data: Record<string, unknown>) => boolean;
}) {
  const { templates, saveTemplates } = useSync();
  const { notify } = useStore();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputId = useId();
  const own = templates.filter((t) => t.kind === kind).sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const save = () => {
    const n = name.trim();
    if (!n) return;
    const existing = templates.find((t) => t.kind === kind && t.name.toLowerCase() === n.toLowerCase());
    const entry: StyleTemplate = {
      id: existing?.id ?? `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: n,
      kind,
      data: JSON.parse(JSON.stringify(current)),
      at: Date.now(),
    };
    saveTemplates([...templates.filter((t) => t.id !== entry.id), entry]);
    notify(existing ? `Vorlage „${n}“ aktualisiert` : `Vorlage „${n}“ gespeichert`, 'erfolg');
    setNaming(false);
    setName('');
  };

  return (
    <div className="tpl">
      <div className="tpl__row" role="group" aria-label="Eigene Vorlagen">
        <span className="field-label tpl__label">
          <Bookmark size={14} aria-hidden /> Eigene Vorlagen
        </span>
        {own.length === 0 && !naming && <span className="subtle">Noch keine gespeichert.</span>}
        {own.map((t) => {
          const active = isActive?.(t.data) ?? false;
          return (
            <span key={t.id} className={`tpl__item${active ? ' is-active' : ''}`}>
              <button type="button" className="tpl__apply" aria-pressed={active} onClick={() => onApply(t.data)} title={`Vorlage „${t.name}“ anwenden`}>
                {t.name}
              </button>
              {confirmDelete === t.id ? (
                <>
                  <button
                    type="button"
                    className="tpl__icon tpl__icon--danger"
                    aria-label={`„${t.name}“ wirklich löschen`}
                    title="Wirklich löschen"
                    onClick={() => {
                      saveTemplates(templates.filter((x) => x.id !== t.id));
                      setConfirmDelete(null);
                      notify(`Vorlage „${t.name}“ gelöscht`, 'info');
                    }}
                  >
                    <Check size={13} aria-hidden />
                  </button>
                  <button type="button" className="tpl__icon" aria-label="Nicht löschen" title="Abbrechen" onClick={() => setConfirmDelete(null)}>
                    <X size={13} aria-hidden />
                  </button>
                </>
              ) : (
                <button type="button" className="tpl__icon" aria-label={`Vorlage „${t.name}“ löschen`} title="Löschen" onClick={() => setConfirmDelete(t.id)}>
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </span>
          );
        })}
      </div>
      {naming ? (
        <form
          className="tpl__form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Name der Vorlage
          </label>
          <input
            id={inputId}
            className="input input--sm"
            value={name}
            maxLength={60}
            autoFocus
            placeholder="Name, z. B. „Kunde XY hell“"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(false)}
          />
          <Button size="sm" variant="primary" type="submit" disabled={!name.trim()}>
            Speichern
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
            Abbrechen
          </Button>
          {own.some((t) => t.name.toLowerCase() === name.trim().toLowerCase()) && (
            <span className="field-hint">Eine Vorlage mit diesem Namen wird überschrieben.</span>
          )}
        </form>
      ) : (
        <Button size="sm" icon={BookmarkPlus} onClick={() => setNaming(true)}>
          Aktuelles Aussehen als Vorlage speichern
        </Button>
      )}
    </div>
  );
}

/** Prüft, ob alle Werte einer Vorlage mit den aktuellen übereinstimmen. */
export function matches(current: Record<string, unknown>, data: Record<string, unknown>): boolean {
  return Object.entries(data).every(([k, v]) => JSON.stringify(current[k]) === JSON.stringify(v));
}
