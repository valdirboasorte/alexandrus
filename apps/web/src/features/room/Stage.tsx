import { forwardRef, useEffect, type ReactNode, type RefObject } from 'react';
import { Icon, type IconName } from '../../components/ui/Icon.tsx';

interface StageProps {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Prévia do anfitrião: nunca toca som (ele já ouve a fonte). */
  preview?: boolean;
  idle: boolean;
  top: ReactNode;
  dock: ReactNode;
  panel?: ReactNode;
  overlay?: ReactNode;
  label: string;
  /** Nada tocando ainda: o fundo vira o aquário da sala. */
  waiting?: boolean;
}

/**
 * O palco: vídeo ocupando tudo, cercado de água azul (nunca preto), com os
 * controles de vidro por cima. Os controles somem quando ninguém mexe.
 */
export const Stage = forwardRef<HTMLDivElement, StageProps>(function Stage({ stream, videoRef, preview, idle, top, dock, panel, overlay, label, waiting }, ref) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) void v.play().catch(() => {});
  }, [stream, videoRef]);

  return (
    <div ref={ref} className="stage" data-idle={idle || undefined} data-waiting={waiting || undefined} tabIndex={-1} aria-label={label}>
      <video ref={videoRef} className="stage__video" autoPlay playsInline muted={preview} disablePictureInPicture={preview} />
      {overlay && <div className="stage__overlay">{overlay}</div>}
      <div className="stage__chrome stage__chrome--top">{top}</div>
      {panel}
      <div className="stage__chrome stage__chrome--bottom">
        <div className="stage__dock glass glass--deep" role="toolbar" aria-label="Controles da transmissão">
          {dock}
        </div>
      </div>
    </div>
  );
});

interface DockButtonProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  expanded?: boolean;
  tone?: 'default' | 'danger';
  showLabel?: boolean;
}

export function DockButton({ icon, label, onClick, pressed, expanded, tone = 'default', showLabel }: DockButtonProps) {
  return (
    <button
      type="button"
      className={`dock-btn${tone === 'danger' ? ' dock-btn--danger' : ''}${showLabel ? ' dock-btn--labelled' : ''}`}
      onClick={onClick}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-label={showLabel ? undefined : label}
      title={label}
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
        <button type="button" className="dock-btn dock-btn--small" onClick={onClose} aria-label="Fechar">
          <Icon name="x" />
        </button>
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
