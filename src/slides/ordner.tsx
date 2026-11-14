// Ordner (z. B. ein Ordner je Kurs): Auswahl, Suche und Verwaltung – gemeinsam für Folien-Editor und Studio.
import { useEffect, useState } from 'react';
import { FolderPlus, Pencil, Search, Trash2 } from 'lucide-react';
import { IconButton } from '../components/ui.tsx';
import { slidesApi } from './api.ts';
import type { Folie, FolienState, Praesentation } from './model.ts';

/** 'alle' | 'ohne' | Ordner-ID */
export type OrdnerWahl = string;
const KEY = 'mb-folien-ordner';
const EVENT = 'mb-folien-ordner';

function read(): OrdnerWahl {
  try {
    return window.localStorage.getItem(KEY) || 'alle';
  } catch {
    return 'alle';
  }
}

/** Gewählter Ordner, im Browser gemerkt (Editor und Studio zeigen denselben). */
export function useOrdnerWahl(st: FolienState | null): [OrdnerWahl, (w: OrdnerWahl) => void] {
  const [wahl, setWahl] = useState<OrdnerWahl>(read);
  useEffect(() => {
    const sync = () => setWahl(read());
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);
  // Gelöschter Ordner: zurück auf „Alle“
  const gueltig = !st || wahl === 'alle' || wahl === 'ohne' || st.ordner.some((o) => o.id === wahl) ? wahl : 'alle';
  const set = (w: OrdnerWahl) => {
    setWahl(w);
    try {
      window.localStorage.setItem(KEY, w);
    } catch {
      /* ohne Speicher gilt die Wahl nur hier */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [gueltig, set];
}

const passt = (ordner: string | null | undefined, wahl: OrdnerWahl) => wahl === 'alle' || (wahl === 'ohne' ? !ordner : ordner === wahl);
const norm = (s: string) => s.toLocaleLowerCase('de').normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Folien im gewählten Ordner; mit Suchbegriff über alle Ordner (Name, Texte und Notizen). */
export function filterFolien(st: FolienState, wahl: OrdnerWahl, suche = ''): Folie[] {
  const q = norm(suche.trim());
  if (q)
    return st.folien.filter((f) => norm([f.name, f.notizen ?? '', ...f.elemente.map((e) => (e.typ === 'text' ? e.text : ''))].join(' ')).includes(q));
  return st.folien.filter((f) => passt(f.ordner, wahl));
}
export function filterPraes(st: FolienState, wahl: OrdnerWahl, suche = ''): Praesentation[] {
  const q = norm(suche.trim());
  if (q) return st.praesentationen.filter((p) => norm(p.name).includes(q));
  return st.praesentationen.filter((p) => passt(p.ordner, wahl));
}
/** Neue Folien/Präsentationen landen im gewählten Ordner. */
export const zielOrdner = (wahl: OrdnerWahl) => (wahl === 'alle' || wahl === 'ohne' ? null : wahl);
export const ordnerName = (st: FolienState, id: string | null | undefined) => (id ? (st.ordner.find((o) => o.id === id)?.name ?? '') : '');

/** Auswahl der Ordner mit Anzahl, Suche und (optional) Anlegen, Umbenennen, Löschen. */
export function OrdnerLeiste({
  st,
  wahl,
  onWahl,
  suche,
  onSuche,
  onState,
  onError,
  verwalten = true,
  zaehlen = 'folien',
}: {
  st: FolienState;
  wahl: OrdnerWahl;
  onWahl: (w: OrdnerWahl) => void;
  suche: string;
  onSuche: (s: string) => void;
  onState: (fn: (s: FolienState) => FolienState) => void;
  onError: (msg: string) => void;
  verwalten?: boolean;
  zaehlen?: 'folien' | 'praesentationen';
}) {
  const liste = zaehlen === 'folien' ? st.folien : st.praesentationen;
  const anzahl = (w: OrdnerWahl) => liste.filter((x) => passt(x.ordner, w)).length;
  const aktuell = st.ordner.find((o) => o.id === wahl);

  const neu = async () => {
    const name = window.prompt('Name des neuen Ordners (z. B. der Kurs):')?.trim();
    if (!name) return;
    try {
      const r = await slidesApi.createOrdner(name);
      onState((s) => ({ ...s, ordner: [...s.ordner, r.ordner].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true })) }));
      onWahl(r.ordner.id);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const umbenennen = async () => {
    if (!aktuell) return;
    const name = window.prompt('Neuer Name des Ordners:', aktuell.name)?.trim();
    if (!name || name === aktuell.name) return;
    try {
      const r = await slidesApi.renameOrdner(aktuell.id, name);
      onState((s) => ({
        ...s,
        ordner: s.ordner.map((o) => (o.id === r.ordner.id ? r.ordner : o)).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true })),
      }));
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const loeschen = async () => {
    if (!aktuell) return;
    if (
      !window.confirm(`Ordner „${aktuell.name}“ löschen? Die Folien und Präsentationen darin bleiben erhalten und stehen dann unter „Ohne Ordner“.`)
    )
      return;
    try {
      await slidesApi.removeOrdner(aktuell.id);
      onState((s) => ({
        ...s,
        ordner: s.ordner.filter((o) => o.id !== aktuell.id),
        folien: s.folien.map((f) => (f.ordner === aktuell.id ? { ...f, ordner: null } : f)),
        praesentationen: s.praesentationen.map((p) => (p.ordner === aktuell.id ? { ...p, ordner: null } : p)),
      }));
      onWahl('alle');
    } catch (e) {
      onError((e as Error).message);
    }
  };

  return (
    <div className="ordner">
      <div className="ordner__row">
        <select className="select ordner__select" value={wahl} onChange={(e) => onWahl(e.target.value)} aria-label="Ordner">
          <option value="alle">Alle Ordner ({liste.length})</option>
          {st.ordner.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({anzahl(o.id)})
            </option>
          ))}
          <option value="ohne">Ohne Ordner ({anzahl('ohne')})</option>
        </select>
        {verwalten && (
          <>
            <IconButton label="Neuer Ordner" icon={FolderPlus} onClick={neu} />
            {aktuell && <IconButton label="Ordner umbenennen" icon={Pencil} onClick={umbenennen} />}
            {aktuell && <IconButton label="Ordner löschen" icon={Trash2} onClick={loeschen} />}
          </>
        )}
      </div>
      <label className="ordner__search">
        <Search size={14} aria-hidden />
        <input
          className="input"
          type="search"
          value={suche}
          onChange={(e) => onSuche(e.target.value)}
          placeholder={zaehlen === 'folien' ? 'Folien suchen (alle Ordner)' : 'Präsentationen suchen'}
          aria-label="Suchen"
        />
      </label>
    </div>
  );
}
