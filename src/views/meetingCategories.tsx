import { useId, useState, type CSSProperties } from 'react';
import { Check, Plus, Tag, Trash2 } from 'lucide-react';
import { Button } from '../components/ui.tsx';
import { PALETTE } from '../lib/color.ts';
import { useSync, type StyleTemplate } from '../sync/SyncProvider.tsx';

export interface Category {
  name: string;
  color: string;
}

interface CategoryData {
  list: Category[];
  /** Meeting-ID → Namen der Kategorien */
  assigned: Record<string, string[]>;
}

const RECORD_ID = 'kategorien';

/**
 * Eigene Kategorien für Meetings. Gespeichert als ein Eintrag im Vorlagen-Speicher
 * (daten/vorlagen.json); die Zuordnung hängt an der Meeting-ID.
 */
export function useCategories() {
  const { templates, saveTemplates } = useSync();
  const record = templates.find((t) => t.id === RECORD_ID);
  const raw = (record?.data as unknown as Partial<CategoryData>) ?? {};
  const data: CategoryData = { list: raw.list ?? [], assigned: raw.assigned ?? {} };

  const write = (next: CategoryData) => {
    const entry: StyleTemplate = { id: RECORD_ID, name: 'Kategorien', kind: 'kategorien', data: next as unknown as Record<string, unknown>, at: Date.now() };
    saveTemplates([...templates.filter((t) => t.id !== RECORD_ID), entry]);
  };

  return {
    list: data.list,
    of: (meetingId: string) => (data.assigned[meetingId] ?? []).filter((n) => data.list.some((c) => c.name === n)),
    colorOf: (name: string) => data.list.find((c) => c.name === name)?.color ?? PALETTE[0],
    toggle: (meetingId: string, name: string) => {
      const current = data.assigned[meetingId] ?? [];
      const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
      write({ ...data, assigned: { ...data.assigned, [meetingId]: next } });
    },
    create: (name: string) => {
      const n = name.trim();
      if (!n || data.list.some((c) => c.name.toLowerCase() === n.toLowerCase())) return null;
      const color = PALETTE[data.list.length % PALETTE.length];
      write({ ...data, list: [...data.list, { name: n, color }] });
      return n;
    },
    createAndAssign: (meetingId: string, name: string) => {
      const n = name.trim();
      if (!n) return;
      const exists = data.list.find((c) => c.name.toLowerCase() === n.toLowerCase());
      const finalName = exists?.name ?? n;
      const list = exists ? data.list : [...data.list, { name: n, color: PALETTE[data.list.length % PALETTE.length] }];
      const current = data.assigned[meetingId] ?? [];
      write({ list, assigned: { ...data.assigned, [meetingId]: current.includes(finalName) ? current : [...current, finalName] } });
    },
    setColor: (name: string, color: string) => write({ ...data, list: data.list.map((c) => (c.name === name ? { ...c, color } : c)) }),
    remove: (name: string) =>
      write({
        list: data.list.filter((c) => c.name !== name),
        assigned: Object.fromEntries(Object.entries(data.assigned).map(([id, names]) => [id, names.filter((n) => n !== name)])),
      }),
  };
}

/** Farbige Kennzeichnung der Kategorien eines Meetings. */
export function CategoryChips({ meetingId }: { meetingId: string }) {
  const cats = useCategories();
  const names = cats.of(meetingId);
  if (!names.length) return null;
  return (
    <span className="cat-chips">
      {names.map((n) => (
        <span key={n} className="cat-chip" style={{ '--cat': cats.colorOf(n) } as CSSProperties}>
          {n}
        </span>
      ))}
    </span>
  );
}

