import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon, type IconName } from './Icon.tsx';

type Variant = 'blue' | 'green' | 'red' | 'glass';
type Size = 'lg' | 'md' | 'sm';

interface Common {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  /** Seta ">" no fim, para ações que levam a outro lugar. */
  chevron?: boolean;
  /** Só ícone (precisa de aria-label). */
  iconOnly?: boolean;
  block?: boolean;
  children?: ReactNode;
  className?: string;
}

function classes({ variant = 'blue', size = 'lg', iconOnly, block, className }: Common) {
  return [
    'aero-btn',
    variant !== 'blue' && `aero-btn--${variant}`,
    size !== 'lg' && `aero-btn--${size}`,
    iconOnly && 'aero-btn--icon',
    block && 'aero-btn--block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

function Inner({ icon, chevron, children }: Common) {
  return (
    <>
      <span className="aero-btn__sheen" aria-hidden />
      {icon && <Icon name={icon} className="aero-btn__icon" />}
      {children}
      {chevron && <Icon name="chevronRight" className="aero-btn__chevron" strokeWidth={2.6} />}
    </>
  );
}

type ButtonProps = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

export function AeroButton({ variant, size, icon, chevron, iconOnly, block, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={classes({ variant, size, iconOnly, block, className })} {...rest}>
      <Inner icon={icon} chevron={chevron}>
        {children}
      </Inner>
    </button>
  );
}

type LinkButtonProps = Common & Omit<LinkProps, 'className' | 'children'>;

export function AeroLink({ variant, size, icon, chevron, iconOnly, block, className, children, viewTransition = true, ...rest }: LinkButtonProps) {
  return (
    <Link className={classes({ variant, size, iconOnly, block, className })} viewTransition={viewTransition} {...rest}>
      <Inner icon={icon} chevron={chevron}>
        {children}
      </Inner>
    </Link>
  );
}
