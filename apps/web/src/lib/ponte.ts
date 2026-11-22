import { PONTE_DEFAULT_PORT, type PonteAudioSession, type PonteClientMessage, type PonteServerMessage } from '@protocol';

/*
 * Cliente da Alexandrus Ponte (app auxiliar do Windows).
 * A Ponte captura o áudio de UM processo via WASAPI process loopback e manda
 * PCM 16-bit estéreo 48 kHz por ws://127.0.0.1:47613. Aqui ele vira uma faixa
 * de áudio comum (MediaStreamTrack), pronta para o WebRTC.
 */

export type PonteStatus = 'idle' | 'connecting' | 'ready' | 'unavailable';

export interface PonteHello {
  version: string;
  windowsBuild: number;
  processLoopback: boolean;
}

export interface PonteAudioStats {
  bufferedMs: number;
  underruns: number;
  droppedMs: number;
}

type Started = Extract<PonteServerMessage, { t: 'started' }>;
type Stopped = Extract<PonteServerMessage, { t: 'stopped' }>;

export class PonteClient {
  private ws: WebSocket | null = null;
  private pendingSessions: ((items: PonteAudioSession[]) => void)[] = [];
  private pendingStart: { resolve: (m: Started) => void; reject: (e: Error) => void } | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;

  status: PonteStatus = 'idle';
  hello: PonteHello | null = null;
  capturing: Started | null = null;
  lastStats: PonteAudioStats | null = null;

  onStatus: (s: PonteStatus) => void = () => {};
  onStopped: (m: Stopped) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor(private readonly port = PONTE_DEFAULT_PORT) {}

  private connecting: Promise<PonteHello | null> | null = null;

