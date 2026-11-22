import { useCallback, useRef } from 'react';
import { isReducedMotion } from '../lib/motion.ts';

/**
 * Entradas ao rolar: cada [data-reveal] sobe 24px e aparece quando entra na
 * tela, em cascata de 70 ms entre irmãos. Sem JavaScript (ou com movimento
 * reduzido) tudo já está visível: o estado escondido só existe depois que o
 * script liga a classe `reveal-on`.
 */
export function useReveal() {
  const observer = useRef<IntersectionObserver | null>(null);

  return useCallback((root: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!root) return;
    if (isReducedMotion() || !('IntersectionObserver' in window)) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    const groups = new Map<Element | null, number>();
    for (const el of items) {
      const parent = el.parentElement;
      const i = groups.get(parent) ?? 0;
      groups.set(parent, i + 1);
      el.style.setProperty('--reveal-delay', `${Math.min(i, 6) * 70}ms`);
    }

    root.classList.add('reveal-on');
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute('data-revealed', '');
            observer.current?.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    items.forEach((el) => observer.current!.observe(el));
  }, []);
}
