import { useCallback, useState } from 'react';

// Helles oder dunkles Design der Steuerung. Wird pro Browser gespeichert; die OBS-Ausgabe bleibt unverändert.
export type Theme = 'dunkel' | 'hell';
const KEY = 'mb-design';

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'hell' ? 'hell' : 'dunkel';
  } catch {
    return 'dunkel';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme === 'hell' ? 'light' : 'dark';
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* nur Komfort */
    }
  }, []);
  return [theme, setTheme];
}
