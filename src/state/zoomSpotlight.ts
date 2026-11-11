import { useMemo } from 'react';
import { useStore } from './store.tsx';
import { useSync, type ZoomPerson } from '../sync/SyncProvider.tsx';
import { findPerson, nextRaisedHand } from '../lib/spotlight.ts';

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

    return {
      live,
      /** Person ins Spotlight; ist sie schon allein im Spotlight, wird es aufgehoben (Taste erneut drücken). */
      toggle: (p: ZoomPerson) => {
        if (!ready()) return;
        const only = zoomPeople.spotlight.length === 1 && zoomPeople.spotlight[0] === p.userId;
        spotlightZoom(p.userId, only ? 'remove' : 'replace');
      },
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
        const only = zoomPeople.spotlight.length === 1 && zoomPeople.spotlight[0] === p.userId;
        spotlightZoom(p.userId, only ? 'remove' : 'replace');
      },
      nextHand: () => {
        if (!ready()) return;
        const p = nextRaisedHand(zoomPeople.list, zoomPeople.spotlight);
        if (!p) {
          notify('Keine gehobene Hand ohne Spotlight', 'info', false);
          return;
        }
        spotlightZoom(p.userId, 'replace');
      },
    };
  }, [live, zoomPeople, spotlightZoom, notify, state.settings.spotlightSlots]);
}
