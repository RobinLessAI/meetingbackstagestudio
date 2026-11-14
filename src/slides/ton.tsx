import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '../components/ui.tsx';

// „Mit Ton“ hängt ?ton=1 an die OBS-Adressen. Die Wahl gilt für Editor und Studio gemeinsam (pro Browser gemerkt).
const KEY = 'mb-folien-ton';
const EVENT = 'mb-folien-ton';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useTon(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = () => setOn(read());
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);
  const set = (v: boolean) => {
    setOn(v);
    try {
      window.localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* ohne Speicher gilt die Wahl nur auf dieser Seite */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [on, set];
}

export const mitTon = (url: string, on: boolean) => (on && url ? `${url}${url.includes('?') ? '&' : '?'}ton=1` : url);

/** Schalter neben den OBS-Adressen: Videos in OBS mit oder ohne Ton. */
export function TonButton({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Button
      size="sm"
      variant={on ? 'primary' : 'secondary'}
      icon={on ? Volume2 : VolumeX}
      pressed={on}
      onClick={() => onChange(!on)}
      title={on ? 'Videos laufen in OBS mit Ton. Klicken zum Stummschalten.' : 'Videos laufen in OBS stumm. Klicken, damit OBS den Ton ausgibt.'}
    >
      {on ? 'Mit Ton' : 'Ohne Ton'}
    </Button>
  );
}
