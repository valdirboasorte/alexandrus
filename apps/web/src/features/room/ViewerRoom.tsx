import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AeroButton, AeroLink } from '../../components/ui/AeroButton.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { Avatar } from '../../components/ui/controls.tsx';
import { useCopy } from '../../components/ui/toast.tsx';
import { viewersLabel } from '../../components/room/RoomBits.tsx';
import { useFullscreen, useIdle } from '../../hooks/useIdle.ts';
import { roomLink } from '../../lib/api.ts';
import { ROUTE_LABEL } from '../../lib/capture.ts';
import { getSavedName } from '../../lib/identity.ts';
import { RoomBar, RoomMessage, useNow } from './RoomChrome.tsx';
import { DockButton, DockDivider, DockPanel, formatElapsed, Stage } from './Stage.tsx';
import { ViewerStatsView } from './StatsView.tsx';
import { useViewerSession } from './useViewerSession.ts';

const VOLUME_KEY = 'alexandrus:volume';

function loadVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.85;
  } catch {
    return 0.85;
  }
}

export function ViewerRoom({ code }: { code: string }) {
  const [name] = useState(getSavedName);
  const v = useViewerSession(code, name);
  const navigate = useNavigate();

  useEffect(() => {
    if (v.room) document.title = `${v.room.stream.live ? '● ' : ''}${v.room.name} · Alexandrus`;
  }, [v.room]);

  if (v.fatal === 'room-not-found') {
    return (
      <RoomMessage title="Não achamos essa sala">
        <p>O código pode estar errado, ou a transmissão já terminou. Confira o link com quem te convidou.</p>
      </RoomMessage>
    );
  }
  if (v.fatal === 'room-full') {
    return (
      <RoomMessage title="A sala está cheia">
        <p>Cada espectador recebe uma cópia direta do anfitrião, então as salas têm limite. Tente de novo quando alguém sair.</p>
      </RoomMessage>
    );
  }
  if (v.ended) {
    return (
      <RoomMessage
        title="A transmissão terminou"
        actions={
          <>
            <AeroLink to="/salas" variant="glass" icon="home">
              Ver outras salas
            </AeroLink>
            <AeroLink to="/criar" variant="green" icon="plus">
              Criar a sua
            </AeroLink>
          </>
        }
      >
        <p>{v.ended === 'host-ended' ? 'O anfitrião encerrou a sala.' : 'O anfitrião saiu e não voltou a tempo.'}</p>
      </RoomMessage>
    );
  }
  if (!v.room) {
    return (
      <>
        <RoomBar room={null} connection={v.connection} />
        <RoomMessage title="Entrando na sala…" actions={<span />}>
          <p>{v.connection === 'reconnecting' ? 'O servidor não respondeu; tentando de novo.' : 'Conectando ao servidor do Alexandrus.'}</p>
        </RoomMessage>
      </>
    );
  }

  return <ViewerStage v={v} onLeave={() => navigate('/', { viewTransition: true })} />;
}

type Panel = 'stats' | null;

