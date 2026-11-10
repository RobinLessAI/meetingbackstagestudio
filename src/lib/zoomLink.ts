/**
 * Adresse, die ein Meeting direkt in der Zoom-App öffnet (zoommtg://).
 * Ist man in der App als Gastgeber angemeldet, startet Zoom damit das eigene Meeting.
 * Funktioniert mit Einladungslinks (…/j/123?pwd=…), Start-Links (…/s/123) und reinen Meeting-IDs.
 */
export function zoomAppUrl(link: string): string | null {
  const v = String(link ?? '').trim();
  const fromPath = v.match(/\/(?:j|s|w|wc\/join)\/(\d{9,12})/)?.[1];
  const id = fromPath ?? (/^[\d\s-]{9,15}$/.test(v) ? v.replace(/\D/g, '') : null);
  if (!id || id.length < 9 || id.length > 12) return null;
  const q = new URLSearchParams({ action: 'join', confno: id });
  const pwd = v.match(/[?&]pwd=([^&#\s]+)/)?.[1];
  if (pwd) q.set('pwd', decodeURIComponent(pwd));
  return `zoommtg://zoom.us/join?${q}`;
}

/** Öffnet die Zoom-App, ohne die Seite zu verlassen. */
export function openInZoomApp(link: string): boolean {
  const url = zoomAppUrl(link);
  if (!url) return false;
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.click();
  return true;
}
