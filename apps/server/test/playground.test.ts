import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import type { ServerMessage } from '../../../packages/protocol/src/index.ts';
import { createAlexandrusServer, type AlexandrusServer } from '../src/index.ts';
import { PlaygroundEngine, type PgActor, type PgResult } from '../../../packages/protocol/src/playground-engine.ts';
import { PG_COOLDOWN, PG_LIMITS, PG_ROOM_RATE, type PgEvent } from '../../../packages/protocol/src/playground.ts';

/* ================= Parte A: motor puro ================= */

const T0 = 1_700_000_000_000;
let seq = 0;
const newCid = () => `cid${String(++seq).padStart(4, '0')}abcdefghijklmnop`;

class World {
  now = T0;
  list: PgActor[] = [];
  eng: PlaygroundEngine;
  constructor(core?: unknown, paint?: unknown) {
    this.eng = new PlaygroundEngine(core, paint, T0);
  }
  ctx() {
    return { now: this.now, actors: () => this.list };
  }
  join(peer: string, name = peer, host = false, cid = newCid()) {
    const { actor, result } = this.eng.sync(this.ctx(), peer, cid, name, host);
    this.list = this.list.filter((a) => a.peer !== peer);
    this.list.push(actor);
    return { actor, result };
  }
  do(actor: PgActor, raw: unknown): PgResult {
    return this.eng.handle(this.ctx(), actor, raw);
  }
  leave(actor: PgActor): PgResult {
    this.list = this.list.filter((a) => a.peer !== actor.peer);
    return this.eng.leave(this.ctx(), actor);
  }
  advance(ms: number) {
    this.now += ms;
  }
}

/** Eventos que `me` receberia de um resultado enviado por `sender`. */
function ev(res: PgResult, me: PgActor, sender: PgActor, paint = false): PgEvent[] {
  const out: PgEvent[] = [];
  for (const d of res.out) {
    if (d.to === 'each') {
      const e = d.each(me);
      if (e) out.push(e);
      continue;
    }
    const isSender = me.peer === sender.peer;
    const ok =
      d.to === 'all' ||
      (d.to === 'others' && !isSender) ||
      (d.to === 'sender' && isSender) ||
      (d.to === 'host' && me.host) ||
      (d.to === 'paint' && paint) ||
      (d.to === 'paint-others' && paint && !isSender);
    if (ok) out.push(d.e);
  }
  return out;
}

function pick<K extends PgEvent['k']>(evs: PgEvent[], k: K): Extract<PgEvent, { k: K }> | undefined {
  return evs.find((e) => e.k === k) as Extract<PgEvent, { k: K }> | undefined;
}
function need<K extends PgEvent['k']>(evs: PgEvent[], k: K): Extract<PgEvent, { k: K }> {
  const e = pick(evs, k);
  assert.ok(e, `evento ${k} ausente em ${JSON.stringify(evs)}`);
  return e;
}
/** Código do erro que o próprio remetente recebe (ou undefined). */
function errOf(res: PgResult, sender: PgActor): string | undefined {
  return pick(ev(res, sender, sender), 'err')?.code;
}

/** Ações de `settings` têm intervalo próprio de 250 ms por anfitrião. */
function setSettings(w: World, host: PgActor, patch: object) {
  w.advance(300);
  const r = w.do(host, { k: 'settings', patch });
  assert.equal(errOf(r, host), undefined);
  return r;
}

function statsOf(w: World, actor: PgActor) {
  w.advance(PG_COOLDOWN.stats + 1);
  return need(ev(w.do(actor, { k: 'stats' }), actor, actor), 'stats').v;
}

