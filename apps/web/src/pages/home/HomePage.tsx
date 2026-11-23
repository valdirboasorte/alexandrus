import type { CSSProperties } from 'react';
import { TopNav } from '../../components/layout/TopNav.tsx';
import { SiteFooter } from '../../components/layout/SiteFooter.tsx';
import { CodeEntry } from '../../components/room/CodeEntry.tsx';
import { SystemCheck } from '../../components/check/SystemCheck.tsx';
import { AeroLink } from '../../components/ui/AeroButton.tsx';
import { Bubbles, Clouds, GlassCity, GlassOrb, Hills, LightRays, Seaweed, Sun, WaterSurface } from '../../components/scenery/parts.tsx';
import { FishSchool } from '../../components/scenery/Scene.tsx';
import '../../components/scenery/scenery.css';
import { AudioRoutes } from './AudioRoutes.tsx';
import { HeroScreen } from './HeroScreen.tsx';
import './home.css';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function HomePage() {
  return (
    <div className="home">
      <TopNav />
      {/* ---------------- céu, campo e a linha d'água ---------------- */}
      <section className="hero" aria-labelledby="hero-title" data-loops>
        <div className="scene" aria-hidden>
          <div className="scene__sky" />
          <Sun />
          <Clouds />
          <GlassCity />
          <GlassOrb className="hero__orb-big" style={{ '--size': 'clamp(150px, 15vw, 250px)', '--delay': '-2s' } as Vars} />
          <GlassOrb className="hero__orb-small" style={{ '--size': 'clamp(36px, 3.4vw, 58px)', '--delay': '-5s' } as Vars} />
          <GlassOrb className="hero__orb-tiny" style={{ '--size': '30px', '--delay': '-7s' } as Vars} />
          <Hills />
        </div>

        <div className="page hero__content vt-page" id="conteudo" style={{ viewTransitionName: 'page-inicio' }}>
          <div className="hero__copy">
            <h1 id="hero-title" className="hero__title">
              Compartilhe seu mundo.
            </h1>
            <p className="hero__lead">
              Sua tela, seu jogo, seu som.
              <br />
              Ao vivo com quem você quiser.
            </p>
            <div className="hero__actions">
              <AeroLink to="/criar" icon="monitor" chevron>
                Compartilhar minha tela
              </AeroLink>
              <AeroLink to="/entrar" variant="green" icon="users" chevron>
                Entrar em uma sala
              </AeroLink>
            </div>
            <div className="hero__code">
              <CodeEntry />
            </div>
          </div>
          <div className="hero__visual">
            <HeroScreen />
          </div>
        </div>

        <div className="hero__water" aria-hidden>
          <WaterSurface />
          <LightRays count={4} />
          <Bubbles count={12} seed={3} />
          <FishSchool />
          <Seaweed className="seaweed--left" />
          <Seaweed className="seaweed--right" />
        </div>
      </section>

      {/* ---------------- debaixo d'água: o som ---------------- */}
      <div className="depths" data-loops>
        <div className="depths__light" aria-hidden>
          <LightRays count={5} />
          <Bubbles count={10} seed={41} className="depths__bubbles" />
        </div>

        <section className="page depths__section audio-section" aria-labelledby="som-title">
          <div className="audio-section__head">
            <h2 id="som-title" className="section-title">
              O som do jogo vai. A voz fica no Discord.
            </h2>
            <p className="section-lead">
              O Alexandrus leva a imagem e o áudio da fonte que você escolher. A call e o microfone ficam de fora, então ninguém ouve a própria voz voltando
              nem o som em dobro.
            </p>
          </div>
          <div>
            <AudioRoutes />
          </div>
          <figure className="porthole porthole--fish">
            <img src="/fotos/peixe-imperador.jpg" width={1920} height={1304} alt="Peixe-imperador listrado de azul e amarelo nadando num aquário" loading="lazy" decoding="async" />
          </figure>
        </section>

        <section className="page depths__section how-short" aria-labelledby="passos-title">
          <h2 id="passos-title" className="section-title section-title--center">
            Três gestos, e seus amigos já estão vendo.
          </h2>
          {/* Como o instalador do Windows 7: uma trilha só, os três passos em sequência. */}
          <ol className="setup glass glass--frost">
            <li className="setup__step">
              <span className="step__bubble" aria-hidden>
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              </span>
              <h3 className="setup__title">Crie a sala</h3>
              <p>Dê um nome, escolha se ela aparece na lista pública e pronto: um código de seis letras e um link nascem na hora.</p>
            </li>
            <li className="setup__step">
              <span className="step__bubble step__bubble--green" aria-hidden>
                <svg viewBox="0 0 24 24"><path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 16H5a1.5 1.5 0 0 1-1.5-1.5v-9ZM9 20h6M12 16v4" /></svg>
              </span>
              <h3 className="setup__title">Escolha a fonte</h3>
              <p>Tela inteira, uma janela, uma aba ou um jogo. Ligue o “Áudio da fonte” e diga o que vai passar: jogo, filme ou texto.</p>
            </li>
            <li className="setup__step">
              <span className="step__bubble step__bubble--aqua" aria-hidden>
                <svg viewBox="0 0 24 24"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></svg>
              </span>
              <h3 className="setup__title">Mande o link</h3>
              <p>Cole no chat do Discord. Quem clicar entra direto na transmissão, no computador ou no celular, sem criar conta.</p>
            </li>
          </ol>
          <div className="how-short__more">
            <AeroLink to="/como-funciona" variant="glass" size="md" icon="help" chevron>
              O que cada tipo de captura consegue levar
            </AeroLink>
          </div>
        </section>

        <section className="page depths__section check-section" aria-labelledby="pronto-title">
          <div className="check-section__copy">
            <h2 id="pronto-title" className="section-title">
              Seu computador está pronto?
            </h2>
            <p className="section-lead">
              Esta verificação roda agora, no seu navegador: ela confere a captura de tela, o vídeo em tempo real, o servidor e se a Alexandrus Ponte está
              aberta para levar o som de jogos.
            </p>
            <figure className="porthole porthole--shark">
              <img src="/fotos/tubarao-baleia.jpg" width={1024} height={701} alt="Tubarão-baleia nadando em água azul atravessada por raios de sol" loading="lazy" decoding="async" />
            </figure>
          </div>
          <div className="check-section__panel glass glass--frost">
            <SystemCheck />
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}
