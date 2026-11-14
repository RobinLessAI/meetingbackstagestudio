import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { normalizeState } from '../data/event.ts';
import { parseZoomChat } from '../lib/zoomChat.ts';
import { clock } from '../lib/time.ts';
import { countNew, toChatMessages } from '../state/chatImport.ts';
import { nextId, useStore } from '../state/store.tsx';
import type { AppState } from '../state/types.ts';
import { buildSnapshot } from './snapshot.ts';
import { refreshRights } from '../web/mode.ts';
import { canUseLocalServer, openSyncSocket, type SocketStatus, type SyncSocket } from './socket.ts';

export interface WatchStatus {
  active: boolean;
  folder: string | null;
  file: string | null;
  error: string | null;
  suggested?: string;
}

/** Eigene Vorlage für das Aussehen; „alle“ enthält Highlight und alle drei Grafiken. */
export interface StyleTemplate {
  id: string;
  name: string;
  /** Aussehen je Grafik, „alle“ = Design aller Grafiken, „umfrage-frage“ = Frage mit Antworten. */
  kind: 'highlight' | 'karte' | 'umfrage' | 'wortwolke' | 'gluecksrad' | 'gluecksrad-liste' | 'alle' | 'umfrage-frage' | 'meeting' | 'kategorien';
  data: Record<string, unknown>;
  at: number;
}

/** Live-Chat über das Regie-Fenster (Zoom Meeting SDK). */
export interface RegieStatus {
  state: 'bereit' | 'verbindet' | 'wartet' | 'verbunden' | 'fehler';
  /** Zugangsdaten und SDK vorhanden. */
  configured: boolean;
  sdkInstalled: boolean;
  missing: string[];
  meeting: string | null;
  since: number | null;
  messages: number;
  error: string | null;
  name: string;
  /** Programmversion mit Git-Stand und installierte Zoom-SDK-Version. */
  appVersion?: string;
  sdkVersion?: string | null;
  /** Verbindung zum Zoom-Konto (für „Meetings aus Zoom“). */
  account?: { connected: boolean; redirectConfigured: boolean; scope: string; email?: string | null; oneClick?: boolean };
}

/** Meeting aus dem eigenen Zoom-Konto. */
export interface ZoomMeeting {
  id: string;
  topic: string;
  start: string | null;
  duration: number | null;
  timezone: string | null;
  recurring: boolean;
  type: number | 'pmi';
  link: string;
  /** Herkunft; fehlt bei Zoom. */
  platform?: 'teams';
}

/** Person im Zoom-Meeting, gelesen über das Regie-Fenster. */
export interface ZoomPerson {
  userId: number;
  name: string;
  host: boolean;
  cohost: boolean;
  video: boolean | null;
  muted: boolean | null;
  hand: boolean;
  handSince: number | null;
  /** Mikrofon an seit (null = stumm oder unbekannt). */
  micSince?: number | null;
  /** Zuletzt von Zoom als Sprecher gemeldet. */
  spokeAt?: number | null;
}

export interface ZoomPeopleStatus {
  list: ZoomPerson[];
  /** User-IDs im Spotlight. */
  spotlight: number[];
  /** Gerade von Zoom gemeldete Sprecher. */
  speakers?: number[];
  spotlightKnown: boolean;
  /** Rolle der Regie: nur Host oder Co-Host dürfen Spotlight setzen. */
  role: 'host' | 'cohost' | 'teilnehmer' | 'unbekannt';
  at: number | null;
}

/** Live-Chat aus Microsoft Teams (Graph-Benachrichtigungen über einen Tunnel). */
export interface TeamsLiveStatus {
  state: 'bereit' | 'verbindet' | 'verbunden' | 'fehler';
  meeting: string | null;
  link: string | null;
  since: number | null;
  messages: number;
  error: string | null;
  tunnelUrl: string | null;
}

export interface TeamsStatus {
  /** TEAMS_CLIENT_ID ist eingetragen. */
  configured: boolean;
  connected: boolean;
  name: string | null;
  email: string | null;
  redirectUri: string;
  live: TeamsLiveStatus;
}

export interface ZoomMeetingsState {
  loading: boolean;
  meetings: ZoomMeeting[];
  error: string | null;
  at: number | null;
}

