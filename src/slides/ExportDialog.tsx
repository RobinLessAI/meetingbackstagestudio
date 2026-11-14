// Export: alle Daten des Kontos als ZIP (vom Server) oder Folien als PNG-Bilder (im Browser erzeugt).
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Download, FileArchive, Images } from 'lucide-react';
import { Button, Dialog } from '../components/ui.tsx';
import { FLAECHE, type Folie, type FolienState } from './model.ts';
import { filterFolien, ordnerName, type OrdnerWahl } from './ordner.tsx';
import { SlideCanvas } from './SlideRender.tsx';

const dateiName = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .trim()
    .slice(0, 60) || 'Folie';

/** Warten, bis Bilder und Videos (erstes Bild) in der Folie geladen sind. */
async function medienGeladen(root: HTMLElement) {
  const imgs = [...root.querySelectorAll('img')].map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => {})));
  const vids = [...root.querySelectorAll('video')].map((v) =>
    v.readyState >= 2
      ? Promise.resolve()
      : new Promise<void>((r) => {
          v.addEventListener('loadeddata', () => r(), { once: true });
          v.addEventListener('error', () => r(), { once: true });
          window.setTimeout(r, 4000);
        }),
  );
  await Promise.all([...imgs, ...vids, document.fonts.ready]);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

export function ExportDialog({ open, onClose, st, wahl }: { open: boolean; onClose: () => void; st: FolienState; wahl: OrdnerWahl }) {
  const [cur, setCur] = useState<Folie | null>(null);
  const [fortschritt, setFortschritt] = useState<{ n: number; von: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [umfang, setUmfang] = useState<'ordner' | 'alle'>(wahl === 'alle' ? 'alle' : 'ordner');
  const stage = useRef<HTMLDivElement>(null);
  // Beim Öffnen: Umfang passend zum gerade gewählten Ordner
  useEffect(() => {
    if (open) setUmfang(wahl === 'alle' ? 'alle' : 'ordner');
  }, [open, wahl]);
  const ordner = wahl !== 'alle' && wahl !== 'ohne' ? st.ordner.find((o) => o.id === wahl) : null;
  const auswahl = umfang === 'alle' ? st.folien : filterFolien(st, wahl);

  const bilder = async () => {
    setFehler(null);
    try {
      const [{ toBlob }, { zipSync }] = await Promise.all([import('html-to-image'), import('fflate')]);
      const files: Record<string, [Uint8Array, { level: 0 }]> = {};
      const zaehler = new Map<string, number>();
      for (let i = 0; i < auswahl.length; i++) {
        const f = auswahl[i];
        setFortschritt({ n: i + 1, von: auswahl.length });
        flushSync(() => setCur(f));
        const el = stage.current?.firstElementChild as HTMLElement | null;
        if (!el) continue;
        await medienGeladen(el);
        const blob = await toBlob(el, { width: FLAECHE.w, height: FLAECHE.h, pixelRatio: 1, cacheBust: false });
        if (!blob) throw new Error(`Folie „${f.name}“ konnte nicht als Bild gespeichert werden.`);
        // Nummer je Ordner, damit die Reihenfolge erhalten bleibt
        const dir = umfang === 'alle' ? `${dateiName(ordnerName(st, f.ordner) || 'Ohne Ordner')}/` : '';
        const n = (zaehler.get(dir) ?? 0) + 1;
        zaehler.set(dir, n);
        files[`${dir}${String(n).padStart(2, '0')} ${dateiName(f.name)}.png`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
      }
      const zip = zipSync(files);
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `folien-${dateiName(umfang === 'alle' ? 'alle' : (ordner?.name ?? 'ohne-ordner'))
        .toLowerCase()
        .replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setFortschritt(null);
      setCur(null);
    }
  };

  const umfangText = wahl === 'ohne' ? 'Folien ohne Ordner' : ordner ? `Ordner „${ordner.name}“` : '';

  return (
    <Dialog open={open} onClose={() => !fortschritt && onClose()} title="Exportieren" size="lg">
      <div className="exp">
        <section className="exp__card">
          <h3>
            <FileArchive size={18} aria-hidden /> Alle Daten (ZIP)
          </h3>
          <p className="muted">
            Folien, Präsentationen, Ordner, Notizen, alle hochgeladenen Bilder und Videos in Originalqualität sowie deine Veranstaltung und Vorlagen
            aus dem Studio. Gut als Sicherung oder zum Weiterverwenden.
          </p>
          <div className="row">
            <a className="btn btn--primary btn--md" href="/api/export" download>
              <Download size={16} aria-hidden /> Alles herunterladen
            </a>
            {ordner && (
              <a className="btn btn--secondary btn--md" href={`/api/export?ordner=${ordner.id}`} download>
                <Download size={16} aria-hidden /> Nur „{ordner.name}“
              </a>
            )}
          </div>
        </section>

        <section className="exp__card">
          <h3>
            <Images size={18} aria-hidden /> Folien als Bilder (PNG)
          </h3>
          <p className="muted">
            Jede Folie als Bild in 1920 × 1080 – z. B. für PowerPoint, Keynote, Handouts oder soziale Medien. Durchsichtige Stellen bleiben
            durchsichtig. Bei Videos wird das erste Bild gespeichert.
          </p>
          {wahl !== 'alle' && (
            <div className="exp__umfang" role="radiogroup" aria-label="Welche Folien">
              <label>
                <input type="radio" checked={umfang === 'ordner'} onChange={() => setUmfang('ordner')} /> {umfangText} (
                {filterFolien(st, wahl).length})
              </label>
              <label>
                <input type="radio" checked={umfang === 'alle'} onChange={() => setUmfang('alle')} /> Alle Folien ({st.folien.length}), je Ordner ein
                Unterordner
              </label>
            </div>
          )}
          <div className="row">
            <Button variant="primary" icon={Images} loading={!!fortschritt} disabled={!!fortschritt || auswahl.length === 0} onClick={bilder}>
              {fortschritt
                ? `Bild ${fortschritt.n} von ${fortschritt.von} …`
                : `${auswahl.length} ${auswahl.length === 1 ? 'Bild' : 'Bilder'} herunterladen`}
            </Button>
          </div>
          {fehler && <p className="callout callout--danger">{fehler}</p>}
        </section>
      </div>
      {/* Unsichtbare Bühne in Originalgröße für die Bilder */}
      <div ref={stage} className="exp__stage" aria-hidden>
        {cur && <SlideCanvas folie={cur} />}
      </div>
    </Dialog>
  );
}
