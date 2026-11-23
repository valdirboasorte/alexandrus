import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { fitCanvas, reducedMotion, startLoop } from '../loop.ts';
import type { LoopHandle } from '../loop.ts';
import './sky-toys.css';

type Tool = 'bubbles' | 'orbs' | 'drops' | 'sparkles';

const HINTS: Record<Tool, string> = {
  bubbles: 'Segure para soprar uma bolha, solte para ela voar.',
  orbs: 'Arraste e arremesse as esferas; toque no céu para criar outra.',
  drops: 'Toque ou arraste para pingar gotas na água.',
  sparkles: 'Arraste para deixar brilhos e soprar as folhas.',
};

const CAPS = { bubbles: 40, orbs: 8, drops: 60, parts: 160, ripples: 24 };

interface Bubble { x: number; y: number; vx: number; vy: number; r: number; grow: boolean; age: number; life: number; ph: number }
interface Orb { x: number; y: number; vx: number; vy: number; r: number; hue: number; user: boolean; grab: boolean; sub: boolean }
interface Drop { x: number; y: number; vx: number; vy: number; r: number }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; c: number; g: number }
interface Leaf { x: number; y: number; rot: number; vr: number; s: number; ph: number; hue: number; ix: number; iy: number }
interface Ripple { x: number; r: number; max: number }
interface Cloud { x: number; y: number; s: number; v: number }

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const SPARK_RGB = ['126,233,255', '166,230,76', '255,255,255'];
const ORB_HUES = [195, 210, 130, 100, 175, 235];

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')!];
}

