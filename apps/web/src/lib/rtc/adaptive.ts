/*
 * Ajuste automático de qualidade, por espectador.
 *
 * O WebRTC já estima a banda (GCC), mas quando o upload do anfitrião é
 * dividido com o jogo e com vários espectadores, a fila entope antes da
 * estimativa reagir: perda alta, atraso de centenas de ms, vídeo travando.
 * Este controle desce degraus de qualidade (teto de bitrate e, em jogos,
 * resolução) quando a rede daquele espectador piora, e sobe devagar quando ela
 * fica estável. Lógica pura, sem DOM: testada em apps/web/test/adaptive.test.ts.
 */

export interface Step {
  /** Teto de bitrate de vídeo (bps). */
  bps: number;
  /** Divisor de resolução (1 = original). */
  scale: number;
  /** Teto de quadros por segundo. */
  fps: number;
}

export interface Sample {
  /** Fração perdida no último relatório RTCP do espectador (0–1). */
  loss: number | null;
  /** Ida e volta em segundos. */
  rtt: number | null;
  /** Estimativa de banda de saída do WebRTC (bps). */
  available: number | null;
}

export interface AdaptState {
  level: number;
  bad: number;
  good: number;
  /** Momento da última mudança (ms), para não oscilar. */
  changedAt: number;
}

export const INITIAL_ADAPT: AdaptState = { level: 0, bad: 0, good: 0, changedAt: 0 };

const MIN_BPS = 400_000;

/**
 * Degraus a partir do teto escolhido. Em jogos (fluidez) cai a resolução e o
 * FPS fica; em texto (nitidez) a resolução fica e cai o FPS.
 */
export function ladder(ceilingBps: number, fps: number, content: 'motion' | 'detail'): Step[] {
  const fracs = [1, 0.6, 0.4, 0.25, 0.15];
  const motionScale = [1, 1, 1.5, 2, 2.5];
  const detailFps = [fps, fps, Math.min(fps, 30), Math.min(fps, 15), Math.min(fps, 10)];
  return fracs.map((f, i) => ({
    bps: Math.max(MIN_BPS, Math.round(ceilingBps * f)),
    scale: content === 'motion' ? motionScale[i] : 1,
    fps: content === 'motion' ? fps : detailFps[i],
  }));
}

const LOSS_BAD = 0.04;
const LOSS_SEVERE = 0.15;
const LOSS_GOOD = 0.01;
const RTT_BAD = 0.35;
const RTT_SEVERE = 0.8;
const RTT_GOOD = 0.15;
/** Amostras ruins seguidas para descer um degrau (amostra a cada ~2 s). */
const BAD_STREAK = 2;
/** Amostras boas seguidas para subir um degrau. */
const GOOD_STREAK = 5;
/** Depois de descer, espera antes de tentar subir. */
const UP_COOLDOWN_MS = 12_000;

/** Próximo estado a partir de uma amostra de rede. */
export function decide(state: AdaptState, s: Sample, steps: Step[], now: number): AdaptState {
  const last = steps.length - 1;
  const loss = s.loss ?? 0;
  const rtt = s.rtt ?? 0;
  const current = steps[state.level];

  const severe = loss >= LOSS_SEVERE || rtt >= RTT_SEVERE;
  // A estimativa do WebRTC muito abaixo do degrau atual também conta como sinal ruim.
  const starved = s.available !== null && s.available < current.bps * 0.6;
  const bad = severe || loss >= LOSS_BAD || rtt >= RTT_BAD || starved;
  const nextUp = steps[Math.max(0, state.level - 1)];
  const good = loss < LOSS_GOOD && rtt < RTT_GOOD && (s.available === null || s.available >= nextUp.bps * 0.9);

  if (severe && state.level < last) {
    return { level: Math.min(last, state.level + 2), bad: 0, good: 0, changedAt: now };
  }
  if (bad) {
    const streak = state.bad + 1;
    if (streak >= BAD_STREAK && state.level < last) return { level: state.level + 1, bad: 0, good: 0, changedAt: now };
    return { ...state, bad: streak, good: 0 };
  }
  if (good) {
    const streak = state.good + 1;
    if (streak >= GOOD_STREAK && state.level > 0 && now - state.changedAt >= UP_COOLDOWN_MS) {
      return { level: state.level - 1, bad: 0, good: 0, changedAt: now };
    }
    return { ...state, good: streak, bad: 0 };
  }
  return { ...state, bad: 0, good: 0 };
}
