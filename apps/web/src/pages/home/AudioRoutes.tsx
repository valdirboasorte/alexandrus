import { Icon, type IconName } from '../../components/ui/Icon.tsx';

/**
 * O diagrama central do Alexandrus: duas correntes que nunca se misturam.
 * Corrente azul = Alexandrus (imagem + som da fonte). Corrente verde = Discord (voz).
 */

interface Source {
  icon: IconName;
  name: string;
  route: 'alexandrus' | 'discord' | 'nowhere';
  note: string;
}

const SOURCES: Source[] = [
  { icon: 'gamepad', name: 'Jogo', route: 'alexandrus', note: 'imagem e som vão pelo Alexandrus' },
  { icon: 'headphones', name: 'Call do Discord', route: 'discord', note: 'fica no Discord' },
  { icon: 'mic', name: 'Seu microfone', route: 'discord', note: 'o Alexandrus nunca abre' },
  { icon: 'alert', name: 'Notificações do Windows', route: 'nowhere', note: 'ficam de fora' },
];

export function AudioRoutes() {
  return (
    <div className="routes" data-loops>
      <div className="routes__node glass glass--frost">
        <p className="routes__node-title">
          <Icon name="monitor" />
          Seu computador
        </p>
        <ul className="routes__sources">
          {SOURCES.map((s) => (
            <li key={s.name} className={`routes__source routes__source--${s.route}`}>
              <span className="routes__source-icon">
                <Icon name={s.icon} />
              </span>
              <span>
                <strong>{s.name}</strong>
                <span className="routes__source-note">{s.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="routes__currents" aria-hidden>
        <svg viewBox="0 0 300 240" preserveAspectRatio="none" focusable="false">
          <path className="routes__pipe routes__pipe--blue" d="M0 70C110 70 170 60 300 60" />
          <path className="routes__flow routes__flow--blue" d="M0 70C110 70 170 60 300 60" />
          <path className="routes__pipe routes__pipe--green" d="M0 170C110 170 170 180 300 180" />
          <path className="routes__flow routes__flow--green" d="M0 170C110 170 170 180 300 180" />
        </svg>
        <span className="routes__label routes__label--blue">
          <Icon name="globe" />
          Alexandrus · imagem e som do jogo
        </span>
        <span className="routes__label routes__label--green">
          <Icon name="mic" />
          Discord · só a voz
        </span>
      </div>

      <div className="routes__node routes__node--friend glass glass--frost">
        <p className="routes__node-title">
          <Icon name="user" />
          Quem assiste ouve
        </p>
        <ul className="routes__hears">
          <li>
            <Icon name="check" strokeWidth={2.6} />o jogo, uma vez, pelo Alexandrus
          </li>
          <li>
            <Icon name="check" strokeWidth={2.6} />a sua voz, pelo Discord
          </li>
          <li className="routes__hears-no">
            <Icon name="x" strokeWidth={2.6} />a própria voz voltando
          </li>
          <li className="routes__hears-no">
            <Icon name="x" strokeWidth={2.6} />a call em dobro
          </li>
        </ul>
      </div>
    </div>
  );
}
