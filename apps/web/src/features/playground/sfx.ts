/**
 * Efeitos sonoros do Playground, todos sintetizados com Web Audio.
 *
 * Nenhum arquivo de áudio e nenhuma gravação de terceiros: cada som é um gesto
 * genérico (rimshot, trombone descendente, moeda de fliperama...) montado com
 * osciladores, ruído, filtros e envelopes.
 *
 * REGRA DE PRODUTO: este áudio só toca localmente na página. Nada aqui é
 * conectado a um MediaStreamDestination, então nunca entra na captura de tela
 * nem no microfone.
 */

import type { SoundId } from '@protocol';

/* ------------------------------------------------------------------ */
/* Contexto, cadeia mestre e ruído                                      */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let failed = false;

/** Cria (uma vez) o AudioContext e a cadeia mestre: ganho → limitador suave → saída. */
function boot(): AudioContext | null {
  if (failed) return null;
  if (ctx) return ctx;
  try {
    if (typeof AudioContext === 'undefined') throw new Error('sem Web Audio');
    const c = new AudioContext({ latencyHint: 'interactive' });
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    const m = c.createGain();
    m.gain.value = 0.8;
    m.connect(comp);
    comp.connect(c.destination);
    ctx = c;
    master = m;
    return c;
  } catch {
    failed = true;
    return null;
  }
}

function C(): AudioContext {
  if (!ctx) throw new Error('AudioContext ausente');
  return ctx;
}

type NoiseKind = 'white' | 'pink' | 'brown';
const noiseBufs: Partial<Record<NoiseKind, AudioBuffer>> = {};
const NOISE_SECONDS = 2;

/** Buffer de ruído de 2 s, gerado uma vez por tipo e reaproveitado. */
function noiseBuf(kind: NoiseKind): AudioBuffer {
  const hit = noiseBufs[kind];
  if (hit) return hit;
  const c = C();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * NOISE_SECONDS), c.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    // Paul Kellet (aproximação de 1/f)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  }
  noiseBufs[kind] = buf;
  return buf;
}

/* ------------------------------------------------------------------ */
/* Voz: nós de uma execução, para limpar e para cortar                  */
/* ------------------------------------------------------------------ */

interface Voice {
  out: GainNode;
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  ui: boolean;
}

const voices: Voice[] = [];
/** Voz que está sendo montada agora (receitas são síncronas). */
let bag: Voice | null = null;

const MAX_SOUNDS = 6;
const MAX_UI = 10;

function dispose(v: Voice): void {
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
  for (const n of v.nodes) {
    try {
      n.disconnect();
    } catch {
      /* já desconectado */
    }
  }
  try {
    v.out.disconnect();
  } catch {
    /* já desconectado */
  }
}

/** Corta uma voz com fade curto de 30 ms. */
function cutVoice(v: Voice): void {
  const c = C();
  const now = c.currentTime;
  try {
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setValueAtTime(v.out.gain.value, now);
    v.out.gain.linearRampToValueAtTime(0, now + 0.03);
  } catch {
    /* ignora */
  }
  for (const s of v.srcs) {
    try {
      s.stop(now + 0.04);
    } catch {
      /* já parou */
    }
  }
}

function launch(ui: boolean, volume: number, build: (t0: number, out: GainNode) => number): boolean {
  const c = boot();
  if (!c || !master) return false;
  const wasSuspended = c.state === 'suspended';
  if (wasSuspended) void c.resume().catch(() => undefined);

  if (ui) {
    if (voices.filter((v) => v.ui).length >= MAX_UI) return false;
  } else {
    const live = voices.filter((v) => !v.ui);
    for (let i = 0; i <= live.length - MAX_SOUNDS; i++) cutVoice(live[i]);
  }

  const out = c.createGain();
  out.gain.value = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
  out.connect(master);
  const v: Voice = { out, srcs: [], nodes: [], ui };
  voices.push(v);
  bag = v;
  try {
    build(c.currentTime + 0.02, out);
  } catch {
    bag = null;
    dispose(v);
    return false;
  }
  bag = null;

  let left = v.srcs.length;
  if (left === 0) {
    dispose(v);
    return true;
  }
  for (const s of v.srcs) {
    s.onended = () => {
      left--;
      if (left <= 0) dispose(v);
    };
  }
  return !wasSuspended;
}

/* ------------------------------------------------------------------ */
/* Ferramentas de síntese                                               */
/* ------------------------------------------------------------------ */

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const FLOOR = 0.0001;

function gain(v: number, dest: AudioNode): GainNode {
  const g = C().createGain();
  g.gain.value = v;
  g.connect(dest);
  bag?.nodes.push(g);
  return g;
}

