import { focusPortalWindow, PortalWindow } from './PortalWindow.tsx';
import { Eye, EyeOff, MessageSquareQuote, X } from 'lucide-react';
import { useCommands } from '../state/commands.ts';
import { useStore } from '../state/store.tsx';
import { useUi } from '../state/ui.tsx';
import { HighlightPickList } from './HighlightPickList.tsx';
import { Button } from './ui.tsx';

/** Holt ein offenes Chat-Fenster nach vorne. Gibt false zurück, wenn keins offen ist. */
export function focusChatPopup(): boolean {
  return focusPortalWindow('mb-chat');
}

/** Öffnet den Chat als eigenes Fenster, solange chatPopupOpen gesetzt ist. */
export function ChatPopupWindow() {
  const { chatPopupOpen, setChatPopupOpen } = useUi();
  return (
    <PortalWindow
      name="mb-chat"
      title="MeetingBackstage · Chat-Highlight"
      open={chatPopupOpen}
      onClosed={() => setChatPopupOpen(false)}
      width={480}
      height={860}
      className="chat-popup"
    >
      {(close) => <ChatPopupContent onClose={close} />}
    </PortalWindow>
  );
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
            <span className="subtle">Kein Highlight gewählt. Auf eine Nachricht klicken.</span>
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
      <HighlightPickList fill />
    </>
  );
}
