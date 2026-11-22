import { Link } from 'react-router';
import { PHOTO_CREDITS } from '../content/credits.ts';
import './pages.css';

export function AboutPage() {
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Sobre o Alexandrus</h1>
        <p className="page-lead">Um lugar para mostrar o seu mundo para quem está na call com você: o jogo, o filme, o desenho, a planilha. Com o som certo e nada mais.</p>
      </header>

      <section className="prose-panel glass glass--frost" aria-labelledby="ideia">
        <h2 id="ideia">A ideia</h2>
        <p>
          Compartilhar a tela costuma vir com um preço: ou o som não vai, ou vai tudo, inclusive a call, e todo mundo passa a se ouvir em eco. O Alexandrus
          existe para separar essas águas: a imagem e o som da fonte vão por aqui; a conversa fica onde já está.
        </p>
        <p>
          O visual lembra a tecnologia otimista de 2008, de céu azul, vidro e água limpa, porque é isso que a ferramenta quer ser: transparente e calma.
        </p>
      </section>

      <section className="prose-panel glass glass--frost" aria-labelledby="principios">
        <h2 id="principios">O que o Alexandrus promete</h2>
        <ul>
          <li><strong>Sem microfone.</strong> Nenhuma parte do código pede acesso ao microfone ou à câmera.</li>
          <li><strong>Sem conta.</strong> Você entra com um nome qualquer; o navegador lembra dele só para você.</li>
          <li><strong>Salas efêmeras.</strong> Elas vivem na memória do servidor e somem um minuto depois que o anfitrião sai.</li>
          <li><strong>Vídeo direto.</strong> A imagem vai do anfitrião para cada espectador, criptografada (DTLS-SRTP). O servidor só apresenta as pessoas.</li>
          <li><strong>Nada fingido.</strong> Se algo não funciona no seu navegador ou sistema, a interface diz o quê e por quê.</li>
        </ul>
      </section>

      <section className="prose-panel glass glass--frost" aria-labelledby="estado">
        <h2 id="estado">Em que pé está</h2>
        <ul>
          <li>Funciona hoje: salas públicas e privadas, transmissão de tela/janela/aba pelo navegador, áudio de aba, áudio de aplicativo pela Ponte, controles de qualidade, tela cheia, volume e estatísticas reais.</li>
          <li>Ainda não existe: servidor de mídia (SFU) para salas grandes, instalador assinado da Ponte, contas e salas fixas.</li>
        </ul>
        <p>
          Detalhes técnicos em <Link to="/como-funciona">Como funciona</Link>.
        </p>
      </section>

      <section className="prose-panel glass glass--frost" aria-labelledby="creditos">
        <h2 id="creditos">Créditos das fotos</h2>
        <ul>
          {PHOTO_CREDITS.map((c) => (
            <li key={c.file}>
              <a href={c.page} target="_blank" rel="noreferrer">“{c.title}”</a>, por {c.creator}. Licença{' '}
              <a href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a>, via Wikimedia Commons.
            </li>
          ))}
        </ul>
        <p>Cenário, ícones, peixes, nuvens e o globo foram desenhados em código para o Alexandrus.</p>
      </section>
    </div>
  );
}
