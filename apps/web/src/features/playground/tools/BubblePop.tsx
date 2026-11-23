import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { PG_LIMITS } from '@protocol';
import { AeroButton } from '../../../components/ui/AeroButton.tsx';
import { usePgEnv } from '../context.ts';
import { usePg, usePgEvent } from '../hooks.ts';
import { fitCanvas, reducedMotion, startLoop } from '../loop.ts';
import { getPrefs } from '../prefs.ts';
import { playUi, unlockAudio, type UiSound } from '../sfx.ts';
import { PgNotice, PgSection } from '../ui.tsx';
import './bubble-pop.css';

/*
 * Bolhas: as bolhas são locais; só o resultado da rodada vai ao servidor.
 * A simulação vive em refs (nada de setState por quadro) e o HUD é escrito
 * direto no DOM, no máximo 8 vezes por segundo.
 */

type BType = 'normal' | 'gold' | 'rare' | 'giant' | 'mini';

interface Bubble {
  type: BType;
  r: number;
  bx: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rise: number;
  ph: number;
  amp: number;
  freq: number;
  t: number;
  hp: number;
  hit: number;
  scale: number;
}

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  ring: boolean;
}

interface Float {
  x: number;
  y: number;
  txt: string;
  life: number;
  gold: boolean;
}

interface Game {
  w: number;
  h: number;
  dpr: number;
  ctx: CanvasRenderingContext2D | null;
  bg: HTMLCanvasElement | null;
  bubbles: Bubble[];
  parts: Part[];
  floats: Float[];
  score: number;
  pops: number;
  streak: number;
  maxCombo: number;
  mult: number;
  lastPop: number;
  elapsed: number;
  spawnAcc: number;
  slowUntil: number;
  ending: boolean;
  endT: number;
  done: boolean;
  pulse: boolean;
  hudT: number;
  clock: number;
}

interface HudEls {
  score: HTMLElement | null;
  combo: HTMLElement | null;
  tide: HTMLElement | null;
  bar: HTMLElement | null;
  secs: HTMLElement | null;
}

interface Result {
  score: number;
  pops: number;
  combo: number;
  record: boolean;
}

