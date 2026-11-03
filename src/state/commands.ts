import { useMemo } from 'react';
import { handQueue, participantsById } from './derive.ts';
import { joinParticipant, MUTE_ALL_EXEMPT } from './reducer.ts';
import { nextId, useStore } from './store.tsx';
import type { GalleryLayout, GraphicKind, SessionStatus } from './types.ts';

export const GRAPHIC_LABEL: Record<GraphicKind, string> = {
  karte: 'Weltkarte',
  umfrage: 'Umfrage',
  wortwolke: 'Wortwolke',
  highlight: 'Chat-Highlight',
};

export const LAYOUT_LABEL: Record<GalleryLayout, string> = {
  zentrum: 'Moderation im Zentrum',
  spotlight: 'Spotlight-Bühne',
  raster: 'Gleichmäßiges Raster',
};

const LAYOUT_ORDER: GalleryLayout[] = ['zentrum', 'spotlight', 'raster'];

export const SESSION_LABEL: Record<SessionStatus, string> = {
  geplant: 'Geplant',
  laeuft: 'Läuft',
  beendet: 'Beendet',
};

/**
 * Befehle mit sichtbarer Rückmeldung. Alle Befehle verändern nur den lokalen
 * Demo-Zustand. Hier würde später ein Adapter für eine echte Schnittstelle
 * angeschlossen (siehe src/integrations/adapters.ts).
 */
