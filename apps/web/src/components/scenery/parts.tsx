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

export function Cloud({ className, style }: { className?: string; style?: Vars }) {
  return (
    <svg className={`cloud ${className ?? ''}`} style={style} viewBox="0 0 240 120" aria-hidden focusable="false">
      <g fill="url(#aero-cloud)">
        <circle cx="62" cy="76" r="34" />
        <circle cx="102" cy="54" r="44" />
        <circle cx="152" cy="60" r="38" />
        <circle cx="190" cy="80" r="27" />
        <circle cx="34" cy="92" r="20" />
        <rect x="30" y="78" width="180" height="34" rx="17" />
      </g>
      <path d="M70 52c8-18 34-26 52-14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
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

/** Cidade de vidro ao longe: a tecnologia que convive com o campo. */
export function GlassCity() {
  const towers = [
    [10, 120, 26], [40, 80, 20], [64, 150, 30], [98, 60, 22], [124, 110, 24], [152, 40, 18], [174, 96, 26],
  ];
  return (
    <svg className="glass-city" viewBox="0 0 210 260" preserveAspectRatio="xMinYMax meet" aria-hidden focusable="false">
      {towers.map(([x, top, w], i) => (
        <g key={i}>
          <path d={`M${x} 260V${top + 10}q0-10 ${w / 2}-14q${w / 2} 4 ${w / 2} 14V260Z`} fill="url(#aero-tower)" />
          <path d={`M${x + 4} 258V${top + 14}`} stroke="#fff" strokeOpacity="0.8" strokeWidth="1.6" />
          {i % 2 === 0 && <path d={`M${x + w / 2} ${top - 4}v-${14 + i * 2}`} stroke="#fff" strokeOpacity="0.7" strokeWidth="1.4" />}
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */

export function Hills({ variant = 'full' }: { variant?: 'full' | 'low' }) {
  return (
    <svg className={`hills hills--${variant}`} viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden focusable="false">
      <path d="M0 150C200 86 420 104 650 142s430 24 790-30V320H0Z" fill="url(#aero-hill-back)" />
      <path d="M0 150C200 86 420 104 650 142s430 24 790-30" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" />
      <g fill="#4fae32" opacity="0.85">
        <circle cx="1080" cy="132" r="13" />
        <circle cx="1098" cy="128" r="16" />
        <circle cx="1116" cy="134" r="11" />
        <circle cx="300" cy="104" r="10" />
        <circle cx="314" cy="100" r="13" />
      </g>
      <path d="M0 214c240-58 520-40 780-8s440 28 660-24V320H0Z" fill="url(#aero-hill-mid)" />
      <path d="M0 214c240-58 520-40 780-8s440 28 660-24" fill="none" stroke="#e9ffd0" strokeOpacity="0.5" strokeWidth="3" />
      <path d="M0 268c300-40 560-44 820-22s420 16 620-6V320H0Z" fill="url(#aero-hill-front)" />
      <path d="M0 268c300-40 560-44 820-22s420 16 620-6" fill="none" stroke="#f2ffd9" strokeOpacity="0.55" strokeWidth="2.5" />
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