const ROUND = PG_LIMITS.bubbleRoundMs;
const MAX_BUBBLES = 26;
const MAX_PARTS = 140;
const CHAIN_MS = 1100;
const END_FADE = 0.9;
const SESSION_KEY = 'alexandrus:pg-bubble-session';
const FONT = '"Nunito Variable", Nunito, "Segoe UI", sans-serif';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function loadSession(): number {
  try {
    const n = Number(sessionStorage.getItem(SESSION_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function saveSession(n: number) {
  try {
    sessionStorage.setItem(SESSION_KEY, String(n));
  } catch {
    /* sem armazenamento: vale só agora */
  }
}

function createGame(): Game {
  return {
    w: 320, h: 400, dpr: 1, ctx: null, bg: null,
    bubbles: [], parts: [], floats: [],
    score: 0, pops: 0, streak: 0, maxCombo: 0, mult: 1, lastPop: -1e9,
    elapsed: 0, spawnAcc: 1.2, slowUntil: -1, ending: false, endT: 0, done: false, pulse: false, hudT: 0, clock: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Arte                                                                 */
/* ------------------------------------------------------------------ */

function renderBg(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#c4f4ff');
  g.addColorStop(0.3, '#6fd6f6');
  g.addColorStop(0.7, '#1fa6e6');
  g.addColorStop(1, '#0a74c4');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // raios de luz
  for (let i = 0; i < 5; i++) {
    const x0 = w * (0.1 + i * 0.2) + (i % 2 ? 14 : -10);
    const spread = w * 0.12 + i * 6;
    const rg = x.createLinearGradient(0, 0, 0, h * 0.9);
    rg.addColorStop(0, 'rgba(255,255,255,0.42)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rg;
    x.beginPath();
    x.moveTo(x0 - 8, 0);
    x.lineTo(x0 + 18, 0);
    x.lineTo(x0 + spread + 30, h * 0.9);
    x.lineTo(x0 + spread - 40, h * 0.9);
    x.closePath();
    x.fill();
  }
  // areia e algas
  x.fillStyle = 'rgba(255,236,170,0.55)';
  x.beginPath();
  x.moveTo(0, h);
  x.lineTo(0, h - 14);
  x.quadraticCurveTo(w * 0.3, h - 26, w * 0.55, h - 12);
  x.quadraticCurveTo(w * 0.8, h - 2, w, h - 18);
  x.lineTo(w, h);
  x.closePath();
  x.fill();
  const weeds = [0.06, 0.2, 0.46, 0.7, 0.9];
  weeds.forEach((fx, i) => {
    const bx = w * fx;
    const hh = h * (0.16 + (i % 3) * 0.06);
    for (let k = 0; k < 3; k++) {
      const ox = bx + (k - 1) * 9;
      const sway = (k - 1) * 12 + (i % 2 ? 8 : -8);
      x.strokeStyle = k === 1 ? 'rgba(35,128,29,0.55)' : 'rgba(72,181,44,0.5)';
      x.lineWidth = 7 - k;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(ox, h - 8);
      x.bezierCurveTo(ox + sway, h - hh * 0.35, ox - sway, h - hh * 0.7, ox + sway * 0.6, h - hh * (0.9 - k * 0.12));
      x.stroke();
    }
  });
  return c;
}

const SPRITES = new Map<string, HTMLCanvasElement>();

const STOPS: Record<BType, [number, string][]> = {
  normal: [[0, 'rgba(255,255,255,0.6)'], [0.45, 'rgba(150,235,255,0.2)'], [0.85, 'rgba(40,175,235,0.42)'], [1, 'rgba(10,130,210,0.7)']],
  gold: [[0, '#fff6c2'], [0.4, '#ffd84a'], [0.85, '#f0a90f'], [1, '#c77a00']],
  rare: [[0, 'rgba(255,255,255,0.7)'], [0.5, 'rgba(220,200,255,0.28)'], [1, 'rgba(150,100,230,0.6)']],
  giant: [[0, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(190,255,150,0.22)'], [0.9, 'rgba(70,200,60,0.45)'], [1, 'rgba(30,150,40,0.7)']],
  mini: [[0, 'rgba(255,255,255,0.65)'], [0.5, 'rgba(255,200,230,0.26)'], [1, 'rgba(235,90,160,0.62)']],
};

function sprite(type: BType, r: number, dpr: number): { img: HTMLCanvasElement; R: number } {
  const R = Math.max(8, Math.ceil(r / 4) * 4);
  const key = `${type}|${R}|${dpr}`;
  let img = SPRITES.get(key);
  if (!img) {
    img = document.createElement('canvas');
    const px = Math.ceil(2 * R * dpr);
    img.width = px;
    img.height = px;
    const x = img.getContext('2d')!;
    x.scale(px / (2 * R), px / (2 * R));
    const c = R;
    const rad = R - 1;
    const g = x.createRadialGradient(c - R * 0.3, c - R * 0.35, R * 0.05, c, c, rad);
    for (const [o, col] of STOPS[type]) g.addColorStop(o, col);
    x.fillStyle = g;
    x.beginPath();
    x.arc(c, c, rad, 0, Math.PI * 2);
    x.fill();
    if (type === 'normal' || type === 'rare') {
      x.save();
      x.clip();
      const ig = x.createLinearGradient(0, 0, 2 * R, 2 * R);
      if (type === 'rare') {
        for (let i = 0; i <= 6; i++) ig.addColorStop(i / 6, `hsla(${i * 60},95%,68%,0.5)`);
      } else {
        ig.addColorStop(0, 'rgba(255,170,230,0.16)');
        ig.addColorStop(0.5, 'rgba(160,255,220,0.1)');
        ig.addColorStop(1, 'rgba(255,255,160,0.14)');
      }
      x.fillStyle = ig;
      x.fillRect(0, 0, 2 * R, 2 * R);
      x.restore();
    }
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(255,255,255,0.88)';
    x.lineWidth = Math.max(1.5, R * 0.12);
    x.beginPath();
    x.arc(c, c, rad * 0.76, Math.PI * 1.08, Math.PI * 1.62);
    x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.92)';
    x.beginPath();
    x.ellipse(c - R * 0.4, c - R * 0.46, R * 0.13, R * 0.075, -0.7, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.lineWidth = Math.max(1, R * 0.07);
    x.beginPath();
    x.arc(c, c, rad * 0.8, Math.PI * 0.1, Math.PI * 0.42);
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.8)';
    x.lineWidth = 1.4;
    x.beginPath();
    x.arc(c, c, rad - 0.7, 0, Math.PI * 2);
    x.stroke();
    SPRITES.set(key, img);
  }
  return { img, R };
}

function drawSparkle(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, a: number) {
  x.save();
  x.globalAlpha *= a;
  x.fillStyle = '#fff';
  x.beginPath();
  x.moveTo(cx, cy - s);
  x.quadraticCurveTo(cx, cy, cx + s, cy);
  x.quadraticCurveTo(cx, cy, cx, cy + s);
  x.quadraticCurveTo(cx, cy, cx - s, cy);
  x.quadraticCurveTo(cx, cy, cx, cy - s);
  x.fill();
  x.restore();
}

/* ------------------------------------------------------------------ */
/* Simulação                                                            */
/* ------------------------------------------------------------------ */

function spawn(g: Game) {
  const k = clamp(g.w / 480, 0.75, 1.1);
  const hk = g.h / 480;
  const roll = Math.random();
  const giants = g.bubbles.reduce((n, b) => n + (b.type === 'giant' ? 1 : 0), 0);
  let type: BType = 'normal';
  if (roll < 0.025) type = 'rare';
  else if (roll < 0.075 && giants < 2) type = 'giant';
  else if (roll < 0.155) type = 'gold';
  let r = rand(16, 34) * k;
  let rise = rand(55, 120) * hk;
  if (type === 'gold') {
    r = rand(18, 28) * k;
    rise = rand(70, 110) * hk;
  } else if (type === 'rare') {
    r = rand(20, 28) * k;
    rise = rand(130, 190) * hk;
  } else if (type === 'giant') {
    r = Math.min(58 * k, g.w * 0.2);
    rise = rand(32, 45) * hk;
  }
  const amp = type === 'giant' ? 8 : rand(6, 18);
  const lo = r + amp;
  const hi = Math.max(lo, g.w - r - amp);
  g.bubbles.push({
    type, r, bx: rand(lo, hi), x: 0, y: g.h + r + 4, vx: 0, vy: -rise, rise: -rise,
    ph: rand(0, Math.PI * 2), amp, freq: rand(1.2, 2.4), t: 0, hp: type === 'giant' ? 3 : 1, hit: 0, scale: 1,
  });
}

function addPart(g: Game, p: Part) {
  if (g.parts.length < MAX_PARTS) g.parts.push(p);
}

function lightFx(): boolean {
  return getPrefs().light || reducedMotion();
}

function sfx(kind: UiSound, r: number, silent: boolean, extra = 0) {
  const p = getPrefs();
  if (p.muted || silent || p.volume <= 0) return;
  const pitch = clamp(0.75 + ((42 - r) / 42) * 0.65 + extra, 0.6, 1.8);
  playUi(kind, p.volume * 0.8, pitch);
}

function droplets(g: Game, x: number, y: number, n: number, ring: boolean, rr: number) {
  if (ring) addPart(g, { x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, r: rr, ring: true });
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI, 0.3) ;
    const s = rand(80, 200);
    const life = rand(0.45, 0.8);
    addPart(g, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, r: rand(2, 3.6), ring: false });
  }
}

function pop(g: Game, b: Bubble, silent: boolean) {
  const light = lightFx();
  const chain = g.streak > 0 && g.elapsed - g.lastPop <= CHAIN_MS;
  g.streak = chain ? g.streak + 1 : 1;
  g.maxCombo = Math.max(g.maxCombo, g.streak);
  const mult = Math.min(5, 1 + Math.floor(g.streak / 5));
  const up = mult > g.mult;
  g.mult = mult;
  if (up) g.pulse = true;
  g.lastPop = g.elapsed;
  const base = b.type === 'gold' ? 50 : b.type === 'rare' ? 120 : b.type === 'giant' ? 30 : b.type === 'mini' ? 15 : 10;
  const pts = base * mult;
  g.score += pts;
  g.pops += 1;
  const rr = b.r * b.scale;
  droplets(g, b.x, b.y, light ? 4 : 8, !light, rr);
  if (g.floats.length < 30) g.floats.push({ x: b.x, y: b.y - rr * 0.4, txt: `+${pts}`, life: 0.95, gold: b.type !== 'normal' });
  const kind: UiSound = b.type === 'gold' ? 'bubble-gold' : b.type === 'rare' ? 'bubble-rare' : b.type === 'giant' ? 'bubble-giant' : 'bubble';
  sfx(kind, rr, silent, g.streak > 1 ? Math.min(0.25, g.streak * 0.015) : 0);
  if (up) sfx('combo', 30, silent);
  if (b.type === 'rare') g.slowUntil = g.elapsed + 4000;
  g.bubbles.splice(g.bubbles.indexOf(b), 1);
  if (b.type === 'giant') {
    const k = clamp(g.w / 480, 0.75, 1.1);
    const a0 = rand(0, Math.PI * 2);
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i / 5) * Math.PI * 2;
      g.bubbles.push({
        type: 'mini', r: rand(9, 13) * k, bx: b.x, x: b.x, y: b.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130 - 40,
        rise: -rand(60, 90), ph: rand(0, Math.PI * 2), amp: rand(3, 7), freq: rand(1.5, 2.5), t: 0, hp: 1, hit: 0, scale: 1,
      });
    }
  }
}

function tap(g: Game, px: number, py: number, silent: boolean) {
  if (g.ending || g.done) return;
  for (let i = g.bubbles.length - 1; i >= 0; i--) {
    const b = g.bubbles[i]!;
    const r = b.r * b.scale + 6;
    const dx = px - b.x;
    const dy = py - b.y;
    if (dx * dx + dy * dy > r * r) continue;
    if (b.type === 'giant' && b.hp > 1) {
      b.hp -= 1;
      b.hit = 1;
      b.scale = 1 - (3 - b.hp) * 0.13;
      if (g.streak > 0) g.lastPop = g.elapsed;
      droplets(g, px, py, lightFx() ? 2 : 4, false, 0);
      sfx('bubble', b.r * 0.9, silent, -0.15);
    } else {
      pop(g, b, silent);
    }
    return;
  }
  g.streak = 0;
  g.mult = 1;
  if (!lightFx()) addPart(g, { x: px, y: py, vx: 0, vy: 0, life: 0.3, max: 0.3, r: 14, ring: true });
}

function step(g: Game, dt: number) {
  g.clock += dt;
  if (!g.ending) {
    g.elapsed += dt * 1000;
    if (g.elapsed >= ROUND) {
      g.elapsed = ROUND;
      g.ending = true;
    }
  } else {
    g.endT += dt;
  }
  if (g.streak > 0 && g.elapsed - g.lastPop > CHAIN_MS) {
    g.streak = 0;
    g.mult = 1;
  }
  if (!g.ending) {
    g.spawnAcc += (1.6 + 1.4 * (g.elapsed / ROUND)) * dt;
    while (g.spawnAcc >= 1) {
      g.spawnAcc -= 1;
      if (g.bubbles.length < MAX_BUBBLES) spawn(g);
    }
  }
  const f = g.elapsed < g.slowUntil ? 0.4 : 1;
  for (let i = g.bubbles.length - 1; i >= 0; i--) {
    const b = g.bubbles[i]!;
    b.t += dt;
    b.vy += (b.rise - b.vy) * Math.min(1, dt * 2.2);
    b.y += b.vy * dt * f;
    if (b.vx !== 0) {
      b.bx = clamp(b.bx + b.vx * dt * f, b.r, Math.max(b.r, g.w - b.r));
      b.vx *= Math.pow(0.08, dt);
      if (Math.abs(b.vx) < 2) b.vx = 0;
    }
    b.hit = Math.max(0, b.hit - dt * 3.5);
    b.x = b.bx + Math.sin(b.t * b.freq * f + b.ph) * b.amp + Math.sin(b.hit * 38) * b.hit * 5;
    if (b.y < -b.r - 12) g.bubbles.splice(i, 1);
  }
  for (let i = g.parts.length - 1; i >= 0; i--) {
    const p = g.parts[i]!;
    p.life -= dt;
    if (p.life <= 0) {
      g.parts.splice(i, 1);
      continue;
    }
    if (!p.ring) {
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  for (let i = g.floats.length - 1; i >= 0; i--) {
    const t = g.floats[i]!;
    t.life -= dt;
    t.y -= 42 * dt;
    if (t.life <= 0) g.floats.splice(i, 1);
  }
}

function draw(g: Game) {
  const x = g.ctx;
  if (!x) return;
  x.globalAlpha = 1;
  if (g.bg) x.drawImage(g.bg, 0, 0, g.w, g.h);
  else x.clearRect(0, 0, g.w, g.h);
  const fade = g.ending ? clamp(1 - g.endT / END_FADE, 0, 1) : 1;
  x.globalAlpha = fade;
  for (const b of g.bubbles) {
    const r = b.r * b.scale * (1 + b.hit * 0.1);
    const { img } = sprite(b.type, r, g.dpr);
    x.drawImage(img, b.x - r, b.y - r, r * 2, r * 2);
    if (b.type === 'gold' || b.type === 'rare') {
      const a = 0.5 + 0.5 * Math.sin(b.t * 6 + b.ph);
      drawSparkle(x, b.x + r * 0.35, b.y - r * 0.5, r * 0.3 * (0.6 + a * 0.5), a);
    }
  }
  x.globalAlpha = 1;
  for (const p of g.parts) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.ring) {
      const k = 1 - a;
      x.globalAlpha = a * 0.85;
      x.strokeStyle = '#fff';
      x.lineWidth = 2.5 * a + 0.5;
      x.beginPath();
      x.arc(p.x, p.y, p.r * (0.7 + k * 0.9), 0, Math.PI * 2);
      x.stroke();
    } else {
      x.globalAlpha = a;
      x.fillStyle = 'rgba(235,252,255,0.9)';
      x.strokeStyle = 'rgba(40,170,235,0.8)';
      x.lineWidth = 1;
      x.beginPath();
      x.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      x.fill();
      x.stroke();
    }
  }
  x.globalAlpha = 1;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  for (const t of g.floats) {
    const a = clamp(t.life / 0.5, 0, 1);
    x.globalAlpha = a;
    x.font = `900 ${t.gold ? 22 : 18}px ${FONT}`;
    x.lineWidth = 4;
    x.strokeStyle = 'rgba(5,60,130,0.65)';
    x.strokeText(t.txt, t.x, t.y);
    x.fillStyle = t.gold ? '#fff08a' : '#fff';
    x.fillText(t.txt, t.x, t.y);
  }
  x.globalAlpha = 1;
}

function hudWrite(g: Game, els: HudEls, dt: number) {
  const remain = g.ending ? 0 : 1 - g.elapsed / ROUND;
  if (els.bar) els.bar.style.transform = `scaleX(${remain.toFixed(4)})`;
  if (g.pulse && els.combo) {
    g.pulse = false;
    els.combo.classList.remove('is-pulse');
    void els.combo.offsetWidth;
    els.combo.classList.add('is-pulse');
  }
  g.hudT -= dt;
  if (g.hudT > 0) return;
  g.hudT = 0.125;
  if (els.score) els.score.textContent = String(g.score);
  if (els.secs) els.secs.textContent = `${Math.ceil((ROUND - g.elapsed) / 1000)} s`;
  if (els.combo) {
    els.combo.textContent = `x${g.mult}`;
    els.combo.dataset.on = g.mult > 1 ? 'true' : 'false';
  }
  if (els.tide) els.tide.hidden = !(g.elapsed < g.slowUntil);
}

/* ------------------------------------------------------------------ */
/* Componente                                                           */
/* ------------------------------------------------------------------ */

type Phase = 'idle' | 'playing' | 'result';

export default function BubblePop() {
  const { store, current, leak, go } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const active = current === 'bubbles';
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [rejected, setRejected] = useState(false);
  const [sessionBest, setSessionBest] = useState(loadSession);

  const gameRef = useRef<Game>(createGame());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const comboRef = useRef<HTMLSpanElement>(null);
  const tideRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const secsRef = useRef<HTMLSpanElement>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const leakRef = useRef(leak);
  leakRef.current = leak;
  const sessionRef = useRef(sessionBest);
  sessionRef.current = sessionBest;

  usePgEvent(store, 'board', () => setRejected(false));
  usePgEvent(store, 'err', (e) => {
    if (e.act === 'bubble-end') setRejected(true);
  });

  const finish = useCallback(() => {
    const g = gameRef.current;
    const pops = Math.min(g.pops, PG_LIMITS.bubbleMaxPops);
    const score = Math.floor(Math.min(g.score, PG_LIMITS.bubbleMaxScore, pops * 750));
    const combo = Math.min(g.maxCombo, pops);
    const record = score > 0 && (score > sessionRef.current || score > (snapRef.current?.you.best ?? 0));
    if (score > sessionRef.current) {
      saveSession(score);
      setSessionBest(score);
    }
    setResult({ score, pops, combo, record });
    setPhase('result');
    if (!getPrefs().muted && !leakRef.current) playUi('win', getPrefs().volume * 0.8);
    store.send({ k: 'bubble-end', score, pops, combo });
  }, [store]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const start = () => {
    unlockAudio();
    gameRef.current = createGame();
    setResult(null);
    setRejected(false);
    store.send({ k: 'bubble-start' });
    setPhase('playing');
  };

  // saiu do lugar no meio da rodada: abandona sem enviar nada
  useEffect(() => {
    if (!active && phase === 'playing') setPhase('idle');
  }, [active, phase]);

  useEffect(() => {
    if (phase !== 'playing' || !active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = gameRef.current;
    const layout = () => {
      const f = fitCanvas(canvas);
      g.w = f.w;
      g.h = f.h;
      g.dpr = f.dpr;
      g.ctx = f.ctx;
      g.bg = renderBg(f.w, f.h, f.dpr);
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(canvas);
    const els: HudEls = { score: scoreRef.current, combo: comboRef.current, tide: tideRef.current, bar: barRef.current, secs: secsRef.current };
    const loop = startLoop((dt) => {
      if (g.done) return;
      step(g, dt);
      draw(g);
      hudWrite(g, els, dt);
      if (g.ending && g.endT >= END_FADE) {
        g.done = true;
        finishRef.current();
      }
    }, stageRef.current);
    return () => {
      loop.stop();
      ro.disconnect();
    };
  }, [phase, active]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    tap(g, e.clientX - rect.left, e.clientY - rect.top, leakRef.current);
    e.preventDefault();
  };

  const rows = snap?.board ?? [];
  const me = snap?.you.pid;

  return (
    <div className="pg-tool pg-bub">
      {phase === 'playing' && (
        <>
          <div className="pg-bub-stage" ref={stageRef}>
            <canvas ref={canvasRef} className="pg-bub-canvas" onPointerDown={onPointerDown} aria-label="Área do jogo de bolhas" />
            <div className="pg-bub-hud" aria-hidden>
              <div className="pg-bub-hudrow">
                <span className="pg-bub-glass pg-bub-score" ref={scoreRef}>0</span>
                <span className="pg-bub-glass pg-bub-combo" ref={comboRef} data-on="false">x1</span>
                <span className="pg-bub-glass pg-bub-tide" ref={tideRef} hidden>Maré lenta</span>
              </div>
              <div className="pg-bub-hudrow">
                <div className="pg-bub-time" style={{ flex: 1 }}>
                  <div className="pg-bub-timefill" ref={barRef} />
                </div>
                <span className="pg-bub-glass pg-bub-secs" ref={secsRef}>60 s</span>
              </div>
            </div>
          </div>
          <div className="pg-bub-actions">
            <AeroButton variant="glass" size="sm" onClick={() => setPhase('idle')}>
              Abandonar rodada
            </AeroButton>
          </div>
        </>
      )}

      {phase === 'idle' && (
        <div className="pg-bub-card">
          <h2 className="pg-bub-title">Bolhas</h2>
          <ul className="pg-bub-rules">
            <li>Toque nas bolhas para estourar em 60 segundos.</li>
            <li><b>Douradas</b> valem 50, as <b>arco-íris</b> valem 120 e deixam a maré lenta.</li>
            <li><b>Gigantes</b> pedem 3 toques e soltam mini bolhas.</li>
            <li>Estoure em sequência para subir o multiplicador. Errar o toque zera a sequência.</li>
          </ul>
          <div className="pg-bub-records">
            <span className="pg-bub-record">
              Seu recorde na sala
              <strong>{snap?.you.best ?? 0}</strong>
            </span>
            <span className="pg-bub-record">
              Recorde desta sessão
              <strong>{sessionBest}</strong>
            </span>
          </div>
          <div className="pg-bub-actions">
            <AeroButton variant="green" onClick={start} disabled={!snap}>
              Jogar
            </AeroButton>
            <AeroButton variant="glass" onClick={() => go('world')}>
              Voltar
            </AeroButton>
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="pg-bub-card">
          <h2 className="pg-bub-title">Fim da rodada</h2>
          <p className="pg-bub-big">{result.score}</p>
          {result.record && <span className="pg-bub-new">Novo recorde!</span>}
          <div className="pg-bub-records">
            <span className="pg-bub-record">
              Bolhas estouradas
              <strong>{result.pops}</strong>
            </span>
            <span className="pg-bub-record">
              Maior combo
              <strong>{result.combo}</strong>
            </span>
          </div>
          <div className="pg-bub-actions">
            <AeroButton variant="green" onClick={start}>
              Jogar de novo
            </AeroButton>
            <AeroButton variant="glass" onClick={() => go('world')}>
              Voltar
            </AeroButton>
          </div>
        </div>
      )}

      {rejected && phase !== 'playing' && <PgNotice tone="warn">O placar não foi aceito pelo servidor.</PgNotice>}

      {phase !== 'playing' && (
        <PgSection title="Ranking da sala">
          {rows.length === 0 ? (
            <p className="pg-bub-empty">Ninguém pontuou ainda. Seja a primeira pessoa!</p>
          ) : (
            <ol className="pg-bub-board">
              {rows.map((r, i) => (
                <li key={r.pid} className={`pg-bub-row${r.pid === me ? ' is-me' : ''}`}>
                  <span className="pg-bub-pos">{i + 1}º</span>
                  <span className="pg-bub-name">{r.name}</span>
                  <span className="pg-bub-best">{r.best}</span>
                  <span className="pg-bub-rounds">{r.rounds}x</span>
                </li>
              ))}
            </ol>
          )}
        </PgSection>
      )}
    </div>
  );
}