function Icon({ children }: { children: ReactElement | ReactElement[] }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const TOOLS: { id: Tool; label: string; icon: ReactElement }[] = [
  { id: 'bubbles', label: 'Bolhas', icon: <Icon><circle cx="8" cy="8" r="5.5" /><path d="M5.2 6.2a3.6 3.6 0 0 1 2.4-1.6" /></Icon> },
  { id: 'orbs', label: 'Esferas', icon: <Icon><circle cx="8" cy="8" r="5.5" fill="currentColor" fillOpacity="0.2" /><path d="M5 6a3.6 3.6 0 0 1 4-1.8" /></Icon> },
  { id: 'drops', label: 'Gotas', icon: <Icon><path d="M8 2C6 5.2 4 7 4 9.6a4 4 0 0 0 8 0C12 7 10 5.2 8 2z" fill="currentColor" fillOpacity="0.2" /></Icon> },
  { id: 'sparkles', label: 'Brilhos', icon: <Icon><path d="M8 1.5l1.5 5 5 1.5-5 1.5L8 14.5 6.5 9.5l-5-1.5 5-1.5z" fill="currentColor" fillOpacity="0.2" /></Icon> },
];

export default function SkyToys({ active }: { active: boolean }) {
  const [tool, setTool] = useState<Tool>('bubbles');
  const toolRef = useRef<Tool>('bubbles');
  const activeRef = useRef(active);
  const loopRef = useRef<LoopHandle | null>(null);
  const resizeRef = useRef<(() => void) | null>(null);
  const clearRef = useRef<(() => void) | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pick = (t: Tool) => {
    toolRef.current = t;
    setTool(t);
  };

  useEffect(() => {
    activeRef.current = active;
    loopRef.current?.setActive(active);
    if (active) resizeRef.current?.();
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    let w = 1;
    let h = 1;
    let dpr = 1;
    let ctx = canvas.getContext('2d')!;
    let waterY = 1;
    let ready = false;
    let inited = false;
    let bg: HTMLCanvasElement | null = null;
    let cloudSpr: HTMLCanvasElement | null = null;
    let streakSpr: HTMLCanvasElement | null = null;
    let waterGrad: CanvasGradient | null = null;

    const bubbles: Bubble[] = [];
    const orbs: Orb[] = [];
    const drops: Drop[] = [];
    const parts: Part[] = [];
    const leaves: Leaf[] = [];
    const ripples: Ripple[] = [];
    const clouds: Cloud[] = [];
    const sprites = new Map<string, HTMLCanvasElement>();

    const ptr = {
      id: -1, down: false, x: 0, y: 0, vx: 0, vy: 0, moved: 0, lastX: 0, lastY: 0,
      grabbed: null as Orb | null, bubble: null as Bubble | null, tap: false,
    };

    /* ---------- sprites ---------- */
    const orbSprite = (r: number, hue: number) => {
      const key = `o${r}_${hue}_${dpr}`;
      let s = sprites.get(key);
      if (s) return s;
      const [c, g] = mk(2 * r * dpr, 2 * r * dpr);
      g.scale(dpr, dpr);
      g.beginPath();
      g.arc(r, r, r - 0.8, 0, TAU);
      g.save();
      g.clip();
      const body = g.createRadialGradient(r, r * 0.8, r * 0.1, r, r, r);
      body.addColorStop(0, `hsla(${hue},100%,93%,0.22)`);
      body.addColorStop(0.7, `hsla(${hue},90%,68%,0.34)`);
      body.addColorStop(1, `hsla(${hue},95%,52%,0.62)`);
      g.fillStyle = body;
      g.fillRect(0, 0, 2 * r, 2 * r);
      const glow = g.createRadialGradient(r, r * 1.55, 0, r, r * 1.55, r * 1.0);
      glow.addColorStop(0, `hsla(${hue + 25},100%,72%,0.85)`);
      glow.addColorStop(1, `hsla(${hue + 25},100%,72%,0)`);
      g.fillStyle = glow;
      g.fillRect(0, 0, 2 * r, 2 * r);
      g.restore();
      g.lineWidth = 1.2;
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.arc(r, r, r - 0.8, 0, TAU);
      g.stroke();
      const hl = g.createLinearGradient(0, r * 0.1, 0, r * 0.75);
      hl.addColorStop(0, 'rgba(255,255,255,0.95)');
      hl.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.fillStyle = hl;
      g.beginPath();
      g.ellipse(r, r * 0.4, r * 0.62, r * 0.3, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.arc(r * 1.45, r * 1.35, Math.max(1, r * 0.07), 0, TAU);
      g.fill();
      sprites.set(key, c);
      s = c;
      return s;
    };

    const bubbleSprite = (r: number) => {
      const key = `b${r}_${dpr}`;
      let s = sprites.get(key);
      if (s) return s;
      const [c, g] = mk(2 * r * dpr, 2 * r * dpr);
      g.scale(dpr, dpr);
      const body = g.createRadialGradient(r, r, r * 0.55, r, r, r);
      body.addColorStop(0, 'rgba(255,255,255,0)');
      body.addColorStop(0.8, 'rgba(190,235,255,0.14)');
      body.addColorStop(1, 'rgba(255,255,255,0.3)');
      g.fillStyle = body;
      g.beginPath();
      g.arc(r, r, r - 1, 0, TAU);
      g.fill();
      const rim = g.createLinearGradient(0, 0, 2 * r, 2 * r);
      rim.addColorStop(0, 'rgba(120,230,255,0.85)');
      rim.addColorStop(0.3, 'rgba(255,170,230,0.7)');
      rim.addColorStop(0.55, 'rgba(255,240,150,0.7)');
      rim.addColorStop(0.8, 'rgba(150,240,170,0.7)');
      rim.addColorStop(1, 'rgba(120,200,255,0.85)');
      g.strokeStyle = rim;
      g.lineWidth = Math.max(1.3, r * 0.07);
      g.beginPath();
      g.arc(r, r, r - 1.5, 0, TAU);
      g.stroke();
      const sheen = g.createRadialGradient(r * 1.35, r * 1.5, 0, r * 1.35, r * 1.5, r * 0.9);
      sheen.addColorStop(0, 'rgba(255,190,255,0)');
      sheen.addColorStop(0.8, 'rgba(255,200,255,0.18)');
      sheen.addColorStop(1, 'rgba(160,240,255,0.28)');
      g.fillStyle = sheen;
      g.beginPath();
      g.arc(r, r, r - 2, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.beginPath();
      g.ellipse(r * 0.62, r * 0.45, r * 0.3, r * 0.14, -0.6, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath();
      g.arc(r * 1.4, r * 1.45, Math.max(1, r * 0.06), 0, TAU);
      g.fill();
      sprites.set(key, c);
      s = c;
      return s;
    };

    const glowSprite = (ci: number) => {
      const key = `g${ci}`;
      let s = sprites.get(key);
      if (s) return s;
      const [c, g] = mk(48, 48);
      const rgb = ci < 3 ? SPARK_RGB[ci]! : '210,248,255';
      const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, `rgba(${rgb},0.85)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, 48, 48);
      sprites.set(key, c);
      s = c;
      return s;
    };

    /* ---------- fundo (camadas estáticas) ---------- */
    const buildBackground = () => {
      const [c, g] = mk(w * dpr, h * dpr);
      g.scale(dpr, dpr);
      const sky = g.createLinearGradient(0, 0, 0, waterY);
      sky.addColorStop(0, '#2b9ff2');
      sky.addColorStop(0.55, '#6ccaf9');
      sky.addColorStop(1, '#d9f6ff');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      const sun = g.createRadialGradient(w * 0.78, h * 0.12, 0, w * 0.78, h * 0.12, w * 0.7);
      sun.addColorStop(0, 'rgba(255,255,255,0.7)');
      sun.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sun;
      g.fillRect(0, 0, w, waterY);
      const sea = g.createLinearGradient(0, waterY, 0, h);
      sea.addColorStop(0, '#c9f6ff');
      sea.addColorStop(0.5, '#7ee9ff');
      sea.addColorStop(1, '#2cc0ee');
      g.fillStyle = sea;
      g.fillRect(0, waterY, w, h - waterY);
      // grama e folhas nas bordas
      let seed = 7;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const blade = (x: number, base: number, len: number, lean: number, col: string) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x - 2.5, base);
        g.quadraticCurveTo(x + lean * 0.3, base - len * 0.6, x + lean, base - len);
        g.quadraticCurveTo(x + lean * 0.5 + 2, base - len * 0.5, x + 2.5, base);
        g.closePath();
        g.fill();
      };
      const cols = ['#48b52c', '#6fcf3a', '#23801d', '#a6e64c'];
      for (const side of [0, 1]) {
        for (let i = 0; i < 14; i++) {
          const dx = rand() * Math.min(70, w * 0.22);
          const x = side === 0 ? dx : w - dx;
          const dir = side === 0 ? 1 : -1;
          blade(x, h + 2, 22 + rand() * 40 * (1 - dx / 100), dir * (6 + rand() * 18), cols[Math.floor(rand() * 4)]!);
        }
      }
      bg = c;
      // nuvem
      const [cc, cg] = mk(160 * dpr, 70 * dpr);
      cg.scale(dpr, dpr);
      const puff = (x: number, y: number, r: number) => {
        const gr = cg.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)');
        gr.addColorStop(1, 'rgba(255,255,255,0.35)');
        cg.fillStyle = gr;
        cg.beginPath();
        cg.arc(x, y, r, 0, TAU);
        cg.fill();
      };
      puff(45, 44, 22);
      puff(75, 34, 28);
      puff(108, 42, 22);
      puff(88, 50, 18);
      puff(58, 52, 16);
      cloudSpr = cc;
      // brilho que corre na água
      const [sc, sg] = mk(160 * dpr, 10 * dpr);
      sg.scale(dpr, dpr);
      const st = sg.createLinearGradient(0, 0, 160, 0);
      st.addColorStop(0, 'rgba(255,255,255,0)');
      st.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      st.addColorStop(1, 'rgba(255,255,255,0)');
      sg.fillStyle = st;
      sg.beginPath();
      sg.ellipse(80, 5, 80, 3, 0, 0, TAU);
      sg.fill();
      streakSpr = sc;
      waterGrad = ctx.createLinearGradient(0, waterY, 0, h);
      waterGrad.addColorStop(0, 'rgba(190,246,255,0.22)');
      waterGrad.addColorStop(1, 'rgba(40,190,236,0.42)');
    };

    /* ---------- criação ---------- */
    const spawnOrb = (x: number, y: number, user: boolean) => {
      if (orbs.length >= CAPS.orbs) {
        const i = orbs.findIndex((o) => o.user && !o.grab);
        orbs.splice(i >= 0 ? i : 0, 1);
      }
      orbs.push({ x, y, vx: rnd(-40, 40), vy: rnd(-30, 10), r: Math.round(rnd(20, 31)), hue: ORB_HUES[Math.floor(Math.random() * ORB_HUES.length)]!, user, grab: false, sub: false });
    };
    const addPart = (p: Part) => {
      if (parts.length >= CAPS.parts) parts.shift();
      parts.push(p);
    };
    const addRipple = (x: number, size: number) => {
      if (ripples.length >= CAPS.ripples) ripples.shift();
      ripples.push({ x, r: 2, max: 18 + size * 2.2 });
    };
    const splash = (x: number, y: number, n: number, speed: number, up: boolean) => {
      for (let i = 0; i < n; i++) {
        const a = up ? rnd(-Math.PI * 0.9, -Math.PI * 0.1) : rnd(0, TAU);
        const sp = rnd(0.4, 1) * speed;
        addPart({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, max: 0.7, size: rnd(2.5, 4.5), c: 3, g: up ? 380 : 120 });
      }
    };
    const popBubble = (b: Bubble) => {
      const i = bubbles.indexOf(b);
      if (i >= 0) bubbles.splice(i, 1);
      if (ptr.bubble === b) ptr.bubble = null;
      splash(b.x, b.y, 8, 70, false);
    };
    const spawnDrop = (x: number, y: number) => {
      if (drops.length >= CAPS.drops) drops.shift();
      drops.push({ x, y, vx: rnd(-8, 8), vy: rnd(20, 60), r: rnd(3.5, 7) });
    };
    const spawnSpark = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) {
        addPart({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-18, 18) + ptr.vx * 0.05, vy: rnd(-70, -20), life: rnd(1, 1.8), max: 1.8, size: rnd(5, 11), c: Math.floor(Math.random() * 3), g: -8 });
      }
    };
    const spawnLeaf = (top: boolean) => {
      leaves.push({ x: rnd(10, Math.max(20, w - 10)), y: top ? -20 : rnd(0, waterY * 0.8), rot: rnd(0, TAU), vr: rnd(-1, 1), s: rnd(7, 12), ph: rnd(0, TAU), hue: rnd(85, 130), ix: 0, iy: 0 });
    };

    const clear = () => {
      bubbles.length = 0;
      drops.length = 0;
      parts.length = 0;
      ripples.length = 0;
      ptr.bubble = null;
      for (let i = orbs.length - 1; i >= 0; i--) if (orbs[i]!.user) orbs.splice(i, 1);
    };
    clearRef.current = clear;

    /* ---------- tamanho ---------- */
    const resize = () => {
      const f = fitCanvas(canvas);
      if (f.w < 40 || f.h < 40) return;
      const oldDpr = dpr;
      w = f.w;
      h = f.h;
      dpr = f.dpr;
      ctx = f.ctx;
      if (oldDpr !== dpr) sprites.clear();
      waterY = Math.round(h * 0.78);
      buildBackground();
      if (!inited) {
        inited = true;
        for (let i = 0; i < 4; i++) spawnOrb(w * (0.18 + i * 0.21), h * rnd(0.2, 0.4), false);
        clouds.push({ x: w * 0.1, y: h * 0.1, s: 1, v: 9 }, { x: w * 0.6, y: h * 0.28, s: 0.75, v: 6 }, { x: w * 0.35, y: h * 0.5, s: 0.6, v: 12 });
        for (let i = 0; i < 6; i++) spawnLeaf(false);
      }
      for (const o of orbs) {
        o.x = Math.min(w - o.r, Math.max(o.r, o.x));
        o.y = Math.min(h - o.r, Math.max(o.r, o.y));
      }
      for (const b of bubbles) b.x = Math.min(w - b.r, Math.max(b.r, b.x));
      for (const d of drops) d.x = Math.min(w - d.r, Math.max(d.r, d.x));
      ready = true;
    };
    resizeRef.current = resize;

    /* ---------- simulação ---------- */
    const step = (dt: number, t: number, still: boolean) => {
      const drag = Math.exp(-dt * 0.5);
      ptr.vx *= Math.exp(-dt * 6);
      ptr.vy *= Math.exp(-dt * 6);

      // bolhas
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]!;
        if (b.grow) {
          if (!ptr.down) b.grow = false;
          else {
            b.r = Math.min(60, b.r + 38 * dt);
            b.x += (ptr.x - b.x) * Math.min(1, dt * 18);
            b.y += (ptr.y - b.y) * Math.min(1, dt * 18);
            b.x = Math.min(w - b.r, Math.max(b.r, b.x));
            continue;
          }
        }
        b.age += dt;
        const speed = 28 + (60 - b.r) * 0.6;
        b.vy += (-speed - b.vy) * Math.min(1, dt * 1.5);
        b.vx *= Math.exp(-dt * 1.5);
        b.x += (b.vx + (still ? 0 : Math.sin(t * 1.7 + b.ph) * 14)) * dt;
        b.y += b.vy * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.6; }
        if (b.x > w - b.r) { b.x = w - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
        if (b.y - b.r <= 0 || b.age > b.life) popBubble(b);
      }
      for (let i = 0; i < bubbles.length; i++) {
        const a = bubbles[i]!;
        for (let j = i + 1; j < bubbles.length; j++) {
          const c = bubbles[j]!;
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const min = a.r + c.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 < 0.0001) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const push = (min - d) * 0.25;
          if (!a.grow) { a.x -= nx * push; a.y -= ny * push; a.vx -= nx * 6; }
          if (!c.grow) { c.x += nx * push; c.y += ny * push; c.vx += nx * 6; }
        }
      }

      // esferas
      for (const o of orbs) {
        if (o.grab) {
          o.vx = Math.max(-900, Math.min(900, (ptr.x - o.x) * 14));
          o.vy = Math.max(-900, Math.min(900, (ptr.y - o.y) * 14));
        } else {
          o.vy += 170 * dt;
          const depth = Math.min(1, Math.max(0, (o.y + o.r - waterY) / (2 * o.r)));
          if (depth > 0) {
            o.vy -= depth * 170 * 2.4 * dt;
            o.vx *= Math.exp(-dt * 1.2);
            o.vy *= Math.exp(-dt * 2.5 * depth);
          }
          o.vx *= drag;
          o.vy *= drag;
        }
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        const sub = o.y + o.r > waterY + o.r * 0.3;
        if (sub !== o.sub) {
          if (Math.abs(o.vy) > 40) addRipple(o.x, o.r * 0.5);
          o.sub = sub;
        }
        if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx) * 0.6; }
        if (o.x > w - o.r) { o.x = w - o.r; o.vx = -Math.abs(o.vx) * 0.6; }
        if (o.y < o.r) { o.y = o.r; o.vy = Math.abs(o.vy) * 0.6; }
        if (o.y > h - o.r) { o.y = h - o.r; o.vy = -Math.abs(o.vy) * 0.6; }
      }
      for (let i = 0; i < orbs.length; i++) {
        const a = orbs[i]!;
        for (let j = i + 1; j < orbs.length; j++) {
          const c = orbs[j]!;
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const min = a.r + c.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 < 0.0001) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const ia = a.grab ? 0 : 1 / (a.r * a.r);
          const ic = c.grab ? 0 : 1 / (c.r * c.r);
          const sum = ia + ic;
          if (sum === 0) continue;
          const over = min - d;
          a.x -= nx * over * (ia / sum);
          a.y -= ny * over * (ia / sum);
          c.x += nx * over * (ic / sum);
          c.y += ny * over * (ic / sum);
          const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (vn < 0) {
            const j2 = (-(1 + 0.6) * vn) / sum;
            a.vx -= j2 * ia * nx;
            a.vy -= j2 * ia * ny;
            c.vx += j2 * ic * nx;
            c.vy += j2 * ic * ny;
          }
        }
      }

      // gotas
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]!;
        d.vy += 420 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.x < d.r) { d.x = d.r; d.vx = Math.abs(d.vx) * 0.5; }
        if (d.x > w - d.r) { d.x = w - d.r; d.vx = -Math.abs(d.vx) * 0.5; }
        if (d.y + d.r >= waterY) {
          addRipple(d.x, d.r);
          splash(d.x, waterY, Math.round(4 + d.r * 0.7), 40 + d.vy * 0.25, true);
          drops.splice(i, 1);
        }
      }
      for (let i = 0; i < drops.length; i++) {
        const a = drops[i]!;
        for (let j = drops.length - 1; j > i; j--) {
          const c = drops[j]!;
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const min = a.r + c.r;
          if (dx * dx + dy * dy >= min * min) continue;
          const ma = a.r * a.r;
          const mc = c.r * c.r;
          const m = ma + mc;
          a.x = (a.x * ma + c.x * mc) / m;
          a.y = (a.y * ma + c.y * mc) / m;
          a.vx = (a.vx * ma + c.vx * mc) / m;
          a.vy = (a.vy * ma + c.vy * mc) / m;
          a.r = Math.min(15, Math.sqrt(m));
          drops.splice(j, 1);
        }
      }

      // partículas
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        p.life -= dt;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0 || (p.c === 3 && p.g > 100 && p.y > waterY + 2)) parts.splice(i, 1);
      }

      // ondulações
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]!;
        r.r += 55 * dt;
        if (r.r >= r.max) ripples.splice(i, 1);
      }

      // folhas
      if (!still) {
        for (const l of leaves) {
          if (toolRef.current === 'sparkles' && ptr.down) {
            const dx = l.x - ptr.x;
            const dy = l.y - ptr.y;
            const d = Math.hypot(dx, dy);
            if (d < 110) {
              const f = 1 - d / 110;
              l.ix += ptr.vx * f * dt * 4;
              l.iy += ptr.vy * f * dt * 4;
              l.vr += (dx > 0 ? 1 : -1) * f * dt * 6;
            }
          }
          l.ix *= Math.exp(-dt * 1.2);
          l.iy *= Math.exp(-dt * 1.2);
          l.vr *= Math.exp(-dt * 0.8);
          l.x += (Math.sin(t * 0.8 + l.ph) * 18 + l.ix) * dt;
          l.y += (20 + l.s * 1.5 + l.iy) * dt;
          l.rot += l.vr * dt;
          if (l.x < -20) l.x = w + 10;
          if (l.x > w + 20) l.x = -10;
          if (l.y > waterY + 6) {
            l.y = -20;
            l.x = rnd(10, Math.max(20, w - 10));
          }
        }
      }
    };

    /* ---------- desenho ---------- */
    const render = (t: number, still: boolean) => {
      ctx.clearRect(0, 0, w, h);
      if (bg) ctx.drawImage(bg, 0, 0, w, h);
      if (cloudSpr) {
        for (const c of clouds) {
          const cw = 160 * c.s;
          const x = still ? c.x : ((c.x + t * c.v + cw) % (w + cw * 2)) - cw;
          ctx.globalAlpha = 0.8;
          ctx.drawImage(cloudSpr, x, c.y, cw, 70 * c.s);
        }
        ctx.globalAlpha = 1;
      }
      if (!still) {
        for (const l of leaves) {
          ctx.save();
          ctx.translate(l.x, l.y);
          ctx.rotate(l.rot);
          ctx.fillStyle = `hsla(${l.hue},62%,48%,0.9)`;
          ctx.beginPath();
          ctx.moveTo(0, -l.s);
          ctx.quadraticCurveTo(l.s * 0.85, 0, 0, l.s);
          ctx.quadraticCurveTo(-l.s * 0.85, 0, 0, -l.s);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -l.s * 0.8);
          ctx.lineTo(0, l.s * 0.8);
          ctx.stroke();
          ctx.restore();
        }
      }
      for (const o of orbs) {
        ctx.drawImage(orbSprite(Math.round(o.r), o.hue), o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
      }
      for (const d of drops) {
        const rb = Math.max(3, Math.round(d.r));
        ctx.drawImage(orbSprite(rb, 195), d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
      }
      for (const b of bubbles) {
        const bucket = Math.max(6, Math.round(b.r / 4) * 4);
        ctx.globalAlpha = b.life - b.age < 1.5 && !b.grow ? Math.max(0.3, (b.life - b.age) / 1.5) : 1;
        ctx.drawImage(bubbleSprite(bucket), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
      ctx.globalAlpha = 1;
      // água na frente
      if (waterGrad) {
        ctx.fillStyle = waterGrad;
        ctx.fillRect(0, waterY, w, h - waterY);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = waterY + (still ? 0 : Math.sin(x * 0.05 + t * 1.6) * 1.8);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (streakSpr) {
        const sx = still ? w * 0.4 : ((t * 38) % (w + 200)) - 160;
        ctx.globalAlpha = 0.75;
        ctx.drawImage(streakSpr, sx, waterY + h * 0.06, 160, 10);
        ctx.globalAlpha = 0.45;
        ctx.drawImage(streakSpr, w - sx - 120, waterY + h * 0.12, 110, 7);
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = 1.5;
      for (const r of ripples) {
        ctx.strokeStyle = `rgba(255,255,255,${(0.85 * (1 - r.r / r.max)).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(r.x, waterY + 3, r.r, r.r * 0.28, 0, 0, TAU);
        ctx.stroke();
      }
      for (const p of parts) {
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = Math.min(1, a * (p.c === 3 ? 1.2 : 1.4));
        ctx.drawImage(glowSprite(p.c), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      }
      ctx.globalAlpha = 1;
    };

    const loop = startLoop((dt, now) => {
      if (!ready) return;
      const still = reducedMotion();
      const t = now / 1000;
      step(dt, t, still);
      render(t, still);
    }, stage);
    loopRef.current = loop;
    loop.setActive(activeRef.current);

    /* ---------- ponteiro ---------- */
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || ptr.down) return;
      const p = pos(e);
      ptr.id = e.pointerId;
      ptr.down = true;
      ptr.x = ptr.lastX = p.x;
      ptr.y = ptr.lastY = p.y;
      ptr.vx = ptr.vy = 0;
      ptr.moved = 0;
      ptr.tap = false;
      ptr.grabbed = null;
      ptr.bubble = null;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
      const tl = toolRef.current;
      if (tl === 'bubbles') {
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i]!;
          if (!b.grow && Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 4) {
            popBubble(b);
            return;
          }
        }
        if (bubbles.length >= CAPS.bubbles) {
          const old = bubbles.find((b) => !b.grow);
          if (old) popBubble(old);
        }
        const b: Bubble = { x: p.x, y: p.y, vx: 0, vy: 0, r: 6, grow: true, age: 0, life: rnd(12, 20), ph: rnd(0, TAU) };
        bubbles.push(b);
        ptr.bubble = b;
      } else if (tl === 'orbs') {
        for (let i = orbs.length - 1; i >= 0; i--) {
          const o = orbs[i]!;
          if (Math.hypot(p.x - o.x, p.y - o.y) <= o.r + 6) {
            o.grab = true;
            ptr.grabbed = o;
            return;
          }
        }
        ptr.tap = true;
      } else if (tl === 'drops') {
        spawnDrop(p.x, p.y);
      } else {
        spawnSpark(p.x, p.y, 4);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!ptr.down || e.pointerId !== ptr.id) return;
      const p = pos(e);
      const dx = p.x - ptr.x;
      const dy = p.y - ptr.y;
      ptr.vx = ptr.vx * 0.5 + dx * 30 * 0.5;
      ptr.vy = ptr.vy * 0.5 + dy * 30 * 0.5;
      ptr.x = p.x;
      ptr.y = p.y;
      ptr.moved += Math.hypot(dx, dy);
      const dist = Math.hypot(p.x - ptr.lastX, p.y - ptr.lastY);
      const tl = toolRef.current;
      if (tl === 'drops' && dist >= 22) {
        spawnDrop(p.x, p.y);
        ptr.lastX = p.x;
        ptr.lastY = p.y;
      } else if (tl === 'sparkles' && dist >= 7) {
        spawnSpark(p.x, p.y, 2);
        ptr.lastX = p.x;
        ptr.lastY = p.y;
      }
    };

    const release = (e: PointerEvent, cancelled: boolean) => {
      if (!ptr.down || e.pointerId !== ptr.id) return;
      ptr.down = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* já solto */ }
      if (ptr.bubble) ptr.bubble.grow = false;
      if (ptr.grabbed) ptr.grabbed.grab = false;
      if (!cancelled && ptr.tap && ptr.moved < 8) spawnOrb(ptr.x, ptr.y, true);
      ptr.bubble = null;
      ptr.grabbed = null;
      ptr.tap = false;
    };
    const onUp = (e: PointerEvent) => release(e, false);
    const onCancel = (e: PointerEvent) => release(e, true);

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);

    const ro = new ResizeObserver(() => resize());
    ro.observe(stage);
    resize();

    return () => {
      loop.stop();
      loopRef.current = null;
      resizeRef.current = null;
      clearRef.current = null;
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      sprites.clear();
    };
  }, []);

  return (
    <div className="pg-toys" role="group" aria-label="Brinquedos do Céu">
      <div className="pg-toys__bar">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className="pg-toys__btn" aria-pressed={tool === t.id} onClick={() => pick(t.id)}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        <button type="button" className="pg-toys__btn pg-toys__btn--clear" aria-pressed={false} onClick={() => clearRef.current?.()}>
          <Icon>
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </Icon>
          <span>Limpar</span>
        </button>
      </div>
      <p className="pg-toys__hint" aria-live="polite">{HINTS[tool]}</p>
      <div className="pg-toys__stage" ref={stageRef}>
        <canvas className="pg-toys__canvas" ref={canvasRef} />
      </div>
    </div>
  );
}
