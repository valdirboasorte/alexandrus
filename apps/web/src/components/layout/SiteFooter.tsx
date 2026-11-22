import { Link } from 'react-router';
import { PHOTO_CREDITS } from '../../content/credits.ts';
import { Bubbles, Seaweed } from '../scenery/parts.tsx';
import { FishSchool } from '../scenery/Scene.tsx';
import { MotionToggle } from './MotionToggle.tsx';
import './layout.css';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Bubbles count={9} seed={23} />
      <FishSchool />
      <Seaweed className="seaweed--left" />
      <Seaweed className="seaweed--right" />
      <div className="page site-footer__inner">
        <p className="site-footer__word" aria-hidden>
          Alexandrus
        </p>
        <div className="site-footer__row">
          <p className="site-footer__lead">
            Compartilhamento de tela ao vivo com o som da fonte e nada mais. Sem conta, sem microfone, sem eco. As salas somem quando o anfitrião vai embora.
          </p>
          <ul className="site-footer__nav">
            <li><Link to="/criar" viewTransition>Criar sala</Link></li>
            <li><Link to="/entrar" viewTransition>Entrar em uma sala</Link></li>
            <li><Link to="/salas" viewTransition>Salas públicas</Link></li>
            <li><Link to="/ponte" viewTransition>Alexandrus Ponte</Link></li>
            <li><Link to="/sobre" viewTransition>Sobre</Link></li>
          </ul>
        </div>
        <MotionToggle />
        <p className="site-footer__credits">
          Fotos:{' '}
          {PHOTO_CREDITS.map((c, i) => (
            <span key={c.file}>
              <a href={c.page} target="_blank" rel="noreferrer">“{c.title}”</a> por {c.creator},{' '}
              <a href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a>, via Wikimedia Commons
              {i < PHOTO_CREDITS.length - 1 ? '; ' : '. '}
            </span>
          ))}
          Ilustrações, ícones e cenário desenhados para o Alexandrus.
        </p>
      </div>
    </footer>
  );
}
