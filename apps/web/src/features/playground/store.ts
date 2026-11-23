import {
  PG_FEATURE,
  type PgAction,
  type PgErrCode,
  type PgEvent,
  type PgSnapshot,
  type ServerMessage,
} from '@protocol';
import type { SignalingClient } from '../../lib/signaling.ts';

/*
 * O Playground do lado do navegador. Fica pendurado na conexão de
 * sinalização da sala: quando o servidor anuncia o recurso, entra (sync) e
 * mantém um retrato do estado compartilhado. Eventos passageiros (reações,
 * sons, comida, traços) não mexem no retrato: vão direto para quem escuta,
 * para que canvas e camadas de efeito reajam sem re-render do React.
 */

export type PgStatus = 'waiting' | 'connecting' | 'ready' | 'unsupported';

export interface PgState {
  status: PgStatus;
  snap: PgSnapshot | null;
}

type EventOf<K extends PgEvent['k']> = Extract<PgEvent, { k: K }>;
type Handler<K extends PgEvent['k']> = (e: EventOf<K>) => void;

const CID_KEY = 'alexandrus:pg-cid';

/** Segredo deste navegador para o Playground (o servidor nunca o repassa). */
function browserCid(): string {
  try {
    const saved = localStorage.getItem(CID_KEY);
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
  } catch {
    /* sem armazenamento */
  }
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const cid = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try {
    localStorage.setItem(CID_KEY, cid);
  } catch {
    /* segue com um id só desta aba */
  }
  return cid;
}

export const ERR_TEXT: Record<PgErrCode, string> = {
  cooldown: 'Calma, espera um pouquinho.',
  busy: 'A sala está agitada, tenta de novo em instantes.',
  disabled: 'O anfitrião desligou isso por enquanto.',
  muted: 'O anfitrião silenciou você no Playground.',
  'not-allowed': 'Só o anfitrião pode fazer isso.',
  invalid: 'Não deu certo, tenta de novo.',
  full: 'Está cheio por aqui. Espera alguém responder.',
  locked: 'Ainda não foi liberado nesta sala.',
};

export class PlaygroundStore {
  private state: PgState = { status: 'waiting', snap: null };
  private listeners = new Set<() => void>();
  private handlers = new Map<string, Set<(e: PgEvent) => void>>();
  private offset = 0;
  private paintSubs = 0;
  private off: (() => void)[] = [];
  /** Até quando cada ação está em espera (relógio local). */
  readonly cooldowns = new Map<PgAction['k'], number>();
  private readonly cid = browserCid();

  constructor(private readonly sig: SignalingClient) {
    this.off.push(sig.on((m) => this.onMessage(m)));
    this.off.push(
      sig.onState((s) => {
        if (s !== 'open' && this.state.status === 'ready') this.set({ status: 'connecting' });
      }),
    );
  }

  dispose() {
    this.off.forEach((fn) => fn());
    this.listeners.clear();
    this.handlers.clear();
  }

  /* ---------------- leitura ---------------- */

  getState = (): PgState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Relógio do servidor (ms), para peixes, mascote e roleta ficarem iguais em todo lugar. */
  serverNow(): number {
    return Date.now() + this.offset;
  }

  on<K extends PgEvent['k']>(k: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(k);
    if (!set) this.handlers.set(k, (set = new Set()));
    const h = fn as (e: PgEvent) => void;
    set.add(h);
    return () => set!.delete(h);
  }

  /** Quanto falta (ms) para poder repetir a ação. */
  cooldownLeft(k: PgAction['k']): number {
    return Math.max(0, (this.cooldowns.get(k) ?? 0) - Date.now());
  }

  /* ---------------- escrita ---------------- */

  /** Manda uma ação. false = desconectado (nada fica na fila: efeito atrasado é pior que nenhum). */
  send(a: PgAction): boolean {
    if (this.state.status !== 'ready' || this.sig.state !== 'open') return false;
    this.sig.send({ t: 'pg', a });
    return true;
  }

