import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { LIMITS, type Visibility } from '@protocol';
import { AeroButton } from '../components/ui/AeroButton.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { Note, Segmented, TextField } from '../components/ui/controls.tsx';
import { Globe } from '../components/brand/Logo.tsx';
import { api } from '../lib/api.ts';
import { getSavedName, rememberHostKey, saveName } from '../lib/identity.ts';
import './pages.css';

export function CreateRoomPage() {
  const navigate = useNavigate();
  const [hostName, setHostName] = useState(getSavedName);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const who = hostName.trim() || 'Anfitrião';
      const { room, hostKey } = await api.createRoom({ name: name.trim(), hostName: who, visibility });
      rememberHostKey(room.code, hostKey);
      saveName(who);
      navigate(`/sala/${room.code}`, { viewTransition: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Criar uma sala</h1>
        <p className="page-lead">A sala nasce com um código e um link. Você escolhe o que compartilhar logo em seguida, já dentro dela.</p>
      </header>

      <div className="split">
        <form className="glass glass--frost aero-window" onSubmit={submit}>
          <div className="aero-window__bar">
            <Globe size={30} spin={false} />
            Nova sala
          </div>
          <div className="aero-window__body form-stack">
            <TextField
              label="Nome da sala"
              icon="sparkle"
              placeholder="Noite de jogo"
              value={name}
              maxLength={LIMITS.roomNameMax}
              onChange={(e) => setName(e.target.value)}
              hint="Aparece para quem entra. Se deixar em branco, vira “Sala de” + seu nome."
            />
            <TextField
              label="Seu nome"
              icon="user"
              placeholder="Como os outros vão te ver"
              value={hostName}
              maxLength={LIMITS.personNameMax}
              autoComplete="nickname"
              onChange={(e) => setHostName(e.target.value)}
            />
            <div className="field">
              <span className="field__label" id="vis-label">
                Quem pode encontrar a sala
              </span>
              <Segmented
                label="Visibilidade da sala"
                value={visibility}
                onChange={setVisibility}
                options={[
                  { value: 'private', label: 'Privada', icon: 'lock' },
                  { value: 'public', label: 'Pública', icon: 'globe' },
                ]}
              />
              <p className="choice-hint">
                <Icon name={visibility === 'private' ? 'lock' : 'globe'} />
                {visibility === 'private'
                  ? 'Só entra quem tiver o código ou o link.'
                  : 'Aparece na lista de Salas para qualquer pessoa. O link continua funcionando igual.'}
              </p>
            </div>

            {error && <Note tone="bad">{error}</Note>}

            <div className="form-actions">
              <AeroButton type="submit" variant="green" icon="plus" disabled={busy}>
                {busy ? 'Criando…' : 'Criar sala'}
              </AeroButton>
            </div>
          </div>
        </form>

        <aside className="side-card glass glass--frost" aria-labelledby="depois-title">
          <h2 id="depois-title">Depois de criar</h2>
          <ul className="bullets">
            <li>
              <Icon name="link" />
              <span>Você recebe o código e o link para colar no Discord.</span>
            </li>
            <li>
              <Icon name="monitor" />
              <span>Escolhe a fonte: tela inteira, janela, aba ou um jogo.</span>
            </li>
            <li>
              <Icon name="volume" />
              <span>Liga o “Áudio da fonte”. Seu microfone nunca é capturado.</span>
            </li>
            <li>
              <Icon name="clock" />
              <span>Se você fechar a aba, a sala espera um minuto e depois some.</span>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
