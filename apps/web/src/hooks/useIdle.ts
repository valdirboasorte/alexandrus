import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * true depois de `ms` sem mexer o mouse, tocar ou teclar dentro do elemento.
 * Usado para esconder os controles do player enquanto alguém assiste.
 */
export function useIdle(ref: RefObject<HTMLElement | null>, ms = 2600, enabled = true) {
  const [idle, setIdle] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) {
      setIdle(false);
      return;
    }
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setIdle(true), ms);
    };
    const sleep = () => {
      window.clearTimeout(timer.current);
      setIdle(true);
    };
    wake();
    el.addEventListener('pointermove', wake);
    el.addEventListener('pointerdown', wake);
    el.addEventListener('keydown', wake);
    el.addEventListener('focusin', wake);
    el.addEventListener('pointerleave', sleep);
    return () => {
      window.clearTimeout(timer.current);
      el.removeEventListener('pointermove', wake);
      el.removeEventListener('pointerdown', wake);
      el.removeEventListener('keydown', wake);
      el.removeEventListener('focusin', wake);
      el.removeEventListener('pointerleave', sleep);
    };
  }, [ref, ms, enabled]);

  return idle;
}

/** Estado de tela cheia de um elemento, com fallback para o vídeo no iOS. */
export function useFullscreen(ref: RefObject<HTMLElement | null>, videoRef?: RefObject<HTMLVideoElement | null>) {
  const [isFull, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [ref]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } else {
      const v = videoRef?.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      v?.webkitEnterFullscreen?.();
    }
  };
  return { isFull, toggle };
}
