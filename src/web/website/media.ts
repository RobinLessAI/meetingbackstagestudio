// Bilder für die Hauptseite: im Browser verkleinern, dann hochladen.
// Große Fotos werden auf höchstens 2000 Pixel Kantenlänge als WebP gespeichert, damit die Seite schnell lädt.
import type { Favicon, Medium } from './types.ts';

export interface UploadResult {
  url: string;
  medien: Medium[];
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.fehler ?? `Fehler ${res.status}`);
  return data as T;
}

export const websiteApi = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  send: <T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) =>
    request<T>(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

async function uploadBlob(blob: Blob, name: string): Promise<UploadResult> {
  return request<UploadResult>('/api/website/medien', {
    method: 'POST',
    headers: { 'Content-Type': blob.type, 'X-Dateiname': encodeURIComponent(name) },
    body: blob,
  });
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Bild konnte nicht gelesen werden.'));
    };
    img.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht umgewandelt werden.'))), type, quality));
}

/** Bild hochladen; Fotos und große Grafiken vorher verkleinern. */
export async function uploadImage(file: File, maxSize = 2000): Promise<UploadResult> {
  const type = file.type;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(type)) {
    throw new Error('Bitte ein Bild als PNG, JPG, WebP, GIF oder SVG wählen.');
  }
  if (type === 'image/svg+xml' || type === 'image/gif') return uploadBlob(file, file.name);
  const img = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const webp = await canvasBlob(canvas, 'image/webp', 0.85);
  // Kleiner als das Original? Sonst das Original behalten (z. B. bereits optimierte PNG-Grafiken).
  const best = scale === 1 && webp.size >= file.size ? file : webp;
  return uploadBlob(best, file.name);
}

/** Aus einem Bild die Favicon-Größen erzeugen (32, 180, 512 Pixel) und hochladen; SVG zusätzlich im Original. */
export async function uploadFavicon(file: File): Promise<{ favicon: Favicon; medien: Medium[] }> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
    throw new Error('Bitte das Favicon als PNG, JPG, WebP oder SVG wählen (am besten quadratisch, mindestens 512 × 512 Pixel).');
  }
  const img = await loadImage(file);
  const sized = async (size: number, background: string | null) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size, size);
    }
    const pad = background ? size * 0.12 : 0;
    const box = size - 2 * pad;
    const iw = img.naturalWidth || 512;
    const ih = img.naturalHeight || 512;
    const s = Math.min(box / iw, box / ih);
    ctx.drawImage(img, (size - iw * s) / 2, (size - ih * s) / 2, iw * s, ih * s);
    return canvasBlob(c, 'image/png');
  };
  const base = file.name.replace(/\.[a-z0-9]+$/i, '') || 'favicon';
  let medien: Medium[] = [];
  const up = async (blob: Blob, name: string) => {
    const r = await uploadBlob(blob, name);
    medien = r.medien;
    return r.url;
  };
  const favicon: Favicon = {
    svg: file.type === 'image/svg+xml' ? await up(file, `${base}`) : '',
    png32: await up(await sized(32, null), `${base}-32`),
    // Apple-Symbol braucht einen festen Hintergrund
    png180: await up(await sized(180, '#ffffff'), `${base}-180`),
    png512: await up(await sized(512, null), `${base}-512`),
  };
  return { favicon, medien };
}
