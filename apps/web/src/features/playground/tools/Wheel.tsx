import { useId } from 'react';

/*
 * Roda de sorteio em SVG. Regra de performance: nada dentro do SVG anima.
 * O disco fica no seu próprio <svg> dentro de uma <div> (.pg-wheel__disc) e
 * quem gira é essa div; o ponteiro é outro <svg>, fixo por cima.
 */

interface Hue {
  a: string;
  b: string;
  text: string;
  shadow: string;
}

const HUES: Hue[] = [
  { a: '#5fe3ff', b: '#0aa6dc', text: '#04284f', shadow: 'rgba(255,255,255,0.7)' },
  { a: '#c4f566', b: '#6bc12a', text: '#0b3512', shadow: 'rgba(255,255,255,0.7)' },
  { a: '#7fc4ff', b: '#2a79d6', text: '#ffffff', shadow: 'rgba(2,40,100,0.6)' },
  { a: '#ffe27a', b: '#f0a90f', text: '#4a2a00', shadow: 'rgba(255,255,255,0.7)' },
  { a: '#ff9fcb', b: '#e0408a', text: '#ffffff', shadow: 'rgba(120,10,60,0.55)' },
  { a: '#c3a2ff', b: '#7c47d9', text: '#ffffff', shadow: 'rgba(50,10,110,0.55)' },
  { a: '#6ff0d4', b: '#0fa88c', text: '#032e27', shadow: 'rgba(255,255,255,0.7)' },
  { a: '#ffb673', b: '#ee6f16', text: '#ffffff', shadow: 'rgba(110,40,0,0.55)' },
];

const C = 100;
const R = 92;

function pt(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

/** Corta por contagem de caracteres, com reticências. */
function clip(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : `${chars.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}

export function Wheel({ opts, rotation, size }: { opts: string[]; rotation: number; size: number }) {
  const uid = useId().replace(/:/g, '');
  const n = Math.max(2, opts.length);
  const step = 360 / n;
  const maxChars = n <= 6 ? 15 : n <= 10 ? 12 : 9;
  const fs = n <= 6 ? 11 : n <= 10 ? 9.5 : 8;

  const segs = Array.from({ length: n }, (_, i) => {
    const hue = HUES[i % HUES.length]!;
    // o último, se a contagem for ímpar e coincidir com a cor do primeiro, usa a vizinha
    const h = n % HUES.length === 1 && i === n - 1 ? HUES[(i + 3) % HUES.length]! : hue;
    const a0 = i * step - 90;
    const a1 = a0 + step;
    const [x0, y0] = pt(a0, R);
    const [x1, y1] = pt(a1, R);
    const d = `M${C} ${C}L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${step > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
    const mid = a0 + step / 2;
    const label = opts[i] === undefined ? '?' : clip(opts[i]!, maxChars);
    return { i, h, d, mid, label };
  });

  const studs = Array.from({ length: 24 }, (_, i) => pt(i * 15, 96));

  return (
    <div className="pg-wheel__frame" style={{ width: size, height: size }}>
      <div className="pg-wheel__disc" style={{ transform: `rotate(${rotation}deg)` }}>
        <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden focusable="false">
          <defs>
            {segs.map(({ i, h }) => (
              <radialGradient key={i} id={`${uid}s${i}`} cx="50%" cy="50%" r="50%" gradientUnits="userSpaceOnUse" fx="100" fy="100">
                <stop offset="0.2" stopColor={h.a} />
                <stop offset="1" stopColor={h.b} />
              </radialGradient>
            ))}
            <radialGradient id={`${uid}g`} cx="50%" cy="25%" r="75%">
              <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.08" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.5" stopColor="#8fd8ff" />
              <stop offset="1" stopColor="#2a79d6" />
            </linearGradient>
            <radialGradient id={`${uid}h`} cx="40%" cy="30%" r="80%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#a9e6ff" />
              <stop offset="1" stopColor="#1c86d6" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r="99" fill={`url(#${uid}r)`} />
          <circle cx={C} cy={C} r="94.5" fill="#0b4f9c" opacity="0.35" />
          {segs.map(({ i, h, d, mid, label }) => (
            <g key={i}>
              <path d={d} fill={`url(#${uid}s${i})`} stroke="rgba(255,255,255,0.85)" strokeWidth="0.8" />
              <text
                x={C + 84}
                y={C}
                transform={`rotate(${mid.toFixed(2)} ${C} ${C})`}
                textAnchor="end"
                dominantBaseline="central"
                fontFamily="Nunito Variable, Nunito, Segoe UI, system-ui, sans-serif"
                fontWeight="900"
                fontSize={fs}
                fill={h.text}
                stroke={h.shadow}
                strokeWidth="0.5"
                paintOrder="stroke"
              >
                {label}
              </text>
            </g>
          ))}
          <circle cx={C} cy={C} r={R} fill={`url(#${uid}g)`} />
          {studs.map(([x, y], i) => (
            <circle key={i} cx={x.toFixed(2)} cy={y.toFixed(2)} r="1.7" fill="#fff" stroke="#2a79d6" strokeWidth="0.5" />
          ))}
          <circle cx={C} cy={C} r="15" fill={`url(#${uid}h)`} stroke="#fff" strokeWidth="2" />
          <ellipse cx="95" cy="92" rx="8" ry="4.5" fill="#fff" opacity="0.8" />
        </svg>
      </div>
      <svg className="pg-wheel__pointer" viewBox="0 0 40 48" aria-hidden focusable="false">
        <defs>
          <linearGradient id={`${uid}p`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe9a0" />
            <stop offset="1" stopColor="#e8860c" />
          </linearGradient>
        </defs>
        <path d="M20 46 L5 14 A16 16 0 1 1 35 14 Z" fill={`url(#${uid}p)`} stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="20" cy="14" r="5" fill="#fff" opacity="0.9" />
      </svg>
    </div>
  );
}

export function spinAnimation(el: HTMLElement, fromDeg: number, toDeg: number, ms: number): Animation {
  return el.animate([{ transform: `rotate(${fromDeg}deg)` }, { transform: `rotate(${toDeg}deg)` }], {
    duration: ms,
    easing: 'cubic-bezier(0.12, 0.7, 0.12, 1)',
    fill: 'forwards',
  });
}

/** Ângulo final que deixa o segmento `pick` sob o ponteiro (topo), com pequeno desvio dentro dele. */
export function targetRotation(current: number, pick: number, n: number, turns = 5): number {
  const step = 360 / Math.max(1, n);
  const off = (Math.random() * 2 - 1) * 0.35 * step;
  const base = -((pick + 0.5) * step + off);
  const delta = (((base - current) % 360) + 360) % 360;
  return current + Math.max(0, turns) * 360 + delta;
}
