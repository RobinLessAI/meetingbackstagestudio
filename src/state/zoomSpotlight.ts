import { useMemo } from 'react';
import { useStore } from './store.tsx';
import { useSync, type ZoomPerson } from '../sync/SyncProvider.tsx';
import { findPerson, nextRaisedHand, SPOTLIGHT_MAX, spotlightOp } from '../lib/spotlight.ts';

export { findPerson, nextRaisedHand };

/** Spotlight in Zoom über die Regie: Plätze 1–9, aufheben, nächste Hand. */
export function useZoomSpotlight() {
  const { state, notify } = useStore();
  const { regie, zoomPeople, spotlightZoom } = useSync();
  const live = regie?.state === 'verbunden';

  return useMemo(() => {
    const ready = () => {
      if (!live) {
        notify('Die Regie ist nicht im Meeting. Spotlight geht erst, wenn MeetingBackstage im Zoom-Meeting ist.', 'fehler');
        return false;
      }
      return true;
    };
    const slots = state.settings.spotlightSlots ?? [];
    const multi = state.settings.spotlightMulti ?? true;
    /** Je nach Einstellung dazunehmen/herausnehmen (mehrere) oder ersetzen/aufheben (eine Person). */
    const toggle = (p: ZoomPerson) => {
      const op = spotlightOp(zoomPeople.spotlight, p.userId, multi);
      if (op === 'voll') {
        notify(`Zoom erlaubt höchstens ${SPOTLIGHT_MAX} Personen gleichzeitig im Spotlight. Zuerst jemanden herausnehmen.`, 'warnung');
        return;
      }
      spotlightZoom(p.userId, op);
    };

    return {
      live,
      multi,
      /** Person ins Spotlight bzw. wieder heraus (Taste erneut drücken), je nach Modus. */
      toggle: (p: ZoomPerson) => {
        if (!ready()) return;
        toggle(p);
      },
      /** Nur diese Person im Spotlight, alle anderen heraus. */
      only: (p: ZoomPerson) => ready() && spotlightZoom(p.userId, 'replace'),
      add: (p: ZoomPerson) => ready() && spotlightZoom(p.userId, 'add'),
      remove: (p: ZoomPerson) => ready() && spotlightZoom(p.userId, 'remove'),
      clear: () => {
        if (!ready()) return;
        if (!zoomPeople.spotlight.length) {
          notify('Niemand ist im Spotlight', 'info', false);
          return;
        }
        spotlightZoom(null);
      },
      slot: (n: number) => {
        if (!ready()) return;
        const name = slots[n - 1]?.trim() ?? '';
        if (!name) {
          notify(`Spotlight-Platz ${n} ist leer. Auf der Seite „Spotlight“ eine Person zuordnen.`, 'warnung');
          return;
        }
        const p = findPerson(zoomPeople.list, name);
        if (!p) {
          notify(`„${name}“ (Platz ${n}) ist gerade nicht im Meeting.`, 'fehler');
          return;
        }
        toggle(p);
      },
      nextHand: () => {
        if (!ready()) return;
        const p = nextRaisedHand(zoomPeople.list, zoomPeople.spotlight);
        if (!p) {
          notify('Keine gehobene Hand ohne Spotlight', 'info', false);
          return;
        }
        toggle(p);
      },
    };
  }, [live, zoomPeople, spotlightZoom, notify, state.settings.spotlightSlots, state.settings.spotlightMulti]);
}
