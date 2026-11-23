import { useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { normalizeRoomCode } from '@protocol';
import { DeepScene } from '../../components/scenery/Scene.tsx';
import { forgetHostKey, getHostKey } from '../../lib/identity.ts';
import { HostRoom } from './HostRoom.tsx';
import { RoomMessage } from './RoomChrome.tsx';
import { ViewerRoom } from './ViewerRoom.tsx';
import '../../pages/pages.css';
import './room.css';

/**
 * /sala/:code — quem tem a chave de anfitrião desta sala (criada nesta aba)
 * vira anfitrião; todo o resto assiste.
 */
export function RoomPage() {
  const params = useParams();
  const code = normalizeRoomCode(params.code ?? '');
  const [hostKey, setHostKey] = useState(() => (code ? getHostKey(code) : null));

  const demote = useCallback(() => {
    if (code) forgetHostKey(code);
    setHostKey(null);
  }, [code]);

  return (
    <div className="room-page vt-page" style={{ viewTransitionName: 'page-sala' }}>
      <DeepScene />
      {!code ? (
        <RoomMessage title="Código de sala inválido">
          <p>Códigos têm seis letras e números, como K7Q-2MX.</p>
        </RoomMessage>
      ) : hostKey ? (
        <HostRoom key={`h-${code}`} code={code} hostKey={hostKey} onBadKey={demote} />
      ) : (
        <ViewerRoom key={`v-${code}`} code={code} />
      )}
    </div>
  );
}
