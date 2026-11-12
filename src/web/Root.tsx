import { useEffect, useState } from 'react';
import { App } from '../App.tsx';
import { AuthScreen } from './AuthScreen.tsx';
import { api, setMode, type WebUser } from './mode.ts';

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
        const m = await api<{ web: boolean; minPasswort?: number }>('/api/modus');
        web = m.web;
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
        const me = await api<{ user: WebUser }>('/api/konto/ich');
        setMode(true, me.user);
        setPhase('app');
      } catch {
        setMode(true);
        setPhase('anmelden');
      }
    })();
  }, []);

  if (phase === 'laden') return <div className="auth auth--loading" aria-busy="true" />;
  if (phase === 'anmelden') return <AuthScreen minPassword={minPassword} />;
  return <App />;
}
