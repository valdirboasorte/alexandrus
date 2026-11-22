import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';

export type HealthState = { status: 'checking' } | { status: 'ok'; ms: number; rooms: number } | { status: 'down'; message: string };

/** Pergunta ao servidor se ele está de pé, de verdade (GET /api/health). */
export function useServerHealth(intervalMs = 30000) {
  const [state, setState] = useState<HealthState>({ status: 'checking' });

  const check = useCallback(async () => {
    const t0 = performance.now();
    try {
      const h = await api.health();
      setState({ status: 'ok', ms: Math.round(performance.now() - t0), rooms: h.rooms });
    } catch (e) {
      setState({ status: 'down', message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void check();
    const id = window.setInterval(check, intervalMs);
    return () => window.clearInterval(id);
  }, [check, intervalMs]);

  return { state, recheck: check };
}
