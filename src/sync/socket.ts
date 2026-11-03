// WebSocket-Verbindung zum lokalen MeetingBackstage-Server mit automatischem Wiederverbinden.

export type SocketStatus = 'verbinde' | 'verbunden' | 'getrennt';

export interface SyncSocket {
  send: (msg: unknown) => boolean;
  close: () => void;
}

export function syncUrl(rolle: 'steuerung' | 'ausgabe'): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/sync?rolle=${rolle}`;
}

/** Ob die Seite überhaupt von einem lokalen Server stammen kann (nicht z. B. als Datei oder fremde Seite). */
export const canUseLocalServer = () =>
  ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) &&
  window.location.protocol.startsWith('http');

export function openSyncSocket(
  rolle: 'steuerung' | 'ausgabe',
  handlers: {
    onMessage: (msg: any) => void;
    onStatus: (status: SocketStatus) => void;
  },
): SyncSocket {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: number | undefined;

  const connect = () => {
    if (closed) return;
    handlers.onStatus('verbinde');
    try {
      ws = new WebSocket(syncUrl(rolle));
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => {
      attempt = 0;
      handlers.onStatus('verbunden');
    };
    ws.onmessage = (e) => {
      try {
        handlers.onMessage(JSON.parse(String(e.data)));
      } catch {
        /* unvollständige Nachricht ignorieren */
      }
    };
    ws.onclose = () => {
      ws = null;
      if (!closed) {
        handlers.onStatus('getrennt');
        schedule();
      }
    };
    ws.onerror = () => ws?.close();
  };

  const schedule = () => {
    attempt += 1;
    // 1 s, 2 s, 4 s … höchstens 15 s
    timer = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** Math.min(attempt - 1, 4)));
  };

  connect();
  return {
    send: (msg) => {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    close: () => {
      closed = true;
      window.clearTimeout(timer);
      ws?.close();
    },
  };
}
