import { AudioLines, Crosshair, Hand, Mic, Star } from 'lucide-react';
import { currentRequests } from '../lib/spotlight.ts';
import { duration } from '../lib/time.ts';
import { useNow } from '../state/store.tsx';
import { useZoomSpotlight } from '../state/zoomSpotlight.ts';
import { useSync } from '../sync/SyncProvider.tsx';
import { Button, IconButton } from './ui.tsx';

/**
 * „Meldet sich gerade“: wer spricht, die Hand hebt oder das Mikrofon an hat, mit Spotlight-Knopf.
 * Steht oben auf der Spotlight-Seite und im Pop-up „Wer war dran“.
 */
export function RequestsPanel({ compact = false }: { compact?: boolean }) {
  const { zoomPeople, regie } = useSync();
  const zoom = useZoomSpotlight();
  const now = useNow();
  if (regie?.state !== 'verbunden') return null;
  const requests = currentRequests(zoomPeople.list, zoomPeople.speakers ?? [], now);

  return (
    <section className={`requests${compact ? ' requests--compact' : ''}`} aria-label="Meldet sich gerade" aria-live="polite">
      <div className="requests__head">
        <strong>Meldet sich gerade</strong>
        <span className="subtle">spricht · Hand oben · Mikrofon an</span>
      </div>
      {requests.length === 0 ? (
        <p className="subtle requests__empty">Gerade niemand. Sobald jemand spricht, die Hand hebt oder das Mikrofon einschaltet, steht die Person hier.</p>
      ) : (
        <ul className="requests__list">
          {requests.map((r) => {
            const p = r.person;
            const on = zoomPeople.spotlight.includes(p.userId);
            return (
              <li key={p.userId} className={`request${r.speaking ? ' is-speaking' : ''}${on ? ' is-on' : ''}`}>
                <div className="request__who">
                  <strong className="request__name">{p.name}</strong>
                  <span className="request__tags">
                    {r.speaking && (
                      <span className="request__tag request__tag--speaking">
                        <AudioLines size={13} aria-hidden /> spricht
                      </span>
                    )}
                    {r.hand && (
                      <span className="request__tag request__tag--hand">
                        <Hand size={13} aria-hidden /> Hand{p.handSince ? ` · ${duration(now - p.handSince)}` : ''}
                      </span>
                    )}
                    {r.mic && !r.speaking && (
                      <span className="request__tag request__tag--mic">
                        <Mic size={13} aria-hidden /> Mikrofon an{p.micSince ? ` · ${duration(now - p.micSince)}` : ''}
                      </span>
                    )}
                    {r.spokeRecently && <span className="request__tag">hat eben gesprochen</span>}
                    {on && (
                      <span className="request__tag request__tag--on">
                        <Star size={13} aria-hidden /> im Spotlight
                      </span>
                    )}
                  </span>
                </div>
                <div className="request__actions">
                  <Button size="sm" variant={on ? 'primary' : 'secondary'} icon={Star} onClick={() => zoom.toggle(p)}>
                    {on ? 'Heraus' : zoom.multi && zoomPeople.spotlight.length ? 'Dazu' : 'Spotlight'}
                  </Button>
                  {zoom.multi && zoomPeople.spotlight.length > 0 && !(on && zoomPeople.spotlight.length === 1) && (
                    <IconButton label={`Nur ${p.name} im Spotlight, alle anderen heraus`} icon={Crosshair} onClick={() => zoom.only(p)} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
