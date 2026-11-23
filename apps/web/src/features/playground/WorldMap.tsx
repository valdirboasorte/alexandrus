import type { CSSProperties } from 'react';
import { FISH_SPECIES } from '@protocol';
import { Glyph, Orb, type GlyphName } from './art.tsx';
import { PLACES, usePgEnv, type PlaceId } from './context.ts';
import { usePg, useServerClock } from './hooks.ts';
import { MascotFigure, MOOD_TEXT, usePetNow } from './Mascot.tsx';

/*
 * A casa do Playground: uma ilha flutuante entre céu e lagoa. Cada lugar é
 * uma esfera de vidro no seu canto do mundo (nuvens no céu, ateliê e praça
 * na grama, aquário e bolhas na água). A arte é estática; só as esferas e as
 * nuvens flutuam, como elementos inteiros.
 */

const SPOTS: Record<Exclude<PlaceId, 'world' | 'settings' | 'pet'>, { x: number; y: number }> = {
  toys: { x: 22, y: 12 },
  stats: { x: 84, y: 66 },
  paint: { x: 17, y: 46 },
  wheel: { x: 83, y: 44 },
  poll: { x: 33, y: 59 },
  stage: { x: 66, y: 58 },
  aqua: { x: 20, y: 82 },
  bubbles: { x: 50, y: 89 },
  sounds: { x: 80, y: 88 },
};

