import type { CSSProperties } from 'react';

/*
 * Peças do cenário Frutiger Aero. Tudo é decorativo (aria-hidden) e anima só
 * transform/opacity. Os gradientes compartilhados vivem em <SceneDefs/>,
 * montado uma vez no layout.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function SceneDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <linearGradient id="aero-cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#ffffff" />
          <stop offset="0.82" stopColor="#e4f3ff" />
          <stop offset="1" stopColor="#c3e1fa" />
        </linearGradient>
        <linearGradient id="aero-hill-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b5ee7c" />
          <stop offset="1" stopColor="#5cbf3a" />
        </linearGradient>
        <linearGradient id="aero-hill-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fe056" />
          <stop offset="1" stopColor="#3aa628" />
        </linearGradient>
        <linearGradient id="aero-hill-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7ad548" />
          <stop offset="0.6" stopColor="#3f9f22" />
          <stop offset="1" stopColor="#2b8419" />
        </linearGradient>
        <linearGradient id="aero-tower" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.35" stopColor="#d9f3ff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#7cc8f4" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="aero-weed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9be85a" />
          <stop offset="1" stopColor="#1f8a3a" />
        </linearGradient>
        {/* nuvem com volume: cada "bolo" tem a própria luz no alto e sombra azulada embaixo */}
        <radialGradient id="aero-puff" cx="38%" cy="28%" r="74%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.48" stopColor="#fbfdff" />
          <stop offset="0.76" stopColor="#e1effb" />
          <stop offset="1" stopColor="#b7d5ef" />
        </radialGradient>
        <linearGradient id="aero-cloud-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9ebf9" />
          <stop offset="1" stopColor="#a6c8e8" />
        </linearGradient>
        <filter id="aero-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>
        <filter id="aero-blur-8" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id="aero-blur-3" x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        {/* morros: neblina ao longe, brilho na crista, faixas de grama cortada, folhinhas */}
        <linearGradient id="aero-hill-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9ecd0" />
          <stop offset="0.5" stopColor="#8fd8a6" />
          <stop offset="1" stopColor="#6cc07e" />
        </linearGradient>
        <linearGradient id="aero-hill-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.62" />
          <stop offset="0.16" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.34" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <pattern id="aero-mow" width="150" height="320" patternUnits="userSpaceOnUse" patternTransform="skewX(-38)">
          <rect width="75" height="320" fill="#ffffff" opacity="0.075" />
        </pattern>
        <pattern id="aero-blades" width="16" height="20" patternUnits="userSpaceOnUse">
          <path d="M2 20Q3 11 1 3" stroke="#e2ffbe" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M7 20Q8 13 10 6" stroke="#c4f390" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M12 20Q12 14 14 9" stroke="#d7fba8" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </pattern>
        <linearGradient id="aero-crest-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id="aero-crest-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="320">
          <rect x="0" y="222" width="1440" height="46" fill="url(#aero-crest-fade)" />
        </mask>
        <radialGradient id="aero-canopy" cx="38%" cy="30%" r="72%">
          <stop offset="0" stopColor="#d4ff9a" />
          <stop offset="0.5" stopColor="#6fcf3c" />
          <stop offset="1" stopColor="#2f8f22" />
        </radialGradient>
        {/* torres de vidro: face clara, face lateral mais funda */}
        <linearGradient id="aero-tower-face" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#d6f2ff" stopOpacity="0.82" />
          <stop offset="1" stopColor="#8fd2f7" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="aero-tower-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc6f2" stopOpacity="0.85" />
          <stop offset="1" stopColor="#3f9ee0" stopOpacity="0.7" />
        </linearGradient>
        <pattern id="aero-floors" width="10" height="9" patternUnits="userSpaceOnUse">
          <rect y="7" width="10" height="1.2" fill="#ffffff" opacity="0.55" />
        </pattern>
        <linearGradient id="aero-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#f2fbff" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="aero-fish-orange" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="0.5" stopColor="#ff9a2e" />
          <stop offset="1" stopColor="#e2530e" />
        </radialGradient>
        <radialGradient id="aero-fish-yellow" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff8b0" />
          <stop offset="0.55" stopColor="#ffd91e" />
          <stop offset="1" stopColor="#e9a100" />
        </radialGradient>
        <radialGradient id="aero-fish-blue" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#c9f6ff" />
          <stop offset="0.55" stopColor="#2fc2f2" />
          <stop offset="1" stopColor="#0a6fd0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Cúmulo com volume: base achatada azulada, "bolos" de trás maiores e os da
 * frente menores e mais baixos, cada um com luz no alto e sombra embaixo — é
 * a sobreposição que desenha os gomos. Uma sombra difusa por baixo.
 */
