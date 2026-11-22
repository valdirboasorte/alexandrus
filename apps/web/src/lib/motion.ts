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
