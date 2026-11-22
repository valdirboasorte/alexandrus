import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LiveStream } from '@protocol';
import { AeroButton } from '../../components/ui/AeroButton.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { AeroToggle, Avatar, Note, Segmented } from '../../components/ui/controls.tsx';
import { useCopy, useToast } from '../../components/ui/toast.tsx';
import { viewersLabel } from '../../components/room/RoomBits.tsx';
import { useFullscreen, useIdle } from '../../hooks/useIdle.ts';
import { roomLink } from '../../lib/api.ts';
import { canCaptureScreen, detectBrowser } from '../../lib/capabilities.ts';
import { ROUTE_LABEL, SURFACE_LABEL } from '../../lib/capture.ts';
import { useNow } from './RoomChrome.tsx';
import { connectionOrb, PeopleList, ShareOpenRow, type PersonItem } from './ShareCard.tsx';
import { SourcePanel } from './SourcePanel.tsx';
import { DockButton, DockDivider, DockPanel, formatElapsed, Stage, StreamVideo } from './Stage.tsx';
import { HostStatsView, ViewerStatsView } from './StatsView.tsx';
import { QualityControls } from './QualityControls.tsx';
import type { RemoteView, RoomSession } from './useRoomSession.ts';

/*
 * O palco da sala, igual para todo mundo. Cada pessoa pode ter uma tela ao
 * vivo; quem assiste escolhe uma (abas) ou vê todas lado a lado. Só recebemos
 * as telas que estão na tela: uma no modo foco, todas no lado a lado.
 */

const VOLUME_KEY = 'alexandrus:volume';

function loadVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.85;
  } catch {
    return 0.85;
  }
}

/** Windows? (a Ponte só existe lá). Na dúvida, sim. */
export function useIsWindows() {
  const [windows, setWindows] = useState(true);
  useEffect(() => {
    void detectBrowser().then((b) => setWindows(b.os.startsWith('Windows')));
  }, []);
  return windows;
}

/** Tela em foco: a escolhida, senão a primeira de outra pessoa, senão a minha. */
function pickFocus(streams: LiveStream[], chosen: string | null, me: string | null): string | null {
  if (chosen && streams.some((s) => s.peerId === chosen)) return chosen;
  return streams.find((s) => s.peerId !== me)?.peerId ?? streams.find((s) => s.peerId === me)?.peerId ?? null;
}

function audioText(st: LiveStream) {
  return st.info.audio === 'none' || !st.info.audioEnabled ? 'sem som' : ROUTE_LABEL[st.info.audio].toLowerCase();
}

type Panel = 'quality' | 'people' | 'stats' | null;
type Layout = 'focus' | 'grid';

