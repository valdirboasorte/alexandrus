import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { formatRoomCode, type RoomSummary } from '@protocol';
import { Logo } from '../../components/brand/Logo.tsx';
import { AeroLink } from '../../components/ui/AeroButton.tsx';
import { StatusOrb } from '../../components/ui/controls.tsx';
import { RoomStatusPill } from '../../components/room/RoomBits.tsx';
import type { SignalingState } from '../../lib/signaling.ts';

export function useNow(every = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(id);
  }, [every]);
  return now;
}

export function ConnectionOrb({ state }: { state: SignalingState }) {
  const map = {
    open: { orb: 'ok', text: 'Conectado' },
    connecting: { orb: 'busy', text: 'Conectando' },
    reconnecting: { orb: 'warn', text: 'Reconectando' },
    closed: { orb: 'bad', text: 'Desconectado' },
  } as const;
  const m = map[state];
  return (
    <span className="conn-orb">
      <StatusOrb state={m.orb} />
      {m.text}
    </span>
  );
}

/** Barra superior das telas de sala fora do palco (estúdio, espera, avisos). */
export function RoomBar({ room, connection, actions }: { room: RoomSummary | null; connection: SignalingState; actions?: ReactNode }) {
  return (
    <header className="room-bar glass">
      <Link to="/" className="room-bar__brand" viewTransition aria-label="Alexandrus, página inicial">
        <Logo compact />
      </Link>
      {room && (
        <div className="room-bar__room">
          <p className="room-bar__name">{room.name}</p>
          <p className="room-bar__meta">
            <RoomStatusPill room={room} />
            <span className="room-bar__code">{formatRoomCode(room.code)}</span>
            <ConnectionOrb state={connection} />
          </p>
        </div>
      )}
      <div className="room-bar__actions">{actions}</div>
    </header>
  );
}

/** Cartão central para estados da sala (terminou, não existe, cheia…). */
export function RoomMessage({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="room-message glass glass--frost" role="status">
      <span className="empty__bubble" aria-hidden />
      <h1 className="room-message__title">{title}</h1>
      {children && <div className="room-message__body">{children}</div>}
      <div className="room-message__actions">
        {actions ?? (
          <AeroLink to="/" icon="home">
            Voltar para o início
          </AeroLink>
        )}
      </div>
    </div>
  );
}
