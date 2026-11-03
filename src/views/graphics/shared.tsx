import type { ReactNode } from 'react';
import { Eye, EyeOff, Maximize2 } from 'lucide-react';
import { CopyObsUrlButton } from '../../components/ObsOutputs.tsx';
import { Button } from '../../components/ui.tsx';
import { useCommands } from '../../state/commands.ts';
import { useStore } from '../../state/store.tsx';
import type { GraphicKind } from '../../state/types.ts';
import { useUi } from '../../state/ui.tsx';

/** Kopfzeile jeder Grafik: Status, Einblenden und Präsentationsansicht. */
export function GraphicHeader({
  kind,
  title,
  status,
  children,
}: {
  kind: GraphicKind;
  title: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  const { state, derived } = useStore();
  const commands = useCommands();
  const { setPresentation } = useUi();
  const shown = state.program.graphic === kind;
  return (
    <div className="graphic-head">
      <div className="graphic-head__titles">
        <h2 className="graphic-head__title">{title}</h2>
        <div className="row">{status}</div>
      </div>
      <div className="graphic-head__actions">
        {children}
        <Button
          variant={shown ? 'primary' : 'secondary'}
          icon={shown ? EyeOff : Eye}
          onClick={() => commands.toggleGraphic(kind)}
          aria-pressed={shown}
          disabled={!!derived.locked}
          title={derived.locked ?? 'Einblenden in der Vorschau und in der OBS-Ausgabe „Programm“'}
        >
          {shown ? 'Eingeblendet' : 'Einblenden'}
        </Button>
        <Button icon={Maximize2} onClick={() => setPresentation(kind)}>
          Präsentation
        </Button>
        <CopyObsUrlButton kind={kind} />
      </div>
    </div>
  );
}

export function CollectStatus({ status, since }: { status: 'laeuft' | 'pausiert'; since: string }) {
  return status === 'laeuft' ? (
    <span className="collect collect--on">
      <span className="dot dot--ok" aria-hidden /> Sammelt Chat-Beiträge seit {since}
    </span>
  ) : (
    <span className="collect">
      <span className="dot" aria-hidden /> Pausiert seit {since}, neue Beiträge werden nicht gezählt
    </span>
  );
}
