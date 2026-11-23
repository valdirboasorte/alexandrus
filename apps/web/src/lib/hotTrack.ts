/*
 * "Hot-track" do Windows 7: ao passar o mouse, botões e itens ganham um
 * brilho na própria cor, centrado onde o ponteiro está, e ele acompanha o
 * movimento. Um só ouvinte para a página toda; grava --hx/--hy (px) no
 * elemento sob o mouse, uma vez por quadro. O CSS (aero.css) desenha o brilho.
 * Só com mouse: no toque não há hover para acompanhar.
 */

export const HOT_SELECTOR = '.aero-btn, .topnav__link, .source-tile, .stream-tab, .room-row, .dock-btn';

export function installHotTrack() {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let frame = 0;
  let last: PointerEvent | null = null;

  const apply = () => {
    frame = 0;
    const e = last;
    if (!e) return;
    const el = (e.target as Element | null)?.closest?.(HOT_SELECTOR) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--hx', `${Math.round(e.clientX - r.left)}px`);
    el.style.setProperty('--hy', `${Math.round(e.clientY - r.top)}px`);
  };

  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    },
    { passive: true },
  );
}
