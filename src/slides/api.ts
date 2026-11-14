// Schnittstelle zum Server für Folien (Editor und Studio).
import type { Folie, FolienState, Medium } from './model.ts';

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.fehler ?? `Fehler ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const slidesApi = {
  state: () => request<FolienState>('/api/slides'),
  create: (f: Partial<Folie>) => request<{ folie: Folie }>('/api/slides', 'POST', f),
  update: (f: Folie) => request<{ folie: Folie }>(`/api/slides/${f.id}`, 'PUT', f),
  duplicate: (id: string) => request<{ folie: Folie }>(`/api/slides/${id}/duplizieren`, 'POST', {}),
  remove: (id: string) => request<{ ok: boolean }>(`/api/slides/${id}`, 'DELETE'),
  renewKey: (id: string) => request<{ folie: Folie }>(`/api/slides/${id}/schluessel`, 'POST', {}),
  setLive: (liveId: string | null) => request<{ kanal: FolienState['kanal'] }>('/api/slides/kanal', 'POST', { liveId }),
  removeMedia: (name: string) => request<FolienState>(`/api/slides/medien/${encodeURIComponent(name)}`, 'DELETE'),
};

/** Große Fotos verkleinern (höchstens 2560 Pixel, WebP mit Transparenz); GIF und SVG bleiben unverändert. */
async function shrinkImage(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
      i.src = url;
    });
    const scale = Math.min(1, 2560 / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 3 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.88));
    return blob && blob.size < file.size ? blob : file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Bild oder Video hochladen, mit Fortschritt (0–1). */
export async function uploadMedium(
  file: File,
  limits: { bildMax: number; videoMax: number },
  onProgress: (p: number) => void,
): Promise<{ medium: Medium; state: FolienState }> {
  const isVideo = file.type.startsWith('video/');
  if (isVideo && !['video/mp4', 'video/webm'].includes(file.type)) throw new Error('Videos bitte als MP4 oder WebM hochladen.');
  if (!isVideo && !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type)) {
    throw new Error('Bilder bitte als PNG, JPG, WebP, GIF oder SVG hochladen.');
  }
  const body = isVideo ? file : await shrinkImage(file);
  const max = isVideo ? limits.videoMax : limits.bildMax;
  if (body.size > max) throw new Error(`${file.name} ist zu groß (höchstens ${Math.round(max / 1024 / 1024)} MB).`);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/slides/medien');
    xhr.setRequestHeader('Content-Type', body.type || file.type);
    xhr.setRequestHeader('X-Dateiname', encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: { medium?: Medium; fehler?: string } & Partial<FolienState> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* leer */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.medium) resolve({ medium: data.medium, state: data as unknown as FolienState });
      else reject(new Error(data.fehler ?? `Upload fehlgeschlagen (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload abgebrochen. Bitte Verbindung prüfen.'));
    xhr.send(body);
  });
}

export const mb = (bytes: number) => (bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`);
