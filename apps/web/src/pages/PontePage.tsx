import { useEffect, useState } from 'react';
import { SystemCheck } from '../components/check/SystemCheck.tsx';
import { AeroButton } from '../components/ui/AeroButton.tsx';
import { Note } from '../components/ui/controls.tsx';
import './pages.css';

const EXE = '/downloads/AlexandrusPonte.exe';

export function PontePage() {
  const [hasDownload, setHasDownload] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(EXE, { method: 'HEAD' })
      .then((r) => setHasDownload(r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')))
      .catch(() => setHasDownload(false));
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Alexandrus Ponte</h1>
        <p className="page-lead">
          Um programinha para Windows que pega o som de um aplicativo só (o seu jogo) e entrega para o Alexandrus. Sem ela, o navegador só consegue o som
          de abas, de algumas janelas ou do sistema inteiro.
        </p>
      </header>

      <div className="split">
        <div>
          <section className="prose-panel glass glass--frost" aria-labelledby="usar">
            <h2 id="usar">Como usar</h2>
            <ul>
              <li>
                Baixe e abra a Ponte. Ela fica numa janelinha e não precisa de instalação nem de administrador. Como o arquivo ainda não tem
                assinatura digital, o Windows pode mostrar “O Windows protegeu o computador”: clique em <strong>Mais informações</strong> e depois
                em <strong>Executar assim mesmo</strong>. Se o Chrome perguntar sobre o download, escolha <strong>Manter</strong>.
              </li>
              <li>
                No Alexandrus, escolha “Jogo ou aplicativo”. A sala encontra a Ponte sozinha (o navegador pode pedir permissão de rede local:
                permita) e mostra os programas que estão tocando som agora; escolha o jogo.
              </li>
              <li>Selecione a janela do jogo (ou o monitor) no seletor do navegador. Pronto: imagem do navegador, som da Ponte.</li>
            </ul>
            {hasDownload ? (
              <div className="form-actions" style={{ marginTop: 20 }}>
                <AeroButton icon="download" onClick={() => (window.location.href = EXE)}>
                  Baixar AlexandrusPonte.exe
                </AeroButton>
              </div>
            ) : (
              <>
                <h3>Gerar o executável</h3>
                <p>Este servidor ainda não publica o executável. A partir do código do projeto, no Windows:</p>
                <pre>
                  <code>npm run ponte:build{'\n'}native\ponte\bin\AlexandrusPonte.exe</code>
                </pre>
                <p>
                  O build usa o compilador C# que já vem com o .NET Framework do Windows; nada precisa ser instalado. Ele também copia o arquivo para
                  <code> apps/web/public/downloads</code>, e esta página passa a oferecer o download.
                </p>
              </>
            )}
          </section>

          <section className="prose-panel glass glass--frost" aria-labelledby="seguranca">
            <h2 id="seguranca">Segurança</h2>
            <ul>
              <li>Escuta só em <code>127.0.0.1:47613</code>: nenhuma outra máquina da rede alcança a Ponte.</li>
              <li>Aceita apenas páginas do Alexandrus (lista de origens permitidas). Um site qualquer não consegue ouvir seus programas.</li>
              <li>Só captura quando você escolhe um aplicativo na sala, e para quando você encerra a transmissão.</li>
              <li>O Chrome e o Edge podem pedir permissão para o site “acessar dispositivos na rede local”: é essa conversa com a Ponte.</li>
            </ul>
          </section>

          <section className="prose-panel glass glass--frost" aria-labelledby="limites">
            <h2 id="limites">Limites</h2>
            <ul>
              <li>Windows 10 versão 2004 ou mais novo, ou Windows 11. A Ponte testa a captura ao começar e avisa se o sistema não suporta.</li>
              <li>Só aparece na lista quem está tocando som pelo mixer do Windows. Abra o jogo e deixe algum som tocando.</li>
              <li>Programas em modo de áudio exclusivo e alguns jogos com anti-cheat não podem ser capturados.</li>
              <li>Se um jogo toca som por um processo auxiliar, escolha esse processo na lista (ele aparece com o próprio nome).</li>
            </ul>
          </section>
        </div>

        <aside className="side-card glass glass--frost" aria-labelledby="agora">
          <h2 id="agora">Agora, no seu computador</h2>
          {hasDownload === false && <Note tone="info">O status abaixo é real: ele tenta falar com a Ponte na porta 47613.</Note>}
          <div style={{ marginTop: 14 }}>
            <SystemCheck compact />
          </div>
        </aside>
      </div>
    </div>
  );
}