export function useCommands() {
  const { dispatch, stateRef, notify } = useStore();

  return useMemo(() => {
    const s = () => stateRef.current;
    const name = (id: string) => participantsById(s())[id]?.name ?? 'Unbekannt';
    const lockedReason = () =>
      s().session.status === 'beendet'
        ? 'Sitzung ist beendet: Live-Aktionen sind gesperrt. Zum Testen den Status auf „Läuft“ stellen.'
        : null;
    const guard = () => {
      const reason = lockedReason();
      if (reason) notify(reason, 'warnung', false);
      return !reason;
    };

    const toggleSpotlight = (id: string) => {
      if (!guard()) return;
      const state = s();
      const p = state.participants.find((x) => x.id === id);
      if (!p) return;
      if (state.spotlight.includes(id)) {
        dispatch({ type: 'spotlight/toggle', id });
        notify(`${p.name} aus dem Spotlight entfernt`, 'info');
        return;
      }
      if (state.spotlight.length >= state.settings.maxSpotlight) {
        notify(
          `Spotlight ist voll (${state.settings.maxSpotlight} Personen). Zuerst jemanden entfernen oder das Limit in den Einstellungen erhöhen.`,
          'fehler',
        );
        return;
      }
      dispatch({ type: 'spotlight/toggle', id });
      const lowered = state.settings.lowerHandOnSpotlight && p.handRaisedAt !== null;
      notify(`${p.name} ist im Spotlight${lowered ? ' · Hand gesenkt' : ''}`, 'erfolg');
    };

    return {
      toggleSpotlight,

      nextHandToSpotlight: () => {
        if (!guard()) return;
        const next = handQueue(s()).find((q) => !q.inSpotlight);
        if (!next) {
          notify('Keine wartende Hand ohne Spotlight', 'info', false);
          return;
        }
        toggleSpotlight(next.participant.id);
      },

      removeFromSpotlight: (id: string) => {
        dispatch({ type: 'spotlight/remove', id });
        notify(`${name(id)} aus dem Spotlight entfernt`, 'info');
      },

      clearSpotlight: () => {
        if (!guard()) return;
        const n = s().spotlight.length;
        if (n === 0) {
          notify('Spotlight ist bereits leer', 'info', false);
          return;
        }
        dispatch({ type: 'spotlight/clear' });
        notify(`Spotlight geleert (${n} ${n === 1 ? 'Person' : 'Personen'} entfernt)`, 'info');
      },

      moveSpotlight: (id: string, dir: -1 | 1) => dispatch({ type: 'spotlight/move', id, dir }),

      runMuteAll: (allowSelfUnmute: boolean) => {
        if (!guard()) return;
        const affected = s().participants.filter(
          (p) => !(MUTE_ALL_EXEMPT as readonly string[]).includes(p.role),
        );
        const wereOpen = affected.filter((p) => p.micOn).length;
        dispatch({ type: 'muteAll/run', at: Date.now(), allowSelfUnmute });
        notify(
          `Alle Teilnehmenden stummgeschaltet: ${affected.length} Personen, davon ${wereOpen} vorher offen. Moderation und Co-Moderation ausgenommen.`,
          'erfolg',
        );
      },

      dismissMuteAll: () => {
        dispatch({ type: 'muteAll/dismiss' });
        notify('Hinweis „Alle stumm“ geschlossen. Mikrofonstatus bleibt unverändert.', 'info');
      },

      toggleHand: (id: string) => {
        const p = s().participants.find((x) => x.id === id);
        if (!p) return;
        const raised = p.handRaisedAt === null;
        dispatch({ type: 'participant/hand', id, raised, at: Date.now() });
        if (raised) {
          const pos = handQueue(s()).length + 1;
          notify(`${p.name} hebt die Hand (Platz ${pos})`, 'info');
        } else {
          notify(`Hand von ${p.name} gesenkt`, 'info');
        }
      },

      lowerAllHands: () => {
        if (!guard()) return;
        const n = handQueue(s()).length;
        if (n === 0) {
          notify('Es sind keine Hände gehoben', 'info', false);
          return;
        }
        dispatch({ type: 'hands/lowerAll' });
        notify(`${n} Handzeichen gesenkt`, 'info');
      },

      toggleMic: (id: string) => {
        const p = s().participants.find((x) => x.id === id);
        if (!p) return;
        dispatch({ type: 'participant/mic', id, on: !p.micOn });
        notify(`${p.name}: Mikrofon ${p.micOn ? 'stumm' : 'offen'}`, 'info');
      },

      toggleCam: (id: string) => {
        const p = s().participants.find((x) => x.id === id);
        if (!p) return;
        dispatch({ type: 'participant/cam', id, on: !p.camOn });
        notify(`${p.name}: Kamera ${p.camOn ? 'aus' : 'an'}`, 'info');
      },

      setSpeaker: (id: string) => {
        const p = s().participants.find((x) => x.id === id);
        if (!p) return;
        if (s().activeSpeakerId === id) {
          dispatch({ type: 'speaker/set', id: null });
          notify(`${p.name} spricht nicht mehr`, 'info', false);
          return;
        }
        if (!p.micOn) {
          notify(`${p.name} ist stummgeschaltet und kann nicht als sprechend markiert werden.`, 'fehler', false);
          return;
        }
        dispatch({ type: 'speaker/set', id });
        notify(`${p.name} spricht jetzt`, 'info', false);
      },

      join: () => {
        // Name vorab bestimmen: Der neue Zustand ist erst nach dem nächsten Rendern verfügbar.
        const name = joinParticipant(s().joinCursor, Date.now()).name;
        dispatch({ type: 'participant/join', at: Date.now() });
        notify(`${name} ist beigetreten`, 'info');
      },

      leave: (id: string) => {
        const p = s().participants.find((x) => x.id === id);
        if (!p) return;
        if (p.role === 'moderation') {
          notify('Die Moderation kann die Demo-Sitzung nicht verlassen.', 'fehler', false);
          return;
        }
        dispatch({ type: 'participant/leave', id });
        notify(`${p.name} hat die Sitzung verlassen`, 'info');
      },

      react: (id: string, emoji: string, label: string) => {
        dispatch({ type: 'participant/react', id, reaction: { emoji, label, at: Date.now() } });
      },

      setSessionStatus: (status: SessionStatus) => {
        if (s().session.status === status) return;
        dispatch({ type: 'session/status', status, at: Date.now() });
        notify(`Sitzungsstatus: ${SESSION_LABEL[status]}`, 'info');
      },

      toggleGraphic: (graphic: GraphicKind) => {
        if (!guard()) return;
        const state = s();
        if (state.program.graphic === graphic) {
          dispatch({ type: 'program/graphic', graphic: null });
          notify(`${GRAPHIC_LABEL[graphic]} ausgeblendet`, 'info');
          return;
        }
        if (graphic === 'highlight' && !state.highlightId) {
          notify('Kein Chat-Beitrag als Highlight ausgewählt. Im Chat „Als Highlight“ wählen.', 'fehler');
          return;
        }
        dispatch({ type: 'program/graphic', graphic });
        notify(`${GRAPHIC_LABEL[graphic]} in der Vorschau eingeblendet`, 'erfolg');
      },

      hideGraphic: () => {
        const current = s().program.graphic;
        if (!current) {
          notify('Es ist keine Grafik eingeblendet', 'info', false);
          return;
        }
        dispatch({ type: 'program/graphic', graphic: null });
        notify(`${GRAPHIC_LABEL[current]} ausgeblendet`, 'info');
      },

      showReaction: (emoji: string, label: string) => {
        if (!guard()) return;
        dispatch({ type: 'program/reaction', reaction: { emoji, label, at: Date.now() } });
        notify(`Reaktion „${label}“ für 5 Sekunden eingeblendet`, 'erfolg');
      },

      setGalleryLayout: (layout: GalleryLayout) => {
        dispatch({ type: 'gallery/update', patch: { layout } });
        notify(`Galerie: ${LAYOUT_LABEL[layout]}`, 'erfolg');
      },

      cycleGallery: () => {
        const cur = s().gallery.layout;
        const next = LAYOUT_ORDER[(LAYOUT_ORDER.indexOf(cur) + 1) % LAYOUT_ORDER.length];
        dispatch({ type: 'gallery/update', patch: { layout: next } });
        notify(`Galerie: ${LAYOUT_LABEL[next]}`, 'erfolg');
      },

      toggleNames: () => {
        const on = !s().gallery.showNames;
        dispatch({ type: 'gallery/update', patch: { showNames: on } });
        notify(`Namen in der Galerie ${on ? 'eingeblendet' : 'ausgeblendet'}`, 'info');
      },

      closePoll: () => {
        const p = s().poll;
        if (p.status !== 'laeuft') {
          notify(p.status === 'entwurf' ? 'Die Umfrage wurde noch nicht gestartet' : 'Die Umfrage ist bereits geschlossen', 'info', false);
          return;
        }
        dispatch({ type: 'poll/close', at: Date.now() });
        notify('Umfrage geschlossen. Neue Chat-Antworten werden nicht mehr gezählt.', 'erfolg');
      },

      sendChat: (senderId: string | null, senderName: string, text: string, source: 'simulator' | 'auto' = 'simulator') => {
        const t = text.trim();
        const n = senderName.trim();
        if (!t) return 'Bitte einen Nachrichtentext eingeben.';
        if (!n) return 'Bitte einen Absender wählen oder einen Namen eingeben.';
        if (t.length > 280) return 'Die Nachricht ist zu lang (höchstens 280 Zeichen).';
        dispatch({
          type: 'chat/add',
          message: { id: nextId('m'), senderId, senderName: n, text: t, at: Date.now(), source },
        });
        return null;
      },

      log: (text: string, tone: 'info' | 'erfolg' | 'warnung' | 'fehler' = 'info') => notify(text, tone),
    };
  }, [dispatch, stateRef, notify]);
}

export type Commands = ReturnType<typeof useCommands>;
