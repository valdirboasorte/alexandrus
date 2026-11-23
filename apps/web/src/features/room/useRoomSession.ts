import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OFFLINE_STREAM,
  PROTOCOL_VERSION,
  type AudioRoute,
  type EndReason,
  type PeerInfo,
  type Role,
  type RoomSummary,
  type SignalData,
  type SourceKind,
  type StreamInfo,
  type Visibility,
} from '@protocol';
import { api } from '../../lib/api.ts';
import { applyVideoSettings, captureDisplay, CaptureCancelled, FILM_BUFFER_MS, QUALITY_BITRATE, type CaptureSettings, type SourceChoice } from '../../lib/capture.ts';
import { PonteClient, type PonteStatus } from '../../lib/ponte.ts';
import { Broadcaster, type WatcherConnection } from '../../lib/rtc/Broadcaster.ts';
import { StreamReceiver, type ReceiverState } from '../../lib/rtc/StreamReceiver.ts';
import type { SenderStats, ViewerStats } from '../../lib/rtc/stats.ts';
import { SignalingClient, type SignalingState } from '../../lib/signaling.ts';
import { signalingUrl } from '../../lib/server-url.ts';

/*
 * Uma sessão de sala para qualquer participante. Todo mundo pode:
 * - compartilhar a própria tela (o anfitrião sempre; os outros se ele deixar),
 *   com até LIMITS.maxPresenters telas ao vivo na sala;
 * - assistir uma ou várias telas dos outros (watch), cada uma com a sua
 *   conexão direta com quem compartilha.
 * O anfitrião, além disso, manda na sala: nome, visibilidade, quem compartilha, encerrar.
 */

/** Como o som deve ser obtido para a próxima captura. */
export type AudioRequest =
  | { kind: 'none' }
  | { kind: 'browser' } // aba ou janela, pelo navegador
  | { kind: 'system' } // sistema inteiro, com consentimento
  | { kind: 'ponte'; pid: number; name: string; mode: 'include' | 'exclude' };

export interface LiveCapture {
  surface: SourceKind;
  label: string;
  route: AudioRoute;
  audioProcess: string | null;
  /** O som pedido não veio (navegador sem áudio de janela, Ponte falhou…). */
  audioMissing: boolean;
}

/** Alguém recebendo a minha tela agora. */
export type Watcher = WatcherConnection & { joinedAt?: number };

/** A tela de outra pessoa, do jeito que chega aqui. */
export interface RemoteView {
  stream: MediaStream | null;
  media: ReceiverState;
}

export type RoomFatal = 'not-found' | 'bad-host-key' | 'room-full' | 'outdated';

/** Por que não dá para compartilhar agora. */
export type ShareBlock = 'closed' | 'full' | null;

export interface RoomIdentity {
  role: Role;
  hostKey?: string;
  name: string;
}

export interface RoomSession {
  role: Role;
  /** Meu id na sala (muda se o servidor cair e eu reconectar). */
  me: string | null;
  myName: string;
  connection: SignalingState;
  room: RoomSummary | null;
  /** Todos os outros participantes. */
  people: PeerInfo[];

  /* minha tela */
  live: LiveCapture | null;
  starting: boolean;
  audioEnabled: boolean;
  settings: CaptureSettings;
  previewStream: MediaStream | null;
  watchers: Watcher[];
  ponte: PonteClient;
  ponteStatus: PonteStatus;
  shareBlock: ShareBlock;
  start: (choice: SourceChoice, audio: AudioRequest) => Promise<boolean>;
  stop: () => void;
  setAudioEnabled: (on: boolean) => void;
  updateSettings: (s: CaptureSettings) => void;
  readStats: () => Promise<Map<string, SenderStats>>;

  /* telas dos outros */
  remote: Record<string, RemoteView>;
  /** Quais telas eu quero receber agora (ids de quem compartilha). */
  watch: (ids: string[]) => void;
  readRemoteStats: (id: string) => Promise<ViewerStats> | null;
  reconnect: (id: string) => void;

