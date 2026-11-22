import { createBrowserRouter } from 'react-router';
import { RootLayout, SiteLayout } from './components/layout/layouts.tsx';
import { HomePage } from './pages/home/HomePage.tsx';
import { CreateRoomPage } from './pages/CreateRoomPage.tsx';
import { JoinRoomPage } from './pages/JoinRoomPage.tsx';
import { RoomsPage } from './pages/RoomsPage.tsx';
import { HowItWorksPage } from './pages/HowItWorksPage.tsx';
import { AboutPage } from './pages/AboutPage.tsx';
import { PontePage } from './pages/PontePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { RoomPage } from './features/room/RoomPage.tsx';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      {
        element: <SiteLayout />,
        children: [
          { path: '/criar', element: <CreateRoomPage /> },
          { path: '/entrar', element: <JoinRoomPage /> },
          { path: '/salas', element: <RoomsPage /> },
          { path: '/como-funciona', element: <HowItWorksPage /> },
          { path: '/sobre', element: <AboutPage /> },
          { path: '/ponte', element: <PontePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '/sala/:code', element: <RoomPage /> },
    ],
  },
]);