function ViewerStage({ v, onLeave }: { v: ReturnType<typeof useViewerSession>; onLeave: () => void }) {
  const room = v.room!;
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [volume, setVolume] = useState(loadVolume);
  const [muted, setMuted] = useState(false);
  const [autoMuted, setAutoMuted] = useState(false);
  const live = room.stream.live;
  const playing = live && v.media === 'connected';
  const idle = useIdle(stageRef, 2600, playing && panel === null);
  const { isFull, toggle } = useFullscreen(stageRef, videoRef);
  const copy = useCopy();
  const now = useNow();
  const close = useCallback(() => setPanel(null), []);

  // volume e mudo aplicados ao elemento de vídeo
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted || autoMuted;
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* sem armazenamento */
    }
  }, [volume, muted, autoMuted]);

  // Política de autoplay: se o navegador bloquear som, toca mudo e oferece "Ativar som".
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !v.stream) return;
    el.muted = muted;
    el.play().catch(() => {
      el.muted = true;
      setAutoMuted(true);
      void el.play().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.stream]);

  // atalhos: F tela cheia, M mudo (sem animação: teclado é ação repetida)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') toggle();
      if (e.key === 'm' || e.key === 'M') {
        setAutoMuted(false);
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const s = room.stream;
  const audioText = !s.live ? '' : s.audio === 'none' || !s.audioEnabled ? 'sem som' : ROUTE_LABEL[s.audio].toLowerCase();
  const isSilent = muted || autoMuted || volume === 0;

  let overlay = null;
  if (!live) {
    overlay = (
      <div className="waiting glass glass--frost">
        <Avatar name={room.hostName} size="lg" />
        <p className="waiting__title">{room.hostOnline ? `${room.hostName} ainda não começou` : `${room.hostName} saiu por um instante`}</p>
        <p className="waiting__text">
          {room.hostOnline
            ? 'Assim que a transmissão começar, ela aparece aqui sozinha. Pode deixar esta aba aberta.'
            : 'A sala espera o anfitrião voltar por até um minuto.'}
        </p>
        <p className="waiting__meta">
          <Icon name="eye" />
          {viewersLabel(room.viewers)}
        </p>
      </div>
    );
  } else if (v.media !== 'connected') {
    overlay = (
      <div className="waiting waiting--compact glass glass--deep">
        <span className="status-orb status-orb--busy" aria-hidden />
        <p className="waiting__title">{v.media === 'failed' ? 'A conexão direta falhou' : v.media === 'unstable' ? 'Conexão instável…' : 'Conectando ao vídeo…'}</p>
        {v.media === 'failed' && (
          <>
            <p className="waiting__text">Tentando de novo. Redes muito restritas precisam de um servidor TURN configurado.</p>
            <AeroButton size="sm" variant="glass" icon="refresh" onClick={v.reconnect}>
              Tentar agora
            </AeroButton>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="live-wrap">
      <Stage
        ref={stageRef}
        stream={v.stream}
        videoRef={videoRef}
        idle={idle}
        waiting={!live}
        label={`Transmissão de ${room.hostName}`}
        overlay={
          <>
            {overlay}
            {playing && autoMuted && (
              <button type="button" className="unmute-pill" onClick={() => setAutoMuted(false)}>
                <Icon name="volumeOff" />
                Toque para ativar o som
              </button>
            )}
          </>
        }
        top={
          <>
            <div className="stage-chip glass glass--deep">
              {live ? (
                <>
                  <span className="live-pill">
                    <span className="live-pill__dot" />
                    AO VIVO
                  </span>
                  {s.startedAt && <span className="stage-chip__time">{formatElapsed(now - s.startedAt)}</span>}
                </>
              ) : (
                <span className="live-pill live-pill--off">
                  <span className="live-pill__dot" />
                  AGUARDANDO
                </span>
              )}
              <span className="stage-chip__text">
                <strong>{room.name}</strong>
                <span>
                  {room.hostName}
                  {audioText ? ` · ${audioText}` : ''}
                </span>
              </span>
            </div>
            <div className="stage-chip glass glass--deep">
              <span className="stage-chip__btn" role="status">
                <Icon name="eye" />
                {room.viewers}
                <span className="visually-hidden"> assistindo</span>
              </span>
            </div>
          </>
        }
        panel={
          panel === 'stats' && (
            <DockPanel title="Sua conexão" onClose={close}>
              <ViewerStatsView read={v.readStats} />
            </DockPanel>
          )
        }
        dock={
          <>
            <DockButton
              icon={isSilent ? 'volumeOff' : 'volume'}
              label={isSilent ? 'Ativar som' : 'Silenciar'}
              onClick={() => {
                if (autoMuted) setAutoMuted(false);
                else setMuted((m) => !m);
              }}
              pressed={isSilent}
            />
            <input
              className="aero-range dock-volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isSilent ? 0 : volume}
              aria-label="Volume"
              style={{ ['--fill' as string]: `${(isSilent ? 0 : volume) * 100}%` }}
              onChange={(e) => {
                const val = Number(e.target.value);
                setVolume(val);
                setMuted(val === 0);
                setAutoMuted(false);
              }}
            />
            <DockDivider />
            <DockButton icon="signal" label="Conexão" onClick={() => setPanel((p) => (p ? null : 'stats'))} expanded={panel === 'stats'} />
            <DockButton icon="link" label="Copiar link" onClick={() => void copy(roomLink(room.code))} />
            <DockButton icon={isFull ? 'minimize' : 'maximize'} label={isFull ? 'Sair da tela cheia' : 'Tela cheia'} onClick={toggle} />
            <DockDivider />
            <DockButton icon="exit" label="Sair" showLabel tone="danger" onClick={onLeave} />
          </>
        }
      />
    </div>
  );
}
