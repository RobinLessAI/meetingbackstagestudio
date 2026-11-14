import { useCallback, useEffect, useState } from 'react';
import { Ban, Check, CircleAlert, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Empty, Panel, Segmented } from '../components/ui.tsx';
import { useStore } from '../state/store.tsx';
import { api, currentUser, type WebUser } from './mode.ts';
import { RolesPanel, type RollenState } from './RolesPanel.tsx';

interface Account extends WebUser {
  online: { steuerungen: number; ausgaben: number } | null;
  festAdmin?: boolean;
}
type Filter = 'alle' | 'wartet' | 'aktiv' | 'gesperrt';

const STATUS: Record<WebUser['status'], { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  aktiv: { label: 'Aktiv', tone: 'ok' },
  wartet: { label: 'Wartet auf Freischaltung', tone: 'warn' },
  gesperrt: { label: 'Gesperrt', tone: 'danger' },
};
const date = (t: number | null) => (t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');

/** Verwaltung der Kundenkonten (nur für die Verwaltung im Web-Modus). */
export function AdminView() {
  const { notify } = useStore();
  const me = currentUser();
  const [list, setList] = useState<Account[] | null>(null);
  const [rollen, setRollen] = useState<RollenState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('alle');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ konten: Account[]; rollen: RollenState }>('/api/verwaltung/konten', {});
      setList(r.konten);
      setRollen((cur) => cur ?? r.rollen);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  const setRole = async (a: Account, rolle: string) => {
    try {
      await api('/api/verwaltung/konto', { id: a.id, aktion: 'rolle', rolle });
      const name = rolle === 'admin' ? 'Admin' : (rollen?.rollen.find((r) => r.id === rolle)?.name ?? rolle);
      notify(`${a.email} hat jetzt die Rolle „${name}“. Offene Fenster passen sich sofort an.`, 'erfolg');
      load();
    } catch (e) {
      notify((e as Error).message, 'fehler');
    }
  };

  const act = async (a: Account, aktion: 'freischalten' | 'sperren' | 'entsperren' | 'loeschen') => {
    try {
      await api('/api/verwaltung/konto', { id: a.id, aktion });
      const text = {
        freischalten: `${a.email} ist freigeschaltet und bekommt eine Mail`,
        sperren: `${a.email} ist gesperrt, alle Fenster wurden getrennt`,
        entsperren: `${a.email} ist wieder aktiv`,
        loeschen: `${a.email} und alle Daten wurden gelöscht`,
      }[aktion];
      notify(text, aktion === 'sperren' || aktion === 'loeschen' ? 'warnung' : 'erfolg');
      setConfirmDelete(null);
      load();
    } catch (e) {
      notify((e as Error).message, 'fehler');
    }
  };

  if (!me?.admin) {
    return (
      <div className="view">
        <p className="callout callout--warn">
          <CircleAlert size={16} aria-hidden /> Diese Seite ist nur für die Verwaltung.
        </p>
      </div>
    );
  }

  const shown = (list ?? []).filter((a) => filter === 'alle' || a.status === filter);
  const waiting = (list ?? []).filter((a) => a.status === 'wartet' && a.verified).length;

  return (
    <div className="view">
      <header className="view__head">
        <div className="view__titles">
          <span className="eyebrow">Nur für dich</span>
          <h1 className="view__title">Verwaltung</h1>
          <p className="view__lead">
            Kundenkonten freischalten, sperren oder löschen. Eine Sperre trennt sofort alle Fenster des Kontos, auch OBS und Stream Deck; die Daten
            bleiben erhalten, bis du das Konto löschst.
          </p>
        </div>
        <Button icon={RefreshCw} onClick={load}>
          Aktualisieren
        </Button>
      </header>

      {error && (
        <p className="callout callout--danger" role="alert">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}

      <Panel
        title={
          <>
            Konten <span className="subtle tabular">{list?.length ?? 0}</span>
            {waiting > 0 && (
              <Badge tone="warn">
                {waiting} {waiting === 1 ? 'wartet' : 'warten'} auf Freischaltung
              </Badge>
            )}
          </>
        }
        actions={
          <Segmented<Filter>
            label="Zeigen"
            hideLabel
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'alle', label: 'Alle' },
              { value: 'wartet', label: 'Wartet' },
              { value: 'aktiv', label: 'Aktiv' },
              { value: 'gesperrt', label: 'Gesperrt' },
            ]}
          />
        }
        flush
      >
        {list === null ? (
          <p className="subtle admin__empty">Lade …</p>
        ) : shown.length === 0 ? (
          <Empty icon={ShieldCheck} title="Keine Konten in dieser Ansicht" compact />
        ) : (
          <div className="table-wrap">
            <table className="table admin-table">
              <thead>
                <tr>
                  <th scope="col">Konto</th>
                  <th scope="col">Status</th>
                  <th scope="col">Rolle</th>
                  <th scope="col">Registriert</th>
                  <th scope="col">Zuletzt angemeldet</th>
                  <th scope="col">Gerade offen</th>
                  <th scope="col">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => {
                  const s = STATUS[a.status];
                  const self = a.id === me.id;
                  return (
                    <tr key={a.id}>
                      <th scope="row">
                        <div className="admin__who">
                          <span className="admin__email">{a.email}</span>
                          {a.name && <span className="obs-table__desc">{a.name}</span>}

                        </div>
                      </th>
                      <td>
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {!a.verified && <span className="obs-table__desc">E-Mail noch nicht bestätigt</span>}
                      </td>
                      <td>
                        {self || a.festAdmin ? (
                          <span className="admin__role-fixed" title={a.festAdmin ? 'Fest eingerichtet (MB_ADMIN_EMAILS)' : 'Dein eigenes Konto'}>
                            <Badge tone="accent">{a.admin ? 'Admin' : (rollen?.rollen.find((r) => r.id === a.rolle)?.name ?? 'Nutzer')}</Badge>
                          </span>
                        ) : (
                          <select
                            className="select admin__role"
                            aria-label={`Rolle von ${a.email}`}
                            value={a.admin ? 'admin' : (a.rolle && rollen?.rollen.some((r) => r.id === a.rolle) ? a.rolle : (rollen?.standard ?? ''))}
                            onChange={(e) => setRole(a, e.target.value)}
                          >
                            <option value="admin">Admin</option>
                            {rollen?.rollen.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="tabular">{date(a.createdAt)}</td>
                      <td className="tabular">{date(a.lastLoginAt)}</td>
                      <td className="tabular">
                        {a.online && (a.online.steuerungen || a.online.ausgaben)
                          ? `${a.online.steuerungen} Steuerung · ${a.online.ausgaben} OBS`
                          : '–'}
                      </td>
                      <td>
                        {self ? (
                          <span className="subtle">dein Konto</span>
                        ) : confirmDelete === a.id ? (
                          <span className="row admin__actions">
                            <span className="subtle">Konto und alle Daten löschen?</span>
                            <Button size="sm" variant="danger" icon={Trash2} onClick={() => act(a, 'loeschen')}>
                              Endgültig löschen
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                              Abbrechen
                            </Button>
                          </span>
                        ) : (
                          <span className="row admin__actions">
                            {a.status === 'wartet' && (
                              <Button
                                size="sm"
                                variant="primary"
                                icon={Check}
                                onClick={() => act(a, 'freischalten')}
                                disabled={!a.verified}
                                title={a.verified ? undefined : 'Erst nach Bestätigung der E-Mail-Adresse'}
                              >
                                Freischalten
                              </Button>
                            )}
                            {a.status === 'aktiv' && (
                              <Button size="sm" icon={Ban} onClick={() => act(a, 'sperren')}>
                                Sperren
                              </Button>
                            )}
                            {a.status === 'gesperrt' && (
                              <Button size="sm" icon={RotateCcw} onClick={() => act(a, 'entsperren')}>
                                Entsperren
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(a.id)}>
                              Löschen
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {rollen && (
        <RolesPanel
          state={rollen}
          onSaved={(r) => {
            setRollen(r);
            load();
          }}
        />
      )}
    </div>
  );
}
