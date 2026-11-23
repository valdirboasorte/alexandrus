import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/ui/Icon.tsx';
import { AeroLink } from '../components/ui/AeroButton.tsx';
import './pages.css';

const Yes = ({ children }: { children: ReactNode }) => (
  <span className="yes">
    <Icon name="check" strokeWidth={2.6} />
    {children}
  </span>
);
const No = ({ children }: { children: ReactNode }) => (
  <span className="no">
    <Icon name="x" strokeWidth={2.6} />
    {children}
  </span>
);
const Meh = ({ children }: { children: ReactNode }) => (
  <span className="meh">
    <Icon name="alert" />
    {children}
  </span>
);

export function HowItWorksPage() {
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Como funciona, sem letras miúdas</h1>
        <p className="page-lead">
          O Alexandrus usa o que o navegador já faz bem (capturar a tela e transmitir em tempo real) e completa com a Alexandrus Ponte o que o navegador não
          faz: separar o som de um único aplicativo.
        </p>
      </header>

      <section className="prose-panel glass glass--frost" aria-labelledby="fontes">
        <h2 id="fontes">O que cada captura leva</h2>
        <p>
          Você escolhe a fonte no Alexandrus e confirma no seletor do próprio navegador. Depois que a captura começa, o Alexandrus lê o que o navegador
          realmente entregou e mostra isso na sala: se não veio som, a sala diz que não veio.
        </p>
        <div className="caps-table-wrap">
          <table className="caps-table">
            <thead>
              <tr>
                <th scope="col">Fonte</th>
                <th scope="col">Imagem</th>
                <th scope="col">Som</th>
                <th scope="col">Discord fica de fora?</th>
                <th scope="col">Precisa de</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Aba do navegador</td>
                <td><Yes>A aba</Yes></td>
                <td><Yes>Só o som da aba</Yes></td>
                <td><Yes>Sim</Yes></td>
                <td>Chrome ou Edge</td>
              </tr>
              <tr>
                <td>Jogo ou aplicativo</td>
                <td><Yes>A janela do programa</Yes></td>
                <td><Yes>Só o som do app escolhido</Yes></td>
                <td><Yes>Sim</Yes></td>
                <td>
                  Chrome/Edge recentes (“Compartilhar também o áudio do app” no seletor); em navegadores sem essa opção, a{' '}
                  <Link to="/ponte">Ponte</Link> no Windows
                </td>
              </tr>
              <tr>
                <td>Tela inteira</td>
                <td><Yes>O monitor</Yes></td>
                <td><Meh>Pela Ponte, ou o sistema inteiro</Meh></td>
                <td><Meh>Com a Ponte, sim. Com o som do sistema, não</Meh></td>
                <td>Chrome ou Edge; a Ponte para som isolado</td>
              </tr>
              <tr>
                <td>Microfone</td>
                <td>—</td>
                <td><No>Nunca capturado</No></td>
                <td>—</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="prose-panel glass glass--frost" aria-labelledby="varias">
        <h2 id="varias">Várias telas na mesma sala</h2>
        <p>
          Qualquer pessoa na sala pode compartilhar a própria tela, até quatro ao mesmo tempo. Cada tela vira uma aba no palco: quem assiste escolhe qual ver,
          ou liga “Lado a lado” para ver todas. O som vem de uma tela por vez (a que você escolher), para não embolar.
        </p>
        <p>
          Cada pessoa só recebe as telas que está vendo, então ninguém gasta internet com o que não está na tela. O anfitrião pode desligar “Todos podem
          compartilhar a tela”: aí só ele compartilha, e quem estava no ar sai na hora.
        </p>
      </section>

      <section className="prose-panel glass glass--frost" aria-labelledby="eco">
        <h2 id="eco">Por que não dá eco</h2>
        <p>
          Eco acontece quando a call volta para dentro dela mesma. Se um programa captura “tudo o que o Windows está tocando”, ele leva junto as vozes do
          Discord, e quem fala ouve a própria voz com atraso.
        </p>
        <p>
          O Alexandrus nunca abre o microfone e, com a Ponte, captura o áudio <strong>de um processo só</strong>, usando a mesma API do Windows que o OBS usa
          na “Captura de áudio de aplicativo” (WASAPI process loopback). O Discord continua cuidando da voz; o Alexandrus, do jogo.
        </p>
        <p>
          Do lado de quem assiste vale uma dica: com caixas de som, o microfone dessa pessoa pode captar o som do jogo e devolvê-lo para a call. Fone de
          ouvido resolve.
        </p>
      </section>

      <section className="prose-panel glass glass--frost" aria-labelledby="latencia">
        <h2 id="latencia">Baixa latência, de verdade</h2>
        <ul>
          <li>Conexão direta entre o anfitrião e cada espectador (WebRTC), sem servidor de vídeo no meio.</li>
          <li>O player pede ao navegador o menor buffer possível; a sala mostra o atraso de rede real (RTT), perda de pacotes e FPS recebidos.</li>
          <li>
            Você diz o que vai passar: <strong>jogo</strong> prioriza fluidez e o menor atraso; <strong>filme ou série</strong> usa mais banda, imagem
            mais nítida e meio segundo de folga em quem assiste, para não travar; <strong>texto e apps</strong> priorizam a nitidez das letras.
          </li>
          <li>Áudio em Opus estéreo a 192 kbps, sem cancelamento de eco nem supressão de ruído, que estragariam música e efeitos.</li>
        </ul>
        <h3>Limites honestos</h3>
        <ul>
          <li>Cada espectador recebe uma cópia direta do anfitrião: o upload da sua internet limita quantas pessoas assistem bem. O padrão é até 12 por sala.</li>
          <li>Jogos em tela cheia exclusiva podem aparecer pretos na captura de janela. Use “tela cheia sem bordas” ou capture o monitor.</li>
          <li>Alguns jogos com anti-cheat e programas em modo de áudio exclusivo não deixam o som ser capturado por processo.</li>
          <li>Netflix, Prime Video, Disney+ e outros serviços com proteção contra cópia costumam aparecer pretos em qualquer compartilhamento de tela.</li>
          <li>Em redes muito restritas (algumas empresas e operadoras móveis) a conexão direta falha; é preciso configurar um servidor TURN no servidor do Alexandrus.</li>
        </ul>
      </section>

      <div className="form-actions" style={{ marginTop: 28 }}>
        <AeroLink to="/criar" variant="green" icon="plus">
          Criar sala
        </AeroLink>
        <AeroLink to="/ponte" variant="glass" icon="bridge" chevron>
          Conhecer a Ponte
        </AeroLink>
      </div>
    </div>
  );
}
