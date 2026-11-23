import { useSyncExternalStore } from 'react';

/*
 * Preferências de cada pessoa, só neste navegador: volume e silêncio dos
 * efeitos sonoros, ver ou não as reações, efeitos leves. Ninguém mais vê.
 */

export interface PgPrefs {
  /** Volume dos sons da Sound Box e dos jogos, 0–1. */
  volume: number;
  muted: boolean;
  /** Mostrar reações e eventos visuais por cima da tela. */
  showFx: boolean;
  /** Menos partículas e animações (além do "movimento reduzido" do site). */
  light: boolean;
}

const KEY = 'alexandrus:pg-prefs';
const DEFAULTS: PgPrefs = { volume: 0.6, muted: false, showFx: true, light: false };

function load(): PgPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PgPrefs> | null;
    if (!raw || typeof raw !== 'object') return DEFAULTS;
    return {
      volume: typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : DEFAULTS.volume,
      muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULTS.muted,
      showFx: typeof raw.showFx === 'boolean' ? raw.showFx : DEFAULTS.showFx,
      light: typeof raw.light === 'boolean' ? raw.light : DEFAULTS.light,
    };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getPrefs(): PgPrefs {
  return current;
}

export function setPrefs(p: Partial<PgPrefs>) {
  current = { ...current, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  listeners.forEach((fn) => fn());
}

export function usePrefs(): PgPrefs {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}
