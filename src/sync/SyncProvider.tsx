import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { normalizeState } from '../data/event.ts';
import { parseZoomChat } from '../lib/zoomChat.ts';
import { clock } from '../lib/time.ts';
import { countNew, toChatMessages } from '../state/chatImport.ts';
import { nextId, useStore } from '../state/store.tsx';
import type { AppState } from '../state/types.ts';
import { buildSnapshot } from './snapshot.ts';
import { canUseLocalServer, openSyncSocket, type SocketStatus, type SyncSocket } from './socket.ts';

export interface WatchStatus {
  active: boolean;
  folder: string | null;
  file: string | null;
  error: string | null;
  suggested?: string;
}

export interface RtmsStatus {
  state: 'nicht-eingerichtet' | 'bereit' | 'verbindet' | 'verbunden' | 'fehler';
  configured: boolean;
  missing: string[];
  meeting: string | null;
  since: number | null;
  messages: number;
  error: string | null;
  lastWebhookAt: number | null;
}

interface SyncValue {
  /** Live-Chat aus Zoom (RTMS), null solange kein Server erreichbar ist. */
  rtms: RtmsStatus | null;
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
  const [rtms, setRtms] = useState<RtmsStatus | null>(null);
  const socket = useRef<SyncSocket | null>(null);
  const rtmsRef = useRef<RtmsStatus | null>(null);
  rtmsRef.current = rtms;
  const restored = useRef(false);

  // Eingehende Nachrichten über eine Referenz, damit die Verbindung stabil bleibt.
  const onMessage = useRef<(msg: any) => void>(() => {});
  onMessage.current = (msg: any) => {
    switch (msg.type) {
      case 'hello': {
        setOutputs(msg.ausgaben ?? 0);
        setSavedAt(msg.saved?.savedAt ?? null);
        if (msg.watch) setWatch(msg.watch);
        if (msg.rtms) setRtms(msg.rtms);
        const saved = msg.saved?.state as Partial<AppState> | undefined;
        // Eine eigene Veranstaltung nach Neuladen oder Absturz automatisch wiederherstellen.
        if (!restored.current && saved?.dataMode === 'eigene' && stateRef.current.dataMode === 'demo') {
          restored.current = true;
          dispatch({ type: 'demo/replace', state: normalizeState(saved) });
          notify(`Veranstaltung „${saved.session?.title ?? ''}“ wiederhergestellt (Stand ${clock(msg.saved.savedAt, false)} Uhr)`, 'info');
        }
        restored.current = true;
        break;
      }
      case 'rtms-status': {
        const prev = rtmsRef.current;
        setRtms(msg.status);
        if (msg.status.state === 'verbunden' && prev?.state !== 'verbunden') notify('Live-Chat aus Zoom verbunden', 'erfolg');
        if (msg.status.state === 'fehler' && msg.status.error && prev?.error !== msg.status.error) notify(msg.status.error, 'fehler');
        break;
      }
      case 'live-chat': {
        // Live-Nachrichten aus Zoom: Schlüssel verhindern doppelte Übernahme nach Neuladen.
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
        const messages = toChatMessages(parsed.messages);
        const added = countNew(messages, stateRef.current.chat);
        if (added > 0) {
          dispatch({ type: 'chat/import', messages });
          notify(`${added} neue ${added === 1 ? 'Chat-Nachricht' : 'Chat-Nachrichten'} aus Zoom übernommen`, 'erfolg');
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
    if (status !== 'verbunden' || state.dataMode !== 'eigene') return;
    const t = window.setTimeout(() => socket.current?.send({ type: 'save', state }), 1500);
    return () => window.clearTimeout(t);
  }, [state, status]);

  const startWatch = useCallback((folder?: string) => socket.current?.send({ type: 'chat-watch', folder }) ?? false, []);
  const stopWatch = useCallback(() => {
    socket.current?.send({ type: 'chat-watch-stop' });
  }, []);

  const value = useMemo<SyncValue>(
    () => ({
      rtms,
      available,
      status,
      outputs,
      savedAt,
      watch,
      lastImport,
      baseUrl: available ? window.location.origin : DEFAULT_BASE,
      startWatch,
      stopWatch,
    }),
    [rtms, available, status, outputs, savedAt, watch, lastImport, startWatch, stopWatch],
  );
  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}

export function useSync(): SyncValue {
  const v = useContext(SyncCtx);
  if (!v) throw new Error('useSync außerhalb von SyncProvider');
  return v;
}

/** OBS-Adresse für eine Grafik. */
export function outputUrl(base: string, params: Record<string, string>): string {
  return `${base}/ausgabe.html?${new URLSearchParams(params).toString()}`;
}
