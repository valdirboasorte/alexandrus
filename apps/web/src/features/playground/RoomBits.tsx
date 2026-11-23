import { Icon } from '../../components/ui/Icon.tsx';
import { Orb } from './art.tsx';
import { usePg } from './hooks.ts';
import type { PlaygroundStore } from './store.ts';

/*
 * Pedaços do Playground que moram na sala (fora do painel): os botões do dock
 * e o chip de votação aberta no topo do palco. Só aparecem quando o servidor
 * tem o Playground e ele está ligado (o anfitrião sempre vê o botão, para
 * poder religar).
 */

export function usePgVisible(store: PlaygroundStore, isHost: boolean): boolean {
  return usePg(store, (s) => s.status !== 'unsupported' && (isHost || s.snap === null || s.snap.settings.enabled));
}

interface DockProps {
  store: PlaygroundStore;
  isHost: boolean;
  open: boolean;
  onToggle: () => void;
  tray: boolean;
  onTray: (open: boolean) => void;
}

export function PgDockButtons({ store, isHost, open, onToggle, tray, onTray }: DockProps) {
  const visible = usePgVisible(store, isHost);
  const ready = usePg(store, (s) => s.status === 'ready');
  const reactionsOn = usePg(store, (s) => !!s.snap?.settings.enabled && !!s.snap?.settings.reactions);
  const attention = usePg(store, (s) => (isHost ? (s.snap?.asks.some((a) => a.status === 'pending') ?? false) : !!s.snap?.poll?.open));
  if (!visible) return null;
  return (
    <>
      {ready && reactionsOn && (
        <span className="pg-react-wrap">
          <button
            type="button"
            className="dock-btn"
            data-react-toggle
            aria-expanded={tray}
            aria-label="Reagir"
            title="Reagir"
            onClick={() => onTray(!tray)}
          >
            <Icon name="heart" />
          </button>
        </span>
      )}
      <button type="button" className="dock-btn dock-btn--labelled dock-btn--pg" aria-expanded={open} onClick={onToggle} title="Playground: brincar com a sala enquanto assiste">
        <Icon name="sparkle" />
        <span>Playground</span>
        {attention && !open && <span className="dock-btn__dot" aria-label="Novidade no Playground" />}
      </button>
    </>
  );
}

export function PgPollChip({ store, onOpen }: { store: PlaygroundStore; onOpen: () => void }) {
  const poll = usePg(store, (s) => (s.snap?.settings.enabled && s.snap.poll?.open ? s.snap.poll : null));
  if (!poll) return null;
  const total = poll.opts.reduce((n, o) => n + o.n, 0);
  return (
    <button type="button" className="pg-pollchip glass glass--deep" onClick={onOpen} title={poll.q}>
      <Orb tone="green" glyph="poll" size={34} />
      <span>
        {poll.mine === null ? 'Vote: ' : 'Votação: '}
        {poll.q}
      </span>
      <small>{total}</small>
    </button>
  );
}
