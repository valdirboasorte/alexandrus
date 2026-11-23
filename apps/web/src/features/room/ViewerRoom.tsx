import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AeroLink } from '../../components/ui/AeroButton.tsx';
import { AeroProgress } from '../../components/ui/controls.tsx';
import { DEFAULT_SETTINGS } from '../../lib/capture.ts';
import { getSavedName } from '../../lib/identity.ts';
import { LiveRoom, useIsWindows } from './LiveRoom.tsx';
import { OutdatedMessage, RoomBar, RoomMessage } from './RoomChrome.tsx';
import { useRoomSession } from './useRoomSession.ts';

/** Quem entrou pelo link: assiste as telas da sala e, se o anfitrião deixar, compartilha a própria. */
export function ViewerRoom({ code }: { code: string }) {
  const [name] = useState(getSavedName);
  const s = useRoomSession(code, { role: 'viewer', name }, DEFAULT_SETTINGS);
  const windows = useIsWindows();
  const navigate = useNavigate();
  const anyLive = (s.room?.streams.length ?? 0) > 0;

  useEffect(() => {
    if (s.room) document.title = `${anyLive ? '● ' : ''}${s.room.name} · Alexandrus`;
  }, [s.room, anyLive]);

  if (s.fatal === 'outdated') return <OutdatedMessage />;
  if (s.fatal === 'not-found') {
    return (
      <RoomMessage title="Não achamos essa sala">
        <p>O código pode estar errado, ou a transmissão já terminou. Confira o link com quem te convidou.</p>
      </RoomMessage>
    );
  }
  if (s.fatal === 'room-full') {
    return (
      <RoomMessage title="A sala está cheia">
        <p>Cada pessoa recebe uma cópia direta de quem compartilha, então as salas têm limite. Tente de novo quando alguém sair.</p>
      </RoomMessage>
    );
  }
  if (s.ended) {
    return (
      <RoomMessage
        title="A sala terminou"
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
        <p>{s.ended === 'host-ended' ? 'O anfitrião encerrou a sala.' : 'O anfitrião saiu e não voltou a tempo.'}</p>
      </RoomMessage>
    );
  }
  if (!s.room) {
    return (
      <>
        <RoomBar room={null} connection={s.connection} />
        <RoomMessage title="Entrando na sala…" actions={<span />}>
          <p>{s.connection === 'reconnecting' ? 'O servidor não respondeu; tentando de novo.' : 'Conectando ao servidor do Alexandrus.'}</p>
          <AeroProgress label="Entrando na sala" />
        </RoomMessage>
      </>
    );
  }

  return <LiveRoom s={s} windows={windows} onLeave={() => navigate('/', { viewTransition: true })} />;
}
