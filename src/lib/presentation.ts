/** Adresse des Präsentationsfensters (Bildschirmfreigabe ohne OBS). */
export function presentationUrl(baseUrl: string): string {
  return `${baseUrl}/ausgabe.html?modus=praesentation`;
}

/** Öffnet das Präsentationsfenster als eigenes Browserfenster, damit es sich in Zoom einzeln freigeben lässt. */
export function openPresentationWindow(baseUrl: string): boolean {
  const win = window.open(presentationUrl(baseUrl), 'mb-praesentation', 'popup,width=1280,height=760');
  win?.focus();
  return Boolean(win);
}
