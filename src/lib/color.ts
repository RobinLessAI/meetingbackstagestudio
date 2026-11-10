/** #rrggbb und Deckkraft (0–100) als rgb()-Farbe. */
export function withAlpha(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${Math.max(0, Math.min(100, opacity)) / 100})`;
}

/** Gut lesbare Schriftfarbe (fast schwarz oder weiß) auf einer Fläche dieser Farbe. */
export function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  const n = m ? parseInt(m[1], 16) : 0;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#15130d' : '#ffffff';
}

/** Gut unterscheidbare Farben für „bunt“ (Umfrage, Wortwolke). */
export const PALETTE = ['#f0b43c', '#5fb3f0', '#7bd389', '#f07a8a', '#b48cf0', '#f0a35f', '#4fd1c5', '#e3e36a'];
