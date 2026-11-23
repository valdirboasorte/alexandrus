import { forwardRef, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { AeroButton } from '../../components/ui/AeroButton.tsx';
import { Icon, type IconName } from '../../components/ui/Icon.tsx';

interface StageProps {
  /** O que ocupa o palco: um StreamVideo, a grade de telas, ou nada. */
  media: ReactNode;
  idle: boolean;
  top: ReactNode;
  dock: ReactNode;
  panel?: ReactNode;
  overlay?: ReactNode;
  label: string;
  /** Nada tocando ainda: o fundo vira o aquário da sala. */
  waiting?: boolean;
  /** Abas das telas ao vivo, logo acima do dock. */
  tabs?: ReactNode;
}

/**
 * O palco: vídeo ocupando tudo, cercado de água azul (nunca preto), com os
 * controles de vidro por cima. Os controles somem quando ninguém mexe.
 */
export const Stage = forwardRef<HTMLDivElement, StageProps>(function Stage({ media, idle, top, dock, panel, overlay, label, waiting, tabs }, ref) {
  return (
    <div ref={ref} className="stage" data-idle={idle || undefined} data-waiting={waiting || undefined} tabIndex={-1} aria-label={label}>
      {media}
      {overlay && <div className="stage__overlay">{overlay}</div>}
      <div className="stage__chrome stage__chrome--top">{top}</div>
      {panel}
      <div className="stage__chrome stage__chrome--bottom">
        {tabs}
        <div className="stage__dock glass glass--deep" role="toolbar" aria-label="Controles da transmissão">
          {dock}
        </div>
      </div>
    </div>
  );
});

interface StreamVideoProps {
  stream: MediaStream | null;
  muted: boolean;
  volume?: number;
  /** A minha própria tela: sem picture-in-picture, sempre muda. */
  preview?: boolean;
  className?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** O navegador recusou tocar com som (política de autoplay): já voltou a tocar mudo. */
  onAutoplayBlocked?: () => void;
  label?: string;
}

/**
 * Um vídeo de tela. Volume e mudo são aplicados direto no elemento (o atributo
 * muted do React só vale na criação). Se o navegador bloquear o som, toca mudo
 * e avisa quem usa, que oferece "Toque para ativar o som".
 */
export function StreamVideo({ stream, muted, volume = 1, preview, className = 'stage__video', videoRef, onAutoplayBlocked, label }: StreamVideoProps) {
  const own = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? own;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const blockedRef = useRef(onAutoplayBlocked);
  blockedRef.current = onAutoplayBlocked;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (!stream) return;
    el.muted = preview || mutedRef.current;
    el.play().catch(() => {
      if (el.muted) return;
      el.muted = true;
      blockedRef.current?.();
      void el.play().catch(() => {});
    });
  }, [stream, ref, preview]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = preview || muted;
    el.volume = Math.min(1, Math.max(0, volume));
  }, [muted, volume, preview, ref]);

  return <video ref={ref} className={className} autoPlay playsInline muted disablePictureInPicture={preview} aria-label={label} />;
}

interface DockButtonProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  expanded?: boolean;
  tone?: 'default' | 'danger';
  showLabel?: boolean;
  disabled?: boolean;
  /** Dica no lugar do rótulo (ex.: por que está desligado). */
  hint?: string;
}

export function DockButton({ icon, label, onClick, pressed, expanded, tone = 'default', showLabel, disabled, hint }: DockButtonProps) {
  return (
    <button
      type="button"
      className={`dock-btn${tone === 'danger' ? ' dock-btn--danger' : ''}${showLabel ? ' dock-btn--labelled' : ''}`}
      onClick={onClick}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-label={showLabel ? undefined : label}
      title={hint ?? label}
      disabled={disabled}
    >
      <Icon name={icon} />
      {showLabel && <span>{label}</span>}
    </button>
  );
}

export function DockDivider() {
  return <span className="dock-divider" aria-hidden />;
}

/** Painel flutuante acima do dock (qualidade, estatísticas, espectadores). */
export function DockPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dock-panel glass glass--deep" role="dialog" aria-label={title}>
      <div className="dock-panel__head">
        <h2>{title}</h2>
        <AeroButton size="sm" variant="red" className="aero-close" iconOnly icon="x" aria-label="Fechar" onClick={onClose} />
      </div>
      <div className="dock-panel__body">{children}</div>
    </div>
  );
}

/** Tempo ao vivo: 00:00 / 1:02:03. */
export function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
}
