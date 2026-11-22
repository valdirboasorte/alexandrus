import { useCallback, useEffect, useRef, useState } from 'react';
import { OFFLINE_STREAM, type AudioRoute, type EndReason, type PeerInfo, type RoomSummary, type SourceKind, type StreamInfo, type Visibility } from '@protocol';
import { api } from '../../lib/api.ts';
import { applyVideoSettings, captureDisplay, CaptureCancelled, QUALITY_BITRATE, type CaptureSettings, type SourceChoice } from '../../lib/capture.ts';
import { PonteClient, type PonteStatus } from '../../lib/ponte.ts';
import { HostBroadcaster, type ViewerConnection } from '../../lib/rtc/HostBroadcaster.ts';
import type { SenderStats } from '../../lib/rtc/stats.ts';
import { SignalingClient, type SignalingState } from '../../lib/signaling.ts';
import { signalingUrl } from '../../lib/server-url.ts';

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

export type HostViewer = ViewerConnection & { joinedAt?: number };

export interface HostSession {
  connection: SignalingState;
  room: RoomSummary | null;
  viewers: HostViewer[];
  live: LiveCapture | null;
  starting: boolean;
  audioEnabled: boolean;
  settings: CaptureSettings;
  previewStream: MediaStream | null;
  error: string | null;
  ended: EndReason | 'left' | null;
  fatal: 'not-found' | 'bad-host-key' | null;
  ponte: PonteClient;
  ponteStatus: PonteStatus;
  start: (choice: SourceChoice, audio: AudioRequest) => Promise<void>;
  stop: () => void;
  setAudioEnabled: (on: boolean) => void;
  updateSettings: (s: CaptureSettings) => void;
  setVisibility: (v: Visibility) => void;
  rename: (name: string) => void;
  endRoom: () => void;
  readStats: () => Promise<Map<string, SenderStats>>;
  clearError: () => void;
}

interface Tracks {
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  streams: MediaStream[];
  fromPonte: boolean;
}

const NO_TRACKS: Tracks = { video: null, audio: null, streams: [], fromPonte: false };

function stopTracks(t: Tracks) {
  for (const s of t.streams) for (const tr of s.getTracks()) tr.stop();
  t.video?.stop();
  // A faixa da Ponte é um clone: parar não afeta o grafo de áudio.
  t.audio?.stop();
}

