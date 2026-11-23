/*
 * Laço de animação do Playground: no máximo 60 quadros por segundo (a tela do
 * usuário pode ser de 180 Hz e jogo de bolha não precisa disso), parado
 * quando a aba fica escondida ou o elemento sai da tela. Nada de setState por
 * quadro: quem desenha escreve direto no canvas ou em style.transform.
 */

export interface LoopHandle {
  stop(): void;
  /** Força parar/continuar (ex.: painel fechado). */
  setActive(on: boolean): void;
}

/**
 * `tick(dt, now)` recebe dt em segundos (limitado a 1/20 s para não "pular"
 * depois de uma pausa). `el` = só roda enquanto este elemento está visível.
 */
export function startLoop(tick: (dt: number, now: number) => void, el?: Element | null, maxFps = 60): LoopHandle {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let visible = true;
  let active = true;
  let stopped = false;
  const frame = 1000 / maxFps;

  const run = (now: number) => {
    raf = 0;
    if (stopped || !active || !visible || document.hidden) {
      last = 0;
      return;
    }
    if (last === 0) last = now;
    const delta = now - last;
    acc += delta;
    last = now;
    // telas rápidas: pula quadros até completar um "quadro de 60 Hz"
    if (acc + 0.5 >= frame) {
      const dt = Math.min(acc, 50) / 1000;
      acc = 0;
      tick(dt, now);
    }
    raf = requestAnimationFrame(run);
  };

  const kick = () => {
    if (!raf && !stopped && active && visible && !document.hidden) raf = requestAnimationFrame(run);
  };

  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);

  let io: IntersectionObserver | null = null;
  if (el && 'IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      kick();
    });
    io.observe(el);
  }
  kick();

  return {
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      io?.disconnect();
    },
    setActive(on: boolean) {
      active = on;
      kick();
    },
  };
}

/** Prepara um canvas nítido: tamanho do elemento × devicePixelRatio (até 2). */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2): { w: number; h: number; dpr: number; ctx: CanvasRenderingContext2D } {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, dpr, ctx };
}

/** Movimento reduzido (preferência do sistema ou o interruptor do rodapé). */
export function reducedMotion(): boolean {
  // data-motion já combina a preferência do sistema com o interruptor do site
  return document.documentElement.dataset.motion === 'reduced';
}
