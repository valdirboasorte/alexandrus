import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import '@fontsource-variable/nunito/wght.css';
import '@fontsource-variable/nunito/wght-italic.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/aero.css';
import { router } from './router.tsx';
import { installHotTrack } from './lib/hotTrack.ts';
import { pauseLoopsWhileScrolling } from './lib/motion.ts';

installHotTrack();
pauseLoopsWhileScrolling();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
