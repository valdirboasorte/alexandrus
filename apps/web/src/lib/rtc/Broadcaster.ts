import type { ContentKind, SignalData } from '@protocol';
import type { SignalingClient } from '../signaling.ts';
import { decide, INITIAL_ADAPT, ladder, type AdaptState, type Step } from './adaptive.ts';
import { createSenderStatsReader, readNetSample, type SenderStats } from './stats.ts';
import { applyAudioSenderLimits, applySenderLimits, preferVideoCodecs, tuneOpus } from './tuning.ts';

/*
 * Quem compartilha a tela (anfitrião ou qualquer participante), em malha: uma
 * RTCPeerConnection por pessoa que assiste, sempre com dois transceptores
 * (vídeo e áudio) só de envio. Trocar de fonte ou ligar/desligar o som usa
 * replaceTrack/enabled — sem renegociar.
 *
 * Quem assiste é quem pede: a conexão só nasce num "request-offer" e morre num
 * "bye" (a pessoa trocou de tela) ou quando ela sai da sala. Sem ninguém
 * assistindo, nada é enviado.
 *
 * Ajuste automático: a cada 2 s lê perda, atraso e banda estimada de cada
 * espectador e sobe/desce o degrau de qualidade só daquele espectador
 * (ver adaptive.ts). Quem tem rede boa continua recebendo o máximo.
 *
 * Esta classe é a costura para o futuro SFU: a interface pública
 * (setTracks/handleSignal/removeViewer/closeAll/setLimits) é o que a sala usa.
 */

export interface SenderLimits {
  maxBitrate: number;
  maxFramerate: number;
  content: ContentKind;
  /** Ajuste automático pela conexão de cada espectador. */
  auto: boolean;
}

export interface WatcherConnection {
  id: string;
  name: string;
  state: RTCPeerConnectionState;
  /** Degrau atual do ajuste automático (0 = qualidade escolhida). */
  adaptLevel: number;
  step: Step;
}

interface Peer {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  video: RTCRtpTransceiver;
  audio: RTCRtpTransceiver;
  pendingIce: RTCIceCandidateInit[];
  readStats: () => Promise<SenderStats>;
  adapt: AdaptState;
  /** Quando conectou (ms); 0 = ainda não. */
  connectedAt: number;
}

const TICK_MS = 2000;
/**
 * Nos primeiros segundos a estimativa de banda ainda está subindo do zero:
 * aí estimativa baixa não é rede ruim (perda e atraso continuam valendo).
 */
const WARMUP_MS = 10_000;

export class Broadcaster {
  private peers = new Map<string, Peer>();
  private videoTrack: MediaStreamTrack | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private readonly msid = new MediaStream();
  private limits: SenderLimits = { maxBitrate: 6_000_000, maxFramerate: 60, content: 'motion', auto: true };
  private closed = false;
  private ticking = false;
  private readonly timer: number;

  constructor(
    private readonly signaling: SignalingClient,
    private iceServers: RTCIceServer[],
    private readonly onChange: () => void,
  ) {
    this.timer = window.setInterval(() => void this.tick(), TICK_MS);
  }

  setIceServers(servers: RTCIceServer[]) {
    this.iceServers = servers;
  }

  /** Troca as faixas em todas as conexões. Sem vídeo = parou de compartilhar: fecha todas. */
  async setTracks(video: MediaStreamTrack | null, audio: MediaStreamTrack | null) {
    this.videoTrack = video;
    this.audioTrack = audio;
    if (!video) {
      this.closeAll();
      return;
    }
    await Promise.all(
      [...this.peers.values()].flatMap((p) => [
        p.video.sender.replaceTrack(video).catch(() => {}),
        p.audio.sender.replaceTrack(audio).catch(() => {}),
      ]),
    );
  }

  async setLimits(limits: SenderLimits) {
    this.limits = limits;
    // Mudou o teto ou desligou o automático: recomeça do degrau mais alto.
    for (const p of this.peers.values()) p.adapt = { ...INITIAL_ADAPT, changedAt: Date.now() };
    await Promise.all([...this.peers.values()].map((p) => this.applyPeer(p)));
    this.onChange();
  }

  private steps(): Step[] {
    return ladder(this.limits.maxBitrate, this.limits.maxFramerate, this.limits.content);
  }

  private stepFor(p: Peer): Step {
    const steps = this.steps();
    return steps[this.limits.auto ? Math.min(p.adapt.level, steps.length - 1) : 0];
  }

  private async applyPeer(p: Peer) {
    const s = this.stepFor(p);
    const opts = { maxBitrate: s.bps, maxFramerate: s.fps, content: this.limits.content, scale: s.scale };
    if (!(await applySenderLimits(p.video.sender, opts))) {
      // outra chamada estava no meio: tenta de novo logo depois
      await new Promise((r) => setTimeout(r, 300));
      await applySenderLimits(p.video.sender, opts);
    }
  }

