const pad = (n: number) => String(n).padStart(2, '0');

/** Uhrzeit mit Sekunden, z. B. 10:42:07 */
export function clock(ms: number, withSeconds = true): string {
  const d = new Date(ms);
  return withSeconds
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Dauer als m:ss bzw. h:mm:ss */
export function duration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Dauer als hh:mm:ss (für den Sitzungstimer) */
export function timecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Gut lesbare Wartezeit, z. B. „4 Min.“ oder „45 Sek.“ */
export function waitLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} Sek.`;
  const m = Math.floor(s / 60);
  return `${m} Min.`;
}

export function dateLabel(ms: number): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(ms);
}
