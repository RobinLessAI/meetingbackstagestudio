// Kundenkonten für den Web-Modus: Registrierung, E-Mail-Bestätigung, Freischaltung durch den Betreiber,
// Anmeldung mit Sitzungen, Passwort vergessen, Sperren und Löschen.
//
// Gespeichert in <daten>/web/konten.json (Passwörter nur als scrypt-Hash, Sitzungs- und Link-Tokens
// nur als SHA-256-Hash). Für den Anfang reicht eine Datei; die Schnittstelle lässt sich später auf eine
// Datenbank umstellen.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const SESSION_DAYS = 30;
const VERIFY_HOURS = 48;
const RESET_HOURS = 2;
export const MIN_PASSWORD = 10;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
export const normalizeEmail = (e) => String(e ?? '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i.test(e) && e.length <= 254;

function scrypt(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(String(password), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function checkPassword(password, stored) {
  const [kind, saltB64, keyB64] = String(stored ?? '').split('$');
  if (kind !== 'scrypt' || !saltB64 || !keyB64) return false;
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'));
  const expected = Buffer.from(keyB64, 'base64');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

/** Fehler mit Code, damit die HTTP-Schicht passende Antworten geben kann. */
export class AccountError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Öffentliche Sicht auf ein Konto (ohne Hash und Schlüssel). */
export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  status: u.status,
  admin: Boolean(u.admin),
  verified: Boolean(u.verifiedAt),
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt ?? null,
});

/**
 * @param {object} o
 * @param {string} o.dir Ordner für konten.json
 * @param {string[]} o.adminEmails diese Adressen werden automatisch Verwaltung und sofort freigeschaltet
 * @param {(…a) => void} o.log
 */
export function createAccounts({ dir, adminEmails = [], log = () => {}, now = () => Date.now() }) {
  const file = path.join(dir, 'konten.json');
  let db = { users: [], sessions: [], tokens: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    db = { users: raw.users ?? [], sessions: raw.sessions ?? [], tokens: raw.tokens ?? [] };
  } catch {
    /* neu */
  }
  const admins = new Set(adminEmails.map(normalizeEmail).filter(Boolean));

  let writing = Promise.resolve();
  function persist() {
    // Abgelaufenes aufräumen und atomar schreiben (nacheinander, nie gleichzeitig).
    const t = now();
    db.sessions = db.sessions.filter((s) => s.expiresAt > t);
    db.tokens = db.tokens.filter((k) => k.expiresAt > t);
    const data = JSON.stringify(db);
    writing = writing.then(async () => {
      await fsp.mkdir(dir, { recursive: true });
      const tmp = `${file}.tmp`;
      await fsp.writeFile(tmp, data, { mode: 0o600 });
      await fsp.rename(tmp, file);
    });
    return writing;
  }

  const byEmail = (email) => db.users.find((u) => u.email === normalizeEmail(email));
  const byId = (id) => db.users.find((u) => u.id === id);

  function issueToken(userId, type, hours) {
    const t = token();
    db.tokens = db.tokens.filter((k) => !(k.userId === userId && k.type === type));
    db.tokens.push({ hash: sha(t), type, userId, expiresAt: now() + hours * 3600_000 });
    return t;
  }
  function takeToken(t, type) {
    const h = sha(t);
    const k = db.tokens.find((x) => x.hash === h && x.type === type && x.expiresAt > now());
    if (!k) return null;
    db.tokens = db.tokens.filter((x) => x !== k);
    return k;
  }

  function newSession(userId) {
    const t = token();
    db.sessions.push({ hash: sha(t), userId, createdAt: now(), lastSeen: now(), expiresAt: now() + SESSION_DAYS * 86400_000 });
    return t;
  }

  return {
    count: () => db.users.length,
    get: (id) => byId(id) ?? null,
    list: () => db.users.map(publicUser),
    /** Konto über einen Schlüssel finden (OBS-Adresse oder Stream Deck). */
    byOutputKey: (k) => (k ? (db.users.find((u) => u.outputKey === k) ?? null) : null),
    byActionKey: (k) => (k ? (db.users.find((u) => u.actionKey === k) ?? null) : null),

    async register({ email, password, name }) {
      const e = normalizeEmail(email);
      if (!validEmail(e)) throw new AccountError('email', 'Bitte eine gültige E-Mail-Adresse eingeben.');
      if (String(password ?? '').length < MIN_PASSWORD) throw new AccountError('passwort', `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`);
      if (String(password).length > 200) throw new AccountError('passwort', 'Das Passwort ist zu lang.');
      const existing = byEmail(e);
      if (existing) {
        // Nicht verraten, ob es die Adresse schon gibt: gleiche Antwort, aber keine neue Mail mit Konto.
        return { user: null, verifyToken: existing.verifiedAt ? null : issueToken(existing.id, 'bestaetigen', VERIFY_HOURS), existing: publicUser(existing) };
      }
      const isAdmin = admins.has(e);
      const user = {
        id: crypto.randomUUID(),
        email: e,
        name: String(name ?? '').trim().slice(0, 80),
        hash: await hashPassword(password),
        createdAt: now(),
        verifiedAt: null,
        status: isAdmin ? 'aktiv' : 'wartet',
        admin: isAdmin,
        lastLoginAt: null,
        actionKey: crypto.randomBytes(12).toString('hex'),
        outputKey: crypto.randomBytes(16).toString('hex'),
      };
      db.users.push(user);
      const verifyToken = issueToken(user.id, 'bestaetigen', VERIFY_HOURS);
      await persist();
      log(`Konto registriert: ${user.id}${isAdmin ? ' (Verwaltung)' : ''}`);
      return { user: publicUser(user), verifyToken };
    },

    async verifyEmail(t) {
      const k = takeToken(t, 'bestaetigen');
      const u = k && byId(k.userId);
      if (!u) throw new AccountError('link', 'Der Bestätigungslink ist ungültig oder abgelaufen. Bitte erneut anmelden, dann kommt ein neuer Link.');
      u.verifiedAt = u.verifiedAt ?? now();
      await persist();
      return publicUser(u);
    },

    /** Anmelden; gibt das Sitzungs-Token zurück. */
    async login({ email, password }) {
      const u = byEmail(email);
      // Auch ohne Konto rechnen, damit die Antwortzeit nichts verrät.
      const ok = u ? await checkPassword(password, u.hash) : (await hashPassword(password), false);
      if (!u || !ok) throw new AccountError('falsch', 'E-Mail oder Passwort stimmt nicht.', 401);
      if (!u.verifiedAt) throw new AccountError('unbestaetigt', 'Bitte zuerst die E-Mail-Adresse bestätigen. Der Link steht in der Mail nach der Registrierung.', 403);
      if (u.status === 'gesperrt') throw new AccountError('gesperrt', 'Dieses Konto ist gesperrt. Bitte wende dich an den Support.', 403);
      if (u.status !== 'aktiv') throw new AccountError('wartet', 'Dein Konto ist angelegt und wartet auf die Freischaltung. Du bekommst eine Mail, sobald es losgehen kann.', 403);
      u.lastLoginAt = now();
      const t = newSession(u.id);
      await persist();
      return { token: t, user: publicUser(u) };
    },

    /** Konto zu einem Sitzungs-Token, nur wenn aktiv. Verlängert die Sitzung beim Benutzen. */
    session(t) {
      if (!t) return null;
      const h = sha(t);
      const s = db.sessions.find((x) => x.hash === h && x.expiresAt > now());
      if (!s) return null;
      const u = byId(s.userId);
      if (!u || u.status !== 'aktiv') return null;
      if (now() - s.lastSeen > 3600_000) {
        s.lastSeen = now();
        s.expiresAt = now() + SESSION_DAYS * 86400_000;
        persist();
      }
      return u;
    },

    async logout(t) {
      const h = sha(t ?? '');
      db.sessions = db.sessions.filter((s) => s.hash !== h);
      await persist();
    },

    /** Link zum Zurücksetzen; null, wenn es die Adresse nicht gibt (die Antwort nach außen bleibt gleich). */
    async requestReset(email) {
      const u = byEmail(email);
      if (!u || u.status === 'gesperrt') return null;
      const t = issueToken(u.id, 'passwort', RESET_HOURS);
      await persist();
      return { token: t, user: publicUser(u) };
    },

    async resetPassword(t, password) {
      if (String(password ?? '').length < MIN_PASSWORD) throw new AccountError('passwort', `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`);
      const k = takeToken(t, 'passwort');
      const u = k && byId(k.userId);
      if (!u) throw new AccountError('link', 'Der Link ist ungültig oder abgelaufen. Bitte „Passwort vergessen“ erneut nutzen.');
      u.hash = await hashPassword(password);
      u.verifiedAt = u.verifiedAt ?? now(); // Wer die Mail bekommt, besitzt die Adresse.
      db.sessions = db.sessions.filter((s) => s.userId !== u.id); // überall abmelden
      await persist();
      return publicUser(u);
    },

    async changePassword(userId, oldPassword, newPassword) {
      const u = byId(userId);
      if (!u || !(await checkPassword(oldPassword, u.hash))) throw new AccountError('falsch', 'Das bisherige Passwort stimmt nicht.', 401);
      if (String(newPassword ?? '').length < MIN_PASSWORD) throw new AccountError('passwort', `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`);
      u.hash = await hashPassword(newPassword);
      await persist();
    },

    /** Neue Schlüssel für OBS und Stream Deck (alte Adressen gelten danach nicht mehr). */
    async renewKeys(userId) {
      const u = byId(userId);
      if (!u) return null;
      u.actionKey = crypto.randomBytes(12).toString('hex');
      u.outputKey = crypto.randomBytes(16).toString('hex');
      await persist();
      return { actionKey: u.actionKey, outputKey: u.outputKey };
    },

    // ------------------------------------------------------------- Verwaltung
    async setStatus(userId, status) {
      const u = byId(userId);
      if (!u) throw new AccountError('unbekannt', 'Konto nicht gefunden.', 404);
      if (!['aktiv', 'gesperrt', 'wartet'].includes(status)) throw new AccountError('status', 'Unbekannter Status.');
      u.status = status;
      if (status !== 'aktiv') db.sessions = db.sessions.filter((s) => s.userId !== u.id);
      await persist();
      log(`Konto ${u.id}: ${status}`);
      return publicUser(u);
    },

    async remove(userId) {
      const u = byId(userId);
      if (!u) throw new AccountError('unbekannt', 'Konto nicht gefunden.', 404);
      db.users = db.users.filter((x) => x !== u);
      db.sessions = db.sessions.filter((s) => s.userId !== u.id);
      db.tokens = db.tokens.filter((k) => k.userId !== u.id);
      await persist();
      log(`Konto ${u.id} gelöscht.`);
      return publicUser(u);
    },

    flush: () => writing,
  };
}

/** Einfacher Schutz gegen Durchprobieren: höchstens `max` Versuche je Schlüssel im Zeitfenster. */
export function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return {
    /** true = erlaubt (und gezählt), false = zu viele Versuche. */
    take(key) {
      const t = now();
      const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (list.length >= max) {
        hits.set(key, list);
        return false;
      }
      list.push(t);
      hits.set(key, list);
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
      return true;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
