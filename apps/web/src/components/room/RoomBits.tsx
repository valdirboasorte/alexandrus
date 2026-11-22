import type { RoomSummary } from '@protocol';
import { formatRoomCode } from '@protocol';
import { Icon } from '../ui/Icon.tsx';
import { LivePill } from '../ui/controls.tsx';
import { ROUTE_LABEL, SURFACE_LABEL } from '../../lib/capture.ts';

export function viewersLabel(n: number) {
  return n === 0 ? 'ninguém assistindo' : n === 1 ? '1 pessoa assistindo' : `${n} pessoas assistindo`;
}

/** Linha de metadados de uma sala: anfitrião, status, espectadores, fonte. */
export function RoomMeta({ room }: { room: RoomSummary }) {
  const s = room.stream;
  return (
    <>
      <span>
        <Icon name="user" />
        {room.hostName}
        {!room.hostOnline && ' (desconectado)'}
      </span>
      <span>
        <Icon name="eye" />
        {viewersLabel(room.viewers)}
      </span>
      {s.live && s.source && (
        <span>
          <Icon name={s.source === 'monitor' ? 'monitor' : s.source === 'window' ? 'window' : 'tab'} />
          {SURFACE_LABEL[s.source]}
          {s.audio !== 'none' && s.audioEnabled ? ` · ${ROUTE_LABEL[s.audio].toLowerCase()}` : ' · sem som'}
        </span>
      )}
      <span>
        <Icon name="ticket" />
        {formatRoomCode(room.code)}
      </span>
    </>
  );
}

export function RoomStatusPill({ room }: { room: RoomSummary }) {
  if (room.stream.live) return <LivePill live />;
  return <LivePill live={false}>{room.hostOnline ? 'AGUARDANDO' : 'FORA DO AR'}</LivePill>;
}
