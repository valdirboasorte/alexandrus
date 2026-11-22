import { useCallback, useEffect, useState } from 'react';
import type { RoomSummary } from '@protocol';
import { RoomMeta, RoomStatusPill } from '../components/room/RoomBits.tsx';
import { AeroButton, AeroLink } from '../components/ui/AeroButton.tsx';
import { Avatar, Note } from '../components/ui/controls.tsx';
import { api } from '../lib/api.ts';
import './pages.css';

type State = { status: 'loading' } | { status: 'ok'; rooms: RoomSummary[]; at: number } | { status: 'error'; message: string };

export function RoomsPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const rooms = await api.listRooms();
      setState({ status: 'ok', rooms, at: Date.now() });
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 10000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Salas públicas</h1>
        <p className="page-lead">Transmissões que os anfitriões deixaram abertas. Salas privadas não aparecem aqui: entra-se nelas só com código ou link.</p>
      </header>

      {state.status === 'loading' && (
        <div className="empty glass glass--frost" aria-busy="true">
          <span className="empty__bubble" aria-hidden />
          <p>Carregando salas…</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="form-stack">
          <Note tone="bad">{state.message}</Note>
          <div>
            <AeroButton variant="glass" size="md" icon="refresh" onClick={() => void load()}>
              Tentar de novo
            </AeroButton>
          </div>
        </div>
      )}

      {state.status === 'ok' && state.rooms.length === 0 && (
        <div className="empty glass glass--frost">
          <span className="empty__bubble" aria-hidden />
          <h2>Nenhuma sala pública no ar agora</h2>
          <p>Que tal abrir a primeira? Você pode deixá-la pública na criação e ela aparece aqui na hora.</p>
          <AeroLink to="/criar" variant="green" icon="plus">
            Criar sala
          </AeroLink>
        </div>
      )}

      {state.status === 'ok' && state.rooms.length > 0 && (
        <ul className="room-list">
          {state.rooms.map((room) => (
            <li key={room.code} className="room-row glass glass--frost">
              <Avatar name={room.hostName} size="lg" />
              <div>
                <p className="room-row__title">{room.name}</p>
                <p className="room-row__meta">
                  <RoomStatusPill room={room} />
                  <RoomMeta room={room} />
                </p>
              </div>
              <AeroLink to={`/sala/${room.code}`} variant={room.stream.live ? 'blue' : 'glass'} size="md" icon={room.stream.live ? 'play' : 'eye'} chevron>
                {room.stream.live ? 'Assistir' : 'Entrar'}
              </AeroLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
