import { useId, type ReactNode } from 'react';
import type { ReactionKind } from '@protocol';

/*
 * Arte do Playground, desenhada para o Alexandrus: orbes de vidro (esfera,
 * reflexo curvo em cima, luz de retorno embaixo) com glifos de traço branco,
 * e as reações como objetos brilhantes. Nada de emoji: cada forma é SVG próprio.
 */

export type OrbTone = 'aqua' | 'sky' | 'green' | 'lime' | 'gold' | 'pink' | 'violet' | 'orange' | 'coral' | 'teal';

const TONES: Record<OrbTone, [string, string, string]> = {
  // claro (topo), meio, fundo
  aqua: ['#b9f6ff', '#1fc3ee', '#0573c4'],
  sky: ['#cfeaff', '#3d9ff5', '#0b4fc0'],
  green: ['#dcffb0', '#53c43a', '#16781b'],
  lime: ['#f3ffc0', '#a6e64c', '#4f9a14'],
  gold: ['#fff4b8', '#ffc22e', '#cf7a05'],
  pink: ['#ffd6ec', '#ff6fae', '#c4166a'],
  violet: ['#e8dbff', '#9a72ff', '#4b26b8'],
  orange: ['#ffe2bf', '#ff9a3c', '#c8500c'],
  coral: ['#ffd5cf', '#ff6a55', '#b8261a'],
  teal: ['#c6fff1', '#22d1b0', '#077c74'],
};

/** Glifos de traço (24×24), cor herdada. */
const GLYPHS = {
  fish: 'M3.5 12c2.6-4 6-5.5 9.5-5.5 3.4 0 6 2.2 7.5 5.5-1.5 3.3-4.1 5.5-7.5 5.5-3.5 0-6.9-1.5-9.5-5.5ZM3.5 12 1.8 8.6M3.5 12l-1.7 3.4M16.6 10.6h.01',
  bubbles: 'M9.5 15.5a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM17 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18.5 8.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM7.6 8.2a2.4 2.4 0 0 1 2-1',
  brush: 'M14.5 4.5 19.5 9.5 11 18l-5-5 8.5-8.5ZM6 13l-1.6 1.6c-1.1 1.1-1 3.3-2.4 4.9 2.5.4 4.6-.2 5.7-1.3L11 18',
  wheel: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 12V3M12 12l7.8 4.5M12 12l-7.8 4.5M12 14.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
  shell: 'M12 20.5c-4.5 0-8-2.4-8-6.5C4 9 7.6 3.5 12 3.5S20 9 20 14c0 4.1-3.5 6.5-8 6.5ZM12 3.5v17M8 5.6 9.6 20M16 5.6 14.4 20M4.7 10.6 8.7 20M19.3 10.6 15.3 20',
  cloud: 'M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.6a5 5 0 0 1-.9 9.9H7Z',
  poll: 'M5 20V11M10 20V5M15 20v-7M20 20V9M3 20.5h18',
  stage: 'M4 14.5h3l7.5 4.5V5L7 9.5H4v5ZM18 9a4 4 0 0 1 0 6M7 14.5 8.6 20',
  lighthouse: 'M9 21h6M10 21l1-12h2l1 12M8.5 9h7M10.5 9V6.5L12 5l1.5 1.5V9M4 6l4 1.5M20 6l-4 1.5M4 11l4-.8M20 11l-4-.8',
  drop: 'M12 3.5s6.5 7 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 10.5 12 3.5 12 3.5ZM9.6 14.4h.01M14.4 14.4h.01M10 17.2c1.2.9 2.8.9 4 0',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 13.5l1.8 1-1.8 3.2-2-.7-1.7 1-.3 2.1h-3.6l-.3-2.1-1.7-1-2 .7-1.8-3.2 1.8-1v-2l-1.8-1L6.3 5.3l2 .7 1.7-1 .3-2.1h3.6l.3 2.1 1.7 1 2-.7 1.8 3.2-1.8 1v2Z',
  sparkle: 'M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2L12 3.5Z',
  home: 'M4 11 12 4l8 7M6.5 9v10.5h11V9',
  back: 'M15 5.5 8.5 12l6.5 6.5',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14c1.9 2.2 5.1 2.2 7 0M9 9.5h.01M15 9.5h.01',
  undo: 'M9 7.5 4.5 12 9 16.5M5 12h9.5a5 5 0 0 1 0 10H12',
  eraser: 'M8.5 19.5h11M4.8 14.7l8.9-8.9a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8l-8 8H8.5l-3.7-3.7a.6.6 0 0 1 0-.9ZM9.5 9.9l5.6 5.6',
  trash: 'M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7M9 7V4.5h6V7',
  play: 'M8 5.5v13l10.5-6.5L8 5.5Z',
  crown: 'M4 17.5h16M5 17.5 3.5 8l5 3.5L12 5l3.5 6.5 5-3.5-1.5 9.5',
  edit: 'M4.5 19.5 5 16 15.5 5.5a2 2 0 0 1 2.8 2.8L7.9 18.9l-3.4.6ZM13.6 7.4l3 3',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  x: 'M7 7l10 10M17 7 7 17',
  plus: 'M12 5v14M5 12h14',
  volume: 'M4 9.5v5h3.5L12 19V5L7.5 9.5H4ZM15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.4a8 8 0 0 1 0 11.2',
  volumeOff: 'M4 9.5v5h3.5L12 19V5L7.5 9.5H4ZM16 9.5l5 5M21 9.5l-5 5',
  leaf: 'M5 19c0-8 5-13.5 14-14.5-.5 9-6 14.5-14 14.5ZM5 19 13 11',
  moon: 'M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10Z',
  hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.6 0-4.2-1.4-5.4-3.6L4 13.6a1.5 1.5 0 0 1 2.6-1.5L8 14',
  apple: 'M12 7.5c-2.5-1.6-7-1-7 4.5 0 4 2.6 8 5 8 1 0 1.4-.6 2-.6s1 .6 2 .6c2.4 0 5-4 5-8 0-5.5-4.5-6.1-7-4.5ZM12 7.5c0-2 1-3.5 3-4',
  bolt: 'M13 3 5.5 13.5H12L11 21l7.5-10.5H12L13 3Z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.5 2',
  mic: 'M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3ZM6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5',
  flag: 'M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11',
} as const;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, size = 24, stroke = 2, className }: { name: GlyphName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={GLYPHS[name]} />
    </svg>
  );
}

