/**
 * Motor do Playground — o mesmo nos dois servidores (Node e Durable Object).
 *
 * Puro: não abre sockets nem grava em disco. Recebe ações já identificadas,
 * devolve entregas ("para todos", "só para quem mandou", "para quem está com
 * o quadro aberto"…) e marca o que mudou para quem hospeda decidir quando
 * persistir. O controle de spam por pessoa fica em memória: se o Durable
 * Object hibernar, ele só hiberna depois de um tempo parado, quando todos os
 * intervalos já passaram de qualquer jeito.
 */
import {
  DEFAULT_PG_SETTINGS,
  EMPTY_PG_STATS,
  FISH_PATTERNS,
  FISH_SPECIES,
  PG_COOLDOWN,
  PG_LIMITS,
  PG_ROOM_RATE,
  petStage,
  petTotalXp,
  parsePgAction,
  unlockedAccessories,
  unlockedSpecies,
  type AskKind,
  type AskStatus,
  type AskView,
  type BoardRow,
  type FishPattern,
  type FishSpecies,
  type FishView,
  type PetAccessory,
  type PetAct,
  type PetView,
  type PgAction,
  type PgErrCode,
  type PgEvent,
  type PgSettings,
  type PgSnapshot,
  type PgStats,
  type PgStatsView,
  type PollView,
  type SpinView,
  type StrokeView,
} from './playground.ts';

/** Quem está agindo, já identificado pela conexão. */
export interface PgActor {
  /** Id da conexão na sala (PeerInfo.id). */
  peer: string;
  /** Segredo do navegador; nunca sai do servidor. */
  cid: string;
  /** Id público estável da pessoa nesta sala. */
  pid: string;
  name: string;
  host: boolean;
}

export interface PgContext {
  now: number;
  /** Todo mundo que entrou no Playground e ainda está conectado. */
  actors(): PgActor[];
}

/**
 * Para quem vai cada evento:
 * - all / others / sender / host: o óbvio;
 * - paint / paint-others: só quem está com o quadro aberto (assinou 'paint').
 * `each` monta um evento por destinatário (votos, desafios, quem está mudo).
 */
export type PgTarget = 'all' | 'others' | 'sender' | 'host' | 'paint' | 'paint-others';
export type PgDelivery = { to: PgTarget; e: PgEvent } | { to: 'each'; each: (r: PgActor) => PgEvent | null };

export interface PgResult {
  out: PgDelivery[];
  /** Assinatura de canal para a conexão de quem mandou. */
  sub?: { ch: 'paint'; on: boolean };
}

/* ---------------- estado salvo ---------------- */

interface FishRec extends Omit<FishView, 'online' | 'owner'> {
  cid: string;
  pid: string;
  fedAt: number;
}

interface PollRec {
  id: string;
  q: string;
  opts: { t: string; v: string[] }[];
  by: string;
  byName: string;
  open: boolean;
  at: number;
  closedAt: number | null;
}

interface AskRec extends AskView {}

interface PetRec {
  name: string | null;
  xp: number;
  born: number;
  fedAt: number;
  pettedAt: number;
  tuckedAt: number;
  acc: PetAccessory | null;
  suggestions: { id: string; name: string; by: string; votes: string[] }[];
  last: { act: PetAct; by: string; at: number } | null;
}

interface StrokeRec extends StrokeView {}

interface PersonRec {
  pid: string;
  name: string;
  at: number;
}

export interface PgSavedCore {
  v: 1;
  settings: PgSettings;
  muted: string[];
  people: Record<string, PersonRec>;
  stats: PgStats;
  timeline: [number, number][];
  activeMs: number;
  activeSince: number | null;
  fish: FishRec[];
  board: Record<string, BoardRow>;
  poll: PollRec | null;
  asks: AskRec[];
  pet: PetRec;
  spin: SpinView | null;
  seq: number;
}

export interface PgSavedPaint {
  v: 1;
  strokes: StrokeRec[];
}

/* ---------------- utilidades ---------------- */

const FISH_NAMES = ['Bolha', 'Pipoca', 'Marola', 'Coral', 'Pingo', 'Brisa', 'Azulão', 'Netuno', 'Limão', 'Gotinha', 'Cometa', 'Tsunami', 'Pérola', 'Biscoito', 'Faísca', 'Nuvem'];
const STARTER: FishSpecies[] = ['bolinha', 'listrado', 'veu'];

function randomId(len = 10): string {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of buf) s += abc[b % abc.length];
  return s;
}

