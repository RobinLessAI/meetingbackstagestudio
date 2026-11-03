import { useId, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { createEventState } from '../data/event.ts';
import { useStore } from '../state/store.tsx';
import { Button, Dialog, Field } from './ui.tsx';

/** Startet eine eigene Veranstaltung ohne Beispieldaten. */
export function NewEventButton({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} icon={CalendarPlus} onClick={() => setOpen(true)}>
        Neue Veranstaltung
      </Button>
      {open && <NewEventDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function NewEventDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch, notify } = useStore();
  const [title, setTitle] = useState('');
  const [team, setTeam] = useState(state.settings.teamNames.join(', '));
  const [mapQuestion, setMapQuestion] = useState('Von wo seid ihr heute dabei?');
  const [cloudPrompt, setCloudPrompt] = useState('Was erwartet ihr heute? Ein bis drei Wörter.');
  const [error, setError] = useState<string | null>(null);
  const ids = { title: useId(), team: useId(), map: useId(), cloud: useId() };

  const create = () => {
    if (!title.trim()) {
      setError('Bitte einen Titel eingeben.');
      return;
    }
    dispatch({
      type: 'demo/replace',
      state: createEventState({
        title,
        teamNames: team.split(',').map((t) => t.trim()).filter(Boolean),
        mapQuestion,
        cloudPrompt,
      }),
    });
    notify(`Veranstaltung „${title.trim()}“ gestartet. Der Stand wird automatisch gespeichert.`, 'erfolg');
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Neue Veranstaltung"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" icon={CalendarPlus} onClick={create}>
            Veranstaltung starten
          </Button>
        </>
      }
    >
      <p className="muted">
        Beispieldaten werden ersetzt. Chat, Weltkarte und Wortwolke beginnen leer; die Umfrage legst du unter „Live Grafiken“ an.
      </p>
      <Field label="Titel" htmlFor={ids.title} error={error}>
        <input
          id={ids.title}
          className="input"
          value={title}
          maxLength={90}
          autoFocus
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="z. B. Workshop Moderation, 14. November"
        />
      </Field>
      <Field
        label="Team-Namen (durch Komma getrennt)"
        htmlFor={ids.team}
        hint="Chat-Beiträge dieser Personen werden nicht ausgewertet, z. B. deine eigenen Fragen. „Robin“ erfasst auch „Robin Weniger“."
      >
        <input id={ids.team} className="input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Robin, Co-Moderation" />
      </Field>
      <Field label="Frage für die Weltkarte" htmlFor={ids.map}>
        <input id={ids.map} className="input" value={mapQuestion} maxLength={90} onChange={(e) => setMapQuestion(e.target.value)} />
      </Field>
      <Field label="Frage für die Wortwolke" htmlFor={ids.cloud}>
        <input id={ids.cloud} className="input" value={cloudPrompt} maxLength={90} onChange={(e) => setCloudPrompt(e.target.value)} />
      </Field>
    </Dialog>
  );
}