export function LiveRoom({ s, windows, onLeave }: { s: RoomSession; windows: boolean; onLeave?: () => void }) {
  const room = s.room!;
  const streams = room.streams;
  const me = s.me;
  const isHost = s.role === 'host';
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>('focus');
  const [audioPick, setAudioPick] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [drawer, setDrawer] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [volume, setVolume] = useState(loadVolume);
  const [muted, setMuted] = useState(false);
  const [autoMuted, setAutoMuted] = useState(false);
  const copy = useCopy();
  const toast = useToast();
  const now = useNow();

  const others = streams.filter((x) => x.peerId !== me);
  const grid = layout === 'grid' && streams.length > 1;
  const focusId = pickFocus(streams, chosen, me);
  const focused = streams.find((x) => x.peerId === focusId) ?? null;
  const focusIsMe = focusId !== null && focusId === me;
  // de quem vem o som: no foco, da tela em foco; no lado a lado, da escolhida (ou da primeira)
  const audioId = grid ? (others.some((x) => x.peerId === audioPick) ? audioPick : focusIsMe ? (others[0]?.peerId ?? null) : focusId) : focusIsMe ? null : focusId;
  const anyLive = streams.length > 0;
  const idle = useIdle(stageRef, 2800, anyLive && panel === null && !drawer);
  const { isFull, toggle } = useFullscreen(stageRef, videoRef);
  const close = useCallback(() => setPanel(null), []);
  const togglePanel = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  /* quais telas receber */
  const wanted = grid ? others.map((x) => x.peerId) : focusId && !focusIsMe ? [focusId] : [];
  const wantedKey = wanted.join('|');
  const { watch } = s;
  useEffect(() => {
    watch(wantedKey ? wantedKey.split('|') : []);
  }, [wantedKey, watch]);
  useEffect(() => () => watch([]), [watch]);

  /* volume lembrado */
  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* sem armazenamento */
    }
  }, [volume]);

  /* trocou a tela que toca som: o bloqueio de autoplay vale de novo para ela */
  useEffect(() => setAutoMuted(false), [audioId]);

  /* aviso quando alguém começa a compartilhar */
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(streams.map((x) => x.peerId));
    if (seen.current) {
      for (const st of streams) if (!seen.current.has(st.peerId) && st.peerId !== me) toast(`${st.name} começou a compartilhar a tela`);
    }
    seen.current = ids;
  }, [streams, me, toast]);

  /* atalhos: F tela cheia, M mudo (sem animação: teclado é ação repetida) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') toggle();
      if (e.key === 'm' || e.key === 'M') {
        setAutoMuted(false);
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const silent = muted || autoMuted || volume === 0;
  const blocked = useCallback(() => setAutoMuted(true), []);
  const view = (id: string): RemoteView | undefined => s.remote[id];
  const audioView = audioId ? view(audioId) : undefined;
  const hearing = audioId !== null && audioView?.media === 'connected';

  /* ---------------- o que ocupa o palco ---------------- */
  let media = null;
  if (grid) {
    media = (
      <div className="stage-grid" data-count={Math.min(streams.length, 4)}>
        {streams.map((st) => {
          const mine = st.peerId === me;
          const v = mine ? null : view(st.peerId);
          const plays = !mine && st.peerId === audioId;
          return (
            <figure key={st.peerId} className="stage-tile" data-audio={plays || undefined}>
              <StreamVideo
                className="stage-tile__video"
                stream={mine ? s.previewStream : (v?.stream ?? null)}
                preview={mine}
                muted={!plays || silent}
                volume={volume}
                onAutoplayBlocked={plays ? blocked : undefined}
                label={mine ? 'Sua tela' : `Tela de ${st.name}`}
              />
              {!mine && v?.media !== 'connected' && (
                <span className="stage-tile__status">
                  <span className="status-orb status-orb--busy" aria-hidden />
                  {v?.media === 'failed' ? 'Sem conexão, tentando de novo' : 'Conectando…'}
                </span>
              )}
              <figcaption className="stage-tile__bar glass glass--deep">
                <Avatar name={st.name} />
                <span className="stage-tile__name">
                  {mine ? 'Você' : st.name}
                  <span>{SURFACE_LABEL[st.info.source ?? 'monitor']}</span>
                </span>
                {!mine && (
                  <button
                    type="button"
                    className="dock-btn dock-btn--small"
                    aria-pressed={plays}
                    title={plays ? 'O som vem desta tela' : 'Ouvir esta tela'}
                    aria-label={plays ? `O som vem da tela de ${st.name}` : `Ouvir a tela de ${st.name}`}
                    onClick={() => setAudioPick(st.peerId)}
                  >
                    <Icon name={plays ? 'volume' : 'volumeOff'} />
                  </button>
                )}
                <button
                  type="button"
                  className="dock-btn dock-btn--small"
                  title="Ampliar"
                  aria-label={mine ? 'Ampliar a sua tela' : `Ampliar a tela de ${st.name}`}
                  onClick={() => {
                    setChosen(st.peerId);
                    setLayout('focus');
                  }}
                >
                  <Icon name="maximize" />
                </button>
              </figcaption>
            </figure>
          );
        })}
      </div>
    );
  } else if (focused) {
    media = focusIsMe ? (
      <StreamVideo key="me" stream={s.previewStream} preview muted videoRef={videoRef} label="Prévia da sua tela" />
    ) : (
      <StreamVideo
        key={focused.peerId}
        stream={view(focused.peerId)?.stream ?? null}
        muted={silent}
        volume={volume}
        videoRef={videoRef}
        onAutoplayBlocked={blocked}
        label={`Tela de ${focused.name}`}
      />
    );
  }

  /* ---------------- avisos no meio do palco ---------------- */
  let center = null;
  if (!anyLive) {
    center = (
      <div className="waiting glass glass--frost">
        <Avatar name={room.hostName} size="lg" />
        <p className="waiting__title">Ninguém está compartilhando ainda</p>
        <p className="waiting__text">
          {room.hostOnline ? 'Quando alguém começar, a tela aparece aqui sozinha. Pode deixar esta aba aberta.' : `${room.hostName} saiu por um instante; a sala espera até um minuto.`}
        </p>
        {!s.shareBlock && (
          <AeroButton variant="blue" icon="monitor" onClick={() => setDrawer(true)}>
            Compartilhar minha tela
          </AeroButton>
        )}
        <p className="waiting__meta">
          <Icon name="eye" />
          {viewersLabel(room.viewers)}
        </p>
      </div>
    );
  } else if (!grid && focused && !focusIsMe) {
    const v = view(focused.peerId);
    if (v?.media !== 'connected') {
      center = (
        <div className="waiting waiting--compact glass glass--deep">
          <span className="status-orb status-orb--busy" aria-hidden />
          <p className="waiting__title">{v?.media === 'failed' ? 'A conexão direta falhou' : v?.media === 'unstable' ? 'Conexão instável…' : `Conectando à tela de ${focused.name}…`}</p>
          {v?.media === 'failed' && (
            <>
              <p className="waiting__text">Tentando de novo. Redes muito restritas precisam de um servidor TURN configurado.</p>
              <AeroButton size="sm" variant="glass" icon="refresh" onClick={() => s.reconnect(focused.peerId)}>
                Tentar agora
              </AeroButton>
            </>
          )}
        </div>
      );
    }
  }

  const live = s.live;
  const alerts =
    s.error || live?.audioMissing || live?.route === 'system' ? (
      <div className="stage-alerts">
        {s.error && (
          <Note tone="bad">
            {s.error}{' '}
            <button type="button" className="link-btn" onClick={s.clearError}>
              Ok
            </button>
          </Note>
        )}
        {live?.audioMissing && !s.error && (
          <Note tone="warn">
            A sua tela está indo só com imagem: o navegador não entregou o som.{' '}
            {live.surface === 'window'
              ? 'Use “Trocar fonte” e, no seletor, deixe ligado “Compartilhar também o áudio do app”.'
              : live.surface === 'browser'
                ? 'Use “Trocar fonte” e deixe ligado “Compartilhar também o áudio da guia”.'
                : ''}
            {windows ? ' Se o seu navegador não tiver essa opção, a Alexandrus Ponte resolve.' : ''}
          </Note>
        )}
        {live?.route === 'system' && <Note tone="warn">Som do sistema inteiro: quem está na call pode se ouvir em eco.</Note>}
      </div>
    ) : null;

  /* ---------------- chips do topo ---------------- */
  const people = room.viewers + (room.hostOnline ? 1 : 0);
  const top = (
    <>
      <div className="stage-chip glass glass--deep">
        {anyLive ? (
          <span className="live-pill">
            <span className="live-pill__dot" />
            AO VIVO
          </span>
        ) : (
          <span className="live-pill live-pill--off">
            <span className="live-pill__dot" />
            AGUARDANDO
          </span>
        )}
        {!grid && focused?.info.startedAt && <span className="stage-chip__time">{formatElapsed(now - focused.info.startedAt)}</span>}
        <span className="stage-chip__text">
          <strong>{room.name}</strong>
          <span>
            {grid
              ? `${streams.length} telas ao vivo`
              : focused
                ? `${focusIsMe ? 'Você' : focused.name} · ${SURFACE_LABEL[focused.info.source ?? 'monitor']} · ${focusIsMe && live?.audioProcess ? `${ROUTE_LABEL[live.route]}: ${live.audioProcess}` : audioText(focused)}`
                : room.hostName}
          </span>
        </span>
      </div>
      <div className="stage-chip glass glass--deep">
        <button type="button" className="stage-chip__btn" onClick={() => togglePanel('people')} aria-expanded={panel === 'people'}>
          <Icon name="users" />
          {people}
          <span className="visually-hidden">{people === 1 ? ' pessoa na sala' : ' pessoas na sala'}</span>
        </button>
        <button type="button" className="stage-chip__btn" onClick={() => void copy(roomLink(room.code))}>
          <Icon name="link" />
          Copiar link
        </button>
      </div>
    </>
  );

  /* ---------------- abas das telas ---------------- */
  const tabs =
    streams.length > 1 ? (
      <div className="stream-tabs glass glass--deep" role="group" aria-label="Telas ao vivo">
        {streams.map((st) => {
          const mine = st.peerId === me;
          const active = !grid && st.peerId === focusId;
          return (
            <button
              key={st.peerId}
              type="button"
              className="stream-tab"
              aria-pressed={active}
              onClick={() => {
                setChosen(st.peerId);
                setLayout('focus');
              }}
            >
              <Avatar name={st.name} />
              <span className="stream-tab__name">{mine ? 'Você' : st.name}</span>
            </button>
          );
        })}
        <button type="button" className="stream-tab stream-tab--grid" aria-pressed={grid} onClick={() => setLayout(grid ? 'focus' : 'grid')}>
          <Icon name="grid" />
          <span className="stream-tab__name">Lado a lado</span>
        </button>
      </div>
    ) : null;

  /* ---------------- painéis ---------------- */
  const personItems = useMemo<PersonItem[]>(() => {
    const liveIds = new Set(streams.map((x) => x.peerId));
    const watching = new Map(s.watchers.map((w) => [w.id, w.state]));
    const mine: PersonItem = { id: me ?? 'me', name: s.myName, tags: ['você', ...(isHost ? ['anfitrião'] : []), ...(live ? ['ao vivo'] : [])] };
    return [
      mine,
      ...s.people.map((p) => {
        const w = watching.get(p.id);
        const orb = w ? connectionOrb(w) : null;
        return {
          id: p.id,
          name: p.name,
          tags: [...(p.role === 'host' ? ['anfitrião'] : []), ...(liveIds.has(p.id) ? ['ao vivo'] : [])],
          state: orb?.state,
          stateLabel: orb?.label,
        };
      }),
    ];
  }, [streams, s.watchers, s.people, s.myName, me, isHost, live]);

  const focusRemoteId = !grid && focused && !focusIsMe ? focused.peerId : grid ? audioId : null;
  const focusRemote = focusRemoteId ? streams.find((x) => x.peerId === focusRemoteId) : undefined;
  const { readRemoteStats } = s;
  const readFocus = useCallback(() => (focusRemoteId ? readRemoteStats(focusRemoteId) : null), [focusRemoteId, readRemoteStats]);

  const panelNode =
    panel &&
    (panel === 'quality' ? (
      <DockPanel title="Qualidade da sua tela" onClose={close}>
        <QualityControls value={s.settings} onChange={s.updateSettings} tone="dark" />
      </DockPanel>
    ) : panel === 'people' ? (
      <DockPanel title="Quem está na sala" onClose={close}>
        {isHost && (
          <div className="people-host">
            <ShareOpenRow room={room} onShareOpen={s.setShareOpen} dark />
            <Segmented
              label="Visibilidade"
              value={room.visibility}
              onChange={s.setVisibility}
              options={[
                { value: 'private', label: 'Privada', icon: 'lock' },
                { value: 'public', label: 'Pública', icon: 'globe' },
              ]}
            />
          </div>
        )}
        <PeopleList items={personItems} dark />
        {isHost && (
          <div className="people-end">
            {confirmEnd ? (
              <span className="confirm-inline">
                Encerrar para todos?
                <AeroButton size="sm" variant="red" onClick={s.endRoom}>
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
            )}
          </div>
        )}
      </DockPanel>
    ) : (
      <DockPanel title="Conexão" onClose={close}>
        {focusRemote && (
          <section className="stats-section">
            <h3>Recebendo de {focusRemote.name}</h3>
            <ViewerStatsView key={focusRemote.peerId} read={readFocus} sourceWidth={focusRemote.info.width} />
          </section>
        )}
        {live && (
          <section className="stats-section">
            <h3>Sua tela, por pessoa</h3>
            <HostStatsView read={s.readStats} viewers={s.watchers} />
          </section>
        )}
        {!focusRemote && !live && <p className="stats-empty">Nada chegando nem saindo agora.</p>}
      </DockPanel>
    ));

  /* ---------------- dock ---------------- */
  const shareHint = s.shareBlock === 'full' ? `Já há ${room.maxPresenters} telas ao vivo` : undefined;
  const dock = (
    <>
      {audioId && (
        <>
          <DockButton
            icon={silent ? 'volumeOff' : 'volume'}
            label={silent ? 'Ativar som' : 'Silenciar'}
            onClick={() => {
              if (autoMuted) setAutoMuted(false);
              else setMuted((m) => !m);
            }}
            pressed={silent}
          />
          <input
            className="aero-range dock-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={silent ? 0 : volume}
            aria-label="Volume"
            style={{ ['--fill' as string]: `${(silent ? 0 : volume) * 100}%` }}
            onChange={(e) => {
              const val = Number(e.target.value);
              setVolume(val);
              setMuted(val === 0);
              setAutoMuted(false);
            }}
          />
          <DockDivider />
        </>
      )}
      {live ? (
        <>
          <span className="dock-audio">
            <Icon name={s.audioEnabled && live.route !== 'none' ? 'volume' : 'volumeOff'} />
            <label htmlFor="live-audio">Áudio da sua tela</label>
            <AeroToggle id="live-audio" checked={s.audioEnabled} onChange={s.setAudioEnabled} label="Áudio da sua tela" disabled={live.route === 'none'} />
          </span>
          <DockButton icon="refresh" label="Trocar fonte" showLabel onClick={() => setDrawer(true)} />
          <DockButton icon="stop" label="Parar de compartilhar" showLabel tone="danger" onClick={s.stop} />
        </>
      ) : (
        s.shareBlock !== 'closed' && (
          <DockButton icon="monitor" label="Compartilhar tela" showLabel onClick={() => setDrawer(true)} disabled={s.shareBlock === 'full'} hint={shareHint} />
        )
      )}
      <DockDivider />
      {live && <DockButton icon="sliders" label="Qualidade" onClick={() => togglePanel('quality')} expanded={panel === 'quality'} />}
      <DockButton icon="users" label="Pessoas" onClick={() => togglePanel('people')} expanded={panel === 'people'} />
      <DockButton icon="signal" label="Conexão" onClick={() => togglePanel('stats')} expanded={panel === 'stats'} />
      <DockButton icon={isFull ? 'minimize' : 'maximize'} label={isFull ? 'Sair da tela cheia' : 'Tela cheia'} onClick={toggle} />
      {onLeave && (
        <>
          <DockDivider />
          <DockButton icon="exit" label="Sair" showLabel tone="danger" onClick={onLeave} />
        </>
      )}
    </>
  );

  return (
    <div className="live-wrap">
      <Stage
        ref={stageRef}
        media={media}
        idle={idle}
        waiting={!anyLive}
        label={focused ? (focusIsMe ? 'Prévia da sua tela' : `Tela de ${focused.name}`) : 'Sala'}
        top={top}
        tabs={tabs}
        overlay={
          center || alerts || (hearing && autoMuted) ? (
            <>
              {center}
              {alerts}
              {hearing && autoMuted && (
                <button type="button" className="unmute-pill" onClick={() => setAutoMuted(false)}>
                  <Icon name="volumeOff" />
                  Toque para ativar o som
                </button>
              )}
            </>
          ) : null
        }
        panel={panelNode}
        dock={dock}
      />

      {drawer && (
        <div className="drawer-scrim" onClick={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <aside className="drawer glass glass--frost" aria-label={live ? 'Trocar fonte' : 'Compartilhar sua tela'}>
            <div className="drawer__head">
              <h2>{live ? 'Trocar fonte' : 'Compartilhar sua tela'}</h2>
              <AeroButton size="sm" variant="glass" iconOnly icon="x" aria-label="Fechar" onClick={() => setDrawer(false)} />
            </div>
            <p className="drawer__hint">
              {live
                ? 'Quem assiste continua conectado; a imagem troca sem cair.'
                : `A sua tela vira mais uma aba na sala, ao lado das outras. Até ${room.maxPresenters} pessoas podem compartilhar ao mesmo tempo.`}
            </p>
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
              submitLabel={live ? 'Trocar agora' : 'Compartilhar'}
              onStart={(c, a) =>
                void s.start(c, a).then((ok) => {
                  if (!ok) return;
                  setDrawer(false);
                  // quem acabou de compartilhar vê a própria tela primeiro, se ninguém mais estiver ao vivo
                  if (!live && others.length === 0) setChosen(null);
                })
              }
            />
          </aside>
        </div>
      )}
    </div>
  );
}