interface SyncValue {
  /** Live-Chat über das Regie-Fenster, null solange kein Server erreichbar ist. */
  regie: RegieStatus | null;
  /** Die Seite läuft über den lokalen Server (sonst z. B. als reine Vorschau). */
  available: boolean;
  status: SocketStatus | 'nicht-verfuegbar';
  outputs: number;
  savedAt: number | null;
  watch: WatchStatus;
  lastImport: { at: number; added: number; file: string } | null;
  /** Basisadresse für OBS-Browserquellen. */
  baseUrl: string;
  startWatch: (folder?: string) => boolean;
  stopWatch: () => void;
  /** Öffnet das Regie-Fenster, das dem Meeting beitritt. */
  openRegie: (meeting: string, passcode: string) => boolean;
  /** Lässt das Regie-Fenster das Meeting verlassen. */
  leaveRegie: () => void;
  /** Meetings aus dem Zoom-Konto und Anmeldung dafür. */
  zoomMeetings: ZoomMeetingsState;
  loadZoomMeetings: () => void;
  requestAuthUrl: () => Promise<string | null>;
  connectZoom: (input: string) => Promise<{ ok: boolean; message: string }>;
  disconnectZoom: () => void;
  /** Microsoft Teams: Konto, Meetings, Live-Chat. */
  teams: TeamsStatus | null;
  /** Teilnehmende im Zoom-Meeting und Spotlight (über die Regie). */
  zoomPeople: ZoomPeopleStatus;
  /** userId null = Spotlight aufheben. */
  spotlightZoom: (userId: number | null, operate?: 'replace' | 'add' | 'remove') => boolean;
  refreshZoomPeople: () => void;
  teamsMeetings: ZoomMeetingsState;
  loadTeamsMeetings: () => void;
  disconnectTeams: () => void;
  startTeamsLive: (link: string, topic?: string) => boolean;
  stopTeamsLive: () => void;
  /** Eigene Vorlagen (im Ordner daten/ gespeichert, ohne Server nur im Browser). */
  templates: StyleTemplate[];
  saveTemplates: (list: StyleTemplate[]) => void;
  /** Schlüssel für Aktions-Adressen (Stream Deck), null ohne Server. */
  actionKey: string | null;
  /** Geheimer Teil der OBS-Adressen (nur Web-Modus). */
  outputKey: string | null;
  /** Neue Schlüssel für OBS und Stream Deck (alte Adressen gelten danach nicht mehr). */
  renewKeys: () => void;
  /** Empfänger für Aktionen, die über den Server ankommen (Stream Deck). */
  setActionHandler: (handler: ((id: string) => void) | null) => void;
}

const SyncCtx = createContext<SyncValue | null>(null);
const DEFAULT_BASE = 'http://localhost:4300';

