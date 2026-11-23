import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AeroButton, AeroLink } from '../../components/ui/AeroButton.tsx';
import { Note } from '../../components/ui/controls.tsx';
import { Bubbles } from '../../components/scenery/parts.tsx';
import { canCaptureScreen } from '../../lib/capabilities.ts';
import { DEFAULT_SETTINGS } from '../../lib/capture.ts';
import { forgetHostKey, getSavedName } from '../../lib/identity.ts';
import { LiveRoom, useIsWindows } from './LiveRoom.tsx';
import { OutdatedMessage, RoomBar, RoomMessage } from './RoomChrome.tsx';
import { ShareCard } from './ShareCard.tsx';
import { SourcePanel } from './SourcePanel.tsx';
import { useRoomSession, type RoomSession } from './useRoomSession.ts';

export function HostRoom({ code, hostKey, onBadKey }: { code: string; hostKey: string; onBadKey: () => void }) {
  const [hostName] = useState(() => getSavedName() || 'Anfitrião');
  const s = useRoomSession(code, { role: 'host', hostKey, name: hostName }, DEFAULT_SETTINGS);
  const windows = useIsWindows();
  const anyLive = (s.room?.streams.length ?? 0) > 0;

  useEffect(() => {
    if (s.fatal === 'bad-host-key') onBadKey();
  }, [s.fatal, onBadKey]);

  useEffect(() => {
    if (s.room) document.title = `${anyLive ? '● ' : ''}${s.room.name} · Alexandrus`;
  }, [s.room, anyLive]);

  // Fechar a aba no meio da transmissão pede confirmação.
  useEffect(() => {
    if (!s.live) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [s.live]);

  if (s.fatal === 'outdated') return <OutdatedMessage />;
  if (s.fatal === 'not-found') {
    return (
      <RoomMessage title="Esta sala não existe mais">
        <p>Salas somem quando o anfitrião fica mais de um minuto fora. Crie outra em segundos.</p>
      </RoomMessage>
    );
  }
  if (s.ended) {
    forgetHostKey(code);
    return (
      <RoomMessage
        title={s.ended === 'left' || s.ended === 'host-ended' ? 'Sala encerrada' : 'A sala expirou'}
        actions={
          <>
            <AeroLink to="/criar" variant="green" icon="plus">
              Criar outra sala
            </AeroLink>
            <AeroLink to="/" variant="glass" icon="home">
              Início
            </AeroLink>
          </>
        }
      >
        <p>Todos que estavam assistindo foram avisados. O link não funciona mais.</p>
      </RoomMessage>
    );
  }

  // Alguém ao vivo (eu ou outra pessoa): o palco. Ninguém: o estúdio para começar.
  return s.live || anyLive ? <LiveRoom s={s} windows={windows} /> : <HostStudio s={s} windows={windows} />;
}

/* ================================================================== */
/* Estúdio: antes de transmitir                                        */
/* ================================================================== */

function HostStudio({ s, windows }: { s: RoomSession; windows: boolean }) {
  const navigate = useNavigate();
  const [confirmEnd, setConfirmEnd] = useState(false);

  return (
    <div className="studio-wrap">
      <RoomBar
        room={s.room}
        connection={s.connection}
        actions={
          confirmEnd ? (
            <span className="confirm-inline">
              Encerrar para todos?
              <AeroButton size="sm" variant="red" onClick={() => (s.endRoom(), navigate('/', { viewTransition: true }))}>
                Encerrar
              </AeroButton>
              <AeroButton size="sm" variant="glass" onClick={() => setConfirmEnd(false)}>
                Cancelar
              </AeroButton>
            </span>
          ) : (
            <AeroButton size="sm" variant="glass" icon="power" onClick={() => setConfirmEnd(true)}>
              Encerrar sala
            </AeroButton>
          )
        }
      />

      <main id="conteudo" className="studio">
        <div className="studio__left">
          <div className="studio__screen" aria-hidden>
            <div className="studio__aquarium">
              <Bubbles count={5} seed={5} />
              <p className="studio__screen-text">
                {s.starting ? 'Escolha no seletor do navegador…' : 'Nada no ar ainda.'}
                <span>Quando você começar, a imagem aparece aqui exatamente como quem assiste vê.</span>
              </p>
            </div>
          </div>
          {s.room && <ShareCard room={s.room} people={s.people} onVisibility={s.setVisibility} onShareOpen={s.setShareOpen} />}
        </div>

        <section className="studio__panel glass glass--frost" aria-labelledby="studio-title">
          <h1 id="studio-title" className="studio__title">
            Começar a transmitir
          </h1>
          {s.error && (
            <Note tone="bad">
              {s.error}{' '}
              <button type="button" className="link-btn" onClick={s.clearError}>
                Ok
              </button>
            </Note>
          )}
          <SourcePanel
            ponte={s.ponte}
            ponteStatus={s.ponteStatus}
            windows={windows}
            canCapture={canCaptureScreen()}
            settings={s.settings}
            onSettings={s.updateSettings}
            audioEnabled={s.audioEnabled}
            onAudioEnabled={s.setAudioEnabled}
            busy={s.starting}
            submitLabel="Iniciar compartilhamento"
            onStart={(c, a) => void s.start(c, a)}
          />
          <p className="studio__more">
            {s.room?.shareOpen
              ? `Quem entrar também pode compartilhar a própria tela (até ${s.room.maxPresenters} ao mesmo tempo); todo mundo escolhe qual assistir.`
              : 'Só você compartilha nesta sala. Dá para liberar para todos no cartão do convite.'}
          </p>
        </section>
      </main>
    </div>
  );
}