export function useHostSession(code: string, hostKey: string, hostName: string, initialSettings: CaptureSettings): HostSession {
  const [connection, setConnection] = useState<SignalingState>('connecting');
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [viewers, setViewers] = useState<HostViewer[]>([]);
  const [live, setLive] = useState<LiveCapture | null>(null);
  const [starting, setStarting] = useState(false);
  const [audioEnabled, setAudioEnabledState] = useState(true);
  const [settings, setSettings] = useState(initialSettings);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<HostSession['ended']>(null);
  const [fatal, setFatal] = useState<HostSession['fatal']>(null);
  const [ponteStatus, setPonteStatus] = useState<PonteStatus>('idle');

  const sigRef = useRef<SignalingClient | null>(null);
  const bcRef = useRef<HostBroadcaster | null>(null);
  const ponteRef = useRef<PonteClient>(new PonteClient());
  const tracksRef = useRef<Tracks>(NO_TRACKS);
  const streamInfoRef = useRef<StreamInfo>({ ...OFFLINE_STREAM });
  const peersRef = useRef(new Map<string, PeerInfo>());
  const settingsRef = useRef(settings);
  const audioOnRef = useRef(audioEnabled);
  settingsRef.current = settings;
  audioOnRef.current = audioEnabled;

  const refreshViewers = useCallback(() => {
    const bc = bcRef.current;
    if (!bc) return;
    setViewers(
      bc.viewers().map((v) => {
        const p = peersRef.current.get(v.id);
        return { ...v, name: p?.name ?? v.name, joinedAt: p?.joinedAt };
      }),
    );
  }, []);

  const publishStream = useCallback((info: StreamInfo) => {
    streamInfoRef.current = info;
    sigRef.current?.send({ t: 'stream', info });
  }, []);

  /* ---------------- conexão ---------------- */
  useEffect(() => {
    const sig = new SignalingClient(signalingUrl(code));
    sigRef.current = sig;
    const bc = new HostBroadcaster(sig, [{ urls: 'stun:stun.l.google.com:19302' }], refreshViewers);
    bcRef.current = bc;
    void api
      .ice()
      .then((c) => bc.setIceServers(c.iceServers))
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
    const join = () => sig.send({ t: 'join', code, role: 'host', hostKey, name: hostName });

    sig.onState(setConnection);
    sig.onOpen(join);
    sig.on((msg) => {
      switch (msg.t) {
        case 'joined':
          retries = 0;
          setRoom(msg.room);
          peersRef.current = new Map(msg.peers.map((p) => [p.id, p]));
          // Reconectou no meio da transmissão: reanuncia o estado e reconecta todos.
          if (streamInfoRef.current.live) sig.send({ t: 'stream', info: streamInfoRef.current });
          for (const p of msg.peers) void bc.addViewer(p.id, p.name);
          refreshViewers();
          break;
        case 'peer-joined':
          peersRef.current.set(msg.peer.id, msg.peer);
          void bc.addViewer(msg.peer.id, msg.peer.name);
          break;
        case 'peer-left':
          peersRef.current.delete(msg.peerId);
          bc.removeViewer(msg.peerId);
          break;
        case 'room':
          setRoom(msg.room);
          break;
        case 'signal':
          void bc.handleSignal(msg.from, msg.data);
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
          } else if (msg.code === 'bad-host-key') {
            setFatal('bad-host-key');
          } else {
            setError(msg.message);
          }
          break;
      }
    });

    return () => {
      window.clearTimeout(retryTimer);
      stopTracks(tracksRef.current);
      tracksRef.current = NO_TRACKS;
      bc.close();
      sig.close();
      ponte.dispose();
    };
  }, [code, hostKey, hostName, refreshViewers]);

  /* ---------------- parar ---------------- */
  const stop = useCallback(() => {
    const t = tracksRef.current;
    if (t.fromPonte) ponteRef.current.stop();
    stopTracks(t);
    tracksRef.current = NO_TRACKS;
    void bcRef.current?.setTracks(null, null);
    setPreviewStream(null);
    setLive(null);
    publishStream({ ...OFFLINE_STREAM });
  }, [publishStream]);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  /* ---------------- começar / trocar de fonte ---------------- */
  const start = useCallback(
    async (choice: SourceChoice, audio: AudioRequest) => {
      setError(null);
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
        await bc.setLimits({ maxBitrate: QUALITY_BITRATE[s.quality].bps, maxFramerate: s.fps, content: s.content });
        // As faixas antigas só param depois da troca: quem assiste não vê piscar.
        stopTracks(old);
        if (old.fromPonte && !fromPonte) ponteRef.current.stop();

        // "Parar de compartilhar" na barra do navegador.
        cap.video.addEventListener('ended', () => {
          if (tracksRef.current.video === cap.video) stopRef.current();
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
        });
      } catch (e) {
        if (!(e instanceof CaptureCancelled)) setError(`Não foi possível capturar: ${(e as Error).message}`);
      } finally {
        setStarting(false);
      }
    },
    [publishStream],
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
          if (info.live) publishStream({ ...info, width: vs.width, height: vs.height, fps: vs.frameRate ? Math.round(vs.frameRate) : next.fps });
        });
      }
      void bcRef.current?.setLimits({ maxBitrate: QUALITY_BITRATE[next.quality].bps, maxFramerate: next.fps, content: next.content });
    },
    [publishStream],
  );

  return {
    connection,
    room,
    viewers,
    live,
    starting,
    audioEnabled,
    settings,
    previewStream,
    error,
    ended,
    fatal,
    ponte: ponteRef.current,
    ponteStatus,
    start,
    stop,
    setAudioEnabled,
    updateSettings,
    setVisibility: (visibility) => sigRef.current?.send({ t: 'room-update', visibility }),
    rename: (name) => sigRef.current?.send({ t: 'room-update', name }),
    endRoom: () => {
      stop();
      sigRef.current?.send({ t: 'end' });
      setEnded('left');
    },
    readStats: () => bcRef.current?.stats() ?? Promise.resolve(new Map()),
    clearError: () => setError(null),
  };
}