  /** Ação com espera local: não manda se ainda está no intervalo. */
  sendCooled(a: PgAction, gapMs: number): boolean {
    if (this.cooldownLeft(a.k) > 0) return false;
    const ok = this.send(a);
    if (ok) this.markCooldown(a.k, gapMs);
    return ok;
  }

  markCooldown(k: PgAction['k'], ms: number) {
    this.cooldowns.set(k, Date.now() + ms);
    this.notify();
  }

  /** O quadro só recebe traços enquanto alguém aqui está com ele aberto. */
  subscribePaint(): () => void {
    this.paintSubs++;
    if (this.paintSubs === 1) this.send({ k: 'sub', ch: 'paint', on: true });
    return () => {
      this.paintSubs--;
      if (this.paintSubs === 0) this.send({ k: 'sub', ch: 'paint', on: false });
    };
  }

  /* ---------------- servidor ---------------- */

  private onMessage(m: ServerMessage) {
    if (m.t === 'joined') {
      if (m.features?.includes(PG_FEATURE)) {
        this.set({ status: 'connecting' });
        this.sig.send({ t: 'pg', a: { k: 'sync', cid: this.cid } });
      } else {
        this.set({ status: 'unsupported', snap: null });
      }
      return;
    }
    if (m.t !== 'pg') return;
    this.apply(m.e);
  }

  private apply(e: PgEvent) {
    const snap = this.state.snap;
    switch (e.k) {
      case 'state':
        this.offset = e.s.now - Date.now();
        this.set({ status: 'ready', snap: e.s });
        // reconectou com o quadro aberto: assina de novo
        if (this.paintSubs > 0) this.sig.send({ t: 'pg', a: { k: 'sub', ch: 'paint', on: true } });
        break;
      case 'settings':
        if (snap) this.patch({ settings: e.settings });
        break;
      case 'muted':
        if (snap) this.patch({ you: { ...snap.you, muted: e.me }, mutedPeers: e.peers });
        break;
      case 'react':
        if (snap) this.patch({ stats: { ...snap.stats, reactions: snap.stats.reactions + 1 } });
        break;
      case 'sound':
        if (snap) this.patch({ stats: { ...snap.stats, sounds: snap.stats.sounds + 1 } });
        break;
      case 'vfx':
        if (snap) this.patch({ stats: { ...snap.stats, vfx: snap.stats.vfx + 1 } });
        break;
      case 'board':
        if (snap) {
          const mine = e.rows.find((r) => r.pid === snap.you.pid);
          this.patch({ board: e.rows, you: { ...snap.you, best: Math.max(snap.you.best, mine?.best ?? 0) } });
        }
        break;
      case 'fish':
        if (snap) this.patch({ fish: e.fish });
        break;
      case 'food':
        if (snap) {
          this.patch({
            fish: snap.fish.map((f) => (f.id === e.fish ? { ...f, size: e.size, fed: e.fed } : f)),
            stats: { ...snap.stats, feeds: snap.stats.feeds + 1 },
          });
        }
        break;
      case 'spin':
        if (snap) this.patch({ spin: e.spin, stats: { ...snap.stats, spins: snap.stats.spins + 1 } });
        break;
      case 'poll':
        if (snap) {
          const isNew = e.poll && e.poll.id !== snap.poll?.id;
          this.patch({ poll: e.poll, stats: isNew ? { ...snap.stats, polls: snap.stats.polls + 1 } : snap.stats });
        }
        break;
      case 'asks':
        if (snap) this.patch({ asks: e.items });
        break;
      case 'pet':
        if (snap) this.patch({ pet: e.pet });
        break;
      case 'stats':
        if (snap) this.patch({ stats: e.v.stats });
        break;
      case 'err':
        if (e.retry) this.cooldowns.set(e.act, Date.now() + e.retry);
        break;
      default:
        break;
    }
    this.handlers.get(e.k)?.forEach((fn) => fn(e));
  }

  private patch(p: Partial<PgSnapshot>) {
    if (!this.state.snap) return;
    this.set({ snap: { ...this.state.snap, ...p } });
  }

  private set(p: Partial<PgState>) {
    this.state = { ...this.state, ...p };
    this.notify();
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }
}
