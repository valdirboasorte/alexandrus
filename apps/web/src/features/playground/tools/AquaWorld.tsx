import { useEffect, useMemo, useRef, useState } from 'react';
import { FISH_PATTERNS, FISH_SPECIES, PG_COOLDOWN, unlockedSpecies, type FishPattern, type FishSpecies, type FishView } from '@protocol';
import { AeroButton } from '../../../components/ui/AeroButton.tsx';
import { usePgEnv } from '../context.ts';
import { useCooldown, usePg, usePgEvent } from '../hooks.ts';
import { fitCanvas, reducedMotion, startLoop } from '../loop.ts';
import { getPrefs } from '../prefs.ts';
import { playUi } from '../sfx.ts';
import { ERR_TEXT } from '../store.ts';
import { PgChip, PgNotice, PgSection } from '../ui.tsx';
import './aqua.css';

/*
 * Lagoa Aqua: o aquário da sala. Cada pessoa tem um peixe. O trajeto de cada
 * peixe é uma função da semente e do relógio do servidor, então todo mundo vê
 * os peixes nos mesmos lugares sem nenhum tráfego de rede. Só a comida
 * trafega: o servidor diz qual peixe come, e a ida até a comida também é
 * calculada pelo carimbo de tempo — igual em todas as telas.
 */

/* ---------------- trajetos ---------------- */