function randomInt(n: number): number {
  // rejeição para não enviesar índices pequenos
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Pessoas diferentes (duas abas do mesmo navegador contam uma vez). */
const people = (actors: PgActor[]) => new Set(actors.map((a) => a.pid)).size;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function freshCore(now: number): PgSavedCore {
  return {
    v: 1,
    settings: { ...DEFAULT_PG_SETTINGS },
    muted: [],
    people: {},
    stats: { ...EMPTY_PG_STATS },
    timeline: [],
    activeMs: 0,
    activeSince: null,
    fish: [],
    board: {},
    poll: null,
    asks: [],
    pet: { name: null, xp: 0, born: now, fedAt: 0, pettedAt: 0, tuckedAt: 0, acc: 'folha', suggestions: [], last: null },
    spin: null,
    seq: 0,
  };
}

/** Lê o que veio do armazenamento; qualquer forma estranha vira estado novo, campo a campo. */
function loadCore(raw: unknown, now: number): PgSavedCore {
  const base = freshCore(now);
  if (!isObj(raw) || raw.v !== 1) return base;
  const r = raw as Partial<PgSavedCore>;
  return {
    ...base,
    ...r,
    settings: { ...base.settings, ...(isObj(r.settings) ? r.settings : {}) },
    stats: { ...base.stats, ...(isObj(r.stats) ? r.stats : {}) },
    pet: { ...base.pet, ...(isObj(r.pet) ? r.pet : {}) },
    people: isObj(r.people) ? r.people : {},
    board: isObj(r.board) ? r.board : {},
    muted: Array.isArray(r.muted) ? r.muted : [],
    timeline: Array.isArray(r.timeline) ? r.timeline : [],
    fish: Array.isArray(r.fish) ? r.fish : [],
    asks: Array.isArray(r.asks) ? r.asks : [],
  };
}

function loadPaint(raw: unknown): StrokeRec[] {
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.strokes)) return [];
  return raw.strokes as StrokeRec[];
}

/* ---------------- motor ---------------- */

export class PlaygroundEngine {
  private core: PgSavedCore;
  private strokes: StrokeRec[];
  private points: number;
  /** Algo do núcleo / do quadro mudou desde a última gravação. */
  dirtyCore = false;
  dirtyPaint = false;

  /* memória volátil: intervalos por pessoa, ritmo da sala, traços abertos, rodadas */
  private last = new Map<string, number>();
  private reactWindow = { at: 0, n: 0 };
  private feedWindow = { at: 0, n: 0 };
  private soundTimes: number[] = [];
  private lastVfxAt = 0;
  private openStrokes = new Map<string, StrokeRec>();
  private rounds = new Map<string, number>();

  constructor(core?: unknown, paint?: unknown, now = Date.now()) {
    this.core = loadCore(core, now);
    this.strokes = loadPaint(paint);
    this.points = this.strokes.reduce((n, s) => n + s.p.length / 2, 0);
  }

  saveCore(): PgSavedCore {
    this.dirtyCore = false;
    return clone(this.core);
  }

  savePaint(): PgSavedPaint {
    this.dirtyPaint = false;
    return { v: 1, strokes: this.strokes.map((s) => ({ ...s, done: true })) };
  }

  get settings(): PgSettings {
    return this.core.settings;
  }

  /* ================= entrada e saída ================= */

  /**
   * Alguém entrou no Playground (ou reconectou). Devolve o id público dela e
   * as entregas: o retrato completo para ela, peixes atualizados para todos.
   */
  sync(ctx: PgContext, peer: string, cid: string, name: string, host: boolean): { actor: PgActor; result: PgResult } {
    const c = this.core;
    const now = ctx.now;
    let person = c.people[cid];
    if (!person) {
      person = { pid: randomId(8), name, at: now };
      c.people[cid] = person;
      c.stats.visitors++;
      this.trimPeople();
    }
    person.name = name;
    person.at = now;
    const actor: PgActor = { peer, cid, pid: person.pid, name, host };

    // presença: os outros + esta pessoa (a conexão já pode aparecer em actors())
    const present = this.presentWith(ctx, actor);
    if (c.activeSince === null) c.activeSince = now;
    c.stats.peak = Math.max(c.stats.peak, people(present));
    this.sample(now, people(present));

    // cada pessoa tem o seu peixe; quem volta reencontra o mesmo
    let fish = c.fish.find((f) => f.cid === cid);
    if (!fish) {
      fish = {
        id: randomId(8),
        cid,
        pid: person.pid,
        ownerName: name,
        name: this.freshFishName(),
        species: STARTER[randomInt(STARTER.length)],
        pattern: FISH_PATTERNS[randomInt(FISH_PATTERNS.length)].id,
        hue: randomInt(360),
        hue2: randomInt(360),
        size: 1,
        fed: 0,
        fedAt: 0,
        seed: randomInt(1_000_000),
        born: now,
      };
      c.fish.push(fish);
      this.trimFish(present);
    }
    fish.ownerName = name;
    this.dirtyCore = true;

    const out: PgDelivery[] = [
      { to: 'sender', e: { k: 'state', s: this.snapshot(actor, present, now) } },
      { to: 'others', e: { k: 'fish', fish: this.fishViews(present) } },
    ];
    return { actor, result: { out } };
  }