describe('Playground: motor', () => {
  test('1. sync cria pessoa e peixe, re-sync mantém, visitantes únicos', () => {
    const w = new World();
    const cidA = newCid();
    const A = w.join('a', 'Ana', false, cidA);
    const B = w.join('b', 'Bia');
    const stateA = need(ev(A.result, A.actor, A.actor), 'state').s;
    assert.equal(stateA.you.pid, A.actor.pid);
    assert.equal(stateA.fish.length, 1);
    assert.equal(stateA.you.fish, stateA.fish[0].id);
    assert.equal(stateA.fish[0].owner, A.actor.pid);
    // quem já estava recebe 'fish' dos outros que entram
    assert.equal(pick(ev(B.result, A.actor, B.actor), 'fish')?.fish.length, 2);
    assert.equal(pick(ev(B.result, B.actor, B.actor), 'fish'), undefined);

    const A2 = w.join('a2', 'Ana', false, cidA);
    assert.equal(A2.actor.pid, A.actor.pid);
    const stateA2 = need(ev(A2.result, A2.actor, A2.actor), 'state').s;
    assert.equal(stateA2.fish.length, 2);
    assert.equal(stateA2.you.fish, stateA.you.fish);
    assert.equal(stateA2.stats.visitors, 2);
  });

  test('2. react: todos recebem, cooldown, calmo e desligado', () => {
    const w = new World();
    const H = w.join('h', 'Host', true).actor;
    const A = w.join('a').actor;
    const B = w.join('b').actor;
    const r1 = w.do(A, { k: 'react', r: 'heart' });
    for (const who of [H, A, B]) {
      const e = need(ev(r1, who, A), 'react');
      assert.equal(e.from, A.pid);
      assert.equal(e.r, 'heart');
    }
    w.advance(PG_COOLDOWN.react - 1);
    const r2 = w.do(A, { k: 'react', r: 'star' });
    assert.equal(errOf(r2, A), 'cooldown');
    assert.equal(ev(r2, B, A).length, 0);
    w.advance(1);
    assert.equal(errOf(w.do(A, { k: 'react', r: 'star' }), A), undefined);

    setSettings(w, H, { calm: true });
    const t = w.now;
    assert.equal(errOf(w.do(B, { k: 'react', r: 'fire' }), B), undefined);
    w.now = t + 1000;
    assert.equal(errOf(w.do(B, { k: 'react', r: 'fire' }), B), 'cooldown');
    w.now = t + PG_COOLDOWN.reactCalm;
    assert.equal(errOf(w.do(B, { k: 'react', r: 'fire' }), B), undefined);

    setSettings(w, H, { reactions: false });
    w.advance(10_000);
    assert.equal(errOf(w.do(A, { k: 'react', r: 'star' }), A), 'disabled');
  });

  test('3. settings: só anfitrião; enabled=false desliga para os outros', () => {
    const w = new World();
    const H = w.join('h', 'Host', true).actor;
    const A = w.join('a').actor;
    assert.equal(errOf(w.do(A, { k: 'settings', patch: { calm: true } }), A), 'not-allowed');
    const r = setSettings(w, H, { calm: true });
    assert.equal(need(ev(r, A, H), 'settings').settings.calm, true);
    assert.equal(need(ev(r, H, H), 'settings').settings.calm, true);

    setSettings(w, H, { enabled: false });
    w.advance(10_000);
    assert.equal(errOf(w.do(A, { k: 'react', r: 'heart' }), A), 'disabled');
    assert.equal(errOf(w.do(A, { k: 'pet', act: 'pet' }), A), 'disabled');
    assert.equal(errOf(w.do(H, { k: 'react', r: 'heart' }), H), 'disabled');
    // anfitrião ainda mexe nos controles
    const back = setSettings(w, H, { enabled: true });
    assert.equal(need(ev(back, A, H), 'settings').settings.enabled, true);
    assert.equal(errOf(w.do(A, { k: 'pet', act: 'pet' }), A), undefined);
  });

  test('4. sound: limite da sala e intervalo por pessoa', () => {
    const w = new World();
    const actors = ['a', 'b', 'c', 'd', 'e'].map((p) => w.join(p).actor);
    const codes = actors.map((a) => errOf(w.do(a, { k: 'sound', s: 'pop' }), a));
    assert.deepEqual(codes.slice(0, PG_ROOM_RATE.soundsPer6s), Array(PG_ROOM_RATE.soundsPer6s).fill(undefined));
    assert.equal(codes[4], 'busy');
    // depois da janela de 6 s volta
    w.advance(6001);
    assert.equal(errOf(w.do(actors[4], { k: 'sound', s: 'pop' }), actors[4]), undefined);

    const w2 = new World();
    const A = w2.join('a').actor;
    assert.equal(errOf(w2.do(A, { k: 'sound', s: 'ding' }), A), undefined);
    w2.advance(PG_COOLDOWN.sound - 1);
    assert.equal(errOf(w2.do(A, { k: 'sound', s: 'ding' }), A), 'cooldown');
    w2.advance(1);
    assert.equal(errOf(w2.do(A, { k: 'sound', s: 'ding' }), A), undefined);
  });

  test('5. mute: silenciado não reage; entrega por destinatário', () => {
    const w = new World();
    const H = w.join('h', 'Host', true).actor;
    const P = w.join('p').actor;
    const Q = w.join('q').actor;
    assert.equal(errOf(w.do(P, { k: 'mute', peer: 'q', on: true }), P), 'not-allowed');
    assert.equal(errOf(w.do(H, { k: 'mute', peer: 'h', on: true }), H), 'invalid');
    const r = w.do(H, { k: 'mute', peer: 'p', on: true });
    const forP = need(ev(r, P, H), 'muted');
    assert.equal(forP.me, true);
    assert.deepEqual(forP.peers, []);
    const forH = need(ev(r, H, H), 'muted');
    assert.equal(forH.me, false);
    assert.deepEqual(forH.peers, ['p']);
    const forQ = need(ev(r, Q, H), 'muted');
    assert.equal(forQ.me, false);
    assert.deepEqual(forQ.peers, []);
    assert.equal(errOf(w.do(P, { k: 'react', r: 'heart' }), P), 'muted');
    assert.equal(errOf(w.do(Q, { k: 'react', r: 'heart' }), Q), undefined);
    // desmutar
    w.do(H, { k: 'mute', peer: 'p', on: false });
    w.advance(1000);
    assert.equal(errOf(w.do(P, { k: 'react', r: 'heart' }), P), undefined);
  });

  test('6. poll: criação, votos, troca, mesma pessoa, fechar, mine por pessoa', () => {
    const w = new World();
    const H = w.join('h', 'Host', true).actor;
    const cidA = newCid();
    const A = w.join('a', 'Ana', false, cidA).actor;
    const B = w.join('b').actor;
    const C = w.join('c').actor;

    setSettings(w, H, { polls: 'host' });
    assert.equal(errOf(w.do(A, { k: 'poll-new', q: 'Pizza?', opts: ['sim', 'não'] }), A), 'not-allowed');
    setSettings(w, H, { polls: 'all' });

    const created = w.do(A, { k: 'poll-new', q: 'Pizza?', opts: ['sim', 'não'] });
    const pollId = need(ev(created, B, A), 'poll').poll!.id;
    assert.equal(errOf(w.do(B, { k: 'poll-new', q: 'Outra?', opts: ['a', 'b'] }), B), 'busy');

    const v1 = w.do(A, { k: 'vote', poll: pollId, o: 0 });
    assert.deepEqual(need(ev(v1, B, A), 'poll').poll!.opts.map((o) => o.n), [1, 0]);
    // mesmo voto logo em seguida: cooldown, nada muda
    assert.equal(errOf(w.do(A, { k: 'vote', poll: pollId, o: 0 }), A), 'cooldown');
    w.advance(PG_COOLDOWN.vote + 1);
    const v2 = w.do(A, { k: 'vote', poll: pollId, o: 1 });
    assert.deepEqual(need(ev(v2, B, A), 'poll').poll!.opts.map((o) => o.n), [0, 1]);

    // segunda conexão da mesma pessoa (mesmo cid): não conta em dobro
    const A2 = w.join('a2', 'Ana', false, cidA).actor;
    assert.equal(A2.pid, A.pid);
    const v3 = w.do(A2, { k: 'vote', poll: pollId, o: 1 });
    assert.deepEqual(need(ev(v3, B, A2), 'poll').poll!.opts.map((o) => o.n), [0, 1]);

    w.advance(PG_COOLDOWN.vote + 1);
    w.do(C, { k: 'vote', poll: pollId, o: 0 });
    w.advance(PG_COOLDOWN.vote + 1);
    const vb = w.do(B, { k: 'vote', poll: pollId, o: 1 });
    assert.deepEqual(need(ev(vb, B, B), 'poll').poll!.opts.map((o) => o.n), [1, 2]);
    assert.equal(need(ev(vb, A, B), 'poll').poll!.mine, 1);
    assert.equal(need(ev(vb, B, B), 'poll').poll!.mine, 1);
    assert.equal(need(ev(vb, C, B), 'poll').poll!.mine, 0);
    assert.equal(need(ev(vb, H, B), 'poll').poll!.mine, null);

    assert.equal(errOf(w.do(B, { k: 'poll-close', poll: pollId }), B), 'not-allowed');
    const closed = w.do(A, { k: 'poll-close', poll: pollId });
    assert.equal(need(ev(closed, B, A), 'poll').poll!.open, false);
    w.advance(PG_COOLDOWN.vote + 1);
    assert.equal(errOf(w.do(B, { k: 'vote', poll: pollId, o: 0 }), B), 'invalid');
  });

  test('7. spin: pick válido, ocupado durante a animação, cooldown pessoal', () => {
    const w = new World();
    const A = w.join('a').actor;
    const B = w.join('b').actor;
    const opts = ['x', 'y', 'z'];
    const r = w.do(A, { k: 'spin', title: 'Quem?', opts });
    const spin = need(ev(r, B, A), 'spin').spin;
    assert.ok(Number.isInteger(spin.pick) && spin.pick >= 0 && spin.pick < opts.length);
    assert.deepEqual(spin.opts, opts);
    w.advance(1000);
    assert.equal(errOf(w.do(B, { k: 'spin', title: 'Outra', opts }), B), 'busy');
    w.advance(PG_LIMITS.spinMs);
    // B já pode; A ainda está no cooldown pessoal de 8 s
    assert.equal(errOf(w.do(A, { k: 'spin', title: 'Outra', opts }), A), 'cooldown');
    assert.equal(errOf(w.do(B, { k: 'spin', title: 'Outra', opts }), B), undefined);
    w.advance(PG_LIMITS.spinMs);
    assert.equal(errOf(w.do(A, { k: 'spin', title: 'Mais uma', opts }), A), undefined);
  });

  test('8. paint: traços, undo, clear, assinatura', () => {
    const w = new World();
    const H = w.join('h', 'Host', true).actor;
    const A = w.join('a').actor;
    const B = w.join('b').actor;

    const r1 = w.do(A, { k: 'stroke', id: 's1', c: '#ff0000', w: 6, er: false, p: [10, 10, 20, 20], end: false });
    const ack = need(ev(r1, A, A), 'stroke-ack');
    assert.equal(ack.id, 's1');
    assert.equal(pick(ev(r1, A, A, true), 'stroke'), undefined, 'remetente não recebe o próprio traço');
    assert.equal(need(ev(r1, B, A, true), 'stroke').s.p.length, 4);
    assert.equal(pick(ev(r1, B, A, false), 'stroke'), undefined, 'sem assinatura não recebe');

    const r2 = w.do(A, { k: 'stroke', id: 's1', c: '#ff0000', w: 6, er: false, p: [30, 30], end: true });
    assert.equal(pick(ev(r2, A, A), 'stroke-ack'), undefined);
    const chunk = need(ev(r2, B, A, true), 'stroke');
    assert.deepEqual(chunk.s.p, [30, 30]);
    assert.equal(chunk.s.done, true);
    assert.equal(statsOf(w, A).stats.strokes, 1);

    const sub = w.do(B, { k: 'sub', ch: 'paint', on: true });
    assert.deepEqual(sub.sub, { ch: 'paint', on: true });
    const snap = need(ev(sub, B, B), 'paint').strokes;
    assert.equal(snap.length, 1);
    assert.deepEqual(snap[0].p, [10, 10, 20, 20, 30, 30]);
    assert.equal(snap[0].done, true);
    assert.deepEqual(w.do(B, { k: 'sub', ch: 'paint', on: false }).sub, { ch: 'paint', on: false });

    // undo: B não tem traços; A desfaz o seu
    w.advance(200);
    assert.equal(w.do(B, { k: 'undo' }).out.length, 0);
    const un = w.do(A, { k: 'undo' });
    assert.deepEqual(need(ev(un, B, A, true), 'unstroke').ns, [ack.n]);

    // clear mine
    const ns: number[] = [];
    for (const id of ['m1', 'm2']) {
      w.advance(100);
      ns.push(need(ev(w.do(A, { k: 'stroke', id, c: '#00ff00', w: 4, er: false, p: [1, 1, 2, 2], end: true }), A, A), 'stroke-ack').n);
    }
    w.advance(PG_COOLDOWN.clear + 1);
    const cm = w.do(A, { k: 'clear', mine: true });
    assert.deepEqual(need(ev(cm, B, A, true), 'unstroke').ns, ns);

    // clear all
    w.advance(100);
    w.do(B, { k: 'stroke', id: 'b1', c: '#0000ff', w: 4, er: false, p: [5, 5, 6, 6], end: true });
    w.advance(PG_COOLDOWN.clear + 1);
    assert.equal(errOf(w.do(A, { k: 'clear', mine: false }), A), 'not-allowed');
    w.advance(PG_COOLDOWN.clear + 1);
    const ch = w.do(H, { k: 'clear', mine: false });
    assert.equal(need(ev(ch, B, H, true), 'paint-clear').by, 'Host');
    assert.equal(need(ev(w.do(A, { k: 'sub', ch: 'paint', on: true }), A, A), 'paint').strokes.length, 0);
  });

  test('8b. paint: poda os traços terminados mais antigos', () => {
    const w = new World();
    const A = w.join('a').actor;
    const first: number[] = [];
    const pruned: number[] = [];
    const chunk = Array.from({ length: PG_LIMITS.chunkMaxNums }, (_, i) => 100 + (i % 50));
    const perStroke = PG_LIMITS.chunkMaxNums / 2;
    const total = Math.floor(PG_LIMITS.boardMaxPoints / perStroke) + 10;
    for (let i = 0; i < total; i++) {
      w.advance(100);
      const r = w.do(A, { k: 'stroke', id: `p${i}`, c: '#123456', w: 3, er: false, p: chunk, end: true });
      assert.equal(errOf(r, A), undefined);
      if (i === 0) first.push(need(ev(r, A, A), 'stroke-ack').n);
      const u = pick(ev(r, A, A, true), 'unstroke');
      if (u) pruned.push(...u.ns);
    }
    assert.ok(pruned.length > 0, 'nada foi podado');
    assert.equal(pruned[0], first[0], 'o mais antigo sai primeiro');
    const left = need(ev(w.do(A, { k: 'sub', ch: 'paint', on: true }), A, A), 'paint').strokes;
    assert.equal(left.length + pruned.length, total);
    assert.ok(left.reduce((n, s) => n + s.p.length / 2, 0) <= PG_LIMITS.boardMaxPoints);
  });

  test('9. bubble: validações e placar', () => {
    const w = new World();
    const A = w.join('a', 'Ana').actor;
    const B = w.join('b').actor;
    assert.equal(errOf(w.do(A, { k: 'bubble-end', score: 100, pops: 10, combo: 2 }), A), 'invalid');

    w.do(A, { k: 'bubble-start' });
    w.advance(10_000);
    assert.equal(errOf(w.do(A, { k: 'bubble-end', score: 100, pops: 10, combo: 2 }), A), 'invalid', 'cedo demais');

    w.do(A, { k: 'bubble-start' });
    w.advance(60_000);
    const ok = w.do(A, { k: 'bubble-end', score: 900, pops: 20, combo: 5 });
    const rows = need(ev(ok, B, A), 'board').rows;
    assert.equal(rows[0].pid, A.pid);
    assert.equal(rows[0].best, 900);
    assert.equal(rows[0].rounds, 1);

    w.do(A, { k: 'bubble-start' });
    w.advance(60_000);
    assert.equal(errOf(w.do(A, { k: 'bubble-end', score: 10 * 750 + 1, pops: 10, combo: 1 }), A), 'invalid', 'pontos demais');

    w.do(A, { k: 'bubble-start' });
    w.advance(60_000);
    const lower = need(ev(w.do(A, { k: 'bubble-end', score: 300, pops: 10, combo: 1 }), B, A), 'board').rows;
    assert.equal(lower[0].best, 900);
    assert.equal(lower[0].rounds, 2);
  });

  test('10. feed: contadores, desbloqueio e fish-edit', () => {
    const w = new World();
    const A = w.join('a');
    const fishId = need(ev(A.result, A.actor, A.actor), 'state').s.you.fish!;
    // espécie bloqueada
    assert.equal(errOf(w.do(A.actor, { k: 'fish-edit', species: 'neon' }), A.actor), 'locked');

    const unlocks: string[] = [];
    let last: Extract<PgEvent, { k: 'food' }> | undefined;
    for (let i = 1; i <= 10; i++) {
      w.advance(PG_COOLDOWN.feed + 1);
      const r = w.do(A.actor, { k: 'feed', x: 500, fish: fishId });
      assert.equal(errOf(r, A.actor), undefined);
      last = need(ev(r, A.actor, A.actor), 'food');
      const u = pick(ev(r, A.actor, A.actor), 'unlock');
      if (u) unlocks.push(`${i}:${u.species}`);
    }
    assert.deepEqual(unlocks, ['10:neon']);
    assert.equal(last!.fed, 10);
    assert.equal(last!.size, 1.25);
    assert.equal(last!.fish, fishId);
    assert.equal(statsOf(w, A.actor).stats.feeds, 10);

    w.advance(PG_COOLDOWN.fishEdit + 1);
    const edit = w.do(A.actor, { k: 'fish-edit', species: 'neon', name: 'Nemo', hue: 120 });
    const mine = need(ev(edit, A.actor, A.actor), 'fish').fish.find((f) => f.id === fishId)!;
    assert.equal(mine.species, 'neon');
    assert.equal(mine.name, 'Nemo');
    assert.equal(mine.hue, 120);
    // comida rápida demais é barrada
    assert.equal(errOf(w.do(A.actor, { k: 'feed', x: 1 }), A.actor), undefined);
    assert.equal(errOf(w.do(A.actor, { k: 'feed', x: 1 }), A.actor), 'cooldown');
  });

  test('11. pet: xp, nomes por maioria, host escolhe, acessório bloqueado', () => {
    const w = new World();
    const H = w.join('h', 'Host', true).actor;
    const A = w.join('a').actor;
    const B = w.join('b').actor;

    const r = w.do(A, { k: 'pet', act: 'pet' });
    const p = need(ev(r, B, A), 'pet').pet;
    assert.equal(p.xp, 1);
    assert.equal(p.last?.act, 'pet');
    assert.equal(statsOf(w, A).stats.pets, 1);

    const sug = need(ev(w.do(A, { k: 'pet-name', name: 'Fulano' }), B, A), 'pet').pet;
    assert.equal(sug.name, null);
    assert.equal(sug.suggestions.length, 1);
    assert.equal(sug.suggestions[0].votes, 1);
    w.advance(PG_COOLDOWN.petVote + 1);
    const adopted = need(ev(w.do(B, { k: 'pet-vote', id: sug.suggestions[0].id }), A, B), 'pet').pet;
    assert.equal(adopted.name, 'Fulano');
    assert.equal(adopted.suggestions.length, 0);

    // host adota direto
    w.advance(PG_COOLDOWN.petName + 1);
    const s2 = need(ev(w.do(A, { k: 'pet-name', name: 'Beltrano' }), H, A), 'pet').pet;
    assert.equal(s2.name, 'Fulano');
    assert.equal(errOf(w.do(B, { k: 'pet-pick', id: s2.suggestions[0].id }), B), 'not-allowed');
    const picked = need(ev(w.do(H, { k: 'pet-pick', id: s2.suggestions[0].id }), A, H), 'pet').pet;
    assert.equal(picked.name, 'Beltrano');
    assert.equal(picked.suggestions.length, 0);

    w.advance(PG_COOLDOWN.petAcc + 1);
    assert.equal(errOf(w.do(A, { k: 'pet-acc', acc: 'oculos' }), A), 'locked');
    w.advance(PG_COOLDOWN.petAcc + 1);
    assert.equal(need(ev(w.do(A, { k: 'pet-acc', acc: 'folha' }), B, A), 'pet').pet.acc, 'folha');
  });

  test('12. asks: visibilidade por papel e resposta do anfitrião', () => {
    const w = new World();
    const H = w.join('h', 'Host', true).actor;
    const A = w.join('a', 'Ana').actor;
    const B = w.join('b').actor;
    assert.equal(errOf(w.do(H, { k: 'ask', kind: 'challenge', text: 'dança' }), H), 'not-allowed');
    const r = w.do(A, { k: 'ask', kind: 'challenge', text: 'dance uma música' });
    assert.equal(need(ev(r, H, A), 'asks').items.length, 1);
    assert.equal(need(ev(r, A, A), 'asks').items.length, 1);
    assert.equal(need(ev(r, B, A), 'asks').items.length, 0);
    assert.equal(pick(ev(r, B, A), 'asks')?.changed, undefined);
    const id = need(ev(r, H, A), 'asks').items[0].id;

    assert.equal(errOf(w.do(B, { k: 'ask-answer', id, status: 'accepted' }), B), 'not-allowed');
    const ans = w.do(H, { k: 'ask-answer', id, status: 'accepted' });
    for (const who of [H, A, B]) {
      const e = need(ev(ans, who, H), 'asks');
      assert.equal(e.items.length, 1);
      assert.equal(e.items[0].status, 'accepted');
      assert.equal(e.changed?.id, id);
      assert.equal(e.changed?.status, 'accepted');
    }
  });

  test('13. persistência: restaura e tolera lixo', () => {
    const w = new World();
    const H = w.join('h', 'Host', true).actor;
    const cidA = newCid();
    const A = w.join('a', 'Ana', false, cidA);
    const fishId = need(ev(A.result, A.actor, A.actor), 'state').s.you.fish!;
    w.advance(2000);
    w.do(A.actor, { k: 'feed', x: 10, fish: fishId });
    w.do(A.actor, { k: 'stroke', id: 's1', c: '#abcdef', w: 5, er: false, p: [1, 2, 3, 4], end: true });
    setSettings(w, H, { calm: true, polls: 'host' });
    const core = JSON.parse(JSON.stringify(w.eng.saveCore()));
    const paint = JSON.parse(JSON.stringify(w.eng.savePaint()));
    assert.equal(w.eng.dirtyCore, false);
    assert.equal(w.eng.dirtyPaint, false);

    const w2 = new World(core, paint);
    const back = w2.join('a', 'Ana', false, cidA);
    const s = need(ev(back.result, back.actor, back.actor), 'state').s;
    assert.equal(back.actor.pid, A.actor.pid);
    assert.equal(s.you.fish, fishId);
    assert.equal(s.fish.find((f) => f.id === fishId)!.fed, 1);
    assert.equal(s.stats.feeds, 1);
    assert.equal(s.stats.strokes, 1);
    assert.equal(s.settings.calm, true);
    assert.equal(s.settings.polls, 'host');
    assert.equal(s.strokes, 1);
    const strokes = need(ev(w2.do(back.actor, { k: 'sub', ch: 'paint', on: true }), back.actor, back.actor), 'paint').strokes;
    assert.equal(strokes.length, 1);
    assert.deepEqual(strokes[0].p, [1, 2, 3, 4]);
    assert.equal(strokes[0].done, true);

    for (const junk of [{ v: 2 }, 'x', null, undefined, 42, [], { v: 1, fish: 'x', people: 7, settings: 'a' }]) {
      const w3 = new World(junk, junk);
      const j = w3.join('z', 'Zé');
      const st = need(ev(j.result, j.actor, j.actor), 'state').s;
      assert.equal(st.fish.length, 1);
      assert.equal(st.settings.enabled, true);
      assert.equal(w3.eng.saveCore().v, 1);
      assert.equal(w3.eng.savePaint().strokes.length, 0);
    }
  });

  test('14. leave: soma o tempo ativo só quando o último sai', () => {
    const w = new World();
    const A = w.join('a').actor;
    w.advance(30_000);
    const B = w.join('b').actor;
    w.advance(30_000);
    const first = w.leave(A);
    assert.equal(need(ev(first, B, A), 'fish').fish.filter((f) => f.online).length, 1);
    let v = statsOf(w, B);
    assert.equal(v.activeSince, T0);
    assert.equal(v.activeMs, 0);
    assert.equal(v.present, 1);

    w.advance(60_000);
    const leftAt = w.now;
    w.leave(B);
    // consulta pelo ator que já saiu (a ação não depende de presença)
    v = statsOf(w, B);
    assert.equal(v.activeSince, null);
    assert.equal(v.activeMs, leftAt - T0);
    assert.equal(v.present, 0);
  });
});

