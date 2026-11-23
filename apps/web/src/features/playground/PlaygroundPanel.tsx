import { lazy, memo, Suspense, useEffect, useMemo, type ComponentType } from 'react';
import { AeroButton } from '../../components/ui/AeroButton.tsx';
import { AeroProgress } from '../../components/ui/controls.tsx';
import { Glyph, Orb } from './art.tsx';
import { PgEnvContext, PLACES, placeById, type PgEnv, type PlaceId } from './context.ts';
import { usePg } from './hooks.ts';
import PetNest, { MascotFigure } from './Mascot.tsx';
import { PgEmpty, PgNotice } from './ui.tsx';
import { WorldMap } from './WorldMap.tsx';
import './playground.css';

/*
 * O painel do Playground, ao lado (ou embaixo, no celular) do palco. Abrir e
 * fechar não toca no vídeo: o painel é irmão do palco. Fechado, ele nem
 * existe — nenhum laço de animação roda. Cada lugar carrega sob demanda.
 */

const TOOLS: Record<Exclude<PlaceId, 'world'>, ComponentType<{ active: boolean }>> = {
  aqua: lazy(() => import('./tools/AquaWorld.tsx')),
  bubbles: lazy(() => import('./tools/BubblePop.tsx')),
  paint: lazy(() => import('./tools/AeroPaint.tsx')),
  wheel: lazy(() => import('./tools/Randomizer.tsx')),
  sounds: lazy(() => import('./tools/SoundBox.tsx')),
  toys: lazy(() => import('./tools/SkyToys.tsx')),
  poll: lazy(() => import('./tools/LivePoll.tsx')),
  stage: lazy(() => import('./tools/StageDesk.tsx')),
  stats: lazy(() => import('./tools/RoomStats.tsx')),
  // o mascote já vem no pacote do mapa (ele aparece lá), então não é carregado à parte
  pet: PetNest,
  settings: lazy(() => import('./tools/PgSettings.tsx')),
};

interface PanelProps {
  env: Omit<PgEnv, 'go' | 'current'>;
  place: PlaceId;
  onPlace: (p: PlaceId) => void;
  onClose: () => void;
}

/** memo: o palco re-renderiza a cada segundo (relógio ao vivo); o painel só quando os dados dele mudam. */
export const PlaygroundPanel = memo(function PlaygroundPanel({ env, place, onPlace, onClose }: PanelProps) {
  const { store, isHost } = env;
  const status = usePg(store, (s) => s.status);
  const snap = usePg(store, (s) => s.snap);
  const ctx = useMemo<PgEnv>(() => ({ ...env, go: onPlace, current: place }), [env, onPlace, place]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (place !== 'world') onPlace('world');
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [place, onPlace, onClose]);

  const info = place === 'world' ? null : place === 'settings' ? { name: 'Ajustes', tag: isHost ? 'Seus efeitos e os controles da sala' : 'Seus efeitos' } : placeById(place);
  const disabledForMe = snap && !snap.settings.enabled && !isHost;
  const pending = isHost && snap ? snap.asks.filter((a) => a.status === 'pending').length : 0;

  let body;
  if (status === 'unsupported') {
    body = (
      <PgEmpty glyph="cloud" title="Playground indisponível aqui">
        Este servidor de salas ainda não tem o Playground. A transmissão funciona normalmente.
      </PgEmpty>
    );
  } else if (!snap) {
    body = (
      <div className="pg-loading">
        <AeroProgress label="Entrando no Playground" />
        <p className="pg-hint">Entrando no Playground…</p>
      </div>
    );
  } else if (disabledForMe) {
    body = (
      <div className="pg-off">
        <MascotFigure stage={0} mood="sleeping" acc={null} size={110} />
        <p className="pg-empty__title">O Playground está pausado</p>
        <p className="pg-hint">O anfitrião desligou o Playground desta sala por enquanto. A transmissão continua normalmente.</p>
      </div>
    );
  } else {
    const Tool = place === 'world' ? null : TOOLS[place];
    body = (
      <>
        {!snap.settings.enabled && <PgNotice tone="warn">O Playground está desligado para todos. Só você vê isto; ligue de novo em Ajustes.</PgNotice>}
        {snap.you.muted && <PgNotice tone="warn">O anfitrião silenciou você no Playground: dá para brincar, mas nada do que você faz vai para a sala.</PgNotice>}
        {Tool ? (
          <Suspense
            fallback={
              <div className="pg-loading">
                <AeroProgress label="Carregando" />
              </div>
            }
          >
            <Tool active={place !== 'world'} />
          </Suspense>
        ) : (
          <WorldMap />
        )}
      </>
    );
  }

  return (
    <PgEnvContext.Provider value={ctx}>
      <aside className="pg-panel" data-active aria-label="Playground">
        <header className="pg-head">
          {place === 'world' ? (
            <Orb tone="green" glyph="sparkle" size={38} />
          ) : (
            <button type="button" className="pg-head__back" onClick={() => onPlace('world')} aria-label="Voltar ao mapa do Playground">
              <Glyph name="back" size={22} stroke={2.6} />
            </button>
          )}
          <div className="pg-head__title">
            <strong>{info?.name ?? 'Playground'}</strong>
            <span>{info?.tag ?? `O mundinho da sala ${env.room.name}`}</span>
          </div>
          {snap && (
            <button type="button" className="pg-head__icon" onClick={() => onPlace(place === 'settings' ? 'world' : 'settings')} aria-pressed={place === 'settings'} aria-label="Ajustes do Playground">
              <Glyph name="gear" size={21} />
            </button>
          )}
          <AeroButton size="sm" variant="red" className="aero-close" iconOnly icon="x" aria-label="Fechar o Playground" onClick={onClose} />
        </header>

        <div className="pg-body" key={place}>
          {body}
        </div>

        {snap && !disabledForMe && (
          <nav className="pg-dock" aria-label="Lugares do Playground">
            <button type="button" className="pg-dock__btn" aria-current={place === 'world' ? 'page' : undefined} onClick={() => onPlace('world')}>
              <Orb tone="green" glyph="home" size={32} />
              <span>Mapa</span>
            </button>
            {PLACES.map((p) => (
              <button key={p.id} type="button" className="pg-dock__btn" aria-current={place === p.id ? 'page' : undefined} onClick={() => onPlace(p.id)} title={p.tag}>
                <Orb tone={p.tone} glyph={p.glyph} size={32} />
                <span>{p.name.split(' ')[0]}</span>
                {p.id === 'stage' && pending > 0 && <span className="pg-badge">{pending}</span>}
                {p.id === 'poll' && snap.poll?.open && <span className="pg-badge">1</span>}
              </button>
            ))}
          </nav>
        )}
      </aside>
    </PgEnvContext.Provider>
  );
});
