import type { ReactNode } from 'react';
import { Glyph, type GlyphName } from './art.tsx';

/*
 * Peças pequenas e repetidas do Playground. Botões grandes reaproveitam o
 * AeroButton do site; aqui ficam as fichas (chips), seções e estados vazios
 * no vidro claro do painel.
 */

export function PgSection({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`pg-section${className ? ` ${className}` : ''}`}>
      {(title || aside) && (
        <div className="pg-section__head">
          {title && <h3>{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

interface ChipProps {
  children: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  glyph?: GlyphName;
  disabled?: boolean;
  title?: string;
  tone?: 'default' | 'danger' | 'go';
  label?: string;
}

export function PgChip({ children, onClick, pressed, glyph, disabled, title, tone = 'default', label }: ChipProps) {
  return (
    <button
      type="button"
      className={`pg-chip${tone !== 'default' ? ` pg-chip--${tone}` : ''}`}
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {glyph && <Glyph name={glyph} size={18} />}
      {children}
    </button>
  );
}

/** Estado vazio ou aviso dentro de uma ferramenta. */
export function PgEmpty({ glyph, title, children }: { glyph: GlyphName; title: string; children?: ReactNode }) {
  return (
    <div className="pg-empty">
      <span className="pg-empty__icon">
        <Glyph name={glyph} size={28} />
      </span>
      <p className="pg-empty__title">{title}</p>
      {children && <div className="pg-empty__text">{children}</div>}
    </div>
  );
}

/** Faixa de aviso (silenciado, desligado pelo anfitrião, som da transmissão). */
export function PgNotice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <p className={`pg-notice pg-notice--${tone}`} role="status">
      <Glyph name={tone === 'warn' ? 'flag' : 'sparkle'} size={16} />
      <span>{children}</span>
    </p>
  );
}

/** Anel de espera sobre um botão: some quando a ação volta a valer. */
export function CooldownRing({ left, total }: { left: number; total: number }) {
  if (left <= 0) return null;
  const f = Math.min(1, left / total);
  return <span className="pg-cooldown" style={{ ['--f' as string]: f }} aria-hidden />;
}

export function secondsLabel(ms: number) {
  return `${Math.ceil(ms / 1000)} s`;
}