/** Knopf „Kategorie“ mit Auswahl zum An- und Abwählen und Anlegen neuer Kategorien. */
export function CategoryPicker({ meetingId }: { meetingId: string }) {
  const cats = useCategories();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const inputId = useId();
  const mine = cats.of(meetingId);

  return (
    <span className="cat-picker">
      <Button size="sm" variant="ghost" icon={Tag} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Kategorie
      </Button>
      {open && (
        <div className="cat-pop" role="dialog" aria-label="Kategorien zuordnen">
          {cats.list.length === 0 && <p className="subtle">Noch keine Kategorien. Lege unten die erste an.</p>}
          <ul className="cat-pop__list">
            {cats.list.map((c) => {
              const on = mine.includes(c.name);
              return (
                <li key={c.name}>
                  <button type="button" className={`cat-pop__item${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => cats.toggle(meetingId, c.name)}>
                    <span className="cat-pop__box" style={{ background: on ? c.color : 'transparent', borderColor: c.color }} aria-hidden>
                      {on && <Check size={12} />}
                    </span>
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <form
            className="cat-pop__new"
            onSubmit={(e) => {
              e.preventDefault();
              cats.createAndAssign(meetingId, name);
              setName('');
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              Neue Kategorie
            </label>
            <input id={inputId} className="input input--sm" value={name} maxLength={30} placeholder="Neue Kategorie" onChange={(e) => setName(e.target.value)} />
            <Button size="sm" type="submit" icon={Plus} disabled={!name.trim()}>
              Anlegen
            </Button>
          </form>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Fertig
          </Button>
        </div>
      )}
    </span>
  );
}

/** Filterleiste nach Kategorie, dazu Verwalten (Farbe, Löschen). */
export function CategoryFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cats = useCategories();
  const [manage, setManage] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const newId = useId();
  const options = [{ value: '', label: 'Alle' }, ...cats.list.map((c) => ({ value: c.name, label: c.name, color: c.color })), { value: '__ohne', label: 'Ohne Kategorie' }];
  return (
    <div className="cat-filter">
      <span className="field-label">Kategorie</span>
      <div className="cat-filter__row" role="group" aria-label="Nach Kategorie filtern">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`cat-filter__btn${value === o.value ? ' is-active' : ''}`}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            style={'color' in o ? ({ '--cat': o.color } as CSSProperties) : undefined}
          >
            {'color' in o && <span className="cat-dot" aria-hidden />}
            {o.label}
          </button>
        ))}
        <button type="button" className="link-btn" onClick={() => setManage((m) => !m)}>
          {manage ? 'Verwalten schließen' : cats.list.length ? 'Kategorien verwalten' : 'Kategorien anlegen'}
        </button>
      </div>
      {cats.list.length === 0 && !manage && (
        <span className="field-hint">Noch keine Kategorien. Lege sie hier an oder direkt über „Kategorie“ an einem Meeting.</span>
      )}
      {manage && (
        <form
          className="cat-pop__new"
          onSubmit={(e) => {
            e.preventDefault();
            cats.create(newName);
            setNewName('');
          }}
        >
          <label htmlFor={newId} className="sr-only">
            Neue Kategorie
          </label>
          <input id={newId} className="input input--sm" value={newName} maxLength={30} placeholder="Neue Kategorie, z. B. Kunde Nord" onChange={(e) => setNewName(e.target.value)} />
          <Button size="sm" type="submit" icon={Plus} disabled={!newName.trim()}>
            Anlegen
          </Button>
        </form>
      )}
      {manage && cats.list.length > 0 && (
        <ul className="cat-manage">
          {cats.list.map((c) => (
            <li key={c.name}>
              <input type="color" value={c.color} aria-label={`Farbe für ${c.name}`} onChange={(e) => cats.setColor(c.name, e.target.value)} />
              <span>{c.name}</span>
              {confirm === c.name ? (
                <>
                  <Button size="sm" variant="danger" onClick={() => { cats.remove(c.name); setConfirm(null); if (value === c.name) onChange(''); }}>
                    Löschen
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                    Abbrechen
                  </Button>
                </>
              ) : (
                <button type="button" className="tpl__icon meet-item__del" aria-label={`Kategorie „${c.name}“ löschen`} title="Löschen" onClick={() => setConfirm(c.name)}>
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Passt ein Meeting zum Kategorie-Filter ('' = alle, '__ohne' = ohne Kategorie)? */
export function matchesCategory(names: string[], filter: string): boolean {
  if (!filter) return true;
  if (filter === '__ohne') return names.length === 0;
  return names.includes(filter);
}
