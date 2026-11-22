import type { SignalData } from '@protocol';
import type { SignalingClient } from '../signaling.ts';
import { createViewerStatsReader, type ViewerStats } from './stats.ts';
import { lowLatencyReceiver, tuneOpus } from './tuning.ts';

/*
 * Espectador: responde às ofertas do anfitrião e monta o MediaStream que o
 * player toca. Cada oferta nova (anfitrião recarregou, ICE falhou) recria a
 * conexão do zero — simples e previsível.
 */

export type ReceiverState = 'waiting' | 'connecting' | 'connected' | 'unstable' | 'failed';

export class ViewerReceiver {
  private pc: RTCPeerConnection | null = null;
  private hostId: string | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private readStats: (() => Promise<ViewerStats>) | null = null;
  private retryTimer = 0;
  private closed = false;
  stream: MediaStream | null = null;
  state: ReceiverState = 'waiting';

  constructor(
    private readonly signaling: SignalingClient,
    private iceServers: RTCIceServer[],
    private readonly onStream: (stream: MediaStream | null) => void,
    private readonly onState: (state: ReceiverState) => void,
  ) {}

  setIceServers(servers: RTCIceServer[]) {
    this.iceServers = servers;
  }

  setHost(id: string | null) {
    if (id !== this.hostId) this.reset();
    this.hostId = id;
  }

  async handleSignal(from: string, data: SignalData) {
    if (this.closed) return;
    this.hostId = from;
    if (data.kind === 'offer') {
      await this.answer(from, data.sdp);
    } else if (data.kind === 'ice') {
      if (!data.candidate) return;
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(data.candidate).catch(() => {});
      else this.pendingIce.push(data.candidate);
    }
  }

  private async answer(from: string, sdp: string) {
    this.reset(false);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    this.pc = pc;
    this.readStats = createViewerStatsReader(pc);
    const stream = new MediaStream();
    this.stream = stream;

    pc.ontrack = (ev) => {
      lowLatencyReceiver(ev.receiver);
      for (const t of stream.getTracks()) if (t.kind === ev.track.kind) stream.removeTrack(t);
      stream.addTrack(ev.track);
      this.onStream(stream);
    };
    pc.onicecandidate = (ev) => {
      this.signaling.send({ t: 'signal', to: from, data: { kind: 'ice', candidate: ev.candidate ? ev.candidate.toJSON() : null } });
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') this.setState('connected');
      else if (s === 'disconnected') this.setState('unstable');
      else if (s === 'failed') {
        this.setState('failed');
        this.scheduleRetry();
      } else if (s === 'connecting' || s === 'new') this.setState('connecting');
    };

    this.setState('connecting');
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      const answer = await pc.createAnswer();
      answer.sdp = tuneOpus(answer.sdp ?? '');
      await pc.setLocalDescription(answer);
      this.signaling.send({ t: 'signal', to: from, data: { kind: 'answer', sdp: pc.localDescription!.sdp } });
    } catch (e) {
      console.warn('[alexandrus] não consegui responder à oferta', e);
      this.setState('failed');
      this.scheduleRetry();
    }
  }

  /** Pede uma oferta nova ao anfitrião (botão "Reconectar" ou falha de ICE). */
  requestOffer() {
    if (!this.hostId) return;
    this.signaling.send({ t: 'signal', to: this.hostId, data: { kind: 'request-offer' } });
  }

  private scheduleRetry() {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.requestOffer(), 2000);
  }

  stats(): Promise<ViewerStats> | null {
    return this.readStats ? this.readStats() : null;
  }

  private setState(s: ReceiverState) {
    if (s === this.state) return;
    this.state = s;
    this.onState(s);
  }

  private reset(notify = true) {
    window.clearTimeout(this.retryTimer);
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.pc = null;
    this.readStats = null;
    this.pendingIce = [];
    if (notify) {
      this.stream = null;
      this.onStream(null);
      this.setState('waiting');
    }
  }

  close() {
    this.closed = true;
    this.reset(false);
  }
}
