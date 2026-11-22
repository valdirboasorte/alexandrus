import type { SignalData } from '@protocol';
import type { SignalingClient } from '../signaling.ts';
import { createSenderStatsReader, type SenderStats } from './stats.ts';
import { applyAudioSenderLimits, applySenderLimits, preferVideoCodecs, tuneOpus } from './tuning.ts';

/*
 * Anfitrião em malha: uma RTCPeerConnection por espectador, sempre com dois
 * transceptores (vídeo e áudio) só de envio. Trocar de fonte ou ligar/desligar
 * o som usa replaceTrack/enabled — sem renegociar.
 *
 * Esta classe é a costura para o futuro SFU: a interface pública
 * (setTracks/addViewer/removeViewer/handleSignal/setLimits) é o que a sala usa.
 */

export interface SenderLimits {
  maxBitrate: number;
  maxFramerate: number;
  content: 'motion' | 'detail';
}

export interface ViewerConnection {
  id: string;
  name: string;
  state: RTCPeerConnectionState;
}

interface Peer {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  video: RTCRtpTransceiver;
  audio: RTCRtpTransceiver;
  pendingIce: RTCIceCandidateInit[];
  readStats: () => Promise<SenderStats>;
}

export class HostBroadcaster {
  private peers = new Map<string, Peer>();
  private videoTrack: MediaStreamTrack | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private readonly msid = new MediaStream();
  private limits: SenderLimits = { maxBitrate: 6_000_000, maxFramerate: 60, content: 'motion' };
  private closed = false;

  constructor(
    private readonly signaling: SignalingClient,
    private iceServers: RTCIceServer[],
    private readonly onChange: () => void,
  ) {}

  setIceServers(servers: RTCIceServer[]) {
    this.iceServers = servers;
  }

  /** Troca as faixas em todas as conexões (null = parar de enviar). */
  async setTracks(video: MediaStreamTrack | null, audio: MediaStreamTrack | null) {
    this.videoTrack = video;
    this.audioTrack = audio;
    await Promise.all(
      [...this.peers.values()].flatMap((p) => [
        p.video.sender.replaceTrack(video).catch(() => {}),
        p.audio.sender.replaceTrack(audio).catch(() => {}),
      ]),
    );
  }

  async setLimits(limits: SenderLimits) {
    this.limits = limits;
    await Promise.all([...this.peers.values()].map((p) => applySenderLimits(p.video.sender, limits)));
  }

  /** Cria (ou recria) a conexão com um espectador e envia a oferta. */
  async addViewer(id: string, name: string) {
    if (this.closed) return;
    this.removeViewer(id, false);

    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    const video = pc.addTransceiver(this.videoTrack ?? 'video', { direction: 'sendonly', streams: [this.msid] });
    const audio = pc.addTransceiver(this.audioTrack ?? 'audio', { direction: 'sendonly', streams: [this.msid] });
    preferVideoCodecs(video);

    const peer: Peer = { id, name, pc, video, audio, pendingIce: [], readStats: createSenderStatsReader(pc) };
    this.peers.set(id, peer);

    pc.onicecandidate = (ev) => {
      this.send(id, { kind: 'ice', candidate: ev.candidate ? ev.candidate.toJSON() : null });
    };
    pc.onconnectionstatechange = () => {
      this.onChange();
      if (pc.connectionState === 'connected') {
        void applySenderLimits(video.sender, this.limits);
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

  async handleSignal(from: string, data: SignalData) {
    const p = this.peers.get(from);
    if (data.kind === 'request-offer') {
      await this.addViewer(from, p?.name ?? 'Visitante');
      return;
    }
    if (!p) return;
    if (data.kind === 'answer') {
      try {
        await p.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
        void applySenderLimits(p.video.sender, this.limits);
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

  viewers(): ViewerConnection[] {
    return [...this.peers.values()].map((p) => ({ id: p.id, name: p.name, state: p.pc.connectionState }));
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
    for (const id of [...this.peers.keys()]) this.removeViewer(id, false);
    this.onChange();
  }

  private send(to: string, data: SignalData) {
    this.signaling.send({ t: 'signal', to, data });
  }
}
