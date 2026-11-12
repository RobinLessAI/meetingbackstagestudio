import { useId, useState } from 'react';
import { KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { Button, Dialog } from '../components/ui.tsx';
import { useStore } from '../state/store.tsx';
import { useUi } from '../state/ui.tsx';
import { api, currentUser, isWeb } from './mode.ts';

/** Kontomenü in der Kopfzeile (nur Web-Modus): Konto, Passwort ändern, Verwaltung, Abmelden. */
export function AccountMenu() {
  const user = currentUser();
  const { go } = useUi();
  const { notify } = useStore();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { old: useId(), neu: useId() };
  if (!isWeb() || !user) return null;

  const logout = async () => {
    await api('/api/konto/abmelden', {}).catch(() => {});
    window.location.replace('/');
  };

  return (
    <div className="account">
      <button type="button" className="account__btn" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={user.email}>
        <UserRound size={16} aria-hidden />
        <span className="account__name">{user.name || user.email}</span>
      </button>
      {open && (
        <div className="account__menu" role="menu">
          <p className="account__email subtle">{user.email}</p>
          {user.admin && (
            <button
              type="button"
              role="menuitem"
              className="account__item"
              onClick={() => {
                setOpen(false);
                go('verwaltung');
              }}
            >
              <ShieldCheck size={15} aria-hidden /> Verwaltung
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="account__item"
            onClick={() => {
              setOpen(false);
              setPwOpen(true);
            }}
          >
            <KeyRound size={15} aria-hidden /> Passwort ändern
          </button>
          <button type="button" role="menuitem" className="account__item" onClick={logout}>
            <LogOut size={15} aria-hidden /> Abmelden
          </button>
        </div>
      )}
      <Dialog
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Passwort ändern"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={busy || !oldPw || newPw.length < 10}
              onClick={async () => {
                setBusy(true);
                try {
                  await api('/api/konto/passwort-aendern', { alt: oldPw, neu: newPw });
                  notify('Passwort geändert', 'erfolg');
                  setPwOpen(false);
                  setOldPw('');
                  setNewPw('');
                } catch (e) {
                  notify((e as Error).message, 'fehler');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Speichern
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="field">
            <label className="field-label" htmlFor={ids.old}>
              Bisheriges Passwort
            </label>
            <input
              id={ids.old}
              className="input"
              type="password"
              autoComplete="current-password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={ids.neu}>
              Neues Passwort (mindestens 10 Zeichen)
            </label>
            <input
              id={ids.neu}
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
