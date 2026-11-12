// Zoom-Konto verbinden (OAuth) und eigene Meetings abrufen.
//
// Einmalig: „Bei Zoom erlauben“ öffnet die Zoom-Freigabe. Danach leitet Zoom auf die
// eingetragene Weiterleitungs-Adresse (ZOOM_REDIRECT_URI) mit ?code=… weiter; diese Adresse
// wird in MeetingBackstage eingefügt. Die Zugangs-Token liegen nur lokal in
// daten/zoom-anmeldung.json und werden automatisch erneuert.
//
// Im Web-Modus leitet Zoom direkt auf studio…/api/zoom/zurueck zurück (kein Einfügen nötig).
//
// Benötigte Berechtigungen in der Zoom-App: meeting:read:list_meetings (Meetings auflisten),
// user:read:user (persönlicher Meetingraum, Zuordnung beim Entfernen der App) und
// user:read:token (OBF-Token: damit darf die Regie Meetings fremder Zoom-Konten betreten,
// solange die verbundene Person selbst im Meeting ist).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

/** Prüft die Signatur eines Zoom-Ereignisses (x-zm-signature = v0=HMAC(secret, "v0:<zeit>:<inhalt>")). */
export function zoomSignatureOk(secret, headers, raw, now = Date.now()) {
  const ts = String(headers['x-zm-request-timestamp'] ?? '');
  const sig = String(headers['x-zm-signature'] ?? '');
  if (!secret || !/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const expected = `v0=${crypto.createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex')}`;
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** Den Code aus der eingefügten Weiterleitungsadresse (oder nur den Code) lesen. */
export function parseAuthCode(input) {
  const v = String(input ?? '').trim();
  const m = v.match(/[?&]code=([^&#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  return /^[\w.-]{10,}$/.test(v) ? v : '';
}

/** Meeting aus der Zoom-API in ein schlankes Format bringen. */
export function normalizeMeeting(m) {
  const recurring = m.type === 3 || m.type === 8;
  return {
    id: String(m.id),
    topic: m.topic || 'Zoom-Meeting',
    start: m.start_time ?? null,
    duration: m.duration ?? null,
    timezone: m.timezone ?? null,
    recurring,
    /** 3 = wiederkehrend ohne feste Zeit, 8 = wiederkehrend mit fester Zeit */
    type: m.type,
    link: m.join_url ?? `https://zoom.us/j/${m.id}`,
  };
}

export function createZoomAccount({ clientId, clientSecret, redirectUri, dataDir, log, oauthBase, apiBase }) {
  const OAUTH = oauthBase ?? 'https://zoom.us/oauth';
  const API = apiBase ?? 'https://api.zoom.us/v2';
  const file = path.join(dataDir, 'zoom-anmeldung.json');
  let tokens = null;
  try {
    tokens = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    tokens = null;
  }
  const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

  async function save(t) {
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.writeFile(file, JSON.stringify(t), { mode: 0o600 });
    tokens = t;
  }

  async function tokenRequest(params) {
    const res = await fetch(`${OAUTH}/token`, {
      method: 'POST',
      headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new Error(`Zoom-Anmeldung fehlgeschlagen (${res.status}${body.reason || body.error ? ` ${body.reason ?? body.error}` : ''}).`);
    }
    await save({
      access: body.access_token,
      refresh: body.refresh_token ?? tokens?.refresh ?? null,
      expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
      scope: body.scope ?? '',
      // Zoom-Konto, zu dem die Anmeldung gehört (für das Entfernen der App über Zoom)
      zoomUserId: tokens?.zoomUserId ?? null,
      zoomAccountId: tokens?.zoomAccountId ?? null,
      zoomEmail: tokens?.zoomEmail ?? null,
    });
  }

  async function accessToken() {
    if (!tokens) throw new Error('Noch nicht mit dem Zoom-Konto verbunden.');
    if (Date.now() > tokens.expiresAt - 60_000) {
      if (!tokens.refresh) throw new Error('Zoom-Anmeldung abgelaufen. Bitte erneut verbinden.');
      await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
      log('Zoom-Anmeldung erneuert.');
    }
    return tokens.access;
  }

  async function get(pathAndQuery) {
    const res = await fetch(`${API}${pathAndQuery}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(body.message ?? '');
      if ((res.status === 400 || res.status === 403) && /scope/i.test(msg)) {
        // Zoom nennt die fehlenden Berechtigungen selbst, z. B. „scopes:[meeting:read:list_meetings, meeting:read:list_meetings:admin]“.
        const named = msg.match(/scopes?:?\s*\[([^\]]+)\]/i)?.[1]?.split(',').map((x) => x.trim()).filter(Boolean) ?? [];
        const needed = named.length ? named.join(' oder ') : 'meeting:read:list_meetings';
        throw new Error(
          `Der Zoom-App fehlt eine Berechtigung (${needed}). Im Marketplace unter „Scopes“ hinzufügen, dann hier „Zoom-Konto trennen“ und neu verbinden.`,
        );
      }
      if (res.status === 401) throw new Error('Zoom hat die Anmeldung abgelehnt. Bitte „Trennen“ und neu verbinden.');
      throw new Error(`Zoom-API antwortet mit ${res.status}${msg ? `: ${msg}` : ''}`);
    }
    return body;
  }

  /** Nach dem Verbinden: zu welchem Zoom-Konto gehört die Anmeldung? (braucht user:read:user, sonst egal) */
  async function rememberZoomUser() {
    try {
      const me = await get('/users/me');
      await save({ ...tokens, zoomUserId: me.id ?? null, zoomAccountId: me.account_id ?? null, zoomEmail: me.email ?? null });
    } catch {
      /* ohne Berechtigung bleibt die Zuordnung leer */
    }
  }

  async function forget() {
    tokens = null;
    await fsp.rm(file, { force: true });
  }

  return {
    status: () => ({
      connected: Boolean(tokens),
      redirectConfigured: Boolean(redirectUri),
      scope: tokens?.scope ?? '',
      email: tokens?.zoomEmail ?? null,
    }),

    /** Zoom-Konto, zu dem die gespeicherte Anmeldung gehört (oder null). */
    zoomUserId: () => tokens?.zoomUserId ?? null,

    authorizeUrl: (state) =>
      redirectUri
        ? `${OAUTH}/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, ...(state ? { state } : {}) })}`
        : null,

    async connect(input) {
      if (!redirectUri) throw new Error('ZOOM_REDIRECT_URI fehlt in .env.local (dieselbe Adresse wie „OAuth Redirect URL“ in der Zoom-App).');
      // Web: Zoom liefert den Code direkt ({ code }); lokal wird die eingefügte Adresse gelesen.
      const code = typeof input === 'object' && input?.code ? String(input.code) : parseAuthCode(input);
      if (!code) throw new Error('In der eingefügten Adresse wurde kein Code gefunden. Bitte die komplette Adresse nach „Erlauben“ einfügen.');
      await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
      await rememberZoomUser();
      log('Mit dem Zoom-Konto verbunden.');
    },

    /** Trennen auf Wunsch: Anmeldung bei Zoom zurückziehen (soweit möglich) und lokal löschen. */
    async disconnect() {
      const token = tokens?.refresh ?? tokens?.access;
      if (token) {
        await fetch(`${OAUTH}/revoke`, {
          method: 'POST',
          headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
        }).catch(() => {});
      }
      await forget();
    },

    /** Die App wurde bei Zoom entfernt: nur lokal löschen (Zoom hat die Anmeldung schon ungültig gemacht). */
    forget,

    /**
     * OBF-Token für ein Meeting: erlaubt der Regie den Beitritt im Namen der verbundenen Person.
     * Zoom lässt die Regie nur hinein, solange diese Person selbst im Meeting ist.
     */
    async obfToken(meetingId) {
      try {
        const body = await get(`/users/me/token?${new URLSearchParams({ type: 'onbehalf', meeting_id: String(meetingId) })}`);
        if (!body.token) throw new Error('Zoom hat kein Token geliefert.');
        return body.token;
      } catch (e) {
        // Nennt Zoom die fehlende Berechtigung nicht, steht dort der Platzhalter für die Meeting-Liste.
        if (/Berechtigung \(meeting:read:list_meetings\)/.test(e.message)) throw new Error(e.message.replace('meeting:read:list_meetings', 'user:read:token'));
        throw e;
      }
    },

    /** Geplante und wiederkehrende Meetings des eigenen Kontos, dazu der persönliche Meetingraum. */
    async listMeetings() {
      const meetings = [];
      let next = '';
      for (let page = 0; page < 5; page++) {
        const q = new URLSearchParams({ type: 'scheduled', page_size: '300' });
        if (next) q.set('next_page_token', next);
        const body = await get(`/users/me/meetings?${q}`);
        meetings.push(...(body.meetings ?? []).map(normalizeMeeting));
        next = body.next_page_token ?? '';
        if (!next) break;
      }
      // Persönlicher Meetingraum (braucht user:read:user; fehlt die Berechtigung, einfach weglassen)
      let personal = null;
      try {
        const me = await get('/users/me');
        if (me.pmi) personal = { id: String(me.pmi), topic: 'Persönlicher Meetingraum', start: null, duration: null, timezone: null, recurring: true, type: 'pmi', link: me.personal_meeting_url ?? `https://zoom.us/j/${me.pmi}` };
      } catch {
        personal = null;
      }
      // Wiederkehrende zuerst, dann nach Startzeit
      meetings.sort((a, b) => Number(b.recurring) - Number(a.recurring) || String(a.start ?? '').localeCompare(String(b.start ?? '')));
      return personal ? [personal, ...meetings] : meetings;
    },
  };
}
