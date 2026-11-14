import { Lock, Mail } from 'lucide-react';
import { lockedHint } from '../state/rights.ts';
import { currentRights, mainSiteUrl } from '../web/mode.ts';

/** Seite für einen Bereich, der im Paket des Kontos nicht enthalten ist. */
export function LockedView({ title }: { title: string }) {
  const rolle = currentRights()?.rolleName;
  const hint = lockedHint();
  // E-Mail-Adresse im Hinweis anklickbar machen
  const parts = hint.split(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/);
  return (
    <div className="view">
      <section className="locked" aria-labelledby="locked-title">
        <span className="locked__icon" aria-hidden>
          <Lock size={26} />
        </span>
        <p className="eyebrow">Nicht in deinem Paket{rolle ? ` (${rolle})` : ''}</p>
        <h1 id="locked-title" className="locked__title">
          {title}
        </h1>
        <p className="locked__text">
          {parts.map((p, i) =>
            /@/.test(p) ? (
              <a key={i} href={`mailto:${p}?subject=${encodeURIComponent(`Freischaltung: ${title}`)}`}>
                {p}
              </a>
            ) : (
              <span key={i}>{p}</span>
            ),
          )}
        </p>
        <div className="row locked__actions">
          {mainSiteUrl() && (
            <a className="btn btn--secondary" href={`${mainSiteUrl()}/#produkte`} target="_blank" rel="noreferrer">
              Pakete und Produkte ansehen
            </a>
          )}
          <a className="btn btn--ghost" href={`mailto:info@meetingbackstage.de?subject=${encodeURIComponent(`Freischaltung: ${title}`)}`}>
            <Mail size={15} aria-hidden /> Freischaltung anfragen
          </a>
        </div>
      </section>
    </div>
  );
}