  /** Alguém saiu (ctx.actors() já não inclui a pessoa). */
  leave(ctx: PgContext, actor: PgActor): PgResult {
    const c = this.core;
    const present = ctx.actors().filter((a) => a.peer !== actor.peer);
    this.rounds.delete(actor.peer);
    for (const key of [...this.openStrokes.keys()]) if (key.startsWith(actor.peer + ':')) this.finishOpen(key);
    if (present.length === 0 && c.activeSince !== null) {
      c.activeMs += Math.max(0, ctx.now - c.activeSince);
      c.activeSince = null;
    }
    this.sample(ctx.now, people(present));
    this.dirtyCore = true;
    return { out: [{ to: 'all', e: { k: 'fish', fish: this.fishViews(present) } }] };
  }

  /* ================= ações ================= */

  handle(ctx: PgContext, actor: PgActor, raw: unknown): PgResult {
    const a = parsePgAction(raw);
    if (!a) return this.err('invalid', isObj(raw) && typeof raw.k === 'string' ? (raw.k as PgAction['k']) : 'stats');
    if (a.k === 'sync') return this.err('invalid', 'sync');
    const c = this.core;
    const s = c.settings;
    const now = ctx.now;
    const muted = c.muted.includes(actor.cid);

    // Playground desligado: só o anfitrião mexe nos controles
    if (!s.enabled && !(actor.host && (a.k === 'settings' || a.k === 'mute' || a.k === 'stats' || a.k === 'sub'))) {
      return this.err('disabled', a.k);
    }

    switch (a.k) {
      case 'sub':
        return a.on ? { out: [{ to: 'sender', e: { k: 'paint', strokes: this.strokes } }], sub: { ch: 'paint', on: true } } : { out: [], sub: { ch: 'paint', on: false } };

      case 'settings': {
        if (!actor.host) return this.err('not-allowed', a.k);
        if (!this.cool(actor, 'settings', PG_COOLDOWN.settings, now)) return this.err('cooldown', a.k, PG_COOLDOWN.settings);
        Object.assign(s, a.patch);
        this.dirtyCore = true;
        return { out: [{ to: 'all', e: { k: 'settings', settings: { ...s } } }] };
      }

      case 'mute': {
        if (!actor.host) return this.err('not-allowed', a.k);
        const target = ctx.actors().find((x) => x.peer === a.peer);
        if (!target || target.host) return this.err('invalid', a.k);
        c.muted = c.muted.filter((m) => m !== target.cid);
        if (a.on) c.muted.push(target.cid);
        this.dirtyCore = true;
        return { out: [this.mutedDelivery(ctx)] };
      }

      case 'react': {
        if (muted) return this.err('muted', a.k);
        if (!s.reactions) return this.err('disabled', a.k);
        const gap = s.calm ? PG_COOLDOWN.reactCalm : PG_COOLDOWN.react;
        if (!this.cool(actor, 'react', gap, now)) return this.err('cooldown', a.k, gap);
        if (!this.windowOk(this.reactWindow, now, 1000, PG_ROOM_RATE.reactsPerSec)) return this.err('busy', a.k, 1000);
        c.stats.reactions++;
        this.dirtyCore = true;
        return { out: [{ to: 'all', e: { k: 'react', r: a.r, from: actor.pid, by: actor.name } }] };
      }

      case 'sound': {
        if (muted) return this.err('muted', a.k);
        if (!s.sounds || s.calm) return this.err('disabled', a.k);
        if (!this.cool(actor, 'sound', PG_COOLDOWN.sound, now)) return this.err('cooldown', a.k, PG_COOLDOWN.sound);
        this.soundTimes = this.soundTimes.filter((t) => now - t < 6000);
        if (this.soundTimes.length >= PG_ROOM_RATE.soundsPer6s) {
          this.last.delete(`${actor.peer}:sound`);
          return this.err('busy', a.k, 6000 - (now - this.soundTimes[0]));
        }
        this.soundTimes.push(now);
        c.stats.sounds++;
        this.dirtyCore = true;
        return { out: [{ to: 'all', e: { k: 'sound', s: a.s, from: actor.pid, by: actor.name } }] };
      }

      case 'vfx': {
        if (muted) return this.err('muted', a.k);
        if (!s.vfx || s.calm) return this.err('disabled', a.k);
        if (now - this.lastVfxAt < PG_ROOM_RATE.vfxGapMs) return this.err('busy', a.k, PG_ROOM_RATE.vfxGapMs - (now - this.lastVfxAt));
        if (!this.cool(actor, 'vfx', PG_COOLDOWN.vfx, now)) return this.err('cooldown', a.k, PG_COOLDOWN.vfx);
        this.lastVfxAt = now;
        c.stats.vfx++;
        this.dirtyCore = true;
        return { out: [{ to: 'all', e: { k: 'vfx', v: a.v, from: actor.pid, by: actor.name } }] };
      }

      case 'bubble-start':
        this.rounds.set(actor.peer, now);
        return { out: [] };

      case 'bubble-end': {
        const started = this.rounds.get(actor.peer);
        this.rounds.delete(actor.peer);
        const L = PG_LIMITS;
        // a rodada precisa ter durado de verdade (com folga para a rede)
        if (started === undefined || now - started < L.bubbleRoundMs - 4000 || now - started > L.bubbleRoundMs + 120_000) return this.err('invalid', a.k);
        // teto plausível: cada estouro vale no máximo 150 pontos × multiplicador 5
        if (a.combo > a.pops || a.score > a.pops * 150 * 5) return this.err('invalid', a.k);
        c.stats.bubbles += a.pops;
        c.stats.score += a.score;
        c.stats.rounds++;
        const row = c.board[actor.pid] ?? { pid: actor.pid, name: actor.name, best: 0, rounds: 0 };
        row.name = actor.name;
        row.rounds++;
        row.best = Math.max(row.best, a.score);
        c.board[actor.pid] = row;
        this.trimBoard();
        this.dirtyCore = true;
        return { out: [{ to: 'all', e: { k: 'board', rows: this.boardRows() } }] };
      }

      case 'fish-edit': {
        const fish = c.fish.find((f) => f.cid === actor.cid);
        if (!fish) return this.err('invalid', a.k);
        if (a.species && !unlockedSpecies(c.stats.feeds).includes(a.species)) return this.err('locked', a.k);
        if (!this.cool(actor, 'fish', PG_COOLDOWN.fishEdit, now)) return this.err('cooldown', a.k, PG_COOLDOWN.fishEdit);
        if (a.name !== undefined) {
          if (muted) return this.err('muted', a.k);
          fish.name = a.name;
        }
        if (a.species) fish.species = a.species;
        if (a.pattern) fish.pattern = a.pattern as FishPattern;
        if (a.hue !== undefined) fish.hue = a.hue;
        if (a.hue2 !== undefined) fish.hue2 = a.hue2;
        this.dirtyCore = true;
        return { out: [{ to: 'all', e: { k: 'fish', fish: this.fishViews(ctx.actors()) } }] };
      }

      case 'feed': {
        if (muted) return this.err('muted', a.k);
        if (!this.cool(actor, 'feed', PG_COOLDOWN.feed, now)) return this.err('cooldown', a.k, PG_COOLDOWN.feed);
        if (!this.windowOk(this.feedWindow, now, 1000, PG_ROOM_RATE.feedsPerSec)) return this.err('busy', a.k, 1000);
        let fish: FishRec | undefined;
        if (a.fish) {
          fish = c.fish.find((f) => f.id === a.fish);
          if (!fish) return this.err('invalid', a.k);
        } else if (c.fish.length) {
          // quem está há mais tempo sem comer tem mais chance de chegar primeiro
          const sorted = [...c.fish].sort((x, y) => x.fedAt - y.fedAt);
          fish = sorted[randomInt(Math.min(3, sorted.length))];
        }
        const before = unlockedSpecies(c.stats.feeds);
        c.stats.feeds++;
        if (fish) {
          fish.fed++;
          fish.fedAt = now;
          fish.size = Math.min(1.6, Math.round((1 + fish.fed * 0.025) * 1000) / 1000);
        }
        this.dirtyCore = true;
        const out: PgDelivery[] = [
          { to: 'all', e: { k: 'food', x: a.x, fish: fish?.id ?? null, size: fish?.size ?? 1, fed: fish?.fed ?? 0, from: actor.pid, by: actor.name, at: now } },
        ];
        for (const sp of unlockedSpecies(c.stats.feeds)) if (!before.includes(sp)) out.push({ to: 'all', e: { k: 'unlock', species: sp } });
        return { out };
      }

      case 'stroke':
        return this.stroke(actor, a, muted, now);

      case 'undo': {
        if (!this.cool(actor, 'undo', PG_COOLDOWN.undo, now)) return this.err('cooldown', a.k, PG_COOLDOWN.undo);
        for (let i = this.strokes.length - 1; i >= 0; i--) {
          const st = this.strokes[i];
          if (st.by !== actor.pid) continue;
          this.removeStrokes([st.n]);
          return { out: [{ to: 'paint', e: { k: 'unstroke', ns: [st.n] } }] };
        }
        return { out: [] };
      }

      case 'clear': {
        if (!this.cool(actor, 'clear', PG_COOLDOWN.clear, now)) return this.err('cooldown', a.k, PG_COOLDOWN.clear);
        if (a.mine) {
          const ns = this.strokes.filter((st) => st.by === actor.pid).map((st) => st.n);
          if (!ns.length) return { out: [] };
          this.removeStrokes(ns);
          return { out: [{ to: 'paint', e: { k: 'unstroke', ns } }] };
        }
        if (!actor.host && s.clear !== 'all') return this.err('not-allowed', a.k);
        if (muted) return this.err('muted', a.k);
        this.strokes = [];
        this.points = 0;
        this.openStrokes.clear();
        this.dirtyPaint = true;
        return { out: [{ to: 'paint', e: { k: 'paint-clear', by: actor.name } }] };
      }

      case 'spin': {
        if (muted) return this.err('muted', a.k);
        if (!actor.host && s.polls !== 'all') return this.err('not-allowed', a.k);
        if (c.spin && now - c.spin.at < PG_LIMITS.spinMs) return this.err('busy', a.k, PG_LIMITS.spinMs - (now - c.spin.at));
        if (!this.cool(actor, 'spin', PG_COOLDOWN.spin, now)) return this.err('cooldown', a.k, PG_COOLDOWN.spin);
        const spin: SpinView = { id: randomId(8), title: a.title, opts: a.opts, pick: randomInt(a.opts.length), from: actor.pid, by: actor.name, at: now };
        c.spin = spin;
        c.stats.spins++;
        this.dirtyCore = true;
        return { out: [{ to: 'all', e: { k: 'spin', spin } }] };
      }

      case 'poll-new': {
        if (muted) return this.err('muted', a.k);
        if (!actor.host && s.polls !== 'all') return this.err('not-allowed', a.k);
        if (c.poll?.open) return this.err('busy', a.k);
        if (!this.cool(actor, 'poll', PG_COOLDOWN.pollNew, now)) return this.err('cooldown', a.k, PG_COOLDOWN.pollNew);
        c.poll = { id: randomId(8), q: a.q, opts: a.opts.map((t) => ({ t, v: [] })), by: actor.pid, byName: actor.name, open: true, at: now, closedAt: null };
        c.stats.polls++;
        this.dirtyCore = true;
        return { out: [this.pollDelivery()] };
      }

      case 'vote': {
        const p = c.poll;
        if (!p || p.id !== a.poll || !p.open) return this.err('invalid', a.k);
        if (a.o >= p.opts.length) return this.err('invalid', a.k);
        if (!this.cool(actor, 'vote', PG_COOLDOWN.vote, now)) return this.err('cooldown', a.k, PG_COOLDOWN.vote);
        // um voto por pessoa (pelo id estável, não pela conexão): trocar de opção move o voto
        for (const o of p.opts) o.v = o.v.filter((pid) => pid !== actor.pid);
        p.opts[a.o].v.push(actor.pid);
        this.dirtyCore = true;
        return { out: [this.pollDelivery()] };
      }

      case 'poll-close': {
        const p = c.poll;
        if (!p || p.id !== a.poll || !p.open) return this.err('invalid', a.k);
        if (!actor.host && p.by !== actor.pid) return this.err('not-allowed', a.k);
        p.open = false;
        p.closedAt = now;
        this.dirtyCore = true;
        return { out: [this.pollDelivery()] };
      }

      case 'ask': {
        if (muted) return this.err('muted', a.k);
        if (!s.asks) return this.err('disabled', a.k);
        if (actor.host) return this.err('not-allowed', a.k);
        if (c.asks.filter((x) => x.status === 'pending').length >= PG_LIMITS.asksPendingMax) return this.err('full', a.k);
        if (!this.cool(actor, 'ask', PG_COOLDOWN.ask, now)) return this.err('cooldown', a.k, PG_COOLDOWN.ask);
        const ask: AskRec = { id: randomId(8), kind: a.kind as AskKind, text: a.text, by: actor.pid, byName: actor.name, status: 'pending', at: now };
        c.asks.push(ask);
        c.stats.asks++;
        this.trimAsks();
        this.dirtyCore = true;
        return { out: [this.asksDelivery()] };
      }

      case 'ask-answer': {
        if (!actor.host) return this.err('not-allowed', a.k);
        const ask = c.asks.find((x) => x.id === a.id);
        if (!ask) return this.err('invalid', a.k);
        ask.status = a.status as AskStatus;
        this.dirtyCore = true;
        return { out: [this.asksDelivery({ id: ask.id, status: ask.status, text: ask.text, kind: ask.kind, byName: ask.byName })] };
      }

      case 'pet': {
        if (!this.cool(actor, 'pet', PG_COOLDOWN.pet, now)) return this.err('cooldown', a.k, PG_COOLDOWN.pet);
        const pet = c.pet;
        if (a.act === 'feed') pet.fedAt = now;
        else if (a.act === 'pet') pet.pettedAt = now;
        else pet.tuckedAt = now;
        if (a.act !== 'tuck') pet.xp += 1;
        pet.last = { act: a.act, by: actor.name, at: now };
        c.stats.pets++;
        this.dirtyCore = true;
        return { out: [this.petDelivery()] };
      }

      case 'pet-name': {
        if (muted) return this.err('muted', a.k);
        if (!this.cool(actor, 'petName', PG_COOLDOWN.petName, now)) return this.err('cooldown', a.k, PG_COOLDOWN.petName);
        const pet = c.pet;
        // uma sugestão por pessoa: a nova substitui a anterior
        pet.suggestions = pet.suggestions.filter((x) => x.by !== actor.pid);
        if (pet.suggestions.length >= PG_LIMITS.petSuggestionsMax) return this.err('full', a.k);
        pet.suggestions.push({ id: randomId(6), name: a.name, by: actor.pid, votes: [actor.pid] });
        for (const x of pet.suggestions) if (x.by !== actor.pid) x.votes = x.votes.filter((v) => v !== actor.pid);
        this.adoptNameIfMajority(ctx);
        this.dirtyCore = true;
        return { out: [this.petDelivery()] };
      }

      case 'pet-vote': {
        if (!this.cool(actor, 'petVote', PG_COOLDOWN.petVote, now)) return this.err('cooldown', a.k, PG_COOLDOWN.petVote);
        const pet = c.pet;
        const sug = pet.suggestions.find((x) => x.id === a.id);
        if (!sug) return this.err('invalid', a.k);
        for (const x of pet.suggestions) x.votes = x.votes.filter((v) => v !== actor.pid);
        sug.votes.push(actor.pid);
        this.adoptNameIfMajority(ctx);
        this.dirtyCore = true;
        return { out: [this.petDelivery()] };
      }

      case 'pet-pick': {
        if (!actor.host) return this.err('not-allowed', a.k);
        const sug = c.pet.suggestions.find((x) => x.id === a.id);
        if (!sug) return this.err('invalid', a.k);
        c.pet.name = sug.name;
        c.pet.suggestions = [];
        this.dirtyCore = true;
        return { out: [this.petDelivery()] };
      }

      case 'pet-acc': {
        if (!this.cool(actor, 'petAcc', PG_COOLDOWN.petAcc, now)) return this.err('cooldown', a.k, PG_COOLDOWN.petAcc);
        if (a.acc !== null) {
          const stage = petStage(petTotalXp(this.petView(null), now)).stage;
          if (!unlockedAccessories(c.stats, stage).includes(a.acc)) return this.err('locked', a.k);
        }
        c.pet.acc = a.acc;
        this.dirtyCore = true;
        return { out: [this.petDelivery()] };
      }

      case 'stats': {
        if (!this.cool(actor, 'stats', PG_COOLDOWN.stats, now)) return this.err('cooldown', a.k, PG_COOLDOWN.stats);
        const v: PgStatsView = {
          now,
          stats: { ...c.stats },
          timeline: c.timeline.slice(),
          activeMs: c.activeMs,
          activeSince: c.activeSince,
          present: people(ctx.actors()),
        };
        return { out: [{ to: 'sender', e: { k: 'stats', v } }] };
      }
    }
  }

