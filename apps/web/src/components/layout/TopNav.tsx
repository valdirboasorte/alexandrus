import { Link, NavLink } from 'react-router';
import { Logo } from '../brand/Logo.tsx';
import { AeroLink } from '../ui/AeroButton.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import './layout.css';

const LINKS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/salas', label: 'Salas', icon: 'home' },
  { to: '/como-funciona', label: 'Como funciona', icon: 'help' },
  { to: '/sobre', label: 'Sobre', icon: 'info' },
];

export function TopNav() {
  return (
    <header className="topnav">
      <nav className="topnav__bar glass" aria-label="Principal">
        <Link to="/" className="topnav__brand" viewTransition aria-label="Alexandrus, página inicial">
          <Logo />
        </Link>
        <ul className="topnav__links">
          {LINKS.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.end} viewTransition className={({ isActive }) => `topnav__link${isActive ? ' is-active' : ''}`}>
                <Icon name={l.icon} />
                <span>{l.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <AeroLink to="/criar" variant="green" size="md" icon="plus" className="topnav__cta">
          Criar sala
        </AeroLink>
      </nav>
    </header>
  );
}
