import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, INITIAL_ADAPT, ladder, type AdaptState, type Sample } from '../src/lib/rtc/adaptive.ts';

const steps = ladder(6_000_000, 60, 'motion');
const run = (samples: Sample[], start: AdaptState = INITIAL_ADAPT, t0 = 0) => {
  let s = start;
  samples.forEach((x, i) => (s = decide(s, x, steps, t0 + i * 2000)));
  return s;
};
const ok: Sample = { loss: 0, rtt: 0.04, available: 8_000_000 };

test('degraus: jogo baixa resolução, texto baixa FPS, nunca abaixo de 400 kbps', () => {
  assert.deepEqual(steps.map((s) => s.scale), [1, 1, 1.5, 2, 2.5]);
  assert.ok(steps.every((s) => s.fps === 60));
  const detail = ladder(2_500_000, 60, 'detail');
  assert.deepEqual(detail.map((s) => s.fps), [60, 60, 30, 15, 10]);
  assert.ok(detail.every((s) => s.scale === 1 && s.bps >= 400_000));
});

test('rede boa não muda nada', () => {
  assert.equal(run(Array(20).fill(ok)).level, 0);
});

test('caso real: 34,8% de perda e 689 ms desce dois degraus na hora', () => {
  const s = run([{ loss: 0.348, rtt: 0.689, available: 2_000_000 }]);
  assert.equal(s.level, 2);
});

test('perda moderada desce um degrau só depois de duas amostras', () => {
  const bad: Sample = { loss: 0.06, rtt: 0.1, available: null };
  assert.equal(run([bad]).level, 0);
  assert.equal(run([bad, bad]).level, 1);
  assert.equal(run([bad, ok, bad]).level, 0, 'uma amostra boa no meio zera a sequência');
});

test('estimativa de banda bem abaixo do degrau conta como ruim', () => {
  const starved: Sample = { loss: 0, rtt: 0.05, available: 2_000_000 };
  assert.equal(run([starved, starved]).level, 1);
});

test('sobe devagar: precisa de 5 amostras boas e respeita a espera após descer', () => {
  const down = run([{ loss: 0.3, rtt: 0.9, available: null }]);
  assert.equal(down.level, 2);
  // 5 amostras boas logo depois (10 s) ainda estão dentro da espera de 12 s
  const early = run(Array(5).fill(ok), down, 2000);
  assert.equal(early.level, 2);
  const later = run(Array(8).fill(ok), down, 2000);
  assert.equal(later.level, 1);
});

test('não passa do último degrau', () => {
  const s = run(Array(10).fill({ loss: 0.5, rtt: 1.2, available: 300_000 }));
  assert.equal(s.level, steps.length - 1);
});
