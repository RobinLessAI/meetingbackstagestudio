// Läuft die App im Web-Modus (Kundenkonten) oder lokal? Wird beim Start einmal vom Server erfragt.
export interface WebUser {
  id: string;
  email: string;
  name: string;
  status: 'aktiv' | 'wartet' | 'gesperrt';
  admin: boolean;
  verified: boolean;
  createdAt: number;
  lastLoginAt: number | null;
}

let web = false;
let user: WebUser | null = null;

export const isWeb = () => web;
export const currentUser = () => user;
export function setMode(isWebMode: boolean, u: WebUser | null = null) {
  web = isWebMode;
  user = u;
}

/** JSON-Anfrage an den Server; wirft eine Fehlermeldung zum Anzeigen. */
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.fehler ?? `Fehler ${res.status}`) as Error & { code?: string; status?: number };
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}
