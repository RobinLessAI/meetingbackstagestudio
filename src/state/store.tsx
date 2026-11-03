import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { createInitialState } from '../data/sample.ts';
import {
  analyzeCloud,
  analyzeMap,
  analyzePoll,
  handQueue,
  participantsById,
  tagMessages,
  type CloudAnalysis,
  type MapAnalysis,
  type MessageTags,
  type PollAnalysis,
  type QueueEntry,
} from './derive.ts';
import { reducer, type Action } from './reducer.ts';
import type { AppState, LogEntry, Participant } from './types.ts';

export interface Derived {
  byId: Record<string, Participant>;
  queue: QueueEntry[];
  map: MapAnalysis;
  poll: PollAnalysis;
  cloud: CloudAnalysis;
  tags: Record<string, MessageTags>;
  /** Grund, warum Live-Aktionen gesperrt sind, oder null. */
  locked: string | null;
  openMics: Participant[];
}

export interface Toast {
  id: string;
  text: string;
  tone: LogEntry['tone'];
}

interface StoreValue {
  state: AppState;
  dispatch: Dispatch<Action>;
  derived: Derived;
  /** Immer der neueste Zustand, für Event-Handler und Intervalle. */
  stateRef: { current: AppState };
  notify: (text: string, tone?: LogEntry['tone'], log?: boolean) => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;
}

const StoreCtx = createContext<StoreValue | null>(null);
const NowCtx = createContext<number>(Date.now());

let uid = 0;
export const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial, (init) => init ?? createInitialState());
  const stateRef = useRef(state);
  stateRef.current = state;

  const derived = useMemo<Derived>(() => {
    const map = analyzeMap(state);
    const poll = analyzePoll(state);
    return {
      byId: participantsById(state),
      queue: handQueue(state),
      map,
      poll,
      cloud: analyzeCloud(state, poll),
      tags: tagMessages(state, map, poll),
      locked:
        state.session.status === 'beendet'
          ? 'Die Sitzung ist beendet. Live-Aktionen sind gesperrt. Zum Testen den Status auf „Läuft“ stellen.'
          : null,
      openMics: state.participants.filter((p) => p.micOn),
    };
  }, [state]);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());
  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);
  const notify = useCallback(
    (text: string, tone: LogEntry['tone'] = 'erfolg', log = true) => {
      const id = nextId('t');
      setToasts((t) => [...t.slice(-2), { id, text, tone }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismissToast(id), tone === 'fehler' || tone === 'warnung' ? 6000 : 3200),
      );
      if (log) dispatch({ type: 'log/add', entry: { id, at: Date.now(), text, tone } });
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({ state, dispatch, derived, stateRef, notify, toasts, dismissToast }),
    [state, derived, notify, toasts, dismissToast],
  );
  return (
    <StoreCtx.Provider value={value}>
      <NowProvider>{children}</NowProvider>
    </StoreCtx.Provider>
  );
}

function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <NowCtx.Provider value={now}>{children}</NowCtx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore außerhalb von StoreProvider');
  return v;
}

/** Aktuelle Uhrzeit, sekündlich aktualisiert. */
export const useNow = () => useContext(NowCtx);