/** Esfera de vidro com glifo: o "ícone" de cada lugar do mundo. */
export function Orb({ tone, glyph, size = 56, children }: { tone: OrbTone; glyph?: GlyphName; size?: number; children?: ReactNode }) {
  const id = useId().replace(/:/g, '');
  const [hi, mid, lo] = TONES[tone];
  return (
    <span className="pg-orb" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 64 64">
        <defs>
          <radialGradient id={`b${id}`} cx="50%" cy="38%" r="62%">
            <stop offset="0" stopColor={hi} />
            <stop offset="0.55" stopColor={mid} />
            <stop offset="1" stopColor={lo} />
          </radialGradient>
          <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.06" />
          </linearGradient>
          <radialGradient id={`g${id}`} cx="50%" cy="100%" r="55%">
            <stop offset="0" stopColor={hi} stopOpacity="0.85" />
            <stop offset="1" stopColor={hi} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="33" r="29" fill={`url(#b${id})`} />
        <circle cx="32" cy="33" r="29" fill={`url(#g${id})`} />
        <circle cx="32" cy="33" r="28.4" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.2" />
        <path d="M11 26c2-10 10.5-16.5 21-16.5S51 16 53 26c-5.5-3.6-12.8-5.2-21-5.2S16.5 22.4 11 26Z" fill={`url(#h${id})`} />
      </svg>
      {glyph && (
        <span className="pg-orb__glyph" style={{ width: size * 0.5, height: size * 0.5 }}>
          <Glyph name={glyph} size={size * 0.5} stroke={2.2} />
        </span>
      )}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Reações                                                              */
/* ------------------------------------------------------------------ */

export const REACTION_LABEL: Record<ReactionKind, string> = {
  heart: 'Coração',
  star: 'Estrela',
  bubble: 'Bolha',
  rocket: 'Foguete',
  fish: 'Peixe',
  cloud: 'Nuvem',
  laugh: 'Risada',
  fire: 'Fogo',
  thumbs: 'Joinha',
};

/** Cada reação: forma cheia com degradê, contorno claro e reflexo. 64×64. */
export function ReactionArt({ kind, size = 44 }: { kind: ReactionKind; size?: number }) {
  const id = useId().replace(/:/g, '');
  const grad = (a: string, b: string, c?: string) => (
    <linearGradient id={`r${id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={a} />
      {c && <stop offset="0.55" stopColor={b} />}
      <stop offset="1" stopColor={c ?? b} />
    </linearGradient>
  );
  const shine = <ellipse cx="24" cy="18" rx="12" ry="6" fill="#fff" opacity="0.6" transform="rotate(-18 24 18)" />;
  let body: ReactNode;
  let defs: ReactNode;
  switch (kind) {
    case 'heart':
      defs = grad('#ffb3cf', '#ff3f7f', '#c4104a');
      body = (
        <>
          <path d="M32 55C14 43 6 33 6 22.5 6 14 12.5 8 20 8c5 0 9 2.6 12 7 3-4.4 7-7 12-7 7.5 0 14 6 14 14.5C58 33 50 43 32 55Z" fill={`url(#r${id})`} stroke="#fff" strokeOpacity="0.8" strokeWidth="2" />
          {shine}
        </>
      );
      break;
    case 'star':
      defs = grad('#fff6b0', '#ffc81f', '#e07b00');
      body = (
        <>
          <path d="m32 5 8.2 16.6 18.3 2.7-13.2 12.9 3.1 18.2L32 46.8l-16.4 8.6 3.1-18.2L5.5 24.3l18.3-2.7L32 5Z" fill={`url(#r${id})`} stroke="#fff" strokeOpacity="0.85" strokeWidth="2" strokeLinejoin="round" />
          {shine}
        </>
      );
      break;
    case 'bubble':
      defs = (
        <radialGradient id={`r${id}`} cx="40%" cy="35%" r="65%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="0.7" stopColor="#7ee9ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#18a9e8" stopOpacity="0.85" />
        </radialGradient>
      );
      body = (
        <>
          <circle cx="32" cy="32" r="25" fill={`url(#r${id})`} stroke="#e8fbff" strokeWidth="2.5" />
          <path d="M14 30c1-9 8-16 17-16" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.85" />
          <circle cx="44" cy="44" r="3" fill="#fff" opacity="0.7" />
        </>
      );
      break;
    case 'rocket':
      defs = grad('#ffffff', '#cfe9ff', '#7fb8ea');
      body = (
        <>
          <path d="M22 44c-6 2-9 8-9 13 5 0 11-3 13-9" fill="#ffb02e" stroke="#fff" strokeWidth="1.5" />
          <path d="M44 9c7 0 11 4 11 11 0 11-10 21-19 26l-9-9C32 28 33 9 44 9Z" fill={`url(#r${id})`} stroke="#fff" strokeWidth="2" />
          <path d="m27 37-8-1 7-10 7-1M36 46l1 8 10-7 1-7" fill="#ff5a3c" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="43" cy="21" r="5" fill="#2ea5f5" stroke="#fff" strokeWidth="2" />
          <ellipse cx="44" cy="15" rx="5" ry="2.4" fill="#fff" opacity="0.7" transform="rotate(-30 44 15)" />
        </>
      );
      break;
    case 'fish':
      defs = grad('#ffd9a0', '#ff8a2a', '#d44f00');
      body = (
        <>
          <path d="M6 32c6-10 15-15 26-15 10 0 18 6 24 15-6 9-14 15-24 15-11 0-20-5-26-15Z" fill={`url(#r${id})`} stroke="#fff" strokeWidth="2" />
          <path d="M6 32 1 21v22l5-11Z" fill="#ff7a1a" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          <path d="M27 20c3 4 3 20 0 24M35 19c3 5 3 21 0 26" stroke="#fff" strokeWidth="3" opacity="0.8" fill="none" />
          <circle cx="46" cy="29" r="3.2" fill="#063a7a" />
          <circle cx="47" cy="28" r="1" fill="#fff" />
          <ellipse cx="28" cy="22" rx="10" ry="3" fill="#fff" opacity="0.5" />
        </>
      );
      break;
    case 'cloud':
      defs = grad('#ffffff', '#e5f6ff', '#9fd4f5');
      body = (
        <>
          <path d="M16 49a11 11 0 0 1-1.5-21.9A15 15 0 0 1 43.5 22 12 12 0 0 1 47 49H16Z" fill={`url(#r${id})`} stroke="#fff" strokeWidth="2" />
          <ellipse cx="27" cy="26" rx="9" ry="4" fill="#fff" opacity="0.9" />
        </>
      );
      break;
    case 'laugh':
      defs = grad('#fff7b0', '#ffd230', '#f09a00');
      body = (
        <>
          <circle cx="32" cy="32" r="26" fill={`url(#r${id})`} stroke="#fff" strokeWidth="2" />
          <path d="M18 26c2-3 6-3 8 0M38 26c2-3 6-3 8 0" stroke="#8a4a00" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M17 34h30c0 9-7 15-15 15s-15-6-15-15Z" fill="#8a2f00" />
          <path d="M22 41c3 3 6 4 10 4s7-1 10-4" fill="#ff7aa0" />
          <path d="M11 30c-3 2-4 6-2 9M53 30c3 2 4 6 2 9" stroke="#3fc8ff" strokeWidth="3" strokeLinecap="round" fill="none" />
          {shine}
        </>
      );
      break;
    case 'fire':
      defs = grad('#fff2a0', '#ff9a1f', '#e3360b');
      body = (
        <>
          <path d="M32 58c-12 0-20-8-20-19 0-9 6-14 9-21 2 5 5 7 7 8 0-8 4-15 11-21-1 9 4 14 8 19 4 5 5 9 5 14 0 12-8 20-20 20Z" fill={`url(#r${id})`} stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          <path d="M32 54c-6 0-10-4-10-9 0-5 4-8 6-12 1 4 4 5 6 6 1-3 2-6 5-8 0 4 3 7 3 13 0 6-4 10-10 10Z" fill="#fff4b0" />
        </>
      );
      break;
    case 'thumbs':
      defs = grad('#d8ffb0', '#58c93a', '#1d7f1a');
      body = (
        <>
          <path d="M8 28h9v26H8a2 2 0 0 1-2-2V30a2 2 0 0 1 2-2Z" fill="#2c9a24" stroke="#fff" strokeWidth="2" />
          <path d="M20 54V29l9-17c1-2 3-3 5-2 3 1 4 4 3 7l-3 10h15c3 0 6 3 5 6l-4 17c-1 3-3 4-6 4H20Z" fill={`url(#r${id})`} stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="38" cy="32" rx="9" ry="3" fill="#fff" opacity="0.55" />
        </>
      );
      break;
  }
  return (
    <svg className="pg-reaction-art" width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <defs>{defs}</defs>
      {body}
    </svg>
  );
}