function filter(type: BiquadFilterType, freq: number, q: number, dest: AudioNode): BiquadFilterNode {
  const f = C().createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dest);
  bag?.nodes.push(f);
  return f;
}

/** Oscilador ligado direto em `dest`, de t até t+dur. */
function osc(type: OscillatorType, freq: number, t: number, dur: number, dest: AudioNode): OscillatorNode {
  const o = C().createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  bag?.srcs.push(o);
  bag?.nodes.push(o);
  return o;
}

/** Ruído em loop, com ponto de partida aleatório no buffer. */
function noise(kind: NoiseKind, t: number, dur: number, dest: AudioNode): AudioBufferSourceNode {
  const s = C().createBufferSource();
  s.buffer = noiseBuf(kind);
  s.loop = true;
  s.connect(dest);
  s.start(t, rnd(0, NOISE_SECONDS - 0.1));
  s.stop(t + dur + 0.05);
  bag?.srcs.push(s);
  bag?.nodes.push(s);
  return s;
}

/** Envelope percussivo: sobe linear e cai exponencial. */
function env(p: AudioParam, t: number, atk: number, peak: number, dur: number): void {
  p.setValueAtTime(FLOOR, t);
  p.linearRampToValueAtTime(peak, t + atk);
  p.exponentialRampToValueAtTime(FLOOR, t + dur);
}

/** Envelope sustentado: sobe, segura e solta nos últimos `rel` segundos. */
function gate(p: AudioParam, t: number, atk: number, peak: number, dur: number, rel: number): void {
  p.setValueAtTime(FLOOR, t);
  p.linearRampToValueAtTime(peak, t + atk);
  p.setValueAtTime(peak, Math.max(t + atk, t + dur - rel));
  p.linearRampToValueAtTime(FLOOR, t + dur);
}

/** Desliza uma frequência (exponencial) de f0 a f1 em `dur`. */
function slide(p: AudioParam, t: number, f0: number, f1: number, dur: number): void {
  p.setValueAtTime(f0, t);
  p.exponentialRampToValueAtTime(f1, t + dur);
}

/** Valor que passeia aleatoriamente entre lo e hi (água, vento). */
function wander(p: AudioParam, t: number, dur: number, lo: number, hi: number, s0: number, s1: number): void {
  p.setValueAtTime(rnd(lo, hi), t);
  let x = t;
  while (x < t + dur) {
    x = Math.min(x + rnd(s0, s1), t + dur);
    p.linearRampToValueAtTime(rnd(lo, hi), x);
  }
}

/** Nota: oscilador → envelope → dest. */
function tone(type: OscillatorType, f: number, t: number, dur: number, vol: number, dest: AudioNode, atk = 0.005): OscillatorNode {
  const g = gain(0, dest);
  env(g.gain, t, atk, vol, dur);
  return osc(type, f, t, dur, g);
}

/** Sino: parciais inarmônicos 1, 2.76 e 5.4 com decaimento exponencial. */
function bell(t: number, f: number, dur: number, vol: number, dest: AudioNode): void {
  tone('sine', f, t, dur, vol, dest, 0.002);
  tone('sine', f * 2.76, t, dur * 0.6, vol * 0.45, dest, 0.002);
  tone('sine', f * 5.4, t, dur * 0.35, vol * 0.2, dest, 0.002);
}

/** Ganho cuja saída modula um AudioParam (profundidade de LFO/FM). */
function modGain(depth: number, target: AudioParam): GainNode {
  const g = C().createGain();
  g.gain.value = depth;
  g.connect(target);
  bag?.nodes.push(g);
  return g;
}

/** Vibrato/tremolo: LFO senoidal que modula `target`. */
function lfo(target: AudioParam, rate: number, depth: number, t: number, dur: number, rampIn = 0): void {
  const l = C().createOscillator();
  l.frequency.value = rate;
  const g = modGain(depth, target);
  if (rampIn > 0) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(depth, t + rampIn);
  }
  l.connect(g);
  l.start(t);
  l.stop(t + dur + 0.05);
  bag?.srcs.push(l);
  bag?.nodes.push(l);
}

/** Barramento com fade de entrada e saída (sons ambiente). */
function fadeBus(t: number, dur: number, fi: number, fo: number, peak: number, dest: AudioNode): GainNode {
  const g = gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + fi);
  g.gain.setValueAtTime(peak, t + dur - fo);
  g.gain.linearRampToValueAtTime(0, t + dur);
  return g;
}

let crushCurve: Float32Array<ArrayBuffer> | null = null;
/** Curva em degraus (efeito bitcrush) para o Zap. */
function crusher(dest: AudioNode): WaveShaperNode {
  if (!crushCurve) {
    const n = 512;
    const cv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      cv[i] = Math.round(x * 3) / 3;
    }
    crushCurve = cv;
  }
  const w = C().createWaveShaper();
  w.curve = crushCurve;
  w.connect(dest);
  bag?.nodes.push(w);
  return w;
}

