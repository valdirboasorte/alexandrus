import { useEffect, useState } from 'react';
import type { RoomSummary } from '@protocol';
import { CodeEntry } from '../components/room/CodeEntry.tsx';
import { RoomMeta, RoomStatusPill } from '../components/room/RoomBits.tsx';
import { AeroLink } from '../components/ui/AeroButton.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { Avatar, Note, TextField } from '../components/ui/controls.tsx';
import { api, ApiFailure } from '../lib/api.ts';
import { getSavedName, saveName } from '../lib/identity.ts';
import './pages.css';

type Preview = { status: 'none' } | { status: 'loading' } | { status: 'found'; room: RoomSummary } | { status: 'missing' } | { status: 'error'; message: string };

export function JoinRoomPage() {
  const [code, setCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>({ status: 'none' });
  const [name, setName] = useState(getSavedName);

  useEffect(() => {
    if (!code) {
      setPreview({ status: 'none' });
      return;
    }
    let alive = true;
    setPreview({ status: 'loading' });
    api
      .getRoom(code)
      .then((room) => alive && setPreview({ status: 'found', room }))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiFailure && e.status === 404) setPreview({ status: 'missing' });
        else setPreview({ status: 'error', message: (e as Error).message });
      });
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Entrar em uma sala</h1>
        <p className="page-lead">Digite o código que te mandaram ou cole o link inteiro. Você vê quem está transmitindo antes de entrar.</p>
      </header>

      <div className="split">
        <div className="form-stack">
          <CodeEntry autoFocus onCode={setCode} />

          {preview.status === 'loading' && (
            <div className="room-preview glass glass--frost" aria-busy="true">
              <span className="status-orb status-orb--busy" aria-hidden />
              <p>Procurando a sala…</p>
            </div>
          )}
          {preview.status === 'found' && (
            <div className="room-preview glass glass--frost">
              <Avatar name={preview.room.hostName} size="lg" />
              <div>
                <p className="room-preview__name">{preview.room.name}</p>
                <p className="room-preview__meta">
                  <RoomStatusPill room={preview.room} />
                  <RoomMeta room={preview.room} />
                </p>
              </div>
              <AeroLink to={`/sala/${preview.room.code}`} variant="green" icon="play" chevron onClick={() => saveName(name)}>
                Entrar
              </AeroLink>
            </div>
          )}
          {preview.status === 'missing' && <Note tone="warn">Nenhuma sala com esse código agora. Confira com quem te convidou: salas somem quando o anfitrião vai embora.</Note>}
          {preview.status === 'error' && <Note tone="bad">{preview.message}</Note>}
        </div>

        <aside className="side-card glass glass--frost">
          <h2>Como você vai aparecer</h2>
          <TextField
            label="Seu nome (opcional)"
            icon="user"
            placeholder="Visitante"
            value={name}
            maxLength={32}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => saveName(name)}
            hint="Só o anfitrião vê a lista de quem está assistindo."
          />
          <ul className="bullets" style={{ marginTop: 20 }}>
            <li>
              <Icon name="headphones" />
              <span>Use fone de ouvido se estiver numa call: assim o som do jogo não vaza para o seu microfone.</span>
            </li>
            <li>
              <Icon name="micOff" />
              <span>O Alexandrus não usa seu microfone nem sua câmera. Para conversar, continue no Discord.</span>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
