import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AeroButton, AeroLink } from '../../components/ui/AeroButton.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { AeroToggle, Note } from '../../components/ui/controls.tsx';
import { useCopy } from '../../components/ui/toast.tsx';
import { Bubbles } from '../../components/scenery/parts.tsx';
import { useFullscreen, useIdle } from '../../hooks/useIdle.ts';
import { roomLink } from '../../lib/api.ts';
import { canCaptureScreen, detectBrowser, type BrowserInfo } from '../../lib/capabilities.ts';
import { DEFAULT_SETTINGS, ROUTE_LABEL, SURFACE_LABEL } from '../../lib/capture.ts';
import { forgetHostKey, getSavedName } from '../../lib/identity.ts';
import { RoomBar, RoomMessage, useNow } from './RoomChrome.tsx';
import { ShareCard, ViewerList } from './ShareCard.tsx';
import { SourcePanel } from './SourcePanel.tsx';
import { DockButton, DockDivider, DockPanel, formatElapsed, Stage } from './Stage.tsx';
import { HostStatsView } from './StatsView.tsx';
import { QualityControls } from './QualityControls.tsx';
import { useHostSession, type HostSession } from './useHostSession.ts';

export function HostRoom({ code, hostKey, onBadKey }: { code: string; hostKey: string; onBadKey: () => void }) {
  const [hostName] = useState(() => getSavedName() || 'Anfitrião');
  const s = useHostSession(code, hostKey, hostName, DEFAULT_SETTINGS);
  const [browser, setBrowser] = useState<BrowserInfo | null>(null);

  useEffect(() => {
    void detectBrowser().then(setBrowser);
  }, []);

  useEffect(() => {
    if (s.fatal === 'bad-host-key') onBadKey();
  }, [s.fatal, onBadKey]);

  useEffect(() => {
    if (s.room) document.title = `${s.live ? '● ' : ''}${s.room.name} · Alexandrus`;
  }, [s.room, s.live]);

  // Fechar a aba no meio da transmissão pede confirmação.
  useEffect(() => {
    if (!s.live) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [s.live]);

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

  const windows = browser ? browser.os.startsWith('Windows') : true;
  return s.live ? <HostLive s={s} windows={windows} /> : <HostStudio s={s} windows={windows} />;
}

/* ================================================================== */
/* Estúdio: antes de transmitir                                        */
/* ================================================================== */

function HostStudio({ s, windows }: { s: HostSession; windows: boolean }) {
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
              <Bubbles count={9} seed={5} />
              <p className="studio__screen-text">
                {s.starting ? 'Escolha no seletor do navegador…' : 'Nada no ar ainda.'}
                <span>Quando você começar, a imagem aparece aqui exatamente como quem assiste vê.</span>
              </p>
            </div>
          </div>
          {s.room && <ShareCard room={s.room} viewers={s.viewers} onVisibility={s.setVisibility} />}
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
        </section>
      </main>
    </div>
  );
}

/* ================================================================== */
/* Ao vivo                                                             */
/* ================================================================== */

type Panel = 'quality' | 'viewers' | 'stats' | null;

