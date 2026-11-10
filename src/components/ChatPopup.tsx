import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, MessageSquareQuote, X } from 'lucide-react';
import { useCommands } from '../state/commands.ts';
import { useStore } from '../state/store.tsx';
import { useUi } from '../state/ui.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { Button } from './ui.tsx';

// Das Fenster wird von der Steuerung selbst befüllt (React-Portal). Dadurch teilen sich
// beide denselben Zustand: Ein Highlight, das im Fenster gewählt wird, gilt sofort überall.
let popup: Window | null = null;

/** Holt ein offenes Chat-Fenster nach vorne. Gibt false zurück, wenn keins offen ist. */
export function focusChatPopup(): boolean {
  if (popup && !popup.closed) {
    popup.focus();
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

/** Öffnet den Chat als eigenes Fenster, solange chatPopupOpen gesetzt ist. */
export function ChatPopupWindow() {
  const { chatPopupOpen, setChatPopupOpen } = useUi();
  const { notify } = useStore();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!chatPopupOpen) return;
    if (focusChatPopup()) return;
    const win = window.open('', 'mb-chat', 'width=480,height=860');
    if (!win) {
      notify('Das Chat-Fenster wurde blockiert. Bitte Pop-ups für localhost erlauben.', 'fehler');
      setChatPopupOpen(false);
      return;
    }
    popup = win;
    const doc = win.document;
    doc.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    doc.title = 'MeetingBackstage · Chat';
    doc.body.innerHTML = '';
    copyStyles(doc);
    syncRootAttributes(doc);
    const root = doc.createElement('div');
    root.className = 'chat-popup';
    doc.body.appendChild(root);
    setContainer(root);

    // Hell/Dunkel und Bewegungseinstellung mitnehmen
    const observer = new MutationObserver(() => syncRootAttributes(doc));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });

    const closed = () => {
      observer.disconnect();
      clearInterval(timer);
      popup = null;
      setContainer(null);
      setChatPopupOpen(false);
    };
    win.addEventListener('pagehide', closed);
    const timer = window.setInterval(() => win.closed && closed(), 1000);
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, [chatPopupOpen, notify, setChatPopupOpen]);

  // Lädt oder schließt die Steuerung, schließt auch das Chat-Fenster.
  useEffect(() => {
    const close = () => popup?.close();
    window.addEventListener('pagehide', close);
    return () => window.removeEventListener('pagehide', close);
  }, []);

  if (!container) return null;
  return createPortal(<ChatPopupContent onClose={() => popup?.close()} />, container);
}

function ChatPopupContent({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const commands = useCommands();
  const highlight = state.chat.find((m) => m.id === state.highlightId) ?? null;
  const onAir = state.program.graphic === 'highlight';

  return (
    <>
      <header className="chat-popup__head">
        <div className="chat-popup__status">
          <MessageSquareQuote size={16} aria-hidden />
          {highlight ? (
            <span>
              Highlight: <strong>{highlight.senderName}</strong> <span className="subtle">„{highlight.text.slice(0, 60)}{highlight.text.length > 60 ? '…' : ''}“</span>
            </span>
          ) : (
            <span className="subtle">Kein Highlight gewählt. Bei einer Nachricht „Als Highlight“ klicken.</span>
          )}
        </div>
        <div className="row">
          <Button
            size="sm"
            variant={onAir ? 'primary' : 'secondary'}
            icon={onAir ? EyeOff : Eye}
            disabled={!highlight}
            onClick={() => commands.toggleGraphic('highlight')}
            title={onAir ? 'Highlight aus dem Programm nehmen' : 'Highlight in die OBS-Quelle „Programm“ schicken'}
          >
            {onAir ? 'Im Programm' : 'Ins Programm'}
          </Button>
          {highlight && (
            <Button size="sm" variant="ghost" icon={X} onClick={() => dispatch({ type: 'highlight/set', id: null })}>
              Auswahl aufheben
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Fenster schließen
          </Button>
        </div>
      </header>
      <ChatPanel />
    </>
  );
}