  private async tick() {
    if (this.ticking || this.closed || !this.limits.auto || !this.videoTrack) return;
    this.ticking = true;
    try {
      const steps = this.steps();
      let changed = false;
      for (const p of this.peers.values()) {
        if (p.pc.connectionState !== 'connected') continue;
        const sample = await readNetSample(p.pc).catch(() => null);
        if (!sample) continue;
        if (Date.now() - p.connectedAt < WARMUP_MS) sample.limited = false;
        const next = decide(p.adapt, sample, steps, Date.now());
        const moved = next.level !== p.adapt.level;
        p.adapt = next;
        if (moved) {
          await this.applyPeer(p);
          changed = true;
        }
      }
      if (changed) this.onChange();
    } finally {
      this.ticking = false;
    }
  }

  /** Cria (ou recria) a conexão com quem pediu para assistir e envia a oferta. */
  private async addViewer(id: string, name: string) {
    if (this.closed || !this.videoTrack) return;
    this.removeViewer(id, false);

    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    const video = pc.addTransceiver(this.videoTrack ?? 'video', { direction: 'sendonly', streams: [this.msid] });
    const audio = pc.addTransceiver(this.audioTrack ?? 'audio', { direction: 'sendonly', streams: [this.msid] });
    preferVideoCodecs(video);

    const peer: Peer = { id, name, pc, video, audio, pendingIce: [], readStats: createSenderStatsReader(pc), adapt: { ...INITIAL_ADAPT }, connectedAt: 0 };
    this.peers.set(id, peer);

    pc.onicecandidate = (ev) => {
      this.send(id, { kind: 'ice', side: 'pub', candidate: ev.candidate ? ev.candidate.toJSON() : null });
    };
    pc.onconnectionstatechange = () => {
      this.onChange();
      if (pc.connectionState === 'connected') {
        if (!peer.connectedAt) peer.connectedAt = Date.now();
        void this.applyPeer(peer);
        void applyAudioSenderLimits(audio.sender);
      }
    };

    try {
      const offer = await pc.createOffer();
      offer.sdp = tuneOpus(offer.sdp ?? '');
      await pc.setLocalDescription(offer);
      this.send(id, { kind: 'offer', sdp: pc.localDescription!.sdp });
    } catch (e) {
      console.warn('[alexandrus] oferta falhou', e);
    }
    this.onChange();
  }

  removeViewer(id: string, notify = true) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.onicecandidate = null;
    p.pc.onconnectionstatechange = null;
    p.pc.close();
    this.peers.delete(id);
    if (notify) this.onChange();
  }

  /** Fecha todas as conexões (parou de compartilhar, ou reconectou ao servidor com outro id). */
  closeAll() {
    for (const id of [...this.peers.keys()]) this.removeViewer(id, false);
    this.onChange();
  }

  /** Sinais de quem assiste: request-offer, answer, bye e ICE do lado 'sub'. */
  async handleSignal(from: string, data: SignalData, name: string) {
    const p = this.peers.get(from);
    if (data.kind === 'request-offer') {
      await this.addViewer(from, name);
      return;
    }
    if (data.kind === 'bye') {
      this.removeViewer(from);
      return;
    }
    if (!p) return;
    if (data.kind === 'answer') {
      try {
        await p.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
        void this.applyPeer(p);
        void applyAudioSenderLimits(p.audio.sender);
      } catch (e) {
        console.warn('[alexandrus] resposta inválida', e);
      }
    } else if (data.kind === 'ice') {
      if (!data.candidate) return;
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate).catch(() => {});
      else p.pendingIce.push(data.candidate);
    }
  }

  setName(id: string, name: string) {
    const p = this.peers.get(id);
    if (p) p.name = name;
  }

  viewers(): WatcherConnection[] {
    return [...this.peers.values()].map((p) => ({
      id: p.id,
      name: p.name,
      state: p.pc.connectionState,
      adaptLevel: this.limits.auto ? p.adapt.level : 0,
      step: this.stepFor(p),
    }));
  }

  async stats(): Promise<Map<string, SenderStats>> {
    const out = new Map<string, SenderStats>();
    await Promise.all(
      [...this.peers.values()].map(async (p) => {
        if (p.pc.connectionState === 'connected') out.set(p.id, await p.readStats().catch(() => null as never));
      }),
    );
    return out;
  }

  close() {
    this.closed = true;
    window.clearInterval(this.timer);
    this.closeAll();
  }

  private send(to: string, data: SignalData) {
    this.signaling.send({ t: 'signal', to, data });
  }
}