  /* ================= quadro ================= */

  private stroke(actor: PgActor, a: Extract<PgAction, { k: 'stroke' }>, muted: boolean, now: number): PgResult {
    const L = PG_LIMITS;
    const key = `${actor.peer}:${a.id}`;
    let st = this.openStrokes.get(key);
    const out: PgDelivery[] = [];
    if (!st) {
      if (muted) return this.err('muted', 'stroke');
      // ritmo: um traço novo a cada 60 ms no máximo por pessoa
      if (!this.cool(actor, 'stroke-new', 60, now)) return this.err('cooldown', 'stroke', 60);
      st = { n: ++this.core.seq, by: actor.pid, byName: actor.name, c: a.c, w: a.w, er: a.er, p: [], done: false };
      this.strokes.push(st);
      this.openStrokes.set(key, st);
      this.dirtyCore = true;
      out.push({ to: 'sender', e: { k: 'stroke-ack', id: a.id, n: st.n } });
    }
    const room = L.strokeMaxPoints * 2 - st.p.length;
    const add = a.p.slice(0, Math.max(0, room));
    for (const v of add) st.p.push(v);
    this.points += add.length / 2;
    const done = a.end || st.p.length >= L.strokeMaxPoints * 2;
    if (done) {
      st.done = true;
      this.openStrokes.delete(key);
      if (st.p.length >= 2) this.core.stats.strokes++;
    }
    this.dirtyPaint = true;
    out.push({ to: 'paint-others', e: { k: 'stroke', s: { ...st, p: add }, id: a.id } });
    const pruned = this.prune();
    if (pruned.length) out.push({ to: 'paint', e: { k: 'unstroke', ns: pruned } });
    return { out };
  }