function HostLive({ s, windows }: { s: HostSession; windows: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [switching, setSwitching] = useState(false);
  const idle = useIdle(stageRef, 2800, panel === null && !switching);
  const { isFull, toggle } = useFullscreen(stageRef, videoRef);
  const copy = useCopy();
  const now = useNow();
  const live = s.live!;
  const room = s.room;
  const startedAt = room?.stream.startedAt ?? null;
  const close = useCallback(() => setPanel(null), []);
  const togglePanel = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const audioRoute = live.route;

  return (
    <div className="live-wrap">
      <Stage
        ref={stageRef}
        stream={s.previewStream}
        videoRef={videoRef}
        preview
        idle={idle}
        label="Prévia da sua transmissão"
        top={
          <>
            <div className="stage-chip glass glass--deep">
              <span className="live-pill">
                <span className="live-pill__dot" />
                AO VIVO
              </span>
              <span className="stage-chip__time">{startedAt ? formatElapsed(now - startedAt) : '0:00'}</span>
              <span className="stage-chip__text">
                <strong>{room?.name}</strong>
                <span>
                  {SURFACE_LABEL[live.surface]} · {audioRoute === 'none' ? 'sem som' : live.audioProcess ? `${ROUTE_LABEL[audioRoute]}: ${live.audioProcess}` : ROUTE_LABEL[audioRoute]}
                </span>
              </span>
            </div>
            <div className="stage-chip glass glass--deep">
              <button type="button" className="stage-chip__btn" onClick={() => togglePanel('viewers')} aria-expanded={panel === 'viewers'}>
                <Icon name="eye" />
                {s.viewers.length}
                <span className="visually-hidden">{s.viewers.length === 1 ? ' espectador' : ' espectadores'}</span>
              </button>
              {room && (
                <button type="button" className="stage-chip__btn" onClick={() => void copy(roomLink(room.code))}>
                  <Icon name="link" />
                  Copiar link
                </button>
              )}
            </div>
          </>
        }
        overlay={
          (live.audioMissing || audioRoute === 'system' || s.error) && (
            <div className="stage-alerts">
              {s.error && <Note tone="bad">{s.error}</Note>}
              {live.audioMissing && !s.error && (
                <Note tone="warn">
                  O navegador não entregou o som desta fonte: a transmissão está indo só com imagem.
                  {windows ? ' Para levar o som de um app, use “Trocar fonte” e escolha a Ponte.' : ''}
                </Note>
              )}
              {audioRoute === 'system' && <Note tone="warn">Som do sistema inteiro: quem está na call pode se ouvir em eco.</Note>}
            </div>
          )
        }
        panel={
          panel && (
            <DockPanel title={panel === 'quality' ? 'Qualidade' : panel === 'viewers' ? 'Quem está assistindo' : 'Conexão por espectador'} onClose={close}>
              {panel === 'quality' && <QualityControls value={s.settings} onChange={s.updateSettings} tone="dark" />}
              {panel === 'viewers' &&
                (s.viewers.length ? <ViewerList viewers={s.viewers} dark /> : <p className="stats-empty">Ninguém ainda. Mande o link no Discord.</p>)}
              {panel === 'stats' && <HostStatsView read={s.readStats} viewers={s.viewers} />}
            </DockPanel>
          )
        }
        dock={
          <>
            <span className="dock-audio">
              <Icon name={s.audioEnabled && audioRoute !== 'none' ? 'volume' : 'volumeOff'} />
              <label htmlFor="live-audio">Áudio da fonte</label>
              <AeroToggle id="live-audio" checked={s.audioEnabled} onChange={s.setAudioEnabled} label="Áudio da fonte" disabled={audioRoute === 'none'} />
            </span>
            <DockDivider />
            <DockButton icon="refresh" label="Trocar fonte" showLabel onClick={() => setSwitching(true)} />
            <DockButton icon="sliders" label="Qualidade" onClick={() => togglePanel('quality')} expanded={panel === 'quality'} />
            <DockButton icon="users" label="Espectadores" onClick={() => togglePanel('viewers')} expanded={panel === 'viewers'} />
            <DockButton icon="signal" label="Conexão" onClick={() => togglePanel('stats')} expanded={panel === 'stats'} />
            <DockButton icon={isFull ? 'minimize' : 'maximize'} label={isFull ? 'Sair da tela cheia' : 'Tela cheia'} onClick={toggle} />
            <DockDivider />
            <DockButton icon="stop" label="Encerrar transmissão" showLabel tone="danger" onClick={s.stop} />
          </>
        }
      />

      {switching && (
        <div className="drawer-scrim" onClick={(e) => e.target === e.currentTarget && setSwitching(false)}>
          <aside className="drawer glass glass--frost" aria-label="Trocar fonte">
            <div className="drawer__head">
              <h2>Trocar fonte</h2>
              <AeroButton size="sm" variant="glass" iconOnly icon="x" aria-label="Fechar" onClick={() => setSwitching(false)} />
            </div>
            <p className="drawer__hint">Quem assiste continua conectado; a imagem troca sem cair.</p>
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
              submitLabel="Trocar agora"
              onStart={(c, a) => void s.start(c, a).then(() => setSwitching(false))}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
