import type { ClientMessage, ServerMessage } from '@protocol';

type Listener = (msg: ServerMessage) => void;
export type SignalingState = 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * WebSocket de sinalização com reconexão automática.
 * Quem usa registra `onOpen` para (re)entrar na sala a cada conexão nova.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: SignalingState) => void>();
  private openHandlers = new Set<() => void>();
  private queue: ClientMessage[] = [];
  private attempts = 0;
  private closedByUser = false;
  private retryTimer = 0;
  private pingTimer = 0;
  private _state: SignalingState = 'connecting';
  /** Último RTT até o servidor, em ms (ping de aplicação). */
  rttMs: number | null = null;

  constructor(private readonly url: string = defaultUrl()) {
    this.connect();
  }

  get state() {
    return this._state;
  }

  private setState(s: SignalingState) {
    this._state = s;
    this.stateListeners.forEach((fn) => fn(s));
  }

  private connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.setState('open');
      this.openHandlers.forEach((fn) => fn());
      const pending = this.queue;
      this.queue = [];
      pending.forEach((m) => this.send(m));
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 15000);
      this.send({ t: 'ping', ts: performance.now() });
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t === 'pong') this.rttMs = Math.round(performance.now() - msg.ts);
      this.listeners.forEach((fn) => fn(msg));
    };
    ws.onclose = () => {
      window.clearInterval(this.pingTimer);
      if (this.closedByUser) {
        this.setState('closed');
        return;
      }
      this.setState('reconnecting');
      const delay = Math.min(8000, 400 * 2 ** this.attempts++) + Math.random() * 300;
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {
      /* onclose cuida da reconexão */
    };
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (msg.t !== 'ping') {
      this.queue.push(msg);
    }
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onState(fn: (s: SignalingState) => void) {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  onOpen(fn: () => void) {
    this.openHandlers.add(fn);
    if (this.ws?.readyState === WebSocket.OPEN) fn();
    return () => this.openHandlers.delete(fn);
  }

  close() {
    this.closedByUser = true;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.pingTimer);
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ t: 'leave' } satisfies ClientMessage));
      } catch {
        /* já fechando */
      }
      this.ws.close(1000);
    }
    this.listeners.clear();
    this.stateListeners.clear();
    this.openHandlers.clear();
  }
}

function defaultUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}