  private finishOpen(key: string) {
    const st = this.openStrokes.get(key);
    if (st) st.done = true;
    this.openStrokes.delete(key);
  }

  private removeStrokes(ns: number[]) {
    const set = new Set(ns);
    this.strokes = this.strokes.filter((st) => {
      if (!set.has(st.n)) return true;
      this.points -= st.p.length / 2;
      return false;
    });
    for (const [k, st] of this.openStrokes) if (set.has(st.n)) this.openStrokes.delete(k);
    this.dirtyPaint = true;
  }

  /** Quadro cheio: os traços terminados mais antigos saem primeiro. */
  private prune(): number[] {
    const L = PG_LIMITS;
    const removed: number[] = [];
    while ((this.points > L.boardMaxPoints || this.strokes.length > L.boardMaxStrokes) && this.strokes.length) {
      const idx = this.strokes.findIndex((st) => st.done);
      if (idx < 0) break;
      const [st] = this.strokes.splice(idx, 1);
      this.points -= st.p.length / 2;
      removed.push(st.n);
    }
    return removed;
  }

  /* ================= retratos ================= */

  private presentWith(ctx: PgContext, actor: PgActor): PgActor[] {
    const others = ctx.actors().filter((x) => x.peer !== actor.peer);
    return [...others, actor];
  }

