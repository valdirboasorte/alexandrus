/*
 * Animações do cenário.
 * O padrão segue o sistema (prefers-reduced-motion; no Windows, "Efeitos de
 * animação"). A pessoa pode escolher outra coisa só para o Alexandrus, e a
 * escolha fica salva neste navegador. O resultado vai em
 * <html data-motion="full|reduced">, que é o que o CSS lê. index.html aplica o
 * mesmo cálculo antes do primeiro desenho, para não piscar.
 */

export type MotionPref = 'full' | 'reduced';

const KEY = 'alexandrus:motion';
const query = () => window.matchMedia('(prefers-reduced-motion: reduce)');

export function systemPrefersReduced() {
  return query().matches;
}

export function storedMotion(): MotionPref | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'full' || v === 'reduced' ? v : null;
  } catch {
    return null;
  }
}

export function effectiveMotion(): MotionPref {
  return storedMotion() ?? (systemPrefersReduced() ? 'reduced' : 'full');
}

export function applyMotion() {
  document.documentElement.dataset.motion = effectiveMotion();
}

/** Guarda a escolha. Se ela coincide com o sistema, volta a seguir o sistema. */
export function setMotion(pref: MotionPref) {
  const sys: MotionPref = systemPrefersReduced() ? 'reduced' : 'full';
  try {
    if (pref === sys) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* sem armazenamento: vale só para esta visita */
  }
  document.documentElement.dataset.motion = pref;
  window.dispatchEvent(new Event('alexandrus:motion'));
}

/** Acompanha mudanças do sistema enquanto a pessoa não escolheu nada. */
export function watchSystemMotion(onChange: () => void) {
  const mq = query();
  const handler = () => {
    if (!storedMotion()) applyMotion();
    onChange();
  };
  mq.addEventListener('change', handler);
  window.addEventListener('alexandrus:motion', onChange);
  return () => {
    mq.removeEventListener('change', handler);
    window.removeEventListener('alexandrus:motion', onChange);
  };
}

export function isReducedMotion() {
  return document.documentElement.dataset.motion === 'reduced';
}

/**
 * Nome da "janela" de cada página nas transições (ver base.css): uma por rota,
 * para a saída e a entrada serem grupos separados e nunca se deformarem.
 */
export function pageWindowName(pathname: string): string {
  const first = pathname.split('/')[1] || 'inicio';
  return `page-${first.replace(/[^a-z0-9-]/gi, '') || 'x'}`;
}

/**
 * Loops do cenário (bolhas, peixes, correntes) param quando a região sai da
 * tela: [data-loops] ganha data-paused e o CSS pausa as animações lá dentro.
 * Devolve a função que desliga a observação.
 */
export function pauseLoopsOffscreen(root: ParentNode = document): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.target.toggleAttribute('data-paused', !e.isIntersecting);
    },
    { rootMargin: '120px 0px' },
  );
  root.querySelectorAll('[data-loops]').forEach((el) => io.observe(el));
  return () => io.disconnect();
}

/**
 * Enquanto a página rola, os loops do cenário (nuvens, bolhas, peixes, raios)
 * ficam parados: rolando, o navegador recalcula a cada quadro o estado de cada
 * animação, e com dezenas delas a rolagem perde quadros. Param no primeiro
 * evento de rolagem e voltam 160 ms depois do último — quase invisível, porque
 * tudo ali se move devagar. Instalado uma vez (main.tsx).
 */
export function pauseLoopsWhileScrolling(): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  let timer = 0;
  const resume = () => {
    timer = 0;
    delete root.dataset.scrolling;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!timer) root.dataset.scrolling = '';
      else window.clearTimeout(timer);
      timer = window.setTimeout(resume, 160);
    },
    { passive: true, capture: true },
  );
}
