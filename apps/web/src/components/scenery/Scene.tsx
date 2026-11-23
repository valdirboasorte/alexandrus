import type { CSSProperties } from 'react';
import { AuroraRibbons, Bubbles, Clouds, Fish, GlassCity, GlassOrb, Hills, LightRays, Seaweed, Sun } from './parts.tsx';
import './scenery.css';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Fundo das páginas de app (criar, entrar, salas, sobre): céu aberto e campo.
 * Fixo atrás do conteúdo.
 */
export function MeadowScene() {
  return (
    <div className="scene scene--fixed scene--meadow" aria-hidden>
      <div className="scene__sky" />
      <AuroraRibbons />
      <Sun />
      <Clouds count={4} />
      <GlassOrb style={{ '--size': 'clamp(90px, 10vw, 150px)', right: '8%', top: '58%', '--delay': '-3s' } as Vars} />
      <GlassOrb style={{ '--size': '54px', left: '6%', top: '64%', '--delay': '-6s' } as Vars} />
      <Hills variant="low" />
    </div>
  );
}

/** Fundo das salas: debaixo d'água, claro e azul. Nada que dispute com o vídeo. */
export function DeepScene({ calm = false }: { calm?: boolean }) {
  return (
    <div className="scene scene--fixed scene--deep" aria-hidden>
      <LightRays count={calm ? 3 : 5} />
      {!calm && <Bubbles count={10} seed={11} />}
      <Seaweed className="seaweed--left" />
    </div>
  );
}

/** Peixes que cruzam uma faixa d'água. */
export function FishSchool({ dense = false }: { dense?: boolean }) {
  const lanes: { tint: 'orange' | 'yellow' | 'blue'; style: Vars; back?: boolean }[] = [
    { tint: 'yellow', style: { '--y': '30%', '--dur': '46s', '--delay': '-8s', '--w': 'clamp(70px, 8vw, 120px)' } },
    { tint: 'orange', style: { '--y': '62%', '--dur': '38s', '--delay': '-24s', '--w': 'clamp(46px, 5vw, 70px)' }, back: true },
    { tint: 'blue', style: { '--y': '48%', '--dur': '58s', '--delay': '-40s', '--w': 'clamp(40px, 4vw, 60px)' } },
  ];
  if (dense) {
    lanes.push({ tint: 'orange', style: { '--y': '20%', '--dur': '52s', '--delay': '-14s', '--w': '52px' }, back: true });
  }
  return (
    <>
      {lanes.map((l, i) => (
        <div key={i} className={`fish-lane${l.back ? ' fish-lane--back' : ''}`} style={l.style} aria-hidden>
          <div className="fish-bob">
            <Fish tint={l.tint} />
          </div>
        </div>
      ))}
    </>
  );
}

export { AuroraRibbons, GlassCity, GlassOrb, Hills, Sun, Clouds, Bubbles, LightRays, Seaweed };