/* ================= Parte B: WebSocket ================= */

let app: AlexandrusServer;
let base: string;

before(async () => {
  app = await createAlexandrusServer({ port: 0, host: '127.0.0.1', maxViewers: 8, hostGraceMs: 200, publicDir: '/nao-existe' });
  base = `127.0.0.1:${app.port}`;
});
after(async () => {
  for (const c of opened) c.ws.close();
  await app.close();
});

type PgMsg = Extract<ServerMessage, { t: 'pg' }>;
interface Client {
  ws: WebSocket;
  msgs: ServerMessage[];
  send(m: unknown): void;
  waitFor<T extends ServerMessage['t']>(t: T, pred?: (m: Extract<ServerMessage, { t: T }>) => boolean): Promise<Extract<ServerMessage, { t: T }>>;
  pg(k: PgEvent['k']): PgMsg[];
}
const opened: Client[] = [];

async function connect(): Promise<Client> {
  const ws = new WebSocket(`ws://${base}/ws`);
  const msgs: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (d) => {
    msgs.push(JSON.parse(d.toString()));
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  const c: Client = {
    ws,
    msgs,
    send: (m) => ws.send(JSON.stringify(m)),
    async waitFor(t, pred) {
      const deadline = Date.now() + 2000;
      let seen = 0;
      for (;;) {
        for (; seen < msgs.length; seen++) {
          const m = msgs[seen];
          if (m.t === t && (!pred || pred(m as never))) return m as never;
        }
        if (Date.now() > deadline) throw new Error(`timeout esperando ${t}; recebido: ${JSON.stringify(msgs)}`);
        await new Promise<void>((res) => {
          waiters.push(res);
          setTimeout(res, 50);
        });
      }
    },
    pg: (k) => msgs.filter((m): m is PgMsg => m.t === 'pg' && m.e.k === k),
  };
  opened.push(c);
  return c;
}

function newRoom() {
  const r = app.registry.create({ name: 'Sala PG', hostName: 'Ana', visibility: 'private' });
  return { code: app.registry.summary(r).code, hostKey: r.hostKey };
}
async function joinHost(room: { code: string; hostKey: string }) {
  const c = await connect();
  c.send({ t: 'join', v: 2, code: room.code, role: 'host', hostKey: room.hostKey, name: 'Ana' });
  const joined = await c.waitFor('joined');
  return { c, joined };
}
async function joinViewer(room: { code: string }, name = 'Bia') {
  const c = await connect();
  c.send({ t: 'join', v: 2, code: room.code, role: 'viewer', name });
  const joined = await c.waitFor('joined');
  return { c, joined };
}
const wsCid = () => `ws-${Date.now().toString(36)}-${String(++seq).padStart(6, '0')}-abcdef`;
const pause = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

async function syncClient(c: Client) {
  c.send({ t: 'pg', a: { k: 'sync', cid: wsCid() } });
  await c.waitFor('pg', (m) => m.e.k === 'state');
}

describe('Playground: WebSocket', () => {
  test('joined anuncia a feature playground', async () => {
    const room = newRoom();
    const { joined } = await joinHost(room);
    assert.ok(joined.features?.includes('playground'));
    const v = await joinViewer(room);
    assert.ok(v.joined.features?.includes('playground'));
  });

  test('sync devolve state; cid inválido e pg sem sync dão erro', async () => {
    const room = newRoom();
    const { c: host } = await joinHost(room);
    const { c: v } = await joinViewer(room);

    v.send({ t: 'pg', a: { k: 'react', r: 'heart' } });
    await v.waitFor('error', (m) => m.code === 'not-joined');

    v.send({ t: 'pg', a: { k: 'sync', cid: 'curto' } });
    await v.waitFor('error', (m) => m.code === 'bad-request');

    v.send({ t: 'pg', a: { k: 'sync', cid: wsCid() } });
    const st = await v.waitFor('pg', (m) => m.e.k === 'state');
    assert.equal(st.e.k, 'state');
    if (st.e.k === 'state') {
      assert.equal(st.e.s.fish.length, 1);
      assert.equal(st.e.s.you.fish, st.e.s.fish[0].id);
    }
    assert.equal(host.pg('state').length, 0);
  });

  test('reação do espectador chega ao anfitrião', async () => {
    const room = newRoom();
    const { c: host } = await joinHost(room);
    const { c: v } = await joinViewer(room);
    await syncClient(host);
    await syncClient(v);
    v.send({ t: 'pg', a: { k: 'react', r: 'rocket' } });
    const got = await host.waitFor('pg', (m) => m.e.k === 'react');
    assert.ok(got.e.k === 'react' && got.e.r === 'rocket');
    await v.waitFor('pg', (m) => m.e.k === 'react');
  });

  test('quadro só vai para quem assinou', async () => {
    const room = newRoom();
    const { c: host } = await joinHost(room);
    const { c: a } = await joinViewer(room, 'A');
    const { c: b } = await joinViewer(room, 'B');
    const { c: d } = await joinViewer(room, 'C');
    for (const c of [host, a, b, d]) await syncClient(c);
    a.send({ t: 'pg', a: { k: 'sub', ch: 'paint', on: true } });
    await a.waitFor('pg', (m) => m.e.k === 'paint');

    d.send({ t: 'pg', a: { k: 'stroke', id: 's1', c: '#336699', w: 6, er: false, p: [10, 10, 40, 40], end: true } });
    await d.waitFor('pg', (m) => m.e.k === 'stroke-ack');
    const got = await a.waitFor('pg', (m) => m.e.k === 'stroke');
    assert.ok(got.e.k === 'stroke' && got.e.s.p.length === 4);
    await pause(300);
    assert.equal(b.pg('stroke').length, 0);
    assert.equal(host.pg('stroke').length, 0);
    assert.equal(d.pg('stroke').length, 0);
  });

  test('quem nunca deu sync não recebe eventos pg', async () => {
    const room = newRoom();
    const { c: host } = await joinHost(room);
    const { c: v } = await joinViewer(room);
    const { c: old } = await joinViewer(room, 'Antigo');
    await syncClient(host);
    await syncClient(v);
    v.send({ t: 'pg', a: { k: 'react', r: 'star' } });
    await host.waitFor('pg', (m) => m.e.k === 'react');
    await pause(300);
    assert.equal(old.msgs.filter((m) => m.t === 'pg').length, 0);
  });
});

test('Playground: uma conexão não troca de identidade no meio', async () => {
  const { createAlexandrusServer } = await import('../src/index.ts');
  const { WebSocket } = await import('ws');
  const app = await createAlexandrusServer({ port: 0, host: '127.0.0.1', maxViewers: 6, publicDir: '/nao-existe' });
  try {
    const room = app.registry.create({ name: 'Troca', hostName: 'Ana', visibility: 'private' });
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
    const msgs: { t: string; code?: string; e?: { k: string } }[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
    await new Promise((r) => ws.once('open', r));
    const send = (m: unknown) => ws.send(JSON.stringify(m));
    const until = async (pred: () => boolean) => {
      for (let i = 0; i < 60 && !pred(); i++) await new Promise((r) => setTimeout(r, 25));
      return pred();
    };
    send({ t: 'join', v: 2, code: room.code, role: 'viewer', name: 'Bia' });
    await until(() => msgs.some((m) => m.t === 'joined'));
    send({ t: 'pg', a: { k: 'sync', cid: 'primeira-identidade-123456' } });
    await until(() => msgs.some((m) => m.t === 'pg' && m.e?.k === 'state'));
    send({ t: 'pg', a: { k: 'sync', cid: 'segunda-identidade-1234567' } });
    const refused = await until(() => msgs.some((m) => m.t === 'error' && m.code === 'not-allowed'));
    assert.equal(refused, true, 'segunda identidade na mesma conexão deveria ser recusada');
    send({ t: 'pg', a: { k: 'sync', cid: 'primeira-identidade-123456' } });
    const states = await until(() => msgs.filter((m) => m.t === 'pg' && m.e?.k === 'state').length === 2);
    assert.equal(states, true, 're-sync com a mesma identidade continua valendo');
    ws.close();
  } finally {
    await app.close();
  }
});
