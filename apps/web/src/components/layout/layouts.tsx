import { useEffect } from 'react';
import { pageWindowName, pauseLoopsOffscreen } from '../../lib/motion.ts';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Radio } from '../radio/Radio.tsx';
import { SceneDefs } from '../scenery/parts.tsx';
import { MeadowScene } from '../scenery/Scene.tsx';
import { ToastProvider } from '../ui/toast.tsx';
import { SiteFooter } from './SiteFooter.tsx';
import { TopNav } from './TopNav.tsx';

const TITLES: Record<string, string> = {
  '/': 'Alexandrus',
  '/criar': 'Criar sala · Alexandrus',
  '/entrar': 'Entrar em uma sala · Alexandrus',
  '/salas': 'Salas · Alexandrus',
  '/como-funciona': 'Como funciona · Alexandrus',
  '/sobre': 'Sobre · Alexandrus',
  '/ponte': 'Alexandrus Ponte',
};

export function RootLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!pathname.startsWith('/sala/')) document.title = TITLES[pathname] ?? 'Alexandrus';
  }, [pathname]);

  // a cada página nova, as regiões com loops passam a pausar fora da tela
  useEffect(() => pauseLoopsOffscreen(), [pathname]);

  return (
    <ToastProvider>
      <SceneDefs />
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <Outlet />
      <Radio />
      <ScrollRestoration />
    </ToastProvider>
  );
}

/** Páginas de site: céu e campo ao fundo, barra no topo, rodapé submerso. */
export function SiteLayout() {
  const { pathname } = useLocation();
  return (
    <>
      <MeadowScene />
      <TopNav />
      <main id="conteudo" className="site-main vt-page" style={{ viewTransitionName: pageWindowName(pathname) }}>
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