  /**
   * Tenta conectar. Resolve com o hello ou null se a Ponte não estiver aberta.
   * Chamadas simultâneas compartilham a mesma tentativa (a Ponte aceita um
   * cliente por vez; duas conexões se derrubariam).
   */
  connect(timeoutMs = 2500): Promise<PonteHello | null> {
    if (this.ws && this.status === 'ready') return Promise.resolve(this.hello);
    if (this.connecting) return this.connecting;
    this.setStatus('connecting');
    this.connecting = new Promise<PonteHello | null>((resolve) => {
      let settled = false;
      let ws: WebSocket | null = null;
      const done = (h: PonteHello | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        this.connecting = null;
        resolve(h);
      };
      const timer = window.setTimeout(() => {
        // só desiste da tentativa desta chamada; nunca derruba uma conexão mais nova
        if (ws && this.ws === ws) {
          ws.onclose = null;
          ws.close();
          this.ws = null;
          this.setStatus('unavailable');
        }
        done(null);
      }, timeoutMs);

      try {
        ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
      } catch {
        this.setStatus('unavailable');
        done(null);
        return;
      }
      const sock = ws;
      sock.binaryType = 'arraybuffer';
      this.ws = sock;
      sock.onopen = () => this.send({ t: 'hello' });
      sock.onerror = () => {
        /* onclose decide */
      };
      sock.onclose = () => {
        if (this.ws !== sock) return; // socket antigo: ignorar
        const wasCapturing = !!this.capturing;
        this.ws = null;
        this.capturing = null;
        this.setStatus('unavailable');
        if (wasCapturing) this.onStopped({ t: 'stopped', reason: 'error' });
        this.pendingStart?.reject(new Error('A Ponte foi fechada.'));
        this.pendingStart = null;
        done(null);
      };
      sock.onmessage = (ev) => {
        if (this.ws !== sock) return;
        if (ev.data instanceof ArrayBuffer) {
          this.node?.port.postMessage(ev.data, [ev.data]);
          return;
        }
        let msg: PonteServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as PonteServerMessage;
        } catch {
          return;
        }
        switch (msg.t) {
          case 'hello':
            this.hello = { version: msg.version, windowsBuild: msg.windowsBuild, processLoopback: msg.processLoopback };
            this.setStatus('ready');
            done(this.hello);
            break;
          case 'sessions':
            this.pendingSessions.splice(0).forEach((fn) => fn(msg.items));
            break;
          case 'started':
            this.capturing = msg;
            this.pendingStart?.resolve(msg);
            this.pendingStart = null;
            break;
          case 'stopped':
            this.capturing = null;
            this.node?.port.postMessage({ type: 'reset' });
            this.onStopped(msg);
            break;
          case 'error':
            if (this.pendingStart) {
              this.pendingStart.reject(new Error(msg.message));
              this.pendingStart = null;
            } else {
              this.onError(msg.message);
            }
            break;
          case 'pong':
            break;
        }
      };
    });
    return this.connecting;
  }

  private setStatus(s: PonteStatus) {
    this.status = s;
    this.onStatus(s);
  }

  private send(m: PonteClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  listSessions(): Promise<PonteAudioSession[]> {
    if (this.status !== 'ready') return Promise.resolve([]);
    return new Promise((resolve) => {
      this.pendingSessions.push(resolve);
      this.send({ t: 'list' });
      window.setTimeout(() => {
        const i = this.pendingSessions.indexOf(resolve);
        if (i >= 0) {
          this.pendingSessions.splice(i, 1);
          resolve([]);
        }
      }, 3000);
    });
  }

  /**
   * Começa a capturar o processo e devolve a faixa de áudio.
   * Precisa ser chamado a partir de um gesto do usuário (AudioContext).
   */
  async start(pid: number, mode: 'include' | 'exclude'): Promise<{ track: MediaStreamTrack; info: Started }> {
    await this.ensureGraph();
    this.node!.port.postMessage({ type: 'reset' });
    const info = await new Promise<Started>((resolve, reject) => {
      this.pendingStart = { resolve, reject };
      this.send({ t: 'start', pid, mode });
      window.setTimeout(() => {
        if (this.pendingStart?.resolve === resolve) {
          this.pendingStart = null;
          reject(new Error('A Ponte não respondeu a tempo.'));
        }
      }, 6000);
    });
    // Um clone por captura: quem usa pode dar stop() sem matar o grafo.
    const track = this.dest!.stream.getAudioTracks()[0].clone();
    return { track, info };
  }

  stop() {
    this.send({ t: 'stop' });
  }

  private async ensureGraph() {
    if (this.ctx && this.node && this.dest) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule('/worklets/pcm-player.js');
    const node = new AudioWorkletNode(ctx, 'alexandrus-pcm-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 2;
    // Só para a transmissão: nunca para os alto-falantes do anfitrião
    // (ele já ouve o jogo direto; tocar de novo dobraria o som).
    node.connect(dest);
    node.port.onmessage = (ev) => {
      if (ev.data?.type === 'stats') this.lastStats = ev.data as PonteAudioStats;
    };
    if (ctx.state === 'suspended') await ctx.resume();
    this.ctx = ctx;
    this.node = node;
    this.dest = dest;
  }

  dispose(status: PonteStatus = 'idle') {
    if (this.ws) {
      this.ws.onclose = null;
      try {
        if (this.capturing) this.send({ t: 'stop' });
        this.ws.close();
      } catch {
        /* nada */
      }
    }
    this.ws = null;
    this.connecting = null;
    this.capturing = null;
    this.node?.disconnect();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.node = null;
    this.dest = null;
    this.setStatus(status);
  }
}

export interface PonteStatusInfo extends PonteHello {
  connected: boolean;
  capturing: boolean;
}

/**
 * Pergunta à Ponte se ela está aberta, por HTTP (GET /status), sem abrir um
 * WebSocket: a Ponte atende um cliente por vez, e uma segunda conexão
 * derrubaria uma transmissão em andamento em outra aba.
 */
export async function probePonte(port = PONTE_DEFAULT_PORT, timeoutMs = 2000): Promise<PonteStatusInfo | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<PonteStatusInfo> & { app?: string };
    if (j.app !== 'alexandrus-ponte') return null;
    return {
      version: String(j.version),
      windowsBuild: Number(j.windowsBuild),
      processLoopback: !!j.processLoopback,
      connected: !!j.connected,
      capturing: !!j.capturing,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Sessões que valem a pena mostrar primeiro: as que estão tocando agora. */
export function sortSessions(items: PonteAudioSession[]) {
  return [...items]
    .filter((s) => !s.isSystemSounds && s.state !== 'expired')
    .sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name) : a.state === 'active' ? -1 : 1));
}

const VOICE_APPS = /^(discord|discordptb|discordcanary|teamspeak|ts3client_win64|mumble|skype|zoom|slack|teams|ms-teams)\.exe$/i;

/** Apps de voz: o Alexandrus não deve capturar estes (eco na call). */
export function isVoiceApp(name: string) {
  return VOICE_APPS.test(name);
}

const BROWSERS = /^(chrome|msedge|firefox|opera|brave|vivaldi)\.exe$/i;

export function isBrowserApp(name: string) {
  return BROWSERS.test(name);
}