export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, derived, dispatch, notify, stateRef } = useStore();
  const available = canUseLocalServer();
  const [status, setStatus] = useState<SyncValue['status']>(available ? 'verbinde' : 'nicht-verfuegbar');
  const [outputs, setOutputs] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [watch, setWatch] = useState<WatchStatus>({ active: false, folder: null, file: null, error: null });
  const [lastImport, setLastImport] = useState<SyncValue['lastImport']>(null);
  const [regie, setRegie] = useState<RegieStatus | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [outputKey, setOutputKey] = useState<string | null>(null);
  const [zoomMeetings, setZoomMeetings] = useState<ZoomMeetingsState>({ loading: false, meetings: [], error: null, at: null });
  const [teams, setTeams] = useState<TeamsStatus | null>(null);
  const [zoomPeople, setZoomPeople] = useState<ZoomPeopleStatus>({ list: [], spotlight: [], spotlightKnown: false, role: 'unbekannt', at: null });
  const teamsRef = useRef<TeamsStatus | null>(null);
  teamsRef.current = teams;
  const [teamsMeetings, setTeamsMeetings] = useState<ZoomMeetingsState>({ loading: false, meetings: [], error: null, at: null });
  const authUrlWaiter = useRef<((url: string | null) => void) | null>(null);
  const connectWaiter = useRef<((r: { ok: boolean; message: string }) => void) | null>(null);
  const [templates, setTemplates] = useState<StyleTemplate[]>(() => {
    if (available) return [];
    try {
      return JSON.parse(localStorage.getItem('mb-vorlagen') ?? '[]');
    } catch {
      return [];
    }
  });
  const actionHandler = useRef<((id: string) => void) | null>(null);
  const socket = useRef<SyncSocket | null>(null);
  const regieRef = useRef<RegieStatus | null>(null);
  regieRef.current = regie;
  const restored = useRef(false);
  // Unveränderter Startzustand: darf durch einen gespeicherten Stand ersetzt werden.
  const initialState = useRef(state);

  // Eingehende Nachrichten über eine Referenz, damit die Verbindung stabil bleibt.
  const onMessage = useRef<(msg: any) => void>(() => {});
  onMessage.current = (msg: any) => {
    switch (msg.type) {
      case 'hello': {
        setOutputs(msg.ausgaben ?? 0);
        setSavedAt(msg.saved?.savedAt ?? null);
        if (msg.watch) setWatch(msg.watch);
        if (msg.regie) setRegie(msg.regie);
        if (msg.teams) setTeams(msg.teams);
        if (msg.zoomTeilnehmende) setZoomPeople(msg.zoomTeilnehmende);
        if (msg.aktionSchluessel) setActionKey(msg.aktionSchluessel);
        setOutputKey(msg.ausgabeSchluessel ?? null);
        if (Array.isArray(msg.vorlagen)) setTemplates(msg.vorlagen);
        const saved = msg.saved?.state as Partial<AppState> | undefined;
        // Eine eigene Veranstaltung nach Neuladen oder Absturz automatisch wiederherstellen.
        const untouched = stateRef.current === initialState.current || stateRef.current.dataMode === 'demo';
        if (!restored.current && saved?.dataMode === 'eigene' && untouched) {
          restored.current = true;
          dispatch({ type: 'demo/replace', state: normalizeState(saved) });
          notify(`Veranstaltung „${saved.session?.title ?? ''}“ wiederhergestellt (Stand ${clock(msg.saved.savedAt, false)} Uhr)`, 'info');
        }
        restored.current = true;
        break;
      }
      case 'regie-status': {
        const prev = regieRef.current;
        const next = msg.status as RegieStatus;
        setRegie(next);
        if (next.state === prev?.state && next.error === prev?.error) break;
        if (next.state === 'verbunden') notify('Regie ist im Meeting, der Chat kommt jetzt live', 'erfolg');
        else if (next.state === 'wartet') notify('Regie wartet im Warteraum: bitte in Zoom zulassen', 'warnung');
        else if (next.state === 'fehler' && next.error) notify(next.error, 'fehler');
        else if (next.state === 'bereit' && prev?.state === 'verbunden') notify('Regie hat das Meeting verlassen', 'info');
        break;
      }
      case 'teams-status': {
        const prev = teamsRef.current;
        const next = msg.status as TeamsStatus;
        setTeams(next);
        if (next.connected && !prev?.connected) notify(`Mit Microsoft Teams verbunden${next.name ? ` (${next.name})` : ''}`, 'erfolg');
        const a = prev?.live;
        const b = next.live;
        if (b.state === a?.state && b.error === a?.error) break;
        if (b.state === 'verbunden') notify('Teams-Chat wird live mitgelesen', 'erfolg');
        else if (b.state === 'fehler' && b.error) notify(b.error, 'fehler');
        else if (b.state === 'bereit' && a?.state === 'verbunden') notify('Teams-Chat wird nicht mehr mitgelesen', 'info');
        break;
      }
      case 'zoom-teilnehmende':
        if (msg.status) setZoomPeople(msg.status);
        break;
      case 'zoom-aktion':
        notify(String(msg.message ?? ''), msg.ok ? 'erfolg' : 'fehler');
        break;
      case 'teams-meetings':
        setTeamsMeetings({ loading: false, meetings: msg.meetings ?? [], error: msg.ok ? null : String(msg.error ?? 'Unbekannter Fehler'), at: msg.at ?? Date.now() });
        break;
      case 'live-chat': {
        // Live-Nachrichten aus dem Regie-Fenster: Schlüssel verhindern doppelte Übernahme nach Neuladen.
        const messages = (msg.messages ?? []).map((m: { key: string; senderName: string; text: string; at: number }) => ({
          id: nextId('r'),
          senderId: null,
          senderName: m.senderName,
          text: m.text,
          at: m.at,
          source: 'zoom' as const,
          importKey: m.key,
        }));
        if (messages.length) dispatch({ type: 'chat/import', messages });
        break;
      }
      case 'zoom-meetings':
        setZoomMeetings({ loading: false, meetings: msg.meetings ?? [], error: msg.ok ? null : String(msg.error ?? 'Unbekannter Fehler'), at: msg.at ?? Date.now() });
        break;
      case 'zoom-auth-url':
        authUrlWaiter.current?.(msg.url ?? null);
        authUrlWaiter.current = null;
        break;
      case 'zoom-result':
        connectWaiter.current?.({ ok: Boolean(msg.ok), message: String(msg.message ?? '') });
        connectWaiter.current = null;
        break;
      case 'rechte':
        // Rolle oder Rechte wurden in der Verwaltung geändert: neu laden, Menü passt sich an
        refreshRights();
        break;
      case 'schluessel':
        setActionKey(msg.aktionSchluessel ?? null);
        setOutputKey(msg.ausgabeSchluessel ?? null);
        notify('Neue Schlüssel erzeugt. Bitte die OBS-Adressen und Stream-Deck-Tasten neu eintragen.', 'warnung');
        break;
      case 'vorlagen':
        if (Array.isArray(msg.vorlagen)) setTemplates(msg.vorlagen);
        break;
      case 'aktion':
        actionHandler.current?.(String(msg.id ?? ''));
        break;
      case 'clients':
        setOutputs(msg.ausgaben ?? 0);
        break;
      case 'saved':
        setSavedAt(msg.savedAt);
        break;
      case 'watch-status':
        setWatch(msg);
        if (msg.error) notify(msg.error, 'fehler');
        break;
      case 'chat-file': {
        const parsed = parseZoomChat(String(msg.content ?? ''));
        // Nachrichten von vor dem Start dieser Sitzung (z. B. aus einem früheren Meeting) nicht übernehmen.
        const since = (stateRef.current.session.startedAt ?? 0) - 60_000;
        const messages = toChatMessages(parsed.messages).filter((m) => m.at >= since);
        const added = countNew(messages, stateRef.current.chat);
        if (added > 0) {
          dispatch({ type: 'chat/import', messages });
          notify(`${added} neue ${added === 1 ? 'Chat-Nachricht' : 'Chat-Nachrichten'} aus Zoom übernommen`, 'erfolg');
        } else if (parsed.messages.length === 0) {
          notify(`Chat-Datei gelesen (${msg.file}), aber keine Nachrichten an alle erkannt.`, 'warnung');
        }
        setLastImport({ at: Date.now(), added, file: msg.file });
        break;
      }
      case 'error':
        notify(msg.message, 'fehler');
        break;
    }
  };

  useEffect(() => {
    if (!available) return;
    const s = openSyncSocket('steuerung', {
      onStatus: setStatus,
      onMessage: (m) => onMessage.current(m),
      // Im Web-Modus: Konto gesperrt oder Sitzung beendet → zurück zur Anmeldung.
      onKicked: (code) => {
        if (code === 4001) window.location.href = '/?hinweis=getrennt';
      },
    });
    socket.current = s;
    return () => {
      s.close();
      socket.current = null;
    };
  }, [available]);

  // Grafiken an die OBS-Ausgaben schicken (leicht verzögert, um Tippen zu bündeln).
  useEffect(() => {
    if (status !== 'verbunden') return;
    const t = window.setTimeout(() => {
      socket.current?.send({ type: 'snapshot', snapshot: buildSnapshot(state, derived) });
    }, 120);
    return () => window.clearTimeout(t);
  }, [state, derived, status]);

  // Eigene Veranstaltungen automatisch speichern (Beispieldaten werden nicht gespeichert).
  useEffect(() => {
    // Erst speichern, wenn ein gespeicherter Stand geprüft wurde, sonst überschreibt der leere Start ihn.
    if (status !== 'verbunden' || state.dataMode !== 'eigene' || !restored.current) return;
    const t = window.setTimeout(() => socket.current?.send({ type: 'save', state }), 1500);
    return () => window.clearTimeout(t);
  }, [state, status]);

  const startWatch = useCallback((folder?: string) => socket.current?.send({ type: 'chat-watch', folder }) ?? false, []);
  const stopWatch = useCallback(() => {
    socket.current?.send({ type: 'chat-watch-stop' });
  }, []);

  const openRegie = useCallback((meeting: string, passcode: string) => {
    const q = new URLSearchParams({ meeting: meeting.trim() });
    if (passcode.trim()) q.set('kenncode', passcode.trim());
    const win = window.open(`/regie.html?${q.toString()}`, 'mb-regie', 'width=1180,height=780');
    return Boolean(win);
  }, []);
  const loadZoomMeetings = useCallback(() => {
    setZoomMeetings((z) => ({ ...z, loading: true, error: null }));
    if (!socket.current?.send({ type: 'zoom-meetings' })) setZoomMeetings((z) => ({ ...z, loading: false, error: 'Keine Verbindung zum Server.' }));
  }, []);
  const requestAuthUrl = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        authUrlWaiter.current = resolve;
        if (!socket.current?.send({ type: 'zoom-auth-url' })) resolve(null);
        window.setTimeout(() => resolve(null), 4000);
      }),
    [],
  );
  const connectZoom = useCallback(
    (input: string) =>
      new Promise<{ ok: boolean; message: string }>((resolve) => {
        connectWaiter.current = resolve;
        if (!socket.current?.send({ type: 'zoom-connect', input })) resolve({ ok: false, message: 'Keine Verbindung zum Server.' });
        window.setTimeout(() => resolve({ ok: false, message: 'Zoom hat nicht rechtzeitig geantwortet.' }), 15000);
      }),
    [],
  );
  const disconnectZoom = useCallback(() => {
    socket.current?.send({ type: 'zoom-disconnect' });
    setZoomMeetings({ loading: false, meetings: [], error: null, at: null });
  }, []);
  const loadTeamsMeetings = useCallback(() => {
    setTeamsMeetings((z) => ({ ...z, loading: true, error: null }));
    if (!socket.current?.send({ type: 'teams-meetings' })) setTeamsMeetings((z) => ({ ...z, loading: false, error: 'Keine Verbindung zum Server.' }));
  }, []);
  const disconnectTeams = useCallback(() => {
    socket.current?.send({ type: 'teams-disconnect' });
    setTeamsMeetings({ loading: false, meetings: [], error: null, at: null });
  }, []);
  const startTeamsLive = useCallback((link: string, topic?: string) => socket.current?.send({ type: 'teams-live-start', link: link.trim(), topic }) ?? false, []);
  const spotlightZoom = useCallback(
    (userId: number | null, operate: 'replace' | 'add' | 'remove' = 'replace') => socket.current?.send({ type: 'zoom-spotlight', userId, operate }) ?? false,
    [],
  );
  const refreshZoomPeople = useCallback(() => {
    socket.current?.send({ type: 'zoom-teilnehmende-lesen' });
  }, []);
  const stopTeamsLive = useCallback(() => {
    socket.current?.send({ type: 'teams-live-stop' });
  }, []);
  const saveTemplates = useCallback(
    (list: StyleTemplate[]) => {
      setTemplates(list);
      if (available) socket.current?.send({ type: 'vorlagen', vorlagen: list });
      else {
        try {
          localStorage.setItem('mb-vorlagen', JSON.stringify(list));
        } catch {
          /* Vorschau ohne Speicher */
        }
      }
    },
    [available],
  );
  const setActionHandler = useCallback((handler: ((id: string) => void) | null) => {
    actionHandler.current = handler;
  }, []);
  const renewKeys = useCallback(() => {
    socket.current?.send({ type: 'schluessel-erneuern' });
  }, []);
  const leaveRegie = useCallback(() => {
    socket.current?.send({ type: 'regie-leave' });
  }, []);

  const value = useMemo<SyncValue>(
    () => ({
      regie,
      available,
      status,
      outputs,
      savedAt,
      watch,
      lastImport,
      baseUrl: available ? window.location.origin : DEFAULT_BASE,
      startWatch,
      stopWatch,
      openRegie,
      leaveRegie,
      actionKey,
      outputKey,
      renewKeys,
      setActionHandler,
      templates,
      saveTemplates,
      zoomMeetings,
      loadZoomMeetings,
      requestAuthUrl,
      connectZoom,
      disconnectZoom,
      teams,
      zoomPeople,
      spotlightZoom,
      refreshZoomPeople,
      teamsMeetings,
      loadTeamsMeetings,
      disconnectTeams,
      startTeamsLive,
      stopTeamsLive,
    }),
    [teams, zoomPeople, spotlightZoom, refreshZoomPeople, teamsMeetings, loadTeamsMeetings, disconnectTeams, startTeamsLive, stopTeamsLive, regie, available, status, outputs, savedAt, watch, lastImport, startWatch, stopWatch, openRegie, leaveRegie, actionKey, outputKey, renewKeys, setActionHandler, templates, saveTemplates, zoomMeetings, loadZoomMeetings, requestAuthUrl, connectZoom, disconnectZoom],
  );
  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}

export function useSync(): SyncValue {
  const v = useContext(SyncCtx);
  if (!v) throw new Error('useSync außerhalb von SyncProvider');
  return v;
}

/** OBS-Adresse für eine Grafik; im Web-Modus mit dem geheimen Schlüssel des Kontos. */
export function outputUrl(base: string, params: Record<string, string>, key?: string | null): string {
  const q = new URLSearchParams(params);
  if (key) q.set('k', key);
  return `${base}/ausgabe.html?${q.toString()}`;
}
