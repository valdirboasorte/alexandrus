import { useEffect, useState } from 'react';
import type { PonteAudioSession } from '@protocol';
import { Icon } from '../../components/ui/Icon.tsx';
import { isBrowserApp, isVoiceApp, sortSessions, type PonteClient } from '../../lib/ponte.ts';

interface Props {
  ponte: PonteClient;
  mode: 'include' | 'exclude';
  value: number | null;
  onChange: (pid: number, name: string) => void;
}

/** Lista real dos programas com sessão de áudio no Windows, vinda da Ponte. */
export function PonteSessions({ ponte, mode, value, onChange }: Props) {
  const [items, setItems] = useState<PonteAudioSession[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      ponte.listSessions().then((list) => {
        if (alive) setItems(sortSessions(list));
      });
    void load();
    const id = window.setInterval(load, 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [ponte]);

  // Modo "tudo menos": sugere o app de voz automaticamente.
  useEffect(() => {
    if (mode !== 'exclude' || value !== null || !items) return;
    const voice = items.find((s) => isVoiceApp(s.name));
    if (voice) onChange(voice.pid, voice.name);
  }, [mode, value, items, onChange]);

  if (!items) return <p className="ponte-list__empty">Perguntando à Ponte quais programas estão tocando som…</p>;
  if (items.length === 0)
    return (
      <p className="ponte-list__empty">
        Nenhum programa com som aberto agora. Abra o jogo, deixe algum som tocar e a lista atualiza sozinha.
      </p>
    );

  return (
    <ul className="ponte-list" role="radiogroup" aria-label={mode === 'include' ? 'Programa cujo som vai na transmissão' : 'Programa que fica de fora'}>
      {items.map((s) => {
        const voice = isVoiceApp(s.name);
        const blocked = mode === 'include' && voice;
        const selected = value === s.pid;
        return (
          <li key={s.pid}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={blocked}
              className="ponte-item"
              onClick={() => onChange(s.pid, s.name)}
            >
              <span className={`ponte-item__icon${voice ? ' ponte-item__icon--voice' : ''}`}>
                <Icon name={voice ? 'headphones' : isBrowserApp(s.name) ? 'globe' : 'gamepad'} />
              </span>
              <span className="ponte-item__text">
                <strong>{s.title || s.name}</strong>
                <span>
                  {s.title ? `${s.name} · ` : ''}
                  {blocked
                    ? 'app de voz: fica de fora para não dar eco'
                    : isBrowserApp(s.name) && mode === 'include'
                      ? 'leva o som de todas as abas desse navegador'
                      : s.state === 'active'
                        ? 'tocando som agora'
                        : 'aberto, em silêncio'}
                </span>
              </span>
              {s.state === 'active' && !blocked && (
                <span className="ponte-item__wave" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {selected && <Icon name="check" className="ponte-item__check" strokeWidth={2.8} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