export function Cloud({ className, style }: { className?: string; style?: Vars }) {
  return (
    <svg className={`cloud ${className ?? ''}`} style={style} viewBox="0 0 300 160" aria-hidden focusable="false">
      <ellipse cx="152" cy="132" rx="124" ry="16" fill="#8fbde6" opacity="0.5" filter="url(#aero-blur-8)" />
      <g filter="url(#aero-soft)">
        <path d="M34 120c-14 0-16-18-2-22 12-4 24 2 32 4h182c18-5 34 3 30 15-2 8-12 10-22 10H46c-8 0-12-3-12-7Z" fill="url(#aero-cloud-base)" />
        <g fill="url(#aero-puff)">
          <circle cx="114" cy="70" r="46" />
          <circle cx="170" cy="58" r="54" />
          <circle cx="222" cy="80" r="40" />
          <circle cx="72" cy="92" r="34" />
          <circle cx="140" cy="98" r="36" />
          <circle cx="196" cy="102" r="32" />
          <circle cx="252" cy="104" r="24" />
          <circle cx="42" cy="108" r="20" />
          <circle cx="98" cy="110" r="24" />
        </g>
      </g>
      <path d="M134 28c20-16 52-16 70 2" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.85" filter="url(#aero-soft)" />
    </svg>
  );
}

const CLOUDS: Vars[] = [
  { '--x': '-4%', '--y': '14%', '--w': 'clamp(180px, 22vw, 340px)', '--dur': '160s', '--delay': '-40s', '--o': 0.95 },
  { '--x': '12%', '--y': '34%', '--w': 'clamp(120px, 13vw, 210px)', '--dur': '210s', '--delay': '-120s', '--o': 0.8 },
  { '--x': '38%', '--y': '8%', '--w': 'clamp(140px, 16vw, 250px)', '--dur': '190s', '--delay': '-10s', '--o': 0.85 },
  { '--x': '58%', '--y': '40%', '--w': 'clamp(110px, 11vw, 180px)', '--dur': '240s', '--delay': '-70s', '--o': 0.7 },
  { '--x': '76%', '--y': '22%', '--w': 'clamp(160px, 19vw, 300px)', '--dur': '175s', '--delay': '-150s', '--o': 0.9 },
];

export function Clouds({ count = CLOUDS.length }: { count?: number }) {
  return (
    <div className="clouds" aria-hidden>
      {CLOUDS.slice(0, count).map((style, i) => (
        <div key={i} className="clouds__drift" style={style}>
          <Cloud className={i % 2 ? 'cloud--flip' : undefined} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Faixas de luz que atravessam o céu, como nas telas do Vista e do Windows 7:
 * nascem baixas à esquerda (atrás dos morros) e sobem para a direita, passando
 * por trás da tela de vidro, longe do título. Cada uma é uma fita difusa com
 * um fio de luz nítido numa borda. Respiram devagar (só transform).
 */
export function AuroraRibbons() {
  return (
    <svg className="aurora" viewBox="0 0 1440 640" preserveAspectRatio="none" aria-hidden focusable="false">
      <defs>
        <linearGradient id="aurora-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.22" stopColor="#effcff" stopOpacity="0.7" />
          <stop offset="0.52" stopColor="#86ecff" stopOpacity="0.55" />
          <stop offset="0.78" stopColor="#c2ff96" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="aurora-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="#a9e6ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="aurora-thread" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.75" stopColor="#e6fdff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="aurora__band aurora__band--1">
        <path
          d="M-60 700C360 700 640 640 900 470S1240 230 1500 100L1500 180C1250 300 1100 480 910 530S340 730 -60 750Z"
          fill="url(#aurora-a)"
          filter="url(#aero-blur-8)"
        />
        <path d="M-60 700C360 700 640 640 900 470S1240 230 1500 100" fill="none" stroke="url(#aurora-thread)" strokeWidth="2.2" />
      </g>
      <g className="aurora__band aurora__band--2">
        <path
          d="M-60 730C380 720 660 670 950 520S1260 320 1500 190L1500 226C1270 350 1120 540 960 556S400 750 -60 762Z"
          fill="url(#aurora-b)"
          filter="url(#aero-blur-3)"
        />
        <path d="M-60 730C380 720 660 670 950 520S1260 320 1500 190" fill="none" stroke="url(#aurora-thread)" strokeWidth="1.4" opacity="0.8" />
      </g>
      <g className="aurora__band aurora__band--3">
        <path d="M-60 680C340 680 620 580 880 420S1220 190 1500 50" fill="none" stroke="url(#aurora-thread)" strokeWidth="1.2" opacity="0.65" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */

export function Sun() {
  return (
    <div className="sun" aria-hidden>
      <div className="sun__rays" />
      <div className="sun__core" />
      <span className="sun__flare sun__flare--1" />
      <span className="sun__flare sun__flare--2" />
      <span className="sun__flare sun__flare--3" />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Cidade de vidro ao longe: a tecnologia que convive com o campo. Torres com
 * face clara e lateral mais funda, andares marcados por linhas finas, um fio
 * de luz na quina e neblina na base (fica atrás dos morros).
 */
const TOWERS: { x: number; w: number; top: number; cap: 'dome' | 'slant' | 'spire' | 'flat'; side: number }[] = [
  { x: 6, w: 30, top: 150, cap: 'flat', side: 8 },
  { x: 40, w: 34, top: 92, cap: 'slant', side: 10 },
  { x: 80, w: 40, top: 40, cap: 'spire', side: 12 },
  { x: 126, w: 30, top: 118, cap: 'dome', side: 8 },
  { x: 160, w: 36, top: 74, cap: 'slant', side: 10 },
  { x: 202, w: 26, top: 136, cap: 'dome', side: 7 },
  { x: 232, w: 22, top: 168, cap: 'flat', side: 6 },
];

function capPath(t: (typeof TOWERS)[number]) {
  const { x, w, top } = t;
  switch (t.cap) {
    case 'dome':
      return `M${x} ${top}q${w / 2}-${w * 0.7} ${w} 0Z`;
    case 'slant':
      return `M${x} ${top}l${w} -${w * 0.55}V${top}Z`;
    case 'spire':
      return `M${x + w * 0.2} ${top}L${x + w / 2} ${top - 30}L${x + w * 0.8} ${top}Z`;
    default:
      return '';
  }
}

export function GlassCity() {
  return (
    <svg className="glass-city" viewBox="0 0 270 300" preserveAspectRatio="xMinYMax meet" aria-hidden focusable="false">
      {TOWERS.map((t, i) => (
        <g key={i}>
          <path d={`M${t.x + t.w} ${t.top}l${t.side} -${t.side * 0.5}V300h-${t.side}Z`} fill="url(#aero-tower-side)" />
          <rect x={t.x} y={t.top} width={t.w} height={300 - t.top} fill="url(#aero-tower-face)" />
          <rect x={t.x} y={t.top} width={t.w} height={300 - t.top} fill="url(#aero-floors)" />
          {t.cap !== 'flat' && <path d={capPath(t)} fill="url(#aero-tower-face)" />}
          <path d={`M${t.x + 3} 298V${t.top + 4}`} stroke="#fff" strokeOpacity="0.9" strokeWidth="1.6" />
          {t.cap === 'spire' && <path d={`M${t.x + t.w / 2} ${t.top - 30}v-22`} stroke="#fff" strokeOpacity="0.8" strokeWidth="1.4" />}
        </g>
      ))}
      <rect x="0" y="210" width="270" height="90" fill="url(#aero-haze)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

const BACK = 'M0 150C200 86 420 104 650 142s430 24 790-30V320H0Z';
const MID = 'M0 214c240-58 520-40 780-8s440 28 660-24V320H0Z';
const FRONT = 'M0 268c300-40 560-44 820-22s420 16 620-6V320H0Z';

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-2" y="-6" width="4" height="16" rx="2" fill="#6d4c2c" />
      <circle cx="0" cy="-18" r="14" fill="url(#aero-canopy)" />
      <circle cx="-10" cy="-10" r="10" fill="url(#aero-canopy)" />
      <circle cx="10" cy="-9" r="11" fill="url(#aero-canopy)" />
    </g>
  );
}

const SPARKLES: [number, number, number][] = [
  [180, 276, 0],
  [470, 250, 1.4],
  [760, 262, 2.6],
  [1010, 270, 0.7],
  [1290, 246, 1.9],
];

/**
 * Morros em camadas: um ao longe, azulado pela neblina; atrás, com duas
 * árvores redondas; no meio; e na frente, com faixas de grama cortada e
 * folhinhas na crista. Cada um tem brilho no alto, como plástico molhado.
 */
export function Hills({ variant = 'full' }: { variant?: 'full' | 'low' }) {
  return (
    <svg className={`hills hills--${variant}`} viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden focusable="false">
      <path d="M0 118C180 70 360 82 520 106s340-14 520-36 260-6 400 14V320H0Z" fill="url(#aero-hill-far)" opacity="0.9" />
      <path d={BACK} fill="url(#aero-hill-back)" />
      <path d={BACK} fill="url(#aero-hill-gloss)" />
      <Tree x={706} y={145} s={0.85} />
      <Tree x={1384} y={119} />
      <Tree x={1410} y={123} s={0.7} />
      <path d={MID} fill="url(#aero-hill-mid)" />
      <path d={MID} fill="url(#aero-hill-gloss)" />
      <path d={FRONT} fill="url(#aero-hill-front)" />
      <path d={FRONT} fill="url(#aero-mow)" />
      <path d={FRONT} fill="url(#aero-blades)" mask="url(#aero-crest-mask)" />
      <path d={FRONT} fill="url(#aero-hill-gloss)" />
      <g className="sparkles" fill="#ffffff">
        {SPARKLES.map(([x, y, d], i) => (
          <path
            key={i}
            className="sparkle"
            style={{ '--d': `${d}s` } as Vars}
            d={`M${x} ${y - 7}l1.4 5.6 5.6 1.4-5.6 1.4-1.4 5.6-1.4-5.6-5.6-1.4 5.6-1.4Z`}
          />
        ))}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */

type FishTint = 'orange' | 'yellow' | 'blue';

export function Fish({ tint = 'orange', className, style }: { tint?: FishTint; className?: string; style?: Vars }) {
  return (
    <svg className={`fish ${className ?? ''}`} style={style} viewBox="0 0 120 70" aria-hidden focusable="false">
      <path d="M92 35 118 14v42Z" fill={`url(#aero-fish-${tint})`} />
      <path d="M44 14c10-12 26-12 34-4-12 0-22 2-34 4Z" fill={`url(#aero-fish-${tint})`} opacity="0.9" />
      <ellipse cx="54" cy="35" rx="44" ry="24" fill={`url(#aero-fish-${tint})`} />
      {tint !== 'blue' && (
        <g fill="#fff" opacity="0.9">
          <path d="M40 13c6 8 6 36 0 44-5-2-8-4-10-6 4-10 4-22 0-32 2-2 5-4 10-6Z" />
          <path d="M70 14c5 8 5 34 0 42-3 0-5-1-7-2 3-11 3-27 0-38 2-1 4-2 7-2Z" opacity="0.8" />
        </g>
      )}
      <ellipse cx="44" cy="24" rx="30" ry="8" fill="#fff" opacity="0.45" />
      <circle cx="24" cy="31" r="5.5" fill="#fff" />
      <circle cx="23" cy="31" r="3" fill="#06306b" />
      <circle cx="22" cy="30" r="1" fill="#fff" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

interface BubbleSpec {
  x: number;
  size: number;
  dur: number;
  delay: number;
  sway: number;
}

function seeded(n: number, seed: number): BubbleSpec[] {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: n }, () => ({
    x: rnd() * 100,
    size: 6 + Math.round(rnd() * 26),
    dur: 9 + rnd() * 12,
    delay: -rnd() * 20,
    sway: 6 + rnd() * 18,
  }));
}

/** Bolhas subindo. Posições fixas por semente: o desenho é o mesmo a cada visita. */
export function Bubbles({ count = 14, seed = 7, className }: { count?: number; seed?: number; className?: string }) {
  const specs = seeded(count, seed);
  return (
    <div className={`bubbles ${className ?? ''}`} aria-hidden>
      {specs.map((b, i) => (
        <span
          key={i}
          className="bubbles__rise"
          style={{ '--x': `${b.x}%`, '--dur': `${b.dur}s`, '--delay': `${b.delay}s` } as Vars}
        >
          <span className="bubble" style={{ '--size': `${b.size}px`, '--sway': `${b.sway}px` } as Vars} />
        </span>
      ))}
    </div>
  );
}

/** Esfera de vidro grande, flutuando parada no ar. */
export function GlassOrb({ className, style }: { className?: string; style?: Vars }) {
  return <span className={`glass-orb ${className ?? ''}`} style={style} aria-hidden />;
}

/* ------------------------------------------------------------------ */

export function Seaweed({ className }: { className?: string }) {
  return (
    <svg className={`seaweed ${className ?? ''}`} viewBox="0 0 160 220" preserveAspectRatio="xMidYMax meet" aria-hidden focusable="false">
      <g fill="url(#aero-weed)">
        <path className="seaweed__frond" d="M40 220c-8-40 18-60 4-100s14-60 6-110c18 40-2 66 10 104s-6 64-4 106Z" />
        <path className="seaweed__frond seaweed__frond--b" d="M86 220c-10-34 12-54 2-86s10-50 4-86c16 30 0 54 8 82s-6 50-6 90Z" />
        <path className="seaweed__frond seaweed__frond--c" d="M122 220c-6-26 10-40 2-66s8-38 4-64c12 22 0 40 6 62s-4 40-4 68Z" />
      </g>
    </svg>
  );
}

/** Linha da água com reflexo, ondulando devagar. */
export function WaterSurface({ className }: { className?: string }) {
  const wave = 'M0 22C60 8 120 8 180 22s120 14 180 0 120-14 180 0 120 14 180 0 120-14 180 0 120 14 180 0 120-14 180 0 120 14 180 0';
  return (
    <div className={`water-surface ${className ?? ''}`} aria-hidden>
      <svg className="water-surface__wave" viewBox="0 0 1440 44" preserveAspectRatio="none" focusable="false">
        <path d={`${wave}V44H0Z`} fill="rgba(140, 236, 255, 0.85)" />
        <path d={wave} fill="none" stroke="#ffffff" strokeWidth="3" strokeOpacity="0.95" />
        <path d="M0 30C60 18 120 18 180 30s120 10 180 0 120-10 180 0 120 10 180 0 120-10 180 0 120 10 180 0 120-10 180 0 120 10 180 0" fill="none" stroke="#e8fdff" strokeWidth="1.5" strokeOpacity="0.6" />
      </svg>
    </div>
  );
}

export function LightRays({ count = 5 }: { count?: number }) {
  return (
    <div className="light-rays" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="light-rays__ray" style={{ '--i': i } as Vars} />
      ))}
    </div>
  );
}