  snapshot(actor: PgActor, present: PgActor[], now: number): PgSnapshot {
    const c = this.core;
    const fish = c.fish.find((f) => f.cid === actor.cid);
    return {
      now,
      settings: { ...c.settings },
      you: { pid: actor.pid, fish: fish?.id ?? null, muted: c.muted.includes(actor.cid), best: c.board[actor.pid]?.best ?? 0 },
      fish: this.fishViews(present),
      board: this.boardRows(),
      poll: this.pollView(actor),
      asks: this.asksFor(actor),
      pet: this.petView(actor),
      stats: { ...c.stats },
      spin: c.spin && now - c.spin.at < PG_LIMITS.spinMs + 8000 ? c.spin : null,
      strokes: this.strokes.length,
      mutedPeers: actor.host ? present.filter((p) => c.muted.includes(p.cid)).map((p) => p.peer) : [],
    };
  }

  private fishViews(present: PgActor[]): FishView[] {
    const online = new Set(present.map((p) => p.cid));
    return this.core.fish.map((f) => ({
      id: f.id,
      owner: f.pid,
      ownerName: f.ownerName,
      online: online.has(f.cid),
      name: f.name,
      species: f.species,
      pattern: f.pattern,
      hue: f.hue,
      hue2: f.hue2,
      size: f.size,
      fed: f.fed,
      seed: f.seed,
      born: f.born,
    }));
  }