interface Path {
  a1: number;
  a2: number;
  b1: number;
  b2: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function pathFor(seed: number): Path {
  const r = rng(seed);
  return {
    a1: 0.045 + r() * 0.05,
    a2: 0.13 + r() * 0.1,
    b1: 0.07 + r() * 0.06,
    b2: 0.21 + r() * 0.12,
    p1: r() * Math.PI * 2,
    p2: r() * Math.PI * 2,
    p3: r() * Math.PI * 2,
    p4: r() * Math.PI * 2,
  };
}

/** Posição normalizada (0–1) do peixe no instante t (segundos do servidor). */
function swim(p: Path, t: number, jelly: boolean): { x: number; y: number; dx: number } {
  const x = 0.5 + 0.37 * Math.sin(t * p.a1 + p.p1) + 0.07 * Math.sin(t * p.a2 + p.p2);
  const y = (jelly ? 0.36 : 0.42) + 0.2 * Math.sin(t * p.b1 + p.p3) + 0.05 * Math.sin(t * p.b2 + p.p4);
  const dx = 0.37 * p.a1 * Math.cos(t * p.a1 + p.p1) + 0.07 * p.a2 * Math.cos(t * p.a2 + p.p2);
  return { x: Math.min(0.95, Math.max(0.05, x)), y: Math.min(0.76, Math.max(0.1, y)), dx };
}

const smooth = (a: number, b: number, v: number) => {
  const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const FOOD_FALL = 0.11; // fração da altura por segundo
const EAT_AT = 2.2; // s depois de jogada, o peixe escolhido come

interface Food {
  x: number;
  at: number;
  fish: string | null;
  by: string;
}

/** Onde está a comida τ segundos depois de jogada. */
function foodPos(f: Food, tau: number) {
  return { x: f.x / 1000, y: Math.min(0.8, 0.05 + FOOD_FALL * tau) };
}

/* ---------------- desenho dos peixes ---------------- */

export function drawFish(
  ctx: CanvasRenderingContext2D,
  f: { species: FishSpecies; pattern: FishPattern; hue: number; hue2: number },
  x: number,
  y: number,
  scale: number,
  facing: 1 | -1,
  t: number,
) {
  const h = f.species === 'dourado' ? 42 : f.hue;
  const h2 = f.species === 'dourado' ? 18 : f.hue2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);
  const wag = Math.sin(t * 6 + x * 0.05) * 0.18;

  const body = (rx: number, ry: number) => {
    const g = ctx.createLinearGradient(0, -ry, 0, ry);
    if (f.pattern === 'degrade') {
      g.addColorStop(0, `hsl(${h} 95% 72%)`);
      g.addColorStop(1, `hsl(${h2} 90% 45%)`);
    } else {
      g.addColorStop(0, `hsl(${h} 95% 78%)`);
      g.addColorStop(0.55, `hsl(${h} 85% 55%)`);
      g.addColorStop(1, `hsl(${h} 80% 38%)`);
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // padrão por cima do corpo
    ctx.save();
    ctx.clip();
    if (f.pattern === 'listras') {
      ctx.fillStyle = `hsla(${h2} 90% 50% / 0.75)`;
      for (let i = -2; i <= 2; i++) ctx.fillRect(i * rx * 0.42 - rx * 0.08, -ry, rx * 0.16, ry * 2);
    } else if (f.pattern === 'pintas') {
      ctx.fillStyle = `hsla(${h2} 95% 55% / 0.85)`;
      const dots = [
        [-0.4, -0.3, 0.16],
        [0.1, -0.45, 0.12],
        [0.35, 0.1, 0.14],
        [-0.15, 0.3, 0.13],
        [-0.6, 0.15, 0.1],
      ];
      for (const [dx, dy, r] of dots) {
        ctx.beginPath();
        ctx.arc(dx * rx, dy * ry, r * rx, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // reflexo de vidro
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.05, -ry * 0.48, rx * 0.62, ry * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4 / scale;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  };

  const fin = (color: string) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2 / scale;
  };

  const eye = (ex: number, ey: number, r: number) => {
    ctx.fillStyle = '#06306a';
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex + r * 0.35, ey - r * 0.35, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  };

  switch (f.species) {
    case 'agua-viva': {
      // sino translúcido e tentáculos ondulando (sempre "em pé")
      ctx.scale(facing, 1);
      const pulse = 1 + Math.sin(t * 3 + x) * 0.06;
      ctx.strokeStyle = `hsla(${h2} 90% 70% / 0.8)`;
      ctx.lineWidth = 2 / scale;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 5, 6);
        for (let k = 1; k <= 4; k++) ctx.lineTo(i * 5 + Math.sin(t * 4 + k + i) * 3, 6 + k * 7);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(-4, -8, 2, 0, -2, 18);
      g.addColorStop(0, `hsla(${h} 100% 92% / 0.95)`);
      g.addColorStop(1, `hsla(${h} 90% 60% / 0.55)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16 * pulse, 13 / pulse, 0, Math.PI, 0);
      ctx.quadraticCurveTo(0, 10, -16 * pulse, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(-5, -7, 6, 3, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'arraia': {
      const flap = Math.sin(t * 3 + x * 0.1) * 5;
      fin(`hsl(${h2} 80% 50%)`);
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.quadraticCurveTo(-34, wag * 20, -40, wag * 30);
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = `hsl(${h2} 70% 40%)`;
      ctx.stroke();
      const g = ctx.createLinearGradient(0, -20, 0, 20);
      g.addColorStop(0, `hsl(${h} 90% 75%)`);
      g.addColorStop(1, `hsl(${h} 80% 42%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.quadraticCurveTo(4, -22 - flap, -14, 0);
      ctx.quadraticCurveTo(4, 22 + flap, 18, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.4 / scale;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(2, -7, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      eye(11, -3, 1.8);
      break;
    }
    case 'lua': {
      fin(`hsl(${h2} 85% 55%)`);
      ctx.beginPath();
      ctx.moveTo(-2, -15);
      ctx.quadraticCurveTo(-6, -30, 6, -26);
      ctx.lineTo(4, -12);
      ctx.moveTo(-2, 15);
      ctx.quadraticCurveTo(-6, 30, 6, 26);
      ctx.lineTo(4, 12);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.lineTo(-22, -8 + wag * 10);
      ctx.lineTo(-22, 8 + wag * 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      body(14, 18);
      eye(7, -5, 2.6);
      break;
    }
    case 'veu': {
      fin(`hsla(${h2} 90% 60% / 0.9)`);
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.bezierCurveTo(-24, -18 + wag * 20, -40, -16 + wag * 30, -38, 2 + wag * 26);
      ctx.bezierCurveTo(-40, 16 + wag * 30, -24, 18 + wag * 20, -8, 0);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, -8);
      ctx.quadraticCurveTo(-10, -22, 4, -18);
      ctx.closePath();
      ctx.fill();
      body(12, 9);
      eye(6, -2, 2);
      break;
    }
    case 'neon': {
      ctx.shadowColor = `hsl(${h2} 100% 60%)`;
      ctx.shadowBlur = 10;
      fin(`hsl(${h} 80% 55%)`);
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-22, -6 + wag * 8);
      ctx.lineTo(-22, 6 + wag * 8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      body(15, 5.5);
      ctx.fillStyle = `hsl(${h2} 100% 62%)`;
      ctx.fillRect(-12, -1.2, 22, 2.4);
      eye(9, -1, 1.5);
      break;
    }
    case 'listrado': {
      fin(`hsl(${h2} 85% 55%)`);
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(-26, -9 + wag * 12);
      ctx.lineTo(-24, 0);
      ctx.lineTo(-26, 9 + wag * 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, -8);
      ctx.lineTo(4, -14);
      ctx.lineTo(8, -7);
      ctx.fill();
      body(17, 8);
      eye(10, -2, 2);
      break;
    }
    case 'dourado': {
      fin(`hsla(${h2} 95% 62% / 0.9)`);
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.bezierCurveTo(-26, -14 + wag * 16, -36, -10 + wag * 22, -34, 0 + wag * 20);
      ctx.bezierCurveTo(-36, 10 + wag * 22, -26, 14 + wag * 16, -14, 0);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, 6);
      ctx.quadraticCurveTo(-6, 18, 6, 14);
      ctx.closePath();
      ctx.fill();
      body(17, 9);
      ctx.strokeStyle = `hsl(${h2} 90% 40%)`;
      ctx.lineWidth = 1.6 / scale;
      ctx.beginPath();
      ctx.moveTo(15, 2);
      ctx.quadraticCurveTo(22, 6, 20, 10);
      ctx.stroke();
      eye(10, -2, 2);
      break;
    }
    default: {
      // bolinha
      fin(`hsl(${h2} 85% 58%)`);
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-22, -9 + wag * 12);
      ctx.lineTo(-22, 9 + wag * 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-3, -10);
      ctx.quadraticCurveTo(2, -18, 7, -9);
      ctx.fill();
      body(13, 11);
      eye(6, -3, 2.4);
    }
  }
  ctx.restore();
}

/* ---------------- cena ---------------- */

interface Bubble {
  x: number;
  y: number;
  r: number;
  v: number;
  ph: number;
}

function renderBackground(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const water = g.createLinearGradient(0, 0, 0, h);
  water.addColorStop(0, '#9cefff');
  water.addColorStop(0.18, '#3fd0f6');
  water.addColorStop(0.65, '#0c94dc');
  water.addColorStop(1, '#075aae');
  g.fillStyle = water;
  g.fillRect(0, 0, w, h);
  // superfície
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, 0, w, 3);
  // areia
  const sandY = h * 0.84;
  const sand = g.createLinearGradient(0, sandY, 0, h);
  sand.addColorStop(0, '#fff1c2');
  sand.addColorStop(1, '#e2bf78');
  g.fillStyle = sand;
  g.beginPath();
  g.moveTo(0, sandY + 8);
  for (let x = 0; x <= w; x += 20) g.quadraticCurveTo(x + 10, sandY - 6 + Math.sin(x * 0.05) * 6, x + 20, sandY + 4 + Math.sin(x * 0.03) * 5);
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.closePath();
  g.fill();
  // pedras de vidro e conchas
  const stones = [
    [0.12, 0.9, 18, 200],
    [0.2, 0.93, 11, 160],
    [0.74, 0.91, 22, 190],
    [0.86, 0.94, 12, 140],
    [0.5, 0.95, 9, 120],
  ];
  for (const [sx, sy, r, hue] of stones) {
    const sg = g.createRadialGradient(sx * w - r * 0.3, sy * h - r * 0.4, 1, sx * w, sy * h, r);
    sg.addColorStop(0, `hsl(${hue} 70% 90%)`);
    sg.addColorStop(1, `hsl(${hue} 50% 55%)`);
    g.fillStyle = sg;
    g.beginPath();
    g.ellipse(sx * w, sy * h, r, r * 0.7, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

const PLANTS = [
  { x: 0.06, h: 0.42, hue: 140 },
  { x: 0.1, h: 0.3, hue: 100 },
  { x: 0.3, h: 0.22, hue: 160 },
  { x: 0.62, h: 0.26, hue: 120 },
  { x: 0.9, h: 0.46, hue: 150 },
  { x: 0.95, h: 0.32, hue: 95 },
];

export default function AquaWorld() {
  const { store, current } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [names, setNames] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedLeft = useCooldown(store, 'feed');

  // o laço lê sempre o estado mais novo, sem reiniciar
  const fishRef = useRef<FishView[]>([]);
  fishRef.current = snap?.fish ?? [];
  const meRef = useRef<string | null>(null);
  meRef.current = snap?.you.fish ?? null;
  const selRef = useRef<string | null>(null);
  selRef.current = selected;
  const namesRef = useRef(names);
  namesRef.current = names;
  const foods = useRef<Food[]>([]);
  const paths = useRef(new Map<string, Path>());
  const active = current === 'aqua';

  usePgEvent(store, 'food', (e) => {
    foods.current.push({ x: e.x, at: e.at, fish: e.fish, by: e.by });
    if (foods.current.length > 24) foods.current.shift();
    const p = getPrefs();
    if (!p.muted && active) playUi('splash', p.volume * 0.5, 1.2);
  });

  usePgEvent(store, 'err', (e) => {
    if (e.act !== 'feed' && e.act !== 'fish-edit') return;
    setError(ERR_TEXT[e.code]);
    window.setTimeout(() => setError(null), 3500);
  });

  /* posição atual de um peixe (com a ida até a comida) */
  const positionOf = useRef((f: FishView, now: number) => {
    let p = paths.current.get(f.id);
    if (!p) paths.current.set(f.id, (p = pathFor(f.seed)));
    const t = now / 1000;
    const base = swim(p, t, f.species === 'agua-viva');
    let x = base.x;
    let y = base.y;
    let dx = base.dx;
    for (const food of foods.current) {
      if (food.fish !== f.id) continue;
      const tau = (now - food.at) / 1000;
      if (tau < 0 || tau > EAT_AT + 1.8) continue;
      const go = tau <= EAT_AT ? smooth(0, 1.4, tau) : 1 - smooth(EAT_AT, EAT_AT + 1.8, tau);
      const target = foodPos(food, Math.min(tau, EAT_AT));
      dx = go > 0.2 && tau <= EAT_AT ? target.x - x : dx;
      x = x + (target.x - x) * go;
      y = y + (target.y - y) * go;
    }
    return { x, y, facing: (dx >= 0 ? 1 : -1) as 1 | -1 };
  }).current;

  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    let bg: HTMLCanvasElement | null = null;
    let ray: HTMLCanvasElement | null = null;
    let size = { w: 0, h: 0, dpr: 1 };
    const bubbles: Bubble[] = [];
    const calm = reducedMotion();
    const ro = new ResizeObserver(() => {
      const { w, h, dpr } = fitCanvas(cv);
      if (w < 40 || h < 40) return;
      size = { w, h, dpr };
      bg = renderBackground(w, h, dpr);
      // um raio de luz desenhado uma vez; cada quadro só o reposiciona
      ray = document.createElement('canvas');
      ray.width = 120;
      ray.height = Math.max(1, Math.round(h * 0.8));
      const rc = ray.getContext('2d')!;
      const rg = rc.createLinearGradient(0, 0, 0, ray.height);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      rc.fillStyle = rg;
      rc.beginPath();
      rc.moveTo(22, 0);
      rc.lineTo(58, 0);
      rc.lineTo(110, ray.height);
      rc.lineTo(20, ray.height);
      rc.closePath();
      rc.fill();
    });
    ro.observe(box);

    const loop = startLoop((dt) => {
      const { w, h, dpr } = size;
      if (!bg || w < 40) return;
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const now = store.serverNow();
      const t = now / 1000;
      ctx.drawImage(bg, 0, 0, w, h);

      // raios de luz que passeiam devagar (iluminação dinâmica)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; ray && i < 4; i++) {
        const cx = (0.15 + i * 0.25 + Math.sin(t * 0.08 + i * 1.7) * 0.06) * w;
        ctx.globalAlpha = 0.07 + 0.04 * Math.sin(t * 0.3 + i);
        ctx.drawImage(ray, cx - 40, 0, 120, h * 0.8);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // plantas balançando
      for (const pl of PLANTS) {
        const bx = pl.x * w;
        const by = h * 0.88;
        const top = by - pl.h * h;
        const sway = calm ? 0 : Math.sin(t * 0.9 + pl.x * 9) * 10;
        ctx.strokeStyle = `hsl(${pl.hue} 70% 45%)`;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + sway * 0.5, (by + top) / 2, bx + sway, top);
        ctx.stroke();
        ctx.strokeStyle = `hsl(${pl.hue} 80% 65%)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(bx - 1.5, by);
        ctx.quadraticCurveTo(bx + sway * 0.5 - 1.5, (by + top) / 2, bx + sway - 1.5, top + 2);
        ctx.stroke();
        // folhas alternadas ao longo do caule
        for (let i = 1; i <= 4; i++) {
          const f = i / 5;
          const lx = bx + sway * f * f;
          const ly = by - (by - top) * f;
          const side = i % 2 ? 1 : -1;
          ctx.fillStyle = `hsl(${pl.hue} 72% ${50 + i * 4}%)`;
          ctx.beginPath();
          ctx.ellipse(lx + side * 9, ly, 11, 4.5, side * -0.6 + sway * 0.01, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // comida caindo
      for (let i = foods.current.length - 1; i >= 0; i--) {
        const f = foods.current[i];
        const tau = (now - f.at) / 1000;
        const life = f.fish ? EAT_AT : 9;
        if (tau > life) {
          foods.current.splice(i, 1);
          continue;
        }
        if (tau < 0) continue;
        const p = foodPos(f, tau);
        const alpha = f.fish ? 1 : Math.min(1, (life - tau) / 2);
        ctx.fillStyle = `rgba(255,190,70,${alpha})`;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(p.x * w + (k - 1) * 5, p.y * h + Math.sin(tau * 4 + k) * 2, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // peixes
      const fish = fishRef.current;
      const scale = Math.min(1.9, Math.max(1.05, w / 260));
      for (const f of fish) {
        const pos = positionOf(f, now);
        const mine = f.id === meRef.current;
        ctx.globalAlpha = f.online ? 1 : 0.78;
        drawFish(ctx, f, pos.x * w, pos.y * h, f.size * scale, pos.facing, t);
        ctx.globalAlpha = 1;
        if (mine || namesRef.current || selRef.current === f.id) {
          const label = mine ? `${f.name} (seu)` : f.name;
          ctx.font = '800 12px Nunito Variable, Nunito, Segoe UI, sans-serif';
          const tw = ctx.measureText(label).width + 14;
          const lx = pos.x * w - tw / 2;
          const ly = pos.y * h - 26 * f.size * scale - 14;
          ctx.fillStyle = mine ? 'rgba(255,255,255,0.92)' : 'rgba(4,50,120,0.55)';
          ctx.beginPath();
          ctx.roundRect(lx, ly, tw, 18, 9);
          ctx.fill();
          ctx.fillStyle = mine ? '#052c63' : '#fff';
          ctx.fillText(label, lx + 7, ly + 13);
        }
      }

      // bolhas subindo
      if (!calm && bubbles.length < 26 && Math.random() < dt * 3) {
        const em = Math.random() < 0.5 ? 0.08 : 0.88;
        bubbles.push({ x: em * w + (Math.random() - 0.5) * 16, y: h * 0.86, r: 1.5 + Math.random() * 4, v: 26 + Math.random() * 30, ph: Math.random() * 6 });
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.2;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y -= b.v * dt;
        b.x += Math.sin(t * 3 + b.ph) * 0.3;
        if (b.y < 4) {
          bubbles.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }, box, 30); // peixes nadam devagar: 30 quadros bastam e custam metade

    return () => {
      loop.stop();
      ro.disconnect();
    };
  }, [store, positionOf]);

  if (!snap) return null;
  const fish = snap.fish;
  const mine = fish.find((f) => f.id === snap.you.fish) ?? null;
  const feeds = snap.stats.feeds;
  const nextSpecies = FISH_SPECIES.find((s) => s.unlock > feeds);
  const sel = fish.find((f) => f.id === selected) ?? null;

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const now = store.serverNow();
    // tocou num peixe? mostra quem é; senão, joga comida ali
    let hit: FishView | null = null;
    let best = Infinity;
    for (const f of fish) {
      const p = positionOf(f, now);
      const d = Math.hypot((p.x - nx) * rect.width, (p.y - ny) * rect.height);
      if (d < 26 * f.size && d < best) {
        best = d;
        hit = f;
      }
    }
    if (hit) {
      setSelected(hit.id === selected ? null : hit.id);
      return;
    }
    if (ny > 0.84) return;
    store.sendCooled({ k: 'feed', x: Math.round(nx * 1000) }, PG_COOLDOWN.feed);
  };

  const feedMine = () => {
    if (!mine) return;
    const p = positionOf(mine, store.serverNow());
    store.sendCooled({ k: 'feed', x: Math.round(p.x * 1000), fish: mine.id }, PG_COOLDOWN.feed);
  };

  return (
    <div className="pg-tool pg-aqua">
      <div ref={wrap} className="pg-aqua__tank">
        <canvas
          ref={canvas}
          className="pg-aqua__canvas"
          onPointerDown={onPointer}
          aria-label={`Aquário com ${fish.length} ${fish.length === 1 ? 'peixe' : 'peixes'}. Toque na água para jogar comida, num peixe para ver de quem é.`}
          role="img"
        />
        {sel && (
          <div className="pg-aqua__card glass glass--frost">
            <strong>{sel.name}</strong>
            <span>
              de {sel.owner === snap.you.pid ? 'você' : sel.ownerName} · {FISH_SPECIES.find((s) => s.id === sel.species)?.name}
            </span>
            <span>
              {sel.online ? 'na sala agora' : 'dono saiu, o peixe ficou'} · comeu {sel.fed}×
            </span>
            <PgChip glyph="apple" onClick={() => store.sendCooled({ k: 'feed', x: Math.round(positionOf(sel, store.serverNow()).x * 1000), fish: sel.id }, PG_COOLDOWN.feed)} disabled={feedLeft > 0}>
              Alimentar
            </PgChip>
          </div>
        )}
      </div>

      <div className="pg-row">
        <AeroButton size="sm" variant="green" icon="plus" onClick={feedMine} disabled={!mine || feedLeft > 0}>
          Alimentar meu peixe
        </AeroButton>
        <PgChip glyph="edit" pressed={editing} onClick={() => setEditing((v) => !v)}>
          Meu peixe
        </PgChip>
        <PgChip glyph="fish" pressed={names} onClick={() => setNames((v) => !v)}>
          Nomes
        </PgChip>
      </div>
      <p className="pg-hint">Toque na água para jogar comida para a sala. Todo mundo vê a comida cair e o peixe que chega primeiro.</p>
      {error && <PgNotice tone="warn">{error}</PgNotice>}

      {editing && mine && <FishEditor key={mine.id} fish={mine} feeds={feeds} />}

      <PgSection title="O aquário">
        <p className="pg-hint">
          {feeds.toLocaleString('pt-BR')} {feeds === 1 ? 'comida servida' : 'comidas servidas'} pela sala.{' '}
          {nextSpecies ? `Próxima espécie: ${nextSpecies.name}, com ${nextSpecies.unlock}.` : 'Todas as espécies liberadas!'}
        </p>
        <ul className="pg-aqua__list">
          {fish.map((f) => (
            <li key={f.id}>
              <button type="button" className="pg-aqua__fishbtn" aria-pressed={selected === f.id} onClick={() => setSelected(selected === f.id ? null : f.id)}>
                <FishSwatch fish={f} />
                <span>
                  <strong>{f.name}</strong>
                  <small>{f.owner === snap.you.pid ? 'você' : f.ownerName}</small>
                </span>
                <span className="pg-aqua__dot" data-on={f.online || undefined} aria-label={f.online ? 'na sala' : 'fora da sala'} />
              </button>
            </li>
          ))}
        </ul>
      </PgSection>
    </div>
  );
}

/** Miniatura estática de um peixe (para listas e o editor). */
function FishSwatch({ fish, size = 44 }: { fish: Pick<FishView, 'species' | 'pattern' | 'hue' | 'hue2'>; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawFish(ctx, fish, size * 0.55, size / 2, size / 50, 1, 0);
  }, [fish, size]);
  return <canvas ref={ref} className="pg-aqua__swatch" style={{ width: size, height: size }} aria-hidden />;
}

function FishEditor({ fish, feeds }: { fish: FishView; feeds: number }) {
  const { store } = usePgEnv();
  const [draft, setDraft] = useState({ name: fish.name, species: fish.species, pattern: fish.pattern, hue: fish.hue, hue2: fish.hue2 });
  const unlocked = useMemo(() => unlockedSpecies(feeds), [feeds]);
  const changed = draft.name !== fish.name || draft.species !== fish.species || draft.pattern !== fish.pattern || draft.hue !== fish.hue || draft.hue2 !== fish.hue2;

  const save = () => {
    const a: { k: 'fish-edit'; name?: string; species?: FishSpecies; pattern?: FishPattern; hue?: number; hue2?: number } = { k: 'fish-edit' };
    if (draft.name.trim() && draft.name.trim() !== fish.name) a.name = draft.name.trim();
    if (draft.species !== fish.species) a.species = draft.species;
    if (draft.pattern !== fish.pattern) a.pattern = draft.pattern;
    if (draft.hue !== fish.hue) a.hue = draft.hue;
    if (draft.hue2 !== fish.hue2) a.hue2 = draft.hue2;
    store.send(a);
  };

  return (
    <PgSection title="Seu peixe" className="pg-aqua__editor">
      <div className="pg-aqua__preview">
        <FishSwatch fish={draft} size={96} />
      </div>
      <label className="pg-label">
        Nome
        <input className="pg-input" value={draft.name} maxLength={20} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <div className="pg-label" role="group" aria-label="Espécie">
        Espécie
        <div className="pg-aqua__species">
          {FISH_SPECIES.map((s) => {
            const open = unlocked.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className="pg-aqua__sp"
                aria-pressed={draft.species === s.id}
                disabled={!open}
                onClick={() => setDraft({ ...draft, species: s.id })}
                title={open ? s.name : `Libera com ${s.unlock} comidas servidas na sala`}
              >
                <FishSwatch fish={{ ...draft, species: s.id }} size={40} />
                <small>{open ? s.name : `${s.unlock} comidas`}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="pg-label" role="group" aria-label="Padrão">
        Padrão
        <div className="pg-row">
          {FISH_PATTERNS.map((p) => (
            <PgChip key={p.id} pressed={draft.pattern === p.id} onClick={() => setDraft({ ...draft, pattern: p.id })}>
              {p.name}
            </PgChip>
          ))}
        </div>
      </div>
      <label className="pg-label">
        Cor do corpo
        <input className="pg-aqua__hue" type="range" min={0} max={359} value={draft.hue} onChange={(e) => setDraft({ ...draft, hue: Number(e.target.value) })} />
      </label>
      <label className="pg-label">
        Cor das nadadeiras e detalhes
        <input className="pg-aqua__hue" type="range" min={0} max={359} value={draft.hue2} onChange={(e) => setDraft({ ...draft, hue2: Number(e.target.value) })} />
      </label>
      <AeroButton size="sm" variant="blue" icon="check" onClick={save} disabled={!changed}>
        Salvar para a sala
      </AeroButton>
    </PgSection>
  );
}
