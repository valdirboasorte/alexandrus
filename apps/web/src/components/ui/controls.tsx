import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';

/* ------------------------------------------------------------------ */

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

/** Interruptor acessível (role="switch"). O rótulo visível fica a cargo de quem usa. */
export function AeroToggle({ checked, onChange, label, disabled, id }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="aero-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="aero-toggle__knob" aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          className="segmented__option"
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  hint?: ReactNode;
  icon?: IconName;
  /** Elemento à direita, dentro da cápsula (ex.: botão de seta). */
  trailing?: ReactNode;
  hideLabel?: boolean;
}

export function TextField({ label, hint, icon, trailing, hideLabel, id, ...input }: TextFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={fieldId} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}
      </label>
      <div className={`aero-input${trailing ? '' : ' aero-input--plain'}`}>
        {icon && <Icon name={icon} className="aero-input__icon" />}
        <input id={fieldId} aria-describedby={hintId} {...input} />
        {trailing}
      </div>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export type OrbState = 'ok' | 'warn' | 'bad' | 'idle' | 'busy';

export function StatusOrb({ state, label }: { state: OrbState; label?: string }) {
  return <span className={`status-orb${state === 'ok' ? '' : ` status-orb--${state}`}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function LivePill({ live, children }: { live: boolean; children?: ReactNode }) {
  return (
    <span className={`live-pill${live ? '' : ' live-pill--off'}`}>
      <span className="live-pill__dot" aria-hidden />
      {children ?? (live ? 'AO VIVO' : 'FORA DO AR')}
    </span>
  );
}

const AVATAR_TINTS: [string, string][] = [
  ['#7fe0ff', '#1172dc'],
  ['#c8f57a', '#2f9a25'],
  ['#8ff3e0', '#0e9a8a'],
  ['#ffd27a', '#e07a12'],
  ['#9fd0ff', '#2a5fd8'],
  ['#ffa9a0', '#d8402f'],
];

export function Avatar({ name, size }: { name: string; size?: 'lg' }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a1, a2] = AVATAR_TINTS[h % AVATAR_TINTS.length];
  return (
    <span className={`avatar${size === 'lg' ? ' avatar--lg' : ''}`} style={{ ['--a1' as string]: a1, ['--a2' as string]: a2 }} aria-hidden>
      <span>{initial}</span>
    </span>
  );
}

export function Note({ tone = 'info', icon, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; icon?: IconName; children: ReactNode }) {
  const fallback: IconName = tone === 'warn' || tone === 'bad' ? 'alert' : tone === 'ok' ? 'check' : 'info';
  return (
    <div className={`note${tone === 'info' ? '' : ` note--${tone}`}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon name={icon ?? fallback} />
      <div>{children}</div>
    </div>
  );
}