  private boardRows(): BoardRow[] {
    return Object.values(this.core.board)
      .sort((x, y) => y.best - x.best || x.rounds - y.rounds)
      .slice(0, PG_LIMITS.boardRows);
  }

  private pollView(r: PgActor | null): PollView | null {
    const p = this.core.poll;
    if (!p) return null;
    const mine = r ? p.opts.findIndex((o) => o.v.includes(r.pid)) : -1;
    return {
      id: p.id,
      q: p.q,
      opts: p.opts.map((o) => ({ t: o.t, n: o.v.length })),
      by: p.by,
      byName: p.byName,
      open: p.open,
      at: p.at,
      closedAt: p.closedAt,
      mine: mine >= 0 ? mine : null,
    };
  }

  /** O anfitrião vê a fila inteira; cada pessoa vê o que foi aceito e os próprios pedidos. */
  private asksFor(r: PgActor): AskView[] {
    return this.core.asks.filter((x) => r.host || x.by === r.pid || x.status === 'accepted' || x.status === 'done').map((x) => ({ ...x }));
  }

  private petView(r: PgActor | null): PetView {
    const p = this.core.pet;
    const c = this.core;
    return {
      name: p.name,
      xp: p.xp,
      activeMs: c.activeMs,
      activeSince: c.activeSince,
      born: p.born,
      fedAt: p.fedAt,
      pettedAt: p.pettedAt,
      tuckedAt: p.tuckedAt,
      acc: p.acc,
      suggestions: p.suggestions.map((x) => ({ id: x.id, name: x.name, by: x.by, votes: x.votes.length })),
      myVote: r ? (p.suggestions.find((x) => x.votes.includes(r.pid))?.id ?? null) : null,
      last: p.last,
    };
  }

