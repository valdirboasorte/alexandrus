import type { SignalData } from '@protocol';
import type { SignalingClient } from '../signaling.ts';
import { createViewerStatsReader, type ViewerStats } from './stats.ts';
import { lowLatencyReceiver, tuneOpus } from './tuning.ts';

/*
 * Quem assiste a UMA tela da sala. Pede a oferta a quem compartilha
 * ("request-offer"), responde e monta o MediaStream que o player toca. Cada
 * oferta nova (o apresentador reconectou, o ICE falhou) recria a conexão do
 * zero — simples e previsível. Ao parar de assistir manda "bye", e quem
 * compartilha fecha a conexão do lado dele.
 *
 * Uma pessoa pode assistir várias telas ao mesmo tempo (modo lado a lado):
 * uma instância desta classe por tela.
 */

export type ReceiverState = 'waiting' | 'connecting' | 'connected' | 'unstable' | 'failed';

/** Sem oferta depois disso (mensagem perdida, apresentador ainda subindo): pede de novo. */
const OFFER_TIMEOUT_MS = 5000;
const RETRY_MS = 2000;

export class StreamReceiver {
  private pc: RTCPeerConnection | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private readStats: (() => Promise<ViewerStats>) | null = null;
  private retryTimer = 0;
  private closed = false;
  stream: MediaStream | null = null;
  state: ReceiverState = 'waiting';

  constructor(
    private readonly signaling: SignalingClient,
    readonly presenterId: string,
    private iceServers: RTCIceServer[],
    private readonly onStream: (stream: MediaStream | null) => void,
    private readonly onState: (state: ReceiverState) => void,
  ) {}

  setIceServers(servers: RTCIceServer[]) {
    this.iceServers = servers;
  }

  /** Começa a assistir. */
  start() {
    this.requestOffer();
  }

  /** Sinais de quem compartilha: offer e ICE do lado 'pub'. */
  async handleSignal(data: SignalData) {
    if (this.closed) return;
    if (data.kind === 'offer') {
      await this.answer(data.sdp);
    } else if (data.kind === 'ice') {
      if (!data.candidate) return;
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(data.candidate).catch(() => {});
      else this.pendingIce.push(data.candidate);
    }
  }

  private async answer(sdp: string) {
    this.reset(false);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    this.pc = pc;
    this.readStats = createViewerStatsReader(pc);
    const stream = new MediaStream();
    this.stream = stream;
    const to = this.presenterId;

    pc.ontrack = (ev) => {
      lowLatencyReceiver(ev.receiver);
      for (const t of stream.getTracks()) if (t.kind === ev.track.kind) stream.removeTrack(t);
      stream.addTrack(ev.track);
      this.onStream(stream);
    };
    pc.onicecandidate = (ev) => {
      this.signaling.send({ t: 'signal', to, data: { kind: 'ice', side: 'sub', candidate: ev.candidate ? ev.candidate.toJSON() : null } });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      const s = pc.connectionState;
      if (s === 'connected') this.setState('connected');
      else if (s === 'disconnected') this.setState('unstable');
      else if (s === 'failed') {
        this.setState('failed');
        this.scheduleRetry(RETRY_MS);
      } else if (s === 'connecting' || s === 'new') this.setState('connecting');
    };

    this.setState('connecting');
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      const answer = await pc.createAnswer();
      answer.sdp = tuneOpus(answer.sdp ?? '');
      await pc.setLocalDescription(answer);
      this.signaling.send({ t: 'signal', to, data: { kind: 'answer', sdp: pc.localDescription!.sdp } });
    } catch (e) {
      if (this.pc !== pc) return;
      console.warn('[alexandrus] não consegui responder à oferta', e);
      this.setState('failed');
      this.scheduleRetry(RETRY_MS);
    }
  }

  /** Pede uma oferta nova (botão "Tentar agora", falha de ICE, oferta que não veio). */
  requestOffer() {
    if (this.closed) return;
    this.signaling.send({ t: 'signal', to: this.presenterId, data: { kind: 'request-offer' } });
    this.scheduleRetry(OFFER_TIMEOUT_MS, true);
  }

  /** Tenta de novo depois de `ms`; com onlyIfNoOffer, só se nenhuma oferta chegou nesse meio-tempo. */
  private scheduleRetry(ms: number, onlyIfNoOffer = false) {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      if (onlyIfNoOffer && this.pc) return;
      this.requestOffer();
    }, ms);
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

  /** Parou de assistir. bye = avisar quem compartilha (falso se ele já saiu da sala). */
  close(bye = true) {
    if (this.closed) return;
    this.closed = true;
    this.reset(false);
    if (bye) this.signaling.send({ t: 'signal', to: this.presenterId, data: { kind: 'bye' } });
  }
}
