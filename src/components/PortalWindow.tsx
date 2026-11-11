import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store.tsx';

// Eigene Browserfenster, die von der Steuerung selbst befüllt werden (React-Portal).
// Dadurch teilen sie denselben Zustand: Was im Fenster passiert, gilt sofort überall.
const windows = new Map<string, Window>();

/** Holt ein offenes Fenster nach vorne. Gibt false zurück, wenn keins offen ist. */
export function focusPortalWindow(name: string): boolean {
  const w = windows.get(name);
  if (w && !w.closed) {
    w.focus();
    return true;
  }
  return false;
}

function copyStyles(target: Document) {
  for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) {
    const clone = node.cloneNode(true) as HTMLElement;
    // Relative Adressen gelten im leeren Fenster nicht; daher absolut übernehmen.
    if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
    target.head.appendChild(clone);
  }
}

function syncRootAttributes(target: Document) {
  const src = document.documentElement;
  const dst = target.documentElement;
  dst.lang = src.lang || 'de';
  for (const key of ['theme', 'motion']) {
    if (src.dataset[key]) dst.dataset[key] = src.dataset[key];
    else delete dst.dataset[key];
  }
}

/** Zeigt children in einem eigenen Fenster, solange open gesetzt ist. */
export function PortalWindow({
  name,
  title,
  open,
  onClosed,
  width,
  height,
  className,
  children,
}: {
  name: string;
  title: string;
  open: boolean;
  onClosed: () => void;
  width: number;
  height: number;
  className: string;
  children: (close: () => void) => ReactNode;
}) {
  const { notify } = useStore();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (focusPortalWindow(name)) return;
    const win = window.open('', name, `width=${width},height=${height}`);
    if (!win) {
      notify('Das Fenster wurde blockiert. Bitte Pop-ups für localhost erlauben.', 'fehler');
      onClosed();
      return;
    }
    windows.set(name, win);
    const doc = win.document;
    doc.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    doc.title = title;
    doc.body.innerHTML = '';
    copyStyles(doc);
    syncRootAttributes(doc);
    const root = doc.createElement('div');
    root.className = className;
    doc.body.appendChild(root);
    setContainer(root);

    // Hell/Dunkel und Bewegungseinstellung mitnehmen
    const observer = new MutationObserver(() => syncRootAttributes(doc));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });

    const closed = () => {
      observer.disconnect();
      clearInterval(timer);
      windows.delete(name);
      setContainer(null);
      onClosed();
    };
    win.addEventListener('pagehide', closed);
    const timer = window.setInterval(() => win.closed && closed(), 1000);
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
    // onClosed/notify absichtlich nicht als Abhängigkeit: sonst öffnete jedes Neuzeichnen das Fenster neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name]);

  // Lädt oder schließt die Steuerung, schließt auch das Fenster.
  useEffect(() => {
    const close = () => windows.get(name)?.close();
    window.addEventListener('pagehide', close);
    return () => window.removeEventListener('pagehide', close);
  }, [name]);

  if (!container) return null;
  return createPortal(children(() => windows.get(name)?.close()), container);
}
