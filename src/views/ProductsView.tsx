import { Camera, ExternalLink, Mail, MousePointerClick, ScanSearch, type LucideIcon } from 'lucide-react';
import { Badge } from '../components/ui.tsx';
import { mainSiteUrl } from '../web/mode.ts';

interface Produkt {
  name: string;
  pfad: string;
  icon: LucideIcon;
  text: string;
  punkte?: string[];
}

// Platzhalter für kommende Produkte; Beschreibungen folgen, sobald die Produkte feststehen.
const PRODUKTE: Produkt[] = [
  {
    name: 'MeetingBackstage Spotlight',
    pfad: '/spotlight/',
    icon: MousePointerClick,
    text: 'Hebt deinen Mauszeiger mit einem farbigen Ring hervor und blendet gedrückte Tasten ein – für Schulungen und Software-Demos per Bildschirmfreigabe.',
    punkte: ['Ring um den Mauszeiger, frei gestaltbar', 'Anzeige gedrückter Tasten', 'Kleine App für den Mac'],
  },
  {
    name: 'MeetingBackstage Snap',
    pfad: '/snap/',
    icon: Camera,
    text: 'Ein weiteres Werkzeug für deine Online-Veranstaltungen – in Vorbereitung.',
  },
  {
    name: 'MeetingBackstage Scope',
    pfad: '/scope/',
    icon: ScanSearch,
    text: 'Ein weiteres Werkzeug für deine Online-Veranstaltungen – in Vorbereitung.',
  },
];

/** Weitere MeetingBackstage-Produkte (Platzhalter, „Bald verfügbar“). */
export function ProductsView() {
  const site = mainSiteUrl();
  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Die MeetingBackstage-Familie</span>
          <h1 className="view__title">Weitere Produkte</h1>
          <p className="view__lead">Das Studio ist erst der Anfang. Diese Werkzeuge für deine Online-Veranstaltungen sind in Vorbereitung.</p>
        </div>
      </header>
      <div className="products">
        {PRODUKTE.map((p) => {
          const Icon = p.icon;
          return (
            <article key={p.name} className="product">
              <div className="product__head">
                <span className="product__icon">
                  <Icon size={22} aria-hidden />
                </span>
                <Badge tone="warn">Bald verfügbar</Badge>
              </div>
              <h2 className="product__name">{p.name}</h2>
              <p className="muted">{p.text}</p>
              {p.punkte && (
                <ul className="product__list">
                  {p.punkte.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
              <div className="product__actions">
                {site && (
                  <a className="btn btn--secondary btn--sm" href={`${site}${p.pfad}`} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} aria-hidden /> Mehr erfahren
                  </a>
                )}
                <a className="btn btn--ghost btn--sm" href={`mailto:info@meetingbackstage.de?subject=${encodeURIComponent(`${p.name} – bitte benachrichtigen`)}`}>
                  <Mail size={14} aria-hidden /> Benachrichtigen lassen
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
