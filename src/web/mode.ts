// Läuft die App im Web-Modus (Kundenkonten) oder lokal? Wird beim Start einmal vom Server erfragt.
export interface WebUser {
  id: string;
  email: string;
  name: string;
  status: 'aktiv' | 'wartet' | 'gesperrt';
  admin: boolean;
  rolle?: string | null;
  verified: boolean;
  createdAt: number;
  lastLoginAt: number | null;
}

let web = false;
let user: WebUser | null = null;
let mainSite: string | null = null;

export const isWeb = () => web;
export const currentUser = () => user;
let slides: string | null = null;
let studio: string | null = null;
/** Adresse des Folien-Editors (slide.… oder /folien) und des Studios. */
export const slidesUrl = () => slides;
export const studioUrl = () => studio;
export const setSiteUrls = (s: { slides?: string | null; studio?: string | null }) => {
  slides = s.slides ?? null;
  studio = s.studio ?? null;
};
/** Läuft gerade der Folien-Editor (slide.… oder /folien) statt des Studios? */
export const isSlidesApp = () => window.location.hostname.startsWith('slide.') || window.location.pathname === '/folien';
/** Adresse der Hauptseite (z. B. https://meetingbackstage.de) oder null. */
export const mainSiteUrl = () => mainSite;
export const setMainSite = (url: string | null) => {
  mainSite = url && /^https?:\/\//.test(url) ? url : null;
};
export function setMode(isWebMode: boolean, u: WebUser | null = null, r: Rechte | null = null) {
  web = isWebMode;
  user = u;
  rights = r;
  for (const l of listeners) l();
}

// ------------------------------------------------------------------ Rechte (Rollen)
/** Rechte des angemeldeten Kontos (nur Web-Modus). Lokal ist alles erlaubt. */
export interface Rechte {
  rolle: string | null;
  rolleName: string;
  bereiche: string[];
  /** Fehlende Bereiche ausgegraut im Menü zeigen. */
  gesperrteZeigen: boolean;
  /** Hinweis bei gesperrten Bereichen (z. B. „Gibt es im Pro-Paket“). */
  hinweis: string;
}
let rights: Rechte | null = null;
const listeners = new Set<() => void>();
let version = 0;
export const currentRights = () => rights;
/** Für useSyncExternalStore: ändert sich, wenn neue Rechte geladen wurden. */
export const rightsVersion = () => version;
export const subscribeRights = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
/** Darf das Konto diesen Bereich nutzen? (lokal und ohne Rollen: ja) */
export function canUse(bereich: string): boolean {
  if (!web || !rights) return true;
  return rights.bereiche.includes(bereich);
}
/** Rechte neu vom Server holen (nach „Rechte geändert“). */
export async function refreshRights() {
  if (!web) return;
  try {
    const me = await api<{ user: WebUser; rechte: Rechte }>('/api/konto/ich');
    user = me.user;
    rights = me.rechte;
    version += 1;
    for (const l of listeners) l();
  } catch {
    /* abgemeldet oder offline: beim nächsten Laden */
  }
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
