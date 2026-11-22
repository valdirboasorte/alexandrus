import { formatRoomCode, type PeerInfo, type RoomSummary, type Visibility } from '@protocol';
import { AeroButton } from '../../components/ui/AeroButton.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { AeroToggle, Avatar, Segmented, StatusOrb, type OrbState } from '../../components/ui/controls.tsx';
import { useCopy } from '../../components/ui/toast.tsx';
import { roomLink } from '../../lib/api.ts';

export function ShareCard({
  room,
  people,
  onVisibility,
  onShareOpen,
}: {
  room: RoomSummary;
  people: PeerInfo[];
  onVisibility: (v: Visibility) => void;
  onShareOpen: (open: boolean) => void;
}) {
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
      <ShareOpenRow room={room} onShareOpen={onShareOpen} />
      <div className="share-card__people">
        <p className="share-card__people-title">
          <Icon name="users" />
          {people.length === 0 ? 'Ninguém entrou ainda' : people.length === 1 ? '1 pessoa na sala' : `${people.length} pessoas na sala`}
          <span className="share-card__max">máx. {room.maxViewers}</span>
        </p>
        {people.length > 0 && <PeopleList items={people.map((p) => ({ id: p.id, name: p.name }))} />}
      </div>
    </section>
  );
}

/** "Todos podem compartilhar a tela": só o anfitrião vê. */
export function ShareOpenRow({ room, onShareOpen, dark = false }: { room: RoomSummary; onShareOpen: (open: boolean) => void; dark?: boolean }) {
  return (
    <div className={`share-open${dark ? ' share-open--dark' : ''}`}>
      <span className="share-open__text">
        <strong id="share-open-label">Todos podem compartilhar a tela</strong>
        <span>Até {room.maxPresenters} telas ao vivo ao mesmo tempo. Desligado, só você compartilha.</span>
      </span>
      <AeroToggle checked={room.shareOpen} onChange={onShareOpen} label="Todos podem compartilhar a tela" />
    </div>
  );
}

export interface PersonItem {
  id: string;
  name: string;
  /** Selos curtos: "anfitrião", "ao vivo", "você". */
  tags?: string[];
  state?: OrbState;
  stateLabel?: string;
}

export function PeopleList({ items, dark = false }: { items: PersonItem[]; dark?: boolean }) {
  return (
    <ul className={`viewer-list${dark ? ' viewer-list--dark' : ''}`}>
      {items.map((v) => (
        <li key={v.id}>
          <Avatar name={v.name} />
          <span className="viewer-list__name">
            {v.name}
            {v.tags?.map((t) => (
              <span key={t} className={`person-tag${t === 'ao vivo' ? ' person-tag--live' : ''}`}>
                {t}
              </span>
            ))}
          </span>
          {v.stateLabel && (
            <span className="viewer-list__state">
              {v.state && <StatusOrb state={v.state} />}
              {v.stateLabel}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const STATE_LABEL: Record<RTCPeerConnectionState, string> = {
  new: 'entrando',
  connecting: 'conectando',
  connected: 'assistindo você',
  disconnected: 'instável',
  failed: 'sem conexão',
  closed: 'saiu',
};

export function connectionOrb(state: RTCPeerConnectionState): { state: OrbState; label: string } {
  return {
    state: state === 'connected' ? 'ok' : state === 'failed' ? 'bad' : state === 'disconnected' ? 'warn' : 'busy',
    label: STATE_LABEL[state],
  };
}
