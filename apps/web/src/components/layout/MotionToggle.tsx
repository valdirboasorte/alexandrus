import { useEffect, useState } from 'react';
import { effectiveMotion, setMotion, storedMotion, systemPrefersReduced, watchSystemMotion } from '../../lib/motion.ts';
import { AeroToggle } from '../ui/controls.tsx';

/** "Animações do cenário": segue o sistema até a pessoa escolher outra coisa. */
export function MotionToggle() {
  const [on, setOn] = useState(() => effectiveMotion() === 'full');
  const [, refresh] = useState(0);

  useEffect(
    () =>
      watchSystemMotion(() => {
        setOn(effectiveMotion() === 'full');
        refresh((n) => n + 1);
      }),
    [],
  );

  const sysReduced = systemPrefersReduced();
  const custom = storedMotion() !== null;
  const hint = sysReduced
    ? custom
      ? 'Seu sistema pede menos movimento; aqui vale a sua escolha.'
      : 'Desligadas porque seu sistema pede menos movimento (no Windows: Efeitos de animação).'
    : custom
      ? 'Desligadas só aqui no Alexandrus.'
      : 'Nuvens, água, peixes e bolhas em movimento.';

  return (
    <div className="motion-toggle">
      <label htmlFor="animacoes" className="motion-toggle__label">
        Animações do cenário
        <span>{hint}</span>
      </label>
      <AeroToggle
        id="animacoes"
        checked={on}
        label="Animações do cenário"
        onChange={(next) => {
          setMotion(next ? 'full' : 'reduced');
          setOn(next);
        }}
      />
    </div>
  );
}
