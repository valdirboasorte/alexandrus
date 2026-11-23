import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PgEvent } from '@protocol';
import type { PgState, PlaygroundStore } from './store.ts';

/** Lê uma fatia do estado do Playground; re-renderiza só quando ela muda. */
export function usePg<T>(store: PlaygroundStore, select: (s: PgState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

/** Escuta um evento passageiro (reação, som, comida…) enquanto o componente existir. */
export function usePgEvent<K extends PgEvent['k']>(store: PlaygroundStore, k: K, fn: (e: Extract<PgEvent, { k: K }>) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => store.on(k, (e) => ref.current(e)), [store, k]);
}

/** Relógio do servidor que avança a cada `ms` (para humor do mascote, cronômetros). */
export function useServerClock(store: PlaygroundStore, ms = 1000): number {
  const [now, setNow] = useState(() => store.serverNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(store.serverNow()), ms);
    return () => window.clearInterval(id);
  }, [store, ms]);
  return now;
}

/** Segundos restantes de espera de uma ação (re-renderiza enquanto conta). */
export function useCooldown(store: PlaygroundStore, k: Parameters<PlaygroundStore['cooldownLeft']>[0]): number {
  const [left, setLeft] = useState(() => store.cooldownLeft(k));
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const l = store.cooldownLeft(k);
      setLeft(l);
      window.clearTimeout(id);
      if (l > 0) id = window.setTimeout(tick, Math.min(250, l));
    };
    tick();
    const off = store.subscribe(tick);
    return () => {
      off();
      window.clearTimeout(id);
    };
  }, [store, k]);
  return left;
}