function WorldArt() {
  return (
    <svg className="pg-world__art" viewBox="0 0 400 540" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="pgwHill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fdcc0" />
          <stop offset="1" stopColor="#6cc0a4" />
        </linearGradient>
        <linearGradient id="pgwGrass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c8f76a" />
          <stop offset="0.35" stopColor="#7fd23e" />
          <stop offset="1" stopColor="#3b9c24" />
        </linearGradient>
        <linearGradient id="pgwSea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8ae8ff" />
          <stop offset="0.3" stopColor="#2fc0f0" />
          <stop offset="1" stopColor="#0866c0" />
        </linearGradient>
        <linearGradient id="pgwRock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9e8f2" />
          <stop offset="1" stopColor="#7d98ad" />
        </linearGradient>
        <radialGradient id="pgwTree" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#e2ff9c" />
          <stop offset="0.5" stopColor="#6cc935" />
          <stop offset="1" stopColor="#2c8a1e" />
        </radialGradient>
        <radialGradient id="pgwSun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* colinas ao longe, com névoa */}
      <path d="M-10 300c40-30 90-44 140-30s70 10 110-8 120-24 170 6v60H-10Z" fill="url(#pgwHill)" opacity="0.7" />
      {/* prado */}
      <path d="M-10 300c50-22 110-26 170-12 50 12 100 14 150-2 40-12 70-10 100 0v92H-10Z" fill="url(#pgwGrass)" />
      <path d="M-10 302c50-20 110-24 170-10 50 12 100 14 150-2 40-12 70-10 100 0" fill="none" stroke="#efffc0" strokeWidth="3" opacity="0.9" />
      {/* faixas de grama cortada */}
      <path d="M40 330c60-8 120-6 170 2M180 352c60-8 120-8 190 0" stroke="#a6e64c" strokeWidth="6" opacity="0.4" strokeLinecap="round" />
      {/* árvores brilhantes */}
      <rect x="352" y="250" width="6" height="36" rx="3" fill="#7a5a2c" />
      <circle cx="355" cy="246" r="22" fill="url(#pgwTree)" stroke="#fff" strokeOpacity="0.6" />
      <ellipse cx="348" cy="236" rx="9" ry="5" fill="#fff" opacity="0.55" />
      <rect x="40" y="262" width="5" height="30" rx="2.5" fill="#7a5a2c" />
      <circle cx="42" cy="258" r="17" fill="url(#pgwTree)" stroke="#fff" strokeOpacity="0.6" />
      <ellipse cx="37" cy="250" rx="7" ry="4" fill="#fff" opacity="0.55" />
      {/* lagoa */}
      <path d="M-10 372c60 8 130 10 210 4s150-8 210-2V560H-10Z" fill="url(#pgwSea)" />
      <path d="M-10 372c60 8 130 10 210 4s150-8 210-2" fill="none" stroke="#e8fcff" strokeWidth="3" />
      <ellipse cx="300" cy="400" rx="70" ry="6" fill="url(#pgwSun)" />
      <path d="M60 420h40M240 450h56M120 490h34M300 500h40" stroke="#e8fcff" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      {/* pedra do farol */}
      <path d="M312 372c6-14 22-20 40-18s26 10 30 20Z" fill="url(#pgwRock)" />
      {/* algas */}
      <path d="M10 540c6-30-8-50 4-80M24 540c-4-26 10-40 0-66M384 540c-6-30 8-46-4-74" stroke="#2ec27e" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.75" />
      {/* bolhas da lagoa */}
      <circle cx="140" cy="470" r="5" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.8" />
      <circle cx="150" cy="452" r="3" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.7" />
      <circle cx="270" cy="520" r="4" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

function Cloud({ className, style }: { className: string; style: CSSProperties }) {
  return (
    <svg className={className} style={style} width="120" height="56" viewBox="0 0 120 56" aria-hidden>
      <path d="M22 50a18 18 0 0 1-2-35.8A26 26 0 0 1 70 10a20 20 0 0 1 28 6 17 17 0 0 1 2 34H22Z" fill="#fff" opacity="0.92" />
      <path d="M22 50h78" stroke="#cdeaff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface NewsItem {
  key: string;
  glyph: GlyphName;
  title: string;
  text: string;
  place: PlaceId;
}

export function WorldMap() {
  const { store, isHost, go } = usePgEnv();
  const snap = usePg(store, (s) => s.snap);
  const now = useServerClock(store, 5000);
  if (!snap) return null;
  const pet = usePetNowSafe(snap.pet, now);

  const pending = isHost ? snap.asks.filter((a) => a.status === 'pending').length : 0;
  const badges: Partial<Record<PlaceId, number>> = {
    poll: snap.poll?.open ? 1 : 0,
    stage: pending,
  };

  const news: NewsItem[] = [];
  if (snap.poll?.open) news.push({ key: 'poll', glyph: 'poll', title: 'Votação aberta', text: snap.poll.q, place: 'poll' });
  if (pending) news.push({ key: 'asks', glyph: 'stage', title: pending === 1 ? '1 pedido esperando você' : `${pending} pedidos esperando você`, text: 'Desafios e sugestões de quem assiste', place: 'stage' });
  const accepted = [...snap.asks].reverse().find((a) => a.status === 'accepted');
  if (accepted) news.push({ key: 'acc', glyph: 'flag', title: accepted.kind === 'challenge' ? 'Desafio aceito' : 'Sugestão aceita', text: `${accepted.text} — ${accepted.byName}`, place: 'stage' });
  if (snap.spin) news.push({ key: 'spin', glyph: 'wheel', title: `${snap.spin.by} girou a roda`, text: `${snap.spin.title}: ${snap.spin.opts[snap.spin.pick]}`, place: 'wheel' });
  const myFish = snap.fish.find((f) => f.id === snap.you.fish);
  if (myFish) {
    const sp = FISH_SPECIES.find((s) => s.id === myFish.species)?.name ?? '';
    news.push({ key: 'fish', glyph: 'fish', title: `Seu peixe: ${myFish.name}`, text: `${sp} · comeu ${myFish.fed} ${myFish.fed === 1 ? 'vez' : 'vezes'}`, place: 'aqua' });
  }
  if (snap.board[0]) news.push({ key: 'board', glyph: 'crown', title: `Recorde das bolhas: ${snap.board[0].best.toLocaleString('pt-BR')}`, text: snap.board[0].name, place: 'bubbles' });

  return (
    <div className="pg-world">
      <div className="pg-world__scene">
        <WorldArt />
        <Cloud className="pg-world__cloud" style={{ left: '48%', top: '6%' }} />
        <Cloud className="pg-world__cloud pg-world__cloud--b" style={{ left: '-6%', top: '26%', transform: 'scale(0.7)' }} />
        {PLACES.filter((p) => p.id !== 'pet').map((p) => {
          const spot = SPOTS[p.id as keyof typeof SPOTS];
          const badge = badges[p.id];
          return (
            <button
              key={p.id}
              type="button"
              className="pg-place"
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              onClick={() => go(p.id)}
              aria-label={`${p.name}: ${p.tag}`}
            >
              <span className="pg-place__bob">
                <Orb tone={p.tone} glyph={p.glyph} size={58} />
              </span>
              <span className="pg-place__label">{p.name}</span>
              {badge ? <span className="pg-badge">{badge}</span> : null}
            </button>
          );
        })}
        <button type="button" className="pg-place pg-world__petbtn" style={{ left: '50%', top: '43%' }} onClick={() => go('pet')} aria-label={`Ninho do mascote: ${snap.pet.name ?? 'sem nome'}, ${MOOD_TEXT[pet.mood]}`}>
          <MascotFigure stage={pet.stage} mood={pet.mood} acc={snap.pet.acc} size={84} hungry={pet.hungry} />
          <span className="pg-place__label">{snap.pet.name ?? 'Ninho'}</span>
        </button>
      </div>

      <div className="pg-world__board">
        {news.length === 0 ? (
          <p className="pg-hint">Escolha um lugar no mapa. Tudo o que é da sala aparece para todo mundo aqui na hora.</p>
        ) : (
          news.map((n) => (
            <button key={n.key} type="button" className="pg-world__news" onClick={() => go(n.place)}>
              <Orb tone={PLACES.find((p) => p.id === n.place)?.tone ?? 'sky'} glyph={n.glyph} size={36} />
              <span>
                <strong>{n.title}</strong>
                <small>{n.text}</small>
              </span>
              <Glyph name="back" size={18} className="pg-world__chev" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Igual a usePetNow, mas tolerante (o retrato sempre tem pet). */
function usePetNowSafe(pet: Parameters<typeof usePetNow>[0], now: number) {
  return usePetNow(pet, now);
}
