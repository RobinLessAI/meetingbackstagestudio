import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { CircleDashed, FlaskConical, LoaderCircle, X, type LucideIcon } from 'lucide-react';

type Tone = 'neutral' | 'accent' | 'ok' | 'danger' | 'warn' | 'info';

export function Badge({
  tone = 'neutral',
  children,
  icon: Icon,
  solid = false,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: LucideIcon;
  solid?: boolean;
  title?: string;
}) {
  return (
    <span className={`badge badge--${tone}${solid ? ' badge--solid' : ''}`} title={title}>
      {Icon && <Icon size={13} strokeWidth={2.2} aria-hidden />}
      {children}
    </span>
  );
}

/** Kennzeichnung für simulierte Funktionen. */
export function DemoTag({ children = 'Demo', title }: { children?: ReactNode; title?: string }) {
  return (
    <span className="demo-tag" title={title ?? 'Simulierte Funktion ohne echte Verbindung'}>
      <FlaskConical size={12} strokeWidth={2.2} aria-hidden />
      {children}
    </span>
  );
}

export function NotConnected({ children = 'Nicht verbunden' }: { children?: ReactNode }) {
  return (
    <span className="not-connected">
      <CircleDashed size={12} strokeWidth={2.2} aria-hidden />
      {children}
    </span>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
  pressed?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  pressed,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size}${pressed ? ' is-pressed' : ''} ${className}`}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="spin" size={size === 'sm' ? 14 : 16} aria-hidden />
      ) : (
        Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} strokeWidth={2.1} aria-hidden />
      )}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon: Icon,
  tone,
  pressed,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: LucideIcon;
  tone?: 'danger' | 'ok' | 'accent';
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-btn${tone ? ` icon-btn--${tone}` : ''}${pressed ? ' is-pressed' : ''} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...rest}
    >
      <Icon size={16} strokeWidth={2.1} aria-hidden />
    </button>
  );
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  hideLabel = false,
}: {
  label: string;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={`segmented-wrap${hideLabel ? ' segmented-wrap--bare' : ''}`}>
      <span id={id} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </span>
      <div className={`segmented segmented--${size}`} role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={o.value === value ? 'is-active' : ''}
            aria-pressed={o.value === value}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`switch-row${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        className={`switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span className="switch__knob" />
      </button>
      <div className="switch-row__text">
        <span id={`${id}-l`} className="switch-row__label" onClick={() => !disabled && onChange(!checked)}>
          {label}
        </span>
        {description && (
          <span id={`${id}-d`} className="switch-row__desc">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

export function Empty({
  icon: Icon,
  title,
  children,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty${compact ? ' empty--compact' : ''}`}>
      <Icon size={compact ? 18 : 22} strokeWidth={1.8} aria-hidden />
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body">{children}</div>}
    </div>
  );
}

export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className = '',
  id,
  flush,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  flush?: boolean;
}) {
  const hid = useId();
  return (
    <section className={`panel ${className}`} aria-labelledby={title ? hid : undefined} id={id}>
      {(title || actions) && (
        <header className="panel__head">
          <div className="panel__titles">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && (
              <h2 className="panel__title" id={hid}>
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'panel__body panel__body--flush' : 'panel__body'}>{children}</div>
    </section>
  );
}

/** Modaler Dialog auf Basis von <dialog>: Fokus bleibt im Dialog, Esc schließt. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  tone,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  tone?: 'danger';
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${size}${tone ? ` dialog--${tone}` : ''} ${className}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog__inner">
          <header className="dialog__head">
            <h2 id={titleId}>{title}</h2>
            <IconButton label="Dialog schließen" icon={X} onClick={onClose} />
          </header>
          <div className="dialog__body">{children}</div>
          {footer && <footer className="dialog__foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
  htmlFor,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