  /* sala */
  error: string | null;
  clearError: () => void;
  ended: EndReason | 'left' | null;
  fatal: RoomFatal | null;
  setVisibility: (v: Visibility) => void;
  setShareOpen: (open: boolean) => void;
  rename: (name: string) => void;
  endRoom: () => void;
}

interface Tracks {
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  streams: MediaStream[];
  fromPonte: boolean;
}

const NO_TRACKS: Tracks = { video: null, audio: null, streams: [], fromPonte: false };
const STUN: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

function stopTracks(t: Tracks) {
  for (const s of t.streams) for (const tr of s.getTracks()) tr.stop();
  t.video?.stop();
  // A faixa da Ponte é um clone: parar não afeta o grafo de áudio.
  t.audio?.stop();
}

function shareBlockFor(room: RoomSummary | null, role: Role, me: string | null, sharing: boolean): ShareBlock {
  if (!room) return 'closed';
  if (role !== 'host' && !room.shareOpen) return 'closed';
  if (!sharing && room.streams.filter((s) => s.peerId !== me).length >= room.maxPresenters) return 'full';
  return null;
}

export function useRoomSession(code: string, identity: RoomIdentity, initialSettings: CaptureSettings): RoomSession {
  const { role, hostKey, name } = identity;
  const [connection, setConnection] = useState<SignalingState>('connecting');
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [people, setPeople] = useState<PeerInfo[]>([]);
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [live, setLive] = useState<LiveCapture | null>(null);
  const [starting, setStarting] = useState(false);
  const [audioEnabled, setAudioEnabledState] = useState(true);
  const [settings, setSettings] = useState(initialSettings);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<Record<string, RemoteView>>({});
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<RoomSession['ended']>(null);
  const [fatal, setFatal] = useState<RoomFatal | null>(null);
  const [ponteStatus, setPonteStatus] = useState<PonteStatus>('idle');

  const sigRef = useRef<SignalingClient | null>(null);
  const bcRef = useRef<Broadcaster | null>(null);
  const ponteRef = useRef<PonteClient>(new PonteClient());
  const tracksRef = useRef<Tracks>(NO_TRACKS);
  const streamInfoRef = useRef<StreamInfo>({ ...OFFLINE_STREAM });
  const peersRef = useRef(new Map<string, PeerInfo>());
  const roomRef = useRef<RoomSummary | null>(null);
  const meRef = useRef<string | null>(null);
  const receiversRef = useRef(new Map<string, StreamReceiver>());
  const wantedRef = useRef<string[]>([]);
  const iceRef = useRef<RTCIceServer[]>(STUN);
  const settingsRef = useRef(settings);
  const audioOnRef = useRef(audioEnabled);
  settingsRef.current = settings;
  audioOnRef.current = audioEnabled;

  const refreshWatchers = useCallback(() => {
    const bc = bcRef.current;
    if (!bc) return;
    setWatchers(
      bc.viewers().map((v) => {
        const p = peersRef.current.get(v.id);
        return { ...v, name: p?.name ?? v.name, joinedAt: p?.joinedAt };
      }),
    );
  }, []);

  const refreshPeople = useCallback(() => {
    setPeople([...peersRef.current.values()].sort((a, b) => a.joinedAt - b.joinedAt));
  }, []);

  const publishStream = useCallback((info: StreamInfo) => {
    streamInfoRef.current = info;
    sigRef.current?.send({ t: 'stream', info });
  }, []);

  /* ---------------- telas dos outros ---------------- */

  const dropReceiver = useCallback((id: string, bye: boolean) => {
    const rx = receiversRef.current.get(id);
    if (!rx) return;
    rx.close(bye);
    receiversRef.current.delete(id);
    setRemote((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  }, []);

  /** Abre/fecha conexões para que eu receba exatamente as telas pedidas que estão ao vivo. */
  const reconcile = useCallback(() => {
    const sig = sigRef.current;
    if (!sig) return;
    const liveIds = new Set((roomRef.current?.streams ?? []).map((s) => s.peerId));
    const want = new Set(wantedRef.current.filter((id) => id !== meRef.current && liveIds.has(id)));
    for (const id of [...receiversRef.current.keys()]) {
      if (!want.has(id)) dropReceiver(id, peersRef.current.has(id));
    }
    const bufferFor = (id: string) => (roomRef.current?.streams.find((s) => s.peerId === id)?.info.content === 'film' ? FILM_BUFFER_MS : 0);
    for (const [id, rx] of receiversRef.current) rx.setBuffer(bufferFor(id));
    for (const id of want) {
      if (receiversRef.current.has(id)) continue;
      const rx = new StreamReceiver(
        sig,
        id,
        iceRef.current,
        (stream) => setRemote((r) => (receiversRef.current.get(id) === rx ? { ...r, [id]: { stream, media: r[id]?.media ?? 'connecting' } } : r)),
        (media) => setRemote((r) => (receiversRef.current.get(id) === rx ? { ...r, [id]: { stream: r[id]?.stream ?? null, media } } : r)),
      );
      receiversRef.current.set(id, rx);
      rx.setBuffer(bufferFor(id));
      setRemote((r) => ({ ...r, [id]: { stream: null, media: 'connecting' } }));
      rx.start();
    }
  }, [dropReceiver]);

  const watch = useCallback(
    (ids: string[]) => {
      wantedRef.current = ids;
      reconcile();
    },
    [reconcile],
  );

  /* ---------------- parar ---------------- */
  /** silent = o servidor já sabe (recusou ou derrubou a tela): não avisa de novo. */
  const stopInternal = useCallback(
    (silent: boolean) => {
      const t = tracksRef.current;
      if (t.fromPonte) ponteRef.current.stop();
      stopTracks(t);
      tracksRef.current = NO_TRACKS;
      void bcRef.current?.setTracks(null, null);
      setPreviewStream(null);
      setLive(null);
      if (silent) streamInfoRef.current = { ...OFFLINE_STREAM };
      else publishStream({ ...OFFLINE_STREAM });
    },
    [publishStream],
  );
  const stop = useCallback(() => stopInternal(false), [stopInternal]);
  const stopRef = useRef(stopInternal);
  stopRef.current = stopInternal;

  /* ---------------- conexão ---------------- */
  useEffect(() => {
    const sig = new SignalingClient(signalingUrl(code));
    sigRef.current = sig;
    const bc = new Broadcaster(sig, iceRef.current, refreshWatchers);
    bcRef.current = bc;
    const receivers = receiversRef.current;
    void api
      .ice()
      .then((c) => {
        iceRef.current = c.iceServers;
        bc.setIceServers(c.iceServers);
        for (const rx of receivers.values()) rx.setIceServers(c.iceServers);
      })
      .catch(() => {});

    const ponte = ponteRef.current;
    ponte.onStatus = setPonteStatus;
    ponte.onStopped = (m) => {
      if (!tracksRef.current.fromPonte) return;
      if (m.reason === 'process-exited') setError('O aplicativo cujo som estava indo foi fechado. A imagem continua, sem som.');
      else if (m.reason === 'error') setError('A Ponte foi fechada. A imagem continua, sem som.');
    };
    ponte.onError = (msg) => setError(msg);

    let retries = 0;
    let retryTimer = 0;
    const join = () =>
      role === 'host'
        ? sig.send({ t: 'join', v: PROTOCOL_VERSION, code, role: 'host', hostKey: hostKey ?? '', name })
        : sig.send({ t: 'join', v: PROTOCOL_VERSION, code, role: 'viewer', name: name || 'Visitante' });

    const routeSignal = (from: string, data: SignalData) => {
      const toMyScreen = data.kind === 'answer' || data.kind === 'request-offer' || data.kind === 'bye' || (data.kind === 'ice' && data.side === 'sub');
      if (toMyScreen) void bc.handleSignal(from, data, peersRef.current.get(from)?.name ?? 'Visitante');
      else void receiversRef.current.get(from)?.handleSignal(data);
    };

    sig.onState(setConnection);
    sig.onOpen(join);
    sig.on((msg) => {
      switch (msg.t) {
        case 'joined':
          retries = 0;
          meRef.current = msg.you;
          setMe(msg.you);
          peersRef.current = new Map(msg.peers.map((p) => [p.id, p]));
          refreshPeople();
          // Reconectou: as conexões antigas eram com ids antigos. Quem assiste pede de novo.
          bc.closeAll();
          for (const id of [...receiversRef.current.keys()]) dropReceiver(id, false);
          roomRef.current = msg.room;
          setRoom(msg.room);
          if (streamInfoRef.current.live) sig.send({ t: 'stream', info: streamInfoRef.current });
          reconcile();
          break;
        case 'peer-joined':
          peersRef.current.set(msg.peer.id, msg.peer);
          refreshPeople();
          break;
        case 'peer-left':
          peersRef.current.delete(msg.peerId);
          refreshPeople();
          bc.removeViewer(msg.peerId);
          break;
        case 'room': {
          roomRef.current = msg.room;
          setRoom(msg.room);
          const sharing = tracksRef.current.video !== null;
          if (sharing && role !== 'host' && !msg.room.shareOpen) {
            stopRef.current(true);
            setError('O anfitrião desligou o compartilhamento para os participantes.');
          }
          reconcile();
          break;
        }
        case 'signal':
          routeSignal(msg.from, msg.data);
          break;
        case 'ended':
          setEnded(msg.reason);
          break;
        case 'error':
          if (msg.code === 'host-already-connected' && retries < 6) {
            // A aba anterior (recarregada) ainda não fechou o socket.
            retries++;
            retryTimer = window.setTimeout(join, 1200);
          } else if (msg.code === 'room-not-found') {
            setFatal('not-found');
          } else if (msg.code === 'bad-host-key' || msg.code === 'room-full' || msg.code === 'outdated') {
            setFatal(msg.code);
          } else if (msg.code === 'stage-full' || msg.code === 'share-closed') {
            // A minha tela foi recusada: para a captura sem avisar de novo.
            if (tracksRef.current.video) {
              stopRef.current(true);
              setError(msg.message);
            }
          } else if (msg.code !== 'peer-not-found') {
            // peer-not-found: corrida normal (a pessoa saiu antes do sinal chegar).
            setError(msg.message);
          }
          break;
      }
    });

    return () => {
      window.clearTimeout(retryTimer);
      stopTracks(tracksRef.current);
      tracksRef.current = NO_TRACKS;
      for (const rx of receivers.values()) rx.close(false);
      receivers.clear();
      bc.close();
      sig.close();
      ponte.dispose();
    };
  }, [code, role, hostKey, name, refreshWatchers, refreshPeople, reconcile, dropReceiver]);

  /* ---------------- começar / trocar de fonte ---------------- */
  const start = useCallback(
    async (choice: SourceChoice, audio: AudioRequest): Promise<boolean> => {
      setError(null);
      const sharing = tracksRef.current.video !== null;
      const block = shareBlockFor(roomRef.current, role, meRef.current, sharing);
      if (block) {
        setError(block === 'full' ? 'Já há telas demais ao vivo nesta sala. Espere alguém parar.' : 'O anfitrião não liberou o compartilhamento para os participantes.');
        return false;
      }
      setStarting(true);
      const s = settingsRef.current;
      try {
        // 1) O seletor do navegador primeiro: ele exige o clique "fresco".
        const cap = await captureDisplay(choice, s, {
          wantBrowserAudio: audio.kind === 'browser' || audio.kind === 'system',
          allowSystemAudio: audio.kind === 'system',
        });

        // 2) O som: do navegador ou da Ponte.
        let audioTrack: MediaStreamTrack | null = cap.browserAudio;
        let route: AudioRoute = cap.browserAudioRoute;
        let audioProcess: string | null = null;
        let audioMissing = false;
        let fromPonte = false;
        if (audio.kind === 'ponte') {
          try {
            const { track } = await ponteRef.current.start(audio.pid, audio.mode);
            audioTrack = track;
            route = audio.mode === 'include' ? 'process' : 'process-exclude';
            audioProcess = audio.name;
            fromPonte = true;
          } catch (e) {
            audioMissing = true;
            setError(`A Ponte não conseguiu capturar o som: ${(e as Error).message}`);
          }
        } else if (audio.kind !== 'none' && !audioTrack) {
          audioMissing = true;
        }

        // 3) Troca as faixas em todas as conexões, sem renegociar.
        const old = tracksRef.current;
        tracksRef.current = { video: cap.video, audio: audioTrack, streams: [cap.stream], fromPonte };
        if (audioTrack) audioTrack.enabled = audioOnRef.current;
        const bc = bcRef.current!;
        await bc.setTracks(cap.video, audioTrack);
        await bc.setLimits({ maxBitrate: QUALITY_BITRATE[s.quality].bps, maxFramerate: s.fps, content: s.content, auto: s.auto });
        // As faixas antigas só param depois da troca: quem assiste não vê piscar.
        stopTracks(old);
        if (old.fromPonte && !fromPonte) ponteRef.current.stop();

        // "Parar de compartilhar" na barra do navegador.
        cap.video.addEventListener('ended', () => {
          if (tracksRef.current.video === cap.video) stopRef.current(false);
        });

        const vs = cap.video.getSettings();
        setPreviewStream(new MediaStream([cap.video]));
        setLive({ surface: cap.surface, label: cap.label, route, audioProcess, audioMissing });
        publishStream({
          live: true,
          source: cap.surface,
          audio: route,
          audioEnabled: route !== 'none' && audioOnRef.current,
          audioProcess,
          width: vs.width,
          height: vs.height,
          fps: vs.frameRate ? Math.round(vs.frameRate) : s.fps,
          startedAt: streamInfoRef.current.live ? streamInfoRef.current.startedAt : Date.now(),
          content: s.content,
        });
        return true;
      } catch (e) {
        if (!(e instanceof CaptureCancelled)) setError(`Não foi possível capturar: ${(e as Error).message}`);
        return false;
      } finally {
        setStarting(false);
      }
    },
    [publishStream, role],
  );

  const setAudioEnabled = useCallback(
    (on: boolean) => {
      setAudioEnabledState(on);
      const a = tracksRef.current.audio;
      // enabled=false: o WebRTC passa a mandar silêncio na hora.
      if (a) a.enabled = on;
      const info = streamInfoRef.current;
      if (info.live) publishStream({ ...info, audioEnabled: on && info.audio !== 'none' });
    },
    [publishStream],
  );

  const updateSettings = useCallback(
    (next: CaptureSettings) => {
      setSettings(next);
      const v = tracksRef.current.video;
      if (v) {
        void applyVideoSettings(v, next).then(() => {
          const vs = v.getSettings();
          const info = streamInfoRef.current;
          if (info.live) publishStream({ ...info, width: vs.width, height: vs.height, fps: vs.frameRate ? Math.round(vs.frameRate) : next.fps, content: next.content });
        });
      }
      void bcRef.current?.setLimits({ maxBitrate: QUALITY_BITRATE[next.quality].bps, maxFramerate: next.fps, content: next.content, auto: next.auto });
    },
    [publishStream],
  );

  const readStats = useCallback(() => bcRef.current?.stats() ?? Promise.resolve(new Map<string, SenderStats>()), []);
  const readRemoteStats = useCallback((id: string) => receiversRef.current.get(id)?.stats() ?? null, []);
  const reconnect = useCallback((id: string) => receiversRef.current.get(id)?.requestOffer(), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    role,
    me,
    myName: name || (role === 'host' ? 'Anfitrião' : 'Visitante'),
    connection,
    room,
    people,
    live,
    starting,
    audioEnabled,
    settings,
    previewStream,
    watchers,
    ponte: ponteRef.current,
    ponteStatus,
    shareBlock: shareBlockFor(room, role, me, live !== null),
    start,
    stop,
    setAudioEnabled,
    updateSettings,
    readStats,
    remote,
    watch,
    readRemoteStats,
    reconnect,
    error,
    clearError,
    ended,
    fatal,
    setVisibility: (visibility) => sigRef.current?.send({ t: 'room-update', visibility }),
    setShareOpen: (shareOpen) => sigRef.current?.send({ t: 'room-update', shareOpen }),
    rename: (n) => sigRef.current?.send({ t: 'room-update', name: n }),
    endRoom: () => {
      stop();
      sigRef.current?.send({ t: 'end' });
      setEnded('left');
    },
  };
}
