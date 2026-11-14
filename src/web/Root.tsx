import { useEffect, useState } from 'react';
import { App } from '../App.tsx';
import { AuthScreen } from './AuthScreen.tsx';
import { api, canUse, isSlidesApp, setMainSite, setMode, setSiteUrls, studioUrl, type Rechte, type WebUser } from './mode.ts';
import { SlidesEditor } from '../slides/Editor.tsx';
import { Referentenansicht } from '../slides/Referent.tsx';
import { Lock } from 'lucide-react';

/**
 * Startet die App: lokal sofort, im Web-Modus erst nach der Anmeldung.
 * Ohne Server (z. B. reine Vorschau) läuft die App wie lokal ohne Verbindung.
 */
export function Root() {
  const [phase, setPhase] = useState<'laden' | 'app' | 'anmelden'>('laden');
  const [minPassword, setMinPassword] = useState(10);

  useEffect(() => {
    (async () => {
      let web = false;
      try {
        const m = await api<{ web: boolean; minPasswort?: number; hauptseite?: string | null; slides?: string; studio?: string }>('/api/modus');
        web = m.web;
        setMainSite(m.hauptseite ?? null);
        setSiteUrls({ slides: m.slides ?? null, studio: m.studio ?? null });
        if (m.minPasswort) setMinPassword(m.minPasswort);
      } catch {
        web = false;
      }
      if (!web) {
        setMode(false);
        setPhase('app');
        return;
      }
      // Ein Link „neues Passwort“ hat Vorrang, auch wenn noch eine Sitzung besteht.
      if (new URLSearchParams(window.location.search).get('passwort')) {
        setMode(true);
        setPhase('anmelden');
        return;
      }
      try {
        const me = await api<{ user: WebUser; rechte: Rechte }>('/api/konto/ich');
        setMode(true, me.user, me.rechte);
        setPhase('app');
      } catch {
        setMode(true);
        setPhase('anmelden');
      }
    })();
  }, []);

  if (phase === 'laden') return <div className="auth auth--loading" aria-busy="true" />;
  if (phase === 'anmelden') return <AuthScreen minPassword={minPassword} />;
  if (isSlidesApp()) {
    if (!canUse('slides'))
      return (
        <div className="sl-app sl-app--center">
          <div className="locked">
            <span className="locked__icon" aria-hidden>
              <Lock size={26} />
            </span>
            <h1 className="locked__title">MeetingBackstage Slides</h1>
            <p className="locked__text">
              Slides sind in deinem Paket nicht enthalten. Schreib uns an info@meetingbackstage.de, wenn du sie freischalten möchtest.
            </p>
            <a className="btn btn--secondary" href={studioUrl() ?? '/'}>
              Zum Studio
            </a>
          </div>
        </div>
      );
    if (new URLSearchParams(window.location.search).get('ansicht') === 'referent')
      return <Referentenansicht editorUrl={`${window.location.pathname}?bereich=praesentationen`} />;
    return <SlidesEditor studioUrl={studioUrl() ?? '/'} />;
  }
  return <App />;
}
