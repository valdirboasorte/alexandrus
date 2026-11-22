import { formatRoomCode, type RoomSummary, type Visibility } from '@protocol';
import { AeroButton } from '../../components/ui/AeroButton.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { Avatar, Segmented, StatusOrb } from '../../components/ui/controls.tsx';
import { useCopy } from '../../components/ui/toast.tsx';
import { roomLink } from '../../lib/api.ts';
import type { HostViewer } from './useHostSession.ts';

const STATE_LABEL: Record<RTCPeerConnectionState, string> = {
  new: 'entrando',
  connecting: 'conectando',
  connected: 'conectado',
  disconnected: 'instável',
  failed: 'sem conexão',
  closed: 'saiu',
};

export function ShareCard({ room, viewers, onVisibility }: { room: RoomSummary; viewers: HostViewer[]; onVisibility: (v: Visibility) => void }) {
  const copy = useCopy();
  const link = roomLink(room.code);
  return (
    <section className="share-card glass glass--frost" aria-labelledby="share-title">
      <h2 id="share-title" className="visually-hidden">
        Convidar
      </h2>
      <div className="share-card__code">
        <span className="share-card__code-label">Código da sala</span>
        <span className="share-card__code-value">{formatRoomCode(room.code)}</span>
      </div>
      <div className="share-card__link">
        <span className="share-card__url" title={link}>
          {link.replace(/^https?:\/\//, '')}
        </span>
        <AeroButton size="md" variant="green" icon="copy" onClick={() => void copy(link)}>
          Copiar link
        </AeroButton>
      </div>
      <div className="share-card__row">
        <Segmented
          label="Visibilidade"
          value={room.visibility}
          onChange={onVisibility}
          options={[
            { value: 'private', label: 'Privada', icon: 'lock' },
            { value: 'public', label: 'Pública', icon: 'globe' },
          ]}
        />
      </div>
      <div className="share-card__people">
        <p className="share-card__people-title">
          <Icon name="users" />
          {viewers.length === 0 ? 'Ninguém entrou ainda' : viewers.length === 1 ? '1 pessoa na sala' : `${viewers.length} pessoas na sala`}
          <span className="share-card__max">máx. {room.maxViewers}</span>
        </p>
        {viewers.length > 0 && <ViewerList viewers={viewers} />}
      </div>
    </section>
  );
}

export function ViewerList({ viewers, dark = false }: { viewers: HostViewer[]; dark?: boolean }) {
  return (
    <ul className={`viewer-list${dark ? ' viewer-list--dark' : ''}`}>
      {viewers.map((v) => (
        <li key={v.id}>
          <Avatar name={v.name} />
          <span className="viewer-list__name">{v.name}</span>
          <span className="viewer-list__state">
            <StatusOrb state={v.state === 'connected' ? 'ok' : v.state === 'failed' ? 'bad' : v.state === 'disconnected' ? 'warn' : 'busy'} />
            {STATE_LABEL[v.state]}
          </span>
        </li>
      ))}
    </ul>
  );
}
