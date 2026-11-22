import { Icon } from '../../components/ui/Icon.tsx';

/**
 * A tela de vidro do herói: uma prévia, desenhada em HTML, de como a sala
 * aparece para quem assiste. A paisagem é uma foto real (crédito no rodapé).
 */
export function HeroScreen() {
  return (
    <figure className="hero-screen" aria-label="Ilustração: uma transmissão do Alexandrus vista por quem assiste">
      <svg className="hero-screen__orbit" viewBox="0 0 800 520" aria-hidden focusable="false">
        <defs>
          <linearGradient id="orbit-a" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#8ff0ff" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path d="M40 360C120 470 520 500 720 380 800 330 790 250 700 220" fill="none" stroke="url(#orbit-a)" strokeWidth="5" strokeLinecap="round" />
        <path className="hero-screen__spark" d="M40 360C120 470 520 500 720 380 800 330 790 250 700 220" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" pathLength={1000} />
        <path d="M110 130C220 40 560 20 700 110" fill="none" stroke="url(#orbit-a)" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      </svg>

      <div className="hero-screen__frame">
        <div className="hero-screen__glass">
          <img
            className="hero-screen__picture"
            src="/fotos/campo.jpg"
            width={1920}
            height={1280}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
          <div className="hero-screen__hud" aria-hidden>
            <span className="live-pill">
              <span className="live-pill__dot" />
              AO VIVO
            </span>
            <span className="hero-screen__chip glass glass--deep">
              <Icon name="volume" />
              Áudio da fonte
              <span className="aero-toggle" aria-checked="true" role="presentation">
                <span className="aero-toggle__knob" />
              </span>
            </span>
          </div>
          <div className="hero-screen__dock glass glass--deep" aria-hidden>
            <span className="hero-screen__dock-item">
              <Icon name="volume" />
              <span className="hero-screen__meter">
                <span />
              </span>
            </span>
            <span className="hero-screen__dock-item">
              <Icon name="maximize" />
            </span>
          </div>
        </div>
      </div>
      <span className="hero-screen__reflection" aria-hidden />
    </figure>
  );
}
