// Zoom-Konto verbinden (OAuth) und eigene Meetings abrufen.
//
// Einmalig: „Bei Zoom erlauben“ öffnet die Zoom-Freigabe. Danach leitet Zoom auf die
// eingetragene Weiterleitungs-Adresse (ZOOM_REDIRECT_URI) mit ?code=… weiter; diese Adresse
// wird in MeetingBackstage eingefügt. Die Zugangs-Token liegen nur lokal in
// daten/zoom-anmeldung.json und werden automatisch erneuert.
//
// Benötigte Berechtigungen in der Zoom-App: meeting:read:list_meetings (Meetings auflisten),
// optional user:read:user (persönlicher Meetingraum).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

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
      if (res.status === 400 && /scope/i.test(msg)) {
        throw new Error(
          'Der Zoom-App fehlt eine Berechtigung. Im Marketplace unter „Scopes“ „meeting:read:list_meetings“ hinzufügen, dann hier „Trennen“ und neu verbinden.',
        );
      }
      if (res.status === 401) throw new Error('Zoom hat die Anmeldung abgelehnt. Bitte „Trennen“ und neu verbinden.');
      throw new Error(`Zoom-API antwortet mit ${res.status}${msg ? `: ${msg}` : ''}`);
    }
    return body;
  }

  return {
    status: () => ({ connected: Boolean(tokens), redirectConfigured: Boolean(redirectUri), scope: tokens?.scope ?? '' }),

    authorizeUrl: () =>
      redirectUri ? `${OAUTH}/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri })}` : null,

    async connect(input) {
      if (!redirectUri) throw new Error('ZOOM_REDIRECT_URI fehlt in .env.local (dieselbe Adresse wie „OAuth Redirect URL“ in der Zoom-App).');
      const code = parseAuthCode(input);
      if (!code) throw new Error('In der eingefügten Adresse wurde kein Code gefunden. Bitte die komplette Adresse nach „Erlauben“ einfügen.');
      await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
      log('Mit dem Zoom-Konto verbunden.');
    },

    async disconnect() {
      tokens = null;
      await fsp.rm(file, { force: true });
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
