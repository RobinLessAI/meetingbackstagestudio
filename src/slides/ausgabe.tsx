// OBS-Seite für Folien: /s/<key> (eine Folie) oder /kanal/<key> (die Folie, die gerade auf Sendung ist).
// Änderungen kommen live über Server-Sent Events; die Seite skaliert 1920 × 1080 auf die Größe der Browserquelle.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/slides.css';
import type { KanalAusgabe } from './model.ts';
import { FLAECHE } from './model.ts';
import { UebergangsBuehne, useFitScale } from './SlideRender.tsx';

const base = window.location.pathname.replace(/\/+$/, '');
// ?ton=1 erlaubt Videos mit Ton (OBS spielt den Ton der Browserquelle ab)
const allowSound = new URLSearchParams(window.location.search).get('ton') === '1';

function Ausgabe() {
  const [data, setData] = useState<KanalAusgabe>({ folie: null });
  const [fehlt, setFehlt] = useState(false);
  const { ref, scale } = useFitScale('ganz');

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    const connect = () => {
      es = new EventSource(`${base}/live`);
      es.onmessage = (ev) => {
        try {
          setData(JSON.parse(ev.data) as KanalAusgabe);
          setFehlt(false);
        } catch {
          /* ignorieren */
        }
      };
      es.onerror = () => {
        // Adresse ungültig? Dann nicht endlos versuchen.
        fetch(`${base}.json`, { cache: 'no-store' })
          .then((r) => {
            if (r.status === 404 && !stopped) {
              setFehlt(true);
              setData({ folie: null });
              es?.close();
            }
          })
          .catch(() => {});
      };
    };
    connect();
    return () => {
      stopped = true;
      es?.close();
    };
  }, []);

  const left = (window.innerWidth - FLAECHE.w * scale) / 2;
  const top = (window.innerHeight - FLAECHE.h * scale) / 2;
  // Der Behälter ist immer da (er misst die Größe der Browserquelle), die Folie nur, wenn es eine gibt.
  return (
    <div ref={ref} className="folie-ausgabe">
      {!fehlt && (
        <div className="folie-ausgabe__stage" style={{ transform: `scale(${scale})`, left, top, width: FLAECHE.w, height: FLAECHE.h }}>
          {/* Übergänge zwischen Folien und Klick-Schritte (Präsentation) */}
          <UebergangsBuehne folie={data.folie} schritt={data.schritt ?? Infinity} richtung={data.richtung ?? 1} muted={!allowSound} />
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Ausgabe />
  </StrictMode>,
);
