import { useId } from 'react';
import type { SourceChoice } from '../../lib/capture.ts';

/**
 * Ícones ilustrados das fontes, no espírito dos ícones de 2008:
 * volume, brilho, reflexo e uma pitada de céu dentro de cada tela.
 */
export function SourceGlyph({ kind }: { kind: SourceChoice }) {
  const id = useId().replace(/:/g, '');
  const g = (n: string) => `${id}-${n}`;
  return (
    <svg className="source-glyph" viewBox="0 0 72 72" aria-hidden focusable="false">
      <defs>
        <linearGradient id={g('screen')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fb2ff" />
          <stop offset="0.6" stopColor="#8fdcff" />
          <stop offset="0.61" stopColor="#7fd65a" />
          <stop offset="1" stopColor="#3aa22a" />
        </linearGradient>
        <linearGradient id={g('body')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4fbff" />
          <stop offset="1" stopColor="#b9d4ea" />
        </linearGradient>
        <linearGradient id={g('dark')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a6f96" />
          <stop offset="1" stopColor="#16365e" />
        </linearGradient>
        <linearGradient id={g('shine')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={g('pad')} cx="45%" cy="30%" r="75%">
          <stop offset="0" stopColor="#e9fbff" />
          <stop offset="0.5" stopColor="#4cc0f5" />
          <stop offset="1" stopColor="#0a5fc8" />
        </radialGradient>
        <linearGradient id={g('bar')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fd0ff" />
          <stop offset="1" stopColor="#1677dc" />
        </linearGradient>
      </defs>

      {kind === 'monitor' && (
        <>
          <path d="M28 54h16l3 8H25Z" fill={`url(#${g('body')})`} />
          <ellipse cx="36" cy="63" rx="16" ry="3" fill="#9bbbd6" />
          <rect x="6" y="10" width="60" height="44" rx="6" fill={`url(#${g('dark')})`} />
          <rect x="10" y="14" width="52" height="36" rx="3" fill={`url(#${g('screen')})`} />
          <circle cx="50" cy="22" r="4" fill="#fffbe0" opacity="0.9" />
          <path d="M10 14h52v14C44 22 26 30 10 24Z" fill={`url(#${g('shine')})`} opacity="0.7" />
        </>
      )}

      {kind === 'window' && (
        <>
          <rect x="14" y="8" width="50" height="40" rx="5" fill={`url(#${g('body')})`} opacity="0.75" />
          <rect x="6" y="18" width="54" height="44" rx="6" fill={`url(#${g('body')})`} />
          <path d="M6 24a6 6 0 0 1 6-6h42a6 6 0 0 1 6 6v4H6Z" fill={`url(#${g('bar')})`} />
          <circle cx="50" cy="23" r="2.4" fill="#ff6b55" />
          <circle cx="43" cy="23" r="2.4" fill="#ffd24a" />
          <rect x="11" y="32" width="44" height="25" rx="2.5" fill={`url(#${g('screen')})`} />
          <path d="M6 24a6 6 0 0 1 6-6h42a6 6 0 0 1 6 6v2H6Z" fill={`url(#${g('shine')})`} opacity="0.8" />
        </>
      )}

      {kind === 'browser' && (
        <>
          <path d="M8 22v-6a5 5 0 0 1 5-5h16l4 6h26a5 5 0 0 1 5 5v0Z" fill={`url(#${g('bar')})`} />
          <path d="M30 11h12l4 6H34Z" fill="#a9dcff" />
          <rect x="8" y="20" width="56" height="42" rx="6" fill={`url(#${g('body')})`} />
          <rect x="13" y="25" width="46" height="7" rx="3.5" fill="#fff" stroke="#9cc3e4" />
          <circle cx="17.5" cy="28.5" r="1.8" fill="#3aa22a" />
          <rect x="13" y="36" width="46" height="21" rx="2.5" fill={`url(#${g('screen')})`} />
          <path d="M8 26a6 6 0 0 1 6-6h44a6 6 0 0 1 6 6v3H8Z" fill={`url(#${g('shine')})`} opacity="0.6" />
        </>
      )}

      {kind === 'app' && (
        <>
          <path d="M22 22h28a14 14 0 0 1 13.6 17.3l-2.6 11a7 7 0 0 1-12 3L44 48H28l-5 5.3a7 7 0 0 1-12-3l-2.6-11A14 14 0 0 1 22 22Z" fill={`url(#${g('pad')})`} />
          <path d="M22 22h28a14 14 0 0 1 12.8 8.5C52 27 20 27 9.2 30.5A14 14 0 0 1 22 22Z" fill={`url(#${g('shine')})`} />
          <path d="M22 31v10M17 36h10" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
          <circle cx="46" cy="33" r="3.2" fill="#ffd24a" />
          <circle cx="52" cy="39" r="3.2" fill="#7fe04a" />
          <path d="M40 10c3 3 3 6 0 9M45 7c5 5 5 10 0 15" stroke="#3aa6f5" strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      )}
    </svg>
  );
}
