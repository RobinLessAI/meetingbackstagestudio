import { useEffect, useId, useState, type FormEvent } from 'react';
import { CircleAlert, CircleCheck, KeyRound, LogIn, Mail, UserPlus } from 'lucide-react';
import { Brand } from '../components/layout.tsx';
import { Button } from '../components/ui.tsx';
import { api } from './mode.ts';

type Mode = 'anmelden' | 'registrieren' | 'vergessen' | 'neu';

const HINTS: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  bestaetigt: { tone: 'ok', text: 'Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden.' },
  wartet: {
    tone: 'ok',
    text: 'Deine E-Mail-Adresse ist bestätigt. Dein Konto wird jetzt geprüft, du bekommst eine Mail, sobald es freigeschaltet ist.',
  },
  'link-ungueltig': { tone: 'warn', text: 'Der Link ist ungültig oder abgelaufen. Melde dich an, dann schicken wir dir bei Bedarf einen neuen.' },
  getrennt: { tone: 'warn', text: 'Du wurdest abgemeldet. Bitte melde dich erneut an.' },
  'passwort-neu': { tone: 'ok', text: 'Dein neues Passwort ist gespeichert. Bitte melde dich damit an.' },
};

/**
 * Anmeldung im Web-Modus: Anmelden, Registrieren, Passwort vergessen und neues Passwort (aus dem Mail-Link).
 * Nach erfolgreicher Anmeldung lädt die Seite neu und startet die App.
 */
export function AuthScreen({ minPassword }: { minPassword: number }) {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('passwort');
  const [mode, setMode] = useState<Mode>(resetToken ? 'neu' : 'anmelden');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [hint, setHint] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(() => HINTS[params.get('hinweis') ?? ''] ?? null);
  const ids = { email: useId(), password: useId(), password2: useId(), name: useId() };

  // Hinweis aus der Adresse nur einmal zeigen; Adresse aufräumen (der Passwort-Link bleibt, bis er benutzt ist).
  useEffect(() => {
    if (params.get('hinweis')) window.history.replaceState(null, '', resetToken ? `/?passwort=${resetToken}` : '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setDone(null);
    setHint(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    if ((mode === 'registrieren' || mode === 'neu') && password !== password2) {
      setError('Die beiden Passwörter stimmen nicht überein.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'anmelden') {
        await api('/api/konto/anmelden', { email, passwort: password });
        window.location.replace('/');
        return;
      }
      if (mode === 'registrieren') {
        await api('/api/konto/registrieren', { email, passwort: password, name });
        setDone(
          `Fast geschafft: Wir haben eine Mail an ${email.trim()} geschickt. Bitte bestätige darin deine Adresse. Danach prüfen wir dein Konto und schalten es frei.`,
        );
        setPassword('');
        setPassword2('');
      } else if (mode === 'vergessen') {
        await api('/api/konto/passwort-vergessen', { email });
        setDone(`Wenn es ein Konto mit ${email.trim()} gibt, kommt gleich eine Mail mit einem Link für ein neues Passwort (2 Stunden gültig).`);
      } else if (mode === 'neu') {
        await api('/api/konto/passwort-neu', { token: resetToken, passwort: password });
        window.location.replace('/?hinweis=passwort-neu');
        return;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = { anmelden: 'Anmelden', registrieren: 'Konto anlegen', vergessen: 'Passwort vergessen', neu: 'Neues Passwort' }[mode];

  return (
    <div className="auth">
      <div className="auth__card">
        <Brand />
        <h1 className="auth__title">{title}</h1>
        {(mode === 'anmelden' || mode === 'registrieren') && (
          <div className="tabs auth__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'anmelden'}
              className={`tab${mode === 'anmelden' ? ' is-active' : ''}`}
              onClick={() => switchTo('anmelden')}
            >
              <LogIn size={15} aria-hidden /> Anmelden
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'registrieren'}
              className={`tab${mode === 'registrieren' ? ' is-active' : ''}`}
              onClick={() => switchTo('registrieren')}
            >
              <UserPlus size={15} aria-hidden /> Konto anlegen
            </button>
          </div>
        )}

        {hint && (
          <p className={`callout ${hint.tone === 'ok' ? 'callout--ok' : 'callout--warn'}`} role="status">
            {hint.tone === 'ok' ? <CircleCheck size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />} {hint.text}
          </p>
        )}
        {done ? (
          <p className="callout callout--ok" role="status">
            <Mail size={16} aria-hidden /> {done}
          </p>
        ) : (
          <form className="auth__form" onSubmit={submit} noValidate>
            {mode === 'registrieren' && (
              <div className="field">
                <label className="field-label" htmlFor={ids.name}>
                  Name oder Firma
                </label>
                <input
                  id={ids.name}
                  className="input"
                  value={name}
                  maxLength={80}
                  autoComplete="organization"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            {mode !== 'neu' && (
              <div className="field">
                <label className="field-label" htmlFor={ids.email}>
                  E-Mail-Adresse
                </label>
                <input
                  id={ids.email}
                  className="input"
                  type="email"
                  required
                  value={email}
                  autoComplete="email"
                  autoFocus
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}
            {mode !== 'vergessen' && (
              <div className="field">
                <label className="field-label" htmlFor={ids.password}>
                  {mode === 'neu' ? 'Neues Passwort' : 'Passwort'}
                </label>
                <input
                  id={ids.password}
                  className="input"
                  type="password"
                  required
                  minLength={mode === 'anmelden' ? undefined : minPassword}
                  value={password}
                  autoComplete={mode === 'anmelden' ? 'current-password' : 'new-password'}
                  autoFocus={mode === 'neu'}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode !== 'anmelden' && <span className="field-hint">Mindestens {minPassword} Zeichen.</span>}
              </div>
            )}
            {(mode === 'registrieren' || mode === 'neu') && (
              <div className="field">
                <label className="field-label" htmlFor={ids.password2}>
                  Passwort wiederholen
                </label>
                <input
                  id={ids.password2}
                  className="input"
                  type="password"
                  required
                  value={password2}
                  autoComplete="new-password"
                  onChange={(e) => setPassword2(e.target.value)}
                />
              </div>
            )}
            {error && (
              <p className="callout callout--danger" role="alert">
                <CircleAlert size={16} aria-hidden /> {error}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              icon={mode === 'vergessen' ? Mail : mode === 'neu' ? KeyRound : mode === 'registrieren' ? UserPlus : LogIn}
              loading={busy}
              disabled={busy}
            >
              {{ anmelden: 'Anmelden', registrieren: 'Konto anlegen', vergessen: 'Link schicken', neu: 'Passwort speichern' }[mode]}
            </Button>
            {mode === 'registrieren' && (
              <p className="field-hint">Neue Konten werden nach der Bestätigung deiner E-Mail-Adresse von uns geprüft und freigeschaltet.</p>
            )}
          </form>
        )}

        <div className="auth__links">
          {mode === 'anmelden' && (
            <button type="button" className="link-btn" onClick={() => switchTo('vergessen')}>
              Passwort vergessen?
            </button>
          )}
          {(mode === 'vergessen' || mode === 'neu' || done) && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                if (mode === 'neu') window.history.replaceState(null, '', '/');
                switchTo('anmelden');
              }}
            >
              Zur Anmeldung
            </button>
          )}
        </div>
      </div>
      <p className="auth__foot subtle">MeetingBackstage Studio · Live-Grafiken und Regie für Zoom-Workshops</p>
    </div>
  );
}
