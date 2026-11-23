import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

interface ToastItem {
  id: number;
  text: string;
  /** Saindo: some com a animação antes de deixar o DOM. */
  leaving?: boolean;
}

/** Quanto o aviso fica, e quanto dura a saída (igual ao CSS de .toast[data-leaving]). */
const SHOW_MS = 2400;
const LEAVE_MS = 220;

const ToastContext = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const push = useCallback((text: string) => {
    const id = next.current++;
    setItems((list) => [...list.slice(-2), { id, text }]);
    window.setTimeout(() => setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), SHOW_MS);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), SHOW_MS + LEAVE_MS);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast" data-leaving={t.leaving || undefined}>
            <span className="toast__icon" aria-hidden>
              <Icon name="check" strokeWidth={2.8} />
            </span>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Copia texto e confirma com um toast. Devolve false se o navegador recusar. */
export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, done = 'Link copiado') => {
      try {
        await navigator.clipboard.writeText(text);
        toast(done);
        return true;
      } catch {
        toast('Não deu para copiar. Selecione e copie manualmente.');
        return false;
      }
    },
    [toast],
  );
}
