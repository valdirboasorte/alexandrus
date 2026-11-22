import { useId } from 'react';
import './logo.css';

/** O globo de vidro com o anel em órbita: o mundo que você compartilha. */
export function Globe({ size = 56, spin = true }: { size?: number; spin?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`globe${spin ? ' globe--spin' : ''}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${id}-sea`} cx="38%" cy="30%" r="78%">
          <stop offset="0" stopColor="#eafcff" />
          <stop offset="0.28" stopColor="#7fd8ff" />
          <stop offset="0.66" stopColor="#1578e0" />
          <stop offset="1" stopColor="#073f9a" />
        </radialGradient>
        <linearGradient id={`${id}-land`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9f36c" />
          <stop offset="1" stopColor="#2f9e25" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="0.45" stopColor="#ffffff" />
          <stop offset="1" stopColor="#8ff0ff" stopOpacity="0.6" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="60" cy="60" r="38" />
        </clipPath>
      </defs>
      {/* metade de trás do anel */}
      <path d="M8 74c6-14 46-34 84-40 18-3 24 1 20 8" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="3.4" strokeLinecap="round" opacity="0.55" />
      <circle cx="60" cy="60" r="38" fill={`url(#${id}-sea)`} />
      <g clipPath={`url(#${id}-clip)`}>
        <g className="globe__land">
          <path d="M30 44c8-10 22-9 25-2s-6 10 2 15 17 2 18 10-12 15-22 13-18-9-16-17 8-6 2-10-13-2-9-9Z" fill={`url(#${id}-land)`} opacity="0.9" />
          <path d="M74 30c7-3 15 1 16 7s-6 7-4 12 9 4 9 10-6 8-10 4-3-10-9-12-10-3-9-10 2-9 7-11Z" fill={`url(#${id}-land)`} opacity="0.85" />
          <path d="M150 44c8-10 22-9 25-2s-6 10 2 15 17 2 18 10-12 15-22 13-18-9-16-17 8-6 2-10-13-2-9-9Z" fill={`url(#${id}-land)`} opacity="0.9" transform="translate(-120 0)" />
        </g>
        <circle cx="60" cy="60" r="38" fill="none" stroke="#bff4ff" strokeOpacity="0.55" strokeWidth="3" />
      </g>
      <ellipse cx="52" cy="38" rx="25" ry="14" fill={`url(#${id}-shine)`} />
      <ellipse cx="72" cy="86" rx="16" ry="6" fill="#aef3ff" opacity="0.35" />
      {/* metade da frente do anel */}
      <path d="M112 42c-4 12-40 32-78 42-22 6-30 2-26-10" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="104" cy="53" r="3.2" fill="#fff" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`logo${compact ? ' logo--compact' : ''}`}>
      <Globe size={compact ? 40 : 58} />
      <span className="logo__word">Alexandrus</span>
    </span>
  );
}