/* Peças reutilizadas por várias receitas */

function tom(t: number, f0: number, f1: number, dur: number, vol: number, dest: AudioNode): void {
  const g = gain(0, dest);
  env(g.gain, t, 0.003, vol, dur);
  const o = osc('sine', f0, t, dur, g);
  slide(o.frequency, t, f0, f1, 0.16);
  const cg = gain(0, dest);
  env(cg.gain, t, 0.001, vol * 0.5, 0.025);
  noise('white', t, 0.03, filter('bandpass', 1800, 1, cg));
}

function cymbal(t: number, dur: number, vol: number, dest: AudioNode): void {
  const g1 = gain(0, dest);
  env(g1.gain, t, 0.002, vol, dur);
  noise('white', t, dur, filter('highpass', 6500, 0.7, g1));
  const g2 = gain(0, dest);
  env(g2.gain, t, 0.002, vol * 0.5, dur * 0.6);
  noise('white', t, dur, filter('bandpass', 9500, 1.2, g2));
}

function blipSweep(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, dest: AudioNode): void {
  const o = tone(type, f0, t, dur, vol, dest, 0.004);
  slide(o.frequency, t, f0, f1, dur * 0.8);
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                             */
/* ------------------------------------------------------------------ */

/** Duração (s) de cada som do catálogo. */
const D: Record<SoundId, number> = {
  badum: 1.2,
  trombone: 2.4,
  grilos: 2.4,
  suspense: 2.2,
  tada: 1.6,
  corneta: 1.0,
  boing: 0.9,
  pop: 0.15,
  whoosh: 0.9,
  laser: 0.4,
  splash: 0.9,
  zap: 0.45,
  apito: 0.8,
  buzina: 0.55,
  mola: 0.9,
  queda: 1.3,
  kazoo: 1.6,
  moeda: 0.55,
  nivel: 0.95,
  fim: 1.5,
  poder: 1.0,
  pulo: 0.2,
  ding: 1.2,
  carrilhao: 2.2,
  alarme: 1.2,
  aviso: 0.35,
  chuva: 3.5,
  ondas: 4,
  passaros: 3.5,
  vento: 4,
  riacho: 4,
};

/** Cada receita agenda tudo por automação a partir de t0 e devolve a duração (s). */
const RECIPES: Record<SoundId, (t0: number, out: AudioNode) => number> = {
  badum: (t, out) => {
    tom(t, 180, 90, 0.3, 0.9, out);
    tom(t + 0.17, 130, 70, 0.32, 0.9, out);
    cymbal(t + 0.36, 0.82, 0.4, out);
    return D.badum;
  },

  trombone: (t, out) => {
    const starts = [0, 0.45, 0.9, 1.35];
    const durs = [0.42, 0.42, 0.42, 1.0];
    const notes = [58, 57, 56, 55];
    notes.forEach((m, i) => {
      const t1 = t + starts[i];
      const d = durs[i];
      const last = i === notes.length - 1;
      const g = gain(0, out);
      gate(g.gain, t1, 0.05, 0.3, d, last ? 0.35 : 0.06);
      const f = filter('lowpass', 350, 5, g);
      // wah: o filtro abre e fecha em cada nota
      f.frequency.setValueAtTime(350, t1);
      f.frequency.exponentialRampToValueAtTime(1700, t1 + d * 0.4);
      f.frequency.exponentialRampToValueAtTime(600, t1 + d);
      const f0 = hz(m);
      for (const det of [-4, 4]) {
        const o = osc('sawtooth', f0, t1, d, f);
        o.detune.setValueAtTime(det - 60, t1);
        o.detune.linearRampToValueAtTime(det, t1 + 0.06);
        if (last) {
          lfo(o.detune, 5.5, 22, t1, d, 0.45);
          o.detune.setValueAtTime(det, t1 + d * 0.65);
          o.detune.linearRampToValueAtTime(det - 80, t1 + d);
        }
      }
    });
    return D.trombone;
  },

  grilos: (t, out) => {
    const bus = gain(1, out);
    const cricket = (f: number, step: number, pulses: number, phase: number, vol: number) => {
      const g = gain(0, bus);
      osc('sine', f, t, D.grilos, g);
      for (let b = phase; b < D.grilos - 0.2; b += step) {
        for (let j = 0; j < pulses; j++) {
          const p = t + b + j * 0.03;
          g.gain.setValueAtTime(0, p);
          g.gain.linearRampToValueAtTime(vol, p + 0.009);
          g.gain.linearRampToValueAtTime(0, p + 0.024);
        }
      }
    };
    cricket(4450, 0.55, 4, 0.1, 0.1);
    cricket(4800, 0.43, 3, 0.25, 0.07);
    cricket(4200, 0.71, 5, 0.4, 0.06);
    // quase silêncio: um sopro bem fraco de noite
    noise('pink', t, D.grilos, filter('highpass', 3000, 0.5, gain(0.006, bus)));
    return D.grilos;
  },

  suspense: (t, out) => {
    const stab = (t1: number, f: number, d: number, vol: number) => {
      const g = gain(0, out);
      gate(g.gain, t1, 0.02, vol, d, d * 0.5);
      const lp = filter('lowpass', 1000, 2, g);
      lp.frequency.setValueAtTime(1000, t1);
      lp.frequency.exponentialRampToValueAtTime(220, t1 + d);
      osc('sawtooth', f, t1, d, lp);
      osc('square', f * 1.006, t1, d, lp);
      tone('sine', f / 2, t1, d, vol * 0.9, out, 0.02);
    };
    stab(t, 92.5, 0.36, 0.28);
    stab(t + 0.5, 92.5, 0.36, 0.28);
    const last = 1.0;
    stab(t + last, 69.3, 1.2, 0.34);
    return D.suspense;
  },

  tada: (t, out) => {
    [72, 76, 79, 84].forEach((m, i) => {
      const lp = filter('lowpass', 4500, 0.7, out);
      tone('triangle', hz(m), t + i * 0.09, 0.28, 0.2, lp);
      tone('sawtooth', hz(m), t + i * 0.09, 0.2, 0.06, lp);
    });
    const c = t + 0.4;
    const g = gain(0, out);
    gate(g.gain, c, 0.12, 0.3, 1.1, 0.8);
    const lp = filter('lowpass', 3500, 0.7, g);
    for (const m of [72, 76, 79, 84, 88]) {
      osc('triangle', hz(m), c, 1.1, lp);
      osc('sawtooth', hz(m) * 1.004, c, 1.1, gain(0.35, lp));
    }
    for (let i = 0; i < 9; i++) tone('sine', rnd(2800, 6500), c + rnd(0, 0.7), 0.15, 0.05, out, 0.002);
    return D.tada;
  },

  corneta: (t, out) => {
    const d = 0.9;
    const g = gain(0, out);
    gate(g.gain, t, 0.025, 0.28, d, 0.12);
    const bp = filter('bandpass', 1200, 0.9, g);
    const hp = filter('highpass', 250, 0.7, bp);
    for (const [f, det] of [[440, 0], [443, 0], [437, 0], [880, 5]] as const) {
      const o = osc(f === 880 ? 'square' : 'sawtooth', f, t, d, f === 880 ? gain(0.25, hp) : hp);
      o.detune.setValueAtTime(-120 + det, t);
      o.detune.linearRampToValueAtTime(det, t + 0.05);
      lfo(o.detune, 6, 8, t, d, 0.2);
    }
    noise('white', t, 0.08, filter('bandpass', 2500, 0.8, gain(0.12, out)));
    return D.corneta;
  },

  boing: (t, out) => {
    const d = 0.85;
    const g = gain(0, out);
    env(g.gain, t, 0.004, 0.45, d);
    const o = osc('sine', 330, t, d, g);
    slide(o.frequency, t, 330, 200, d);
    // oscilação da mola: profundidade decai
    const depth = modGain(0, o.frequency);
    depth.gain.setValueAtTime(190, t);
    depth.gain.exponentialRampToValueAtTime(2, t + d);
    const l = osc('sine', 17, t, d, depth);
    l.frequency.setValueAtTime(13, t);
    l.frequency.linearRampToValueAtTime(22, t + d);
    tone('sine', 660, t, d * 0.5, 0.08, out);
    return D.boing;
  },

  pop: (t, out) => {
    const o = tone('sine', 950, t, 0.09, 0.6, out, 0.001);
    slide(o.frequency, t, 950, 140, 0.05);
    const cg = gain(0, out);
    env(cg.gain, t, 0.001, 0.4, 0.012);
    noise('white', t, 0.02, filter('highpass', 2500, 0.7, cg));
    return D.pop;
  },

  whoosh: (t, out) => {
    const d = D.whoosh;
    const g = gain(0, out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.35);
    g.gain.linearRampToValueAtTime(0, t + d);
    const bp = filter('bandpass', 300, 3, g);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
    bp.frequency.exponentialRampToValueAtTime(400, t + d);
    noise('white', t, d, bp);
    return d;
  },

  laser: (t, out) => {
    const d = 0.35;
    const g = gain(0, out);
    env(g.gain, t, 0.002, 0.28, d);
    const lp = filter('lowpass', 5000, 1, g);
    const o = osc('square', 1800, t, d, lp);
    slide(o.frequency, t, 1800, 120, 0.3);
    const o2 = osc('sawtooth', 900, t, d, gain(0.4, lp));
    slide(o2.frequency, t, 900, 60, 0.3);
    return D.laser;
  },

  splash: (t, out) => {
    const g = gain(0, out);
    env(g.gain, t, 0.01, 0.6, 0.55);
    const lp = filter('lowpass', 3500, 0.8, g);
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(450, t + 0.5);
    noise('white', t, 0.6, lp);
    for (const dt of [0.14, 0.27, 0.4, 0.58, 0.7]) {
      const f = rnd(700, 1500);
      const o = tone('sine', f, t + dt, 0.08, 0.14, out, 0.003);
      slide(o.frequency, t + dt, f, f * 1.8, 0.05);
    }
    return D.splash;
  },

  zap: (t, out) => {
    const d = 0.4;
    const g = gain(0, out);
    gate(g.gain, t, 0.005, 0.3, d, 0.12);
    const cr = crusher(g);
    const o = osc('square', 120, t, d, cr);
    for (let x = 0; x < d; x += 0.012) o.frequency.setValueAtTime(rnd(80, 420), t + x);
    noise('white', t, d, filter('bandpass', 3000, 0.6, gain(0.8, cr)));
    // buzz entrecortado
    for (let x = 0; x < d; x += 0.045) {
      g.gain.setValueAtTime(rnd(0.08, 0.32), t + x + 0.02);
    }
    g.gain.linearRampToValueAtTime(FLOOR, t + d);
    return D.zap;
  },

  apito: (t, out) => {
    const d = 0.75;
    const g = gain(0, out);
    gate(g.gain, t, 0.03, 0.3, d, 0.1);
    const o = osc('sine', 500, t, d, g);
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(1900, t + 0.38);
    o.frequency.exponentialRampToValueAtTime(600, t + d);
    lfo(o.frequency, 9, 25, t, d);
    return D.apito;
  },

  buzina: (t, out) => {
    const honk = (t1: number, d: number, f: number) => {
      const g = gain(0, out);
      gate(g.gain, t1, 0.01, 0.34, d, 0.04);
      const bp = filter('bandpass', 1100, 3.5, g);
      const lp = filter('lowpass', 3200, 0.7, bp);
      for (const type of ['square', 'sawtooth'] as const) {
        const o = osc(type, f * 1.08, t1, d, lp);
        o.frequency.setValueAtTime(f * 1.08, t1);
        o.frequency.exponentialRampToValueAtTime(f * 0.97, t1 + d);
      }
    };
    honk(t, 0.15, 370);
    honk(t + 0.22, 0.28, 350);
    return D.buzina;
  },

  mola: (t, out) => {
    const d = 0.85;
    const g = gain(0, out);
    env(g.gain, t, 0.004, 0.4, d);
    const car = osc('sine', 520, t, d, g);
    slide(car.frequency, t, 520, 340, d);
    // FM metálico: moduladora inarmônica com índice decaindo
    const idx = modGain(0, car.frequency);
    idx.gain.setValueAtTime(520, t);
    idx.gain.exponentialRampToValueAtTime(8, t + d);
    osc('sine', 520 * 1.41, t, d, idx);
    // balanço da mola
    const wob = modGain(0, car.frequency);
    wob.gain.setValueAtTime(110, t);
    wob.gain.exponentialRampToValueAtTime(2, t + d);
    osc('sine', 24, t, d, wob);
    return D.mola;
  },

  queda: (t, out) => {
    const d = 1.0;
    const g = gain(0, out);
    gate(g.gain, t, 0.03, 0.3, d, 0.15);
    const o = osc('sine', 1800, t, d, g);
    slide(o.frequency, t, 1800, 220, d);
    lfo(o.frequency, 7, 40, t, d);
    // baque no fim
    const tt = t + d + 0.02;
    const th = tone('sine', 130, tt, 0.25, 0.6, out, 0.002);
    slide(th.frequency, tt, 130, 40, 0.2);
    const ng = gain(0, out);
    env(ng.gain, tt, 0.002, 0.3, 0.12);
    noise('brown', tt, 0.15, filter('lowpass', 700, 0.7, ng));
    return D.queda;
  },

  kazoo: (t, out) => {
    const notes = [67, 72, 72, 76, 72, 79];
    const durs = [0.18, 0.18, 0.18, 0.18, 0.18, 0.5];
    const g = gain(0, out);
    const f1 = filter('bandpass', 1300, 2.2, g);
    const f2 = filter('bandpass', 2700, 3, g);
    const src = gain(0.7, f1);
    src.connect(f2);
    const o = osc('sawtooth', hz(notes[0]), t, D.kazoo, src);
    const o2 = osc('square', hz(notes[0]) * 1.01, t, D.kazoo, gain(0.4, src));
    lfo(o.detune, 6, 25, t, D.kazoo);
    notes.forEach((m, i) => {
      const t1 = t + i * 0.22;
      o.frequency.setValueAtTime(hz(m), t1);
      o2.frequency.setValueAtTime(hz(m) * 1.01, t1);
      gate(g.gain, t1, 0.012, 0.45, durs[i], 0.03);
    });
    return D.kazoo;
  },

  moeda: (t, out) => {
    const lp = filter('lowpass', 6000, 0.7, out);
    tone('square', hz(83), t, 0.09, 0.16, lp, 0.002);
    tone('square', hz(88), t + 0.085, 0.45, 0.16, lp, 0.002);
    return D.moeda;
  },

  nivel: (t, out) => {
    const lp = filter('lowpass', 5500, 0.7, out);
    [72, 76, 79, 84, 88, 91].forEach((m, i) => {
      const last = i === 5;
      const t1 = t + i * 0.07;
      tone('square', hz(m), t1, last ? 0.5 : 0.12, 0.13, lp, 0.003);
      tone('triangle', hz(m - 12), t1, last ? 0.5 : 0.12, 0.2, lp, 0.003);
    });
    return D.nivel;
  },

  fim: (t, out) => {
    const lp = filter('lowpass', 2600, 0.8, out);
    [72, 67, 64].forEach((m, i) => tone('square', hz(m), t + i * 0.22, 0.2, 0.14, lp, 0.004));
    const t1 = t + 0.66;
    const g = gain(0, lp);
    gate(g.gain, t1, 0.01, 0.15, 0.8, 0.3);
    const o = osc('square', hz(60), t1, 0.8, g);
    o.frequency.setValueAtTime(hz(60), t1);
    o.frequency.exponentialRampToValueAtTime(hz(53), t1 + 0.8);
    lfo(o.detune, 7, 30, t1, 0.8, 0.2);
    return D.fim;
  },

  poder: (t, out) => {
    const d = 0.75;
    const g = gain(0, out);
    gate(g.gain, t, 0.03, 0.25, d, 0.1);
    // tremolo rápido no ganho de um estágio intermediário
    const trem = gain(0.6, g);
    lfo(trem.gain, 18, 0.35, t, d);
    const lp = filter('lowpass', 3200, 1, trem);
    const o = osc('sawtooth', 220, t, d, lp);
    slide(o.frequency, t, 220, 1760, d);
    const o2 = osc('sine', 440, t, d, lp);
    slide(o2.frequency, t, 440, 3520, d);
    bell(t + d - 0.02, 2093, 0.22, 0.1, out);
    return D.poder;
  },

  pulo: (t, out) => {
    const lp = filter('lowpass', 4000, 0.7, out);
    blipSweep('square', 280, 780, t, 0.14, 0.2, lp);
    return D.pulo;
  },

  ding: (t, out) => {
    bell(t, 1046.5, 1.1, 0.4, out);
    return D.ding;
  },

  carrilhao: (t, out) => {
    [76, 72, 67].forEach((m, i) => bell(t + i * 0.4, hz(m), i === 2 ? 1.3 : 0.9, 0.3, out));
    return D.carrilhao;
  },

  alarme: (t, out) => {
    const lp = filter('lowpass', 2800, 0.7, out);
    for (let i = 0; i < 8; i++) {
      const g = gain(0, lp);
      gate(g.gain, t + i * 0.15, 0.004, 0.18, 0.12, 0.02);
      osc('square', i % 2 ? 680 : 920, t + i * 0.15, 0.12, g);
    }
    return D.alarme;
  },

  aviso: (t, out) => {
    blipSweep('sine', 700, 1050, t, 0.09, 0.4, out);
    blipSweep('sine', 520, 340, t + 0.13, 0.17, 0.4, out);
    return D.aviso;
  },

  chuva: (t, out) => {
    const d = D.chuva;
    const bus = fadeBus(t, d, 0.6, 0.9, 1, out);
    noise('pink', t, d, filter('lowpass', 7500, 0.5, filter('highpass', 450, 0.5, gain(0.5, bus))));
    noise('white', t, d, filter('bandpass', 4500, 0.7, gain(0.05, bus)));
    for (let i = 0; i < 55; i++) {
      const tt = t + rnd(0.2, d - 0.4);
      tone('sine', rnd(1800, 5200), tt, 0.025, rnd(0.015, 0.05), bus, 0.001);
    }
    return d;
  },

  ondas: (t, out) => {
    const d = D.ondas;
    const bus = fadeBus(t, d, 0.5, 0.9, 1, out);
    const g = gain(0, bus);
    g.gain.setValueAtTime(0.05, t);
    for (const [pk, end, amp] of [[1.2, 2.1, 0.7], [3.0, 4.0, 0.8]] as const) {
      g.gain.linearRampToValueAtTime(amp, t + pk);
      g.gain.linearRampToValueAtTime(0.06, t + end - 0.05);
    }
    const lp = filter('lowpass', 250, 0.7, g);
    lp.frequency.setValueAtTime(250, t);
    lp.frequency.exponentialRampToValueAtTime(1900, t + 1.2);
    lp.frequency.exponentialRampToValueAtTime(260, t + 2.1);
    lp.frequency.exponentialRampToValueAtTime(2200, t + 3.0);
    lp.frequency.exponentialRampToValueAtTime(250, t + 4.0);
    noise('brown', t, d, lp);
    // espuma: chiado agudo perto do pico de cada onda
    const foam = gain(0, bus);
    foam.gain.setValueAtTime(0, t);
    foam.gain.linearRampToValueAtTime(0.1, t + 1.3);
    foam.gain.linearRampToValueAtTime(0, t + 2.2);
    foam.gain.linearRampToValueAtTime(0.12, t + 3.1);
    foam.gain.linearRampToValueAtTime(0, t + 4.0);
    noise('white', t, d, filter('highpass', 3500, 0.6, foam));
    return d;
  },

  passaros: (t, out) => {
    const d = D.passaros;
    const bus = fadeBus(t, d, 0.4, 0.6, 1, out);
    for (let i = 0; i < 9; i++) {
      let tt = t + 0.1 + (i / 9) * (d - 0.9) + rnd(0, 0.25);
      const base = rnd(2600, 5200);
      const syl = 2 + Math.floor(rnd(0, 3.5));
      for (let s = 0; s < syl; s++) {
        const sd = rnd(0.05, 0.1);
        const f0 = base * rnd(0.8, 1.15);
        const f1 = base * (Math.random() < 0.5 ? rnd(1.25, 1.6) : rnd(0.6, 0.85));
        const g = gain(0, bus);
        env(g.gain, tt, 0.008, 0.11, sd);
        const o = osc('sine', f0, tt, sd, g);
        slide(o.frequency, tt, f0, f1, sd);
        // FM rápido dá o timbre de "trinado"
        const mod = modGain(rnd(150, 420), o.frequency);
        osc('sine', rnd(45, 95), tt, sd, mod);
        tt += sd + rnd(0.03, 0.07);
      }
    }
    return d;
  },

  vento: (t, out) => {
    const d = D.vento;
    const bus = fadeBus(t, d, 1.0, 1.2, 1, out);
    const g = gain(0.5, bus);
    wander(g.gain, t, d, 0.25, 0.85, 0.6, 1.2);
    const bp = filter('bandpass', 500, 1.3, g);
    wander(bp.frequency, t, d, 300, 1100, 0.7, 1.3);
    noise('pink', t, d, bp);
    const bp2 = filter('bandpass', 1500, 2.5, gain(0.12, bus));
    wander(bp2.frequency, t, d, 900, 2200, 0.5, 1.0);
    noise('white', t, d, bp2);
    noise('brown', t, d, filter('lowpass', 300, 0.7, gain(0.35, bus)));
    return d;
  },

  riacho: (t, out) => {
    const d = D.riacho;
    const bus = fadeBus(t, d, 0.6, 0.9, 1, out);
    const bands: [number, number][] = [[450, 700], [800, 1300], [1400, 2200], [2300, 3600]];
    for (const [lo, hi] of bands) {
      const g = gain(0, bus);
      wander(g.gain, t, d, 0.02, 0.5, 0.03, 0.08);
      const bp = filter('bandpass', lo, 9, g);
      wander(bp.frequency, t, d, lo, hi, 0.04, 0.1);
      noise('white', t, d, bp);
    }
    noise('pink', t, d, filter('lowpass', 900, 0.6, gain(0.12, bus)));
    return d;
  },
};

/* ------------------------------------------------------------------ */
/* Sons de interface (locais, dos minijogos)                            */
/* ------------------------------------------------------------------ */

export type UiSound = 'bubble' | 'bubble-gold' | 'bubble-rare' | 'bubble-giant' | 'combo' | 'tick' | 'win' | 'splash' | 'chirp' | 'whoosh-soft' | 'blip';

function bubblePop(t: number, f: number, vol: number, dest: AudioNode): void {
  const o = tone('sine', f, t, 0.11, vol, dest, 0.002);
  slide(o.frequency, t, f, f * 0.5, 0.09);
}

const UI: Record<UiSound, (t0: number, out: AudioNode, p: number) => number> = {
  bubble: (t, out, p) => {
    bubblePop(t, rnd(600, 900) * p, 0.45, out);
    return 0.12;
  },

  'bubble-gold': (t, out, p) => {
    bubblePop(t, rnd(700, 950) * p, 0.35, out);
    bell(t + 0.01, 1760 * p, 0.4, 0.18, out);
    return 0.45;
  },

  'bubble-rare': (t, out, p) => {
    [1046, 1318, 1568, 2093, 2637].forEach((f, i) => bell(t + i * 0.055, f * p, 0.3, 0.12, out));
    bubblePop(t, 800 * p, 0.25, out);
    return 0.6;
  },

  'bubble-giant': (t, out, p) => {
    const o = tone('sine', 320 * p, t, 0.25, 0.6, out, 0.003);
    slide(o.frequency, t, 320 * p, 85 * p, 0.2);
    const g = gain(0, out);
    env(g.gain, t, 0.005, 0.3, 0.3);
    const lp = filter('lowpass', 2800, 0.7, g);
    lp.frequency.setValueAtTime(2800, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    noise('white', t, 0.32, lp);
    return 0.4;
  },

  combo: (t, out, p) => {
    blipSweep('triangle', 500 * p, 1000 * p, t, 0.1, 0.35, out);
    tone('sine', 1500 * p, t + 0.06, 0.1, 0.12, out, 0.003);
    return 0.17;
  },

  tick: (t, out, p) => {
    const g = gain(0, out);
    env(g.gain, t, 0.001, 0.3, 0.012);
    osc('square', 2200 * p, t, 0.012, g);
    return 0.03;
  },

  win: (t, out, p) => {
    const lp = filter('lowpass', 5000, 0.7, out);
    [72, 76, 79, 84].forEach((m, i) => {
      const last = i === 3;
      tone('triangle', hz(m) * p, t + i * 0.1, last ? 0.4 : 0.14, 0.25, lp, 0.004);
      tone('square', hz(m) * p, t + i * 0.1, last ? 0.35 : 0.1, 0.06, lp, 0.004);
    });
    return 0.75;
  },

  splash: (t, out, p) => {
    const o = tone('sine', 380 * p, t, 0.14, 0.35, out, 0.003);
    slide(o.frequency, t, 380 * p, 900 * p, 0.08);
    const g = gain(0, out);
    env(g.gain, t, 0.004, 0.2, 0.2);
    noise('white', t, 0.22, filter('lowpass', 2000, 0.7, g));
    return 0.25;
  },

  chirp: (t, out, p) => {
    for (const [dt, f0, f1] of [[0, 1200, 2400], [0.1, 1500, 2800]] as const) {
      const g = gain(0, out);
      env(g.gain, t + dt, 0.006, 0.22, 0.09);
      const o = osc('sine', f0 * p, t + dt, 0.09, g);
      slide(o.frequency, t + dt, f0 * p, f1 * p, 0.07);
      lfo(o.frequency, 35, 90, t + dt, 0.09);
    }
    return 0.25;
  },

  'whoosh-soft': (t, out, p) => {
    const g = gain(0, out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.15);
    g.gain.linearRampToValueAtTime(0, t + 0.38);
    const bp = filter('bandpass', 400 * p, 2, g);
    bp.frequency.setValueAtTime(400 * p, t);
    bp.frequency.exponentialRampToValueAtTime(1600 * p, t + 0.2);
    bp.frequency.exponentialRampToValueAtTime(600 * p, t + 0.38);
    noise('pink', t, 0.4, bp);
    return 0.4;
  },

  blip: (t, out, p) => {
    tone('square', 880 * p, t, 0.05, 0.12, filter('lowpass', 4000, 0.7, out), 0.002);
    return 0.08;
  },
};

/* ------------------------------------------------------------------ */
/* API pública                                                          */
/* ------------------------------------------------------------------ */

/** Deve ser chamada de um gesto do usuário (clique/toque) ao menos uma vez: cria/retoma o AudioContext. Pode ser chamada à vontade. */
export function unlockAudio(): void {
  const c = boot();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

/** Toca um som do catálogo. volume 0..1 (já combinado por quem chama). Devolve false se o áudio não estiver disponível/ativo. */
export function playSound(id: SoundId, volume: number): boolean {
  const recipe = RECIPES[id];
  if (!recipe) return false;
  return launch(false, volume, (t0, out) => recipe(t0, out));
}

/** `pitch` opcional (ex.: 0.8..1.4) para variar estouros repetidos. */
export function playUi(kind: UiSound, volume: number, pitch = 1): void {
  const recipe = UI[kind];
  if (!recipe) return;
  const p = Number.isFinite(pitch) && pitch > 0 ? Math.min(pitch, 4) : 1;
  launch(true, volume, (t0, out) => recipe(t0, out, p));
}

/** Duração aproximada, em ms, de um som do catálogo (para barras de progresso). */
export function soundDuration(id: SoundId): number {
  return Math.round((D[id] ?? 1) * 1000);
}
