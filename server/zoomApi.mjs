// Anmeldung bei Zoom (OAuth) und Start des Chat-Datenstroms für ein laufendes Meeting.
//
// Einmalig: Nutzer erlaubt die App bei Zoom und fügt die Adresse, auf die Zoom
// danach weiterleitet (mit ?code=…), in MeetingBackstage ein. Der Server tauscht
// den Code gegen Zugangs-Token und speichert sie lokal in daten/zoom-anmeldung.json.
//
// Pro Meeting: PATCH /v2/live_meetings/{meetingId}/rtms_app/status
// startet den Datenstrom; danach meldet Zoom meeting.rtms_started wie gewohnt.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** Meeting-ID aus einem Zoom-Link oder einer eingegebenen Nummer lesen. */
export function parseMeetingId(input) {
  const v = String(input ?? '').trim();
  const link = v.match(/\/(?:j|w|s|wc\/join|wc)\/(\d{9,12})/);
  if (link) return link[1];
  const digits = v.replace(/[\s-]/g, '');
  return /^\d{9,12}$/.test(digits) ? digits : '';
}

/** Den Code aus der eingefügten Weiterleitungsadresse (oder nur den Code) lesen. */
export function parseAuthCode(input) {
  const v = String(input ?? '').trim();
  const m = v.match(/[?&]code=([^&#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  return /^[\w.-]{10,}$/.test(v) ? v : '';
}

export function createZoomApi({ clientId, clientSecret, redirectUri, dataDir, log, oauthBase, apiBase }) {
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
      throw new Error(`Zoom-Anmeldung fehlgeschlagen (${res.status} ${body.reason ?? body.error ?? ''}).`.replace(' )', ')'));
    }
    await save({
      access: body.access_token,
      refresh: body.refresh_token ?? tokens?.refresh ?? null,
      expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
      scope: body.scope ?? '',
    });
  }

  async function accessToken() {
    if (!tokens) throw new Error('Noch nicht mit Zoom verbunden. Bitte zuerst „Mit Zoom verbinden“.');
    if (Date.now() > tokens.expiresAt - 60_000) {
      if (!tokens.refresh) throw new Error('Zoom-Anmeldung abgelaufen. Bitte erneut verbinden.');
      await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
      log('Zoom-Anmeldung erneuert.');
    }
    return tokens.access;
  }

  return {
    status: () => ({ connected: Boolean(tokens), redirectConfigured: Boolean(redirectUri), scope: tokens?.scope ?? '' }),

    authorizeUrl: () =>
      redirectUri
        ? `${OAUTH}/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri })}`
        : null,

    async connect(input) {
      if (!redirectUri) throw new Error('ZOOM_REDIRECT_URI fehlt in .env.local (dieselbe Adresse wie in der Zoom-App).');
      const code = parseAuthCode(input);
      if (!code) throw new Error('In der eingefügten Adresse wurde kein Code gefunden. Bitte die komplette Adresse nach „Erlauben“ einfügen.');
      await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
      log('Mit Zoom verbunden.');
    },

    async disconnect() {
      tokens = null;
      await fsp.rm(file, { force: true });
    },

    /**
     * Startet oder stoppt den Chat-Datenstrom für ein laufendes Meeting.
     * Zoom erwartet laut Referenz die Nutzer-ID der Person, deren App startet.
     * Weil die genaue Form nicht eindeutig dokumentiert ist, werden mehrere
     * Varianten nacheinander versucht und alle Antworten im Terminal protokolliert.
     */
    async setRtms(meetingInput, action) {
      const meetingId = parseMeetingId(meetingInput);
      if (!meetingId) throw new Error('Keine gültige Meeting-ID erkannt. Bitte den Zoom-Link oder die 9- bis 11-stellige Nummer einfügen.');
      const token = await accessToken();
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      // Eigene Zoom-Nutzer-ID ermitteln (braucht die Berechtigung user:read:user).
      if (!tokens.userId) {
        const me = await fetch(`${API}/users/me`, { headers });
        const meText = await me.text();
        if (me.ok) {
          try {
            await save({ ...tokens, userId: JSON.parse(meText).id });
          } catch {
            /* ohne Nutzer-ID weiter */
          }
        } else {
          log(`Zoom-API users/me: ${me.status} ${meText.slice(0, 200)}`);
        }
      }

      const variants = [
        tokens.userId && { action, settings: { client_id: clientId, participant_user_id: tokens.userId } },
        { action, settings: { client_id: clientId, participant_user_id: 'me' } },
        { action, settings: { client_id: clientId } },
      ].filter(Boolean);

      const failures = [];
      for (const body of variants) {
        const res = await fetch(`${API}/live_meetings/${meetingId}/rtms_app/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(body),
        });
        const text = await res.text();
        log(`Zoom-API rtms_app/status (${action}, Meeting ${meetingId}, ${JSON.stringify(body.settings)}): ${res.status} ${text.slice(0, 300)}`);
        if (res.ok) return { meetingId };
        let message = text;
        try {
          message = JSON.parse(text).message ?? text;
        } catch {
          /* Klartext */
        }
        failures.push(`${res.status}: ${message || 'ohne Begründung'}`);
        // Bei fehlenden Rechten oder unbekanntem Meeting helfen weitere Varianten nicht.
        if (res.status === 401 || res.status === 403 || res.status === 404) break;
      }
      const hint = tokens.userId
        ? ''
        : ' Tipp: In der Zoom-App die Berechtigung user:read:user ergänzen und danach in MeetingBackstage „Trennen“ und neu verbinden.';
      throw new Error(`Zoom hat abgelehnt (${failures.join(' | ')}).${hint}`);
    },
  };
}