  private pollDelivery(): PgDelivery {
    return { to: 'each', each: (r) => ({ k: 'poll', poll: this.pollView(r) }) };
  }

  private asksDelivery(changed?: Extract<PgEvent, { k: 'asks' }>['changed']): PgDelivery {
    return { to: 'each', each: (r) => ({ k: 'asks', items: this.asksFor(r), ...(changed && (r.host || changed.status !== 'pending') ? { changed } : {}) }) };
  }

  private petDelivery(): PgDelivery {
    return { to: 'each', each: (r) => ({ k: 'pet', pet: this.petView(r) }) };
  }

  private mutedDelivery(ctx: PgContext): PgDelivery {
    const muted = this.core.muted;
    return {
      to: 'each',
      each: (r) => ({ k: 'muted', me: muted.includes(r.cid), peers: r.host ? ctx.actors().filter((p) => muted.includes(p.cid)).map((p) => p.peer) : [] }),
    };
  }

  /* ================= miudezas ================= */

  /** Nome de peixe que ainda não está no aquário (se todos estiverem, repete). */
  private freshFishName(): string {
    const used = new Set(this.core.fish.map((f) => f.name));
    const free = FISH_NAMES.filter((n) => !used.has(n));
    const pool = free.length ? free : FISH_NAMES;
    return pool[randomInt(pool.length)];
  }

  private adoptNameIfMajority(ctx: PgContext) {
    const pet = this.core.pet;
    const present = Math.max(1, people(ctx.actors()));
    const need = Math.floor(present / 2) + 1;
    const win = pet.suggestions.find((x) => x.votes.length >= need);
    if (win) {
      pet.name = win.name;
      pet.suggestions = [];
    }
  }

  private cool(actor: PgActor, key: string, gap: number, now: number): boolean {
    const k = `${actor.peer}:${key}`;
    const prev = this.last.get(k) ?? -Infinity;
    if (now - prev < gap) return false;
    this.last.set(k, now);
    if (this.last.size > 4000) this.last.clear();
    return true;
  }

  private windowOk(w: { at: number; n: number }, now: number, span: number, max: number): boolean {
    if (now - w.at >= span) {
      w.at = now;
      w.n = 0;
    }
    if (w.n >= max) return false;
    w.n++;
    return true;
  }

  private err(code: PgErrCode, act: PgAction['k'], retry?: number): PgResult {
    return { out: [{ to: 'sender', e: { k: 'err', code, act, ...(retry !== undefined ? { retry: Math.max(0, Math.round(retry)) } : {}) } }] };
  }

  private sample(now: number, n: number) {
    const tl = this.core.timeline;
    const lastSample = tl[tl.length - 1];
    if (lastSample && now - lastSample[0] < 15_000) lastSample[1] = n;
    else tl.push([now, n]);
    if (tl.length > PG_LIMITS.timelineMax) tl.splice(0, tl.length - PG_LIMITS.timelineMax);
  }

  private trimPeople() {
    const entries = Object.entries(this.core.people);
    if (entries.length <= PG_LIMITS.peopleKept) return;
    entries.sort((x, y) => x[1].at - y[1].at);
    for (const [cid] of entries.slice(0, entries.length - PG_LIMITS.peopleKept)) delete this.core.people[cid];
  }

  /** Aquário cheio: sai o peixe mais antigo de quem não está mais na sala. */
  private trimFish(present: PgActor[]) {
    const online = new Set(present.map((p) => p.cid));
    const fish = this.core.fish;
    while (fish.length > PG_LIMITS.maxFish) {
      const idx = fish.findIndex((f) => !online.has(f.cid));
      fish.splice(idx >= 0 ? idx : 0, 1);
    }
  }

  private trimBoard() {
    const rows = Object.values(this.core.board);
    if (rows.length <= 60) return;
    rows.sort((x, y) => y.best - x.best);
    this.core.board = Object.fromEntries(rows.slice(0, 60).map((r) => [r.pid, r]));
  }

  private trimAsks() {
    const asks = this.core.asks;
    while (asks.length > PG_LIMITS.asksKept) {
      const idx = asks.findIndex((x) => x.status !== 'pending');
      asks.splice(idx >= 0 ? idx : 0, 1);
    }
  }
}

/** Para testes e ferramentas: espécies na ordem do catálogo. */
export const SPECIES_ORDER: FishSpecies[] = FISH_SPECIES.map((s) => s.id);
