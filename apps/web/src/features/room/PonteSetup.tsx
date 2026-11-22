import { AeroButton } from '../../components/ui/AeroButton.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { StatusOrb } from '../../components/ui/controls.tsx';
import type { PonteStatus } from '../../lib/ponte.ts';

export const PONTE_DOWNLOAD = '/downloads/AlexandrusPonte.exe';

/**
 * Três passos para quem quer o som só do jogo. A sala procura a Ponte sozinha
 * enquanto este cartão está na tela; não há botão de "conectar".
 */
export function PonteSetup({ status, busyElsewhere, onTakeOver }: { status: PonteStatus; busyElsewhere: boolean; onTakeOver: () => void }) {
  if (busyElsewhere) {
    return (
      <div className="ponte-setup">
        <p className="ponte-setup__title">
          <Icon name="bridge" />A Ponte está aberta, mas em uso em outra aba do Alexandrus
        </p>
        <p className="ponte-setup__aside">Ela atende uma aba por vez. Usar aqui desconecta a outra aba (e o som que ela estiver transmitindo).</p>
        <div>
          <AeroButton size="sm" variant="glass" icon="bridge" onClick={onTakeOver}>
            Usar nesta aba
          </AeroButton>
        </div>
      </div>
    );
  }
  return (
    <div className="ponte-setup">
      <p className="ponte-setup__title">
        <Icon name="bridge" />
        Para o som só do jogo, use a Alexandrus Ponte
      </p>
      <ol className="ponte-setup__steps">
        <li>
          <a className="aero-btn aero-btn--green aero-btn--sm" href={PONTE_DOWNLOAD} download>
            <span className="aero-btn__sheen" aria-hidden />
            <Icon name="download" className="aero-btn__icon" />
            Baixar a Ponte (27 KB)
          </a>
          <span className="ponte-setup__aside">Sem instalar. Se o Chrome perguntar, escolha “Manter”.</span>
        </li>
        <li>
          Abra o arquivo. Se aparecer “O Windows protegeu o computador”, clique em <strong>Mais informações</strong> e depois em{' '}
          <strong>Executar assim mesmo</strong>.
        </li>
        <li>Deixe a janelinha aberta. Se o navegador pedir para acessar a rede local, permita: é a conversa com a Ponte.</li>
      </ol>
      <p className="ponte-setup__status" aria-live="polite">
        <StatusOrb state={status === 'ready' ? 'ok' : 'busy'} />
        {status === 'ready' ? 'Ponte encontrada!' : 'Procurando a Ponte no seu computador…'}
      </p>
    </div>
  );
}
