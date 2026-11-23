import { useCallback, useEffect, useRef, useState } from 'react';
import { RADIO, RADIO_TRACKS, trackAt } from '../../content/radio.ts';
import { AeroButton } from '../ui/AeroButton.tsx';
import { Icon } from '../ui/Icon.tsx';
import './radio.css';

/*
 * Rádio Aero: o mix "nintendo frutiger aero chill mix 2025" tocando pela IFrame API do YouTube,
 * com o player sempre escondido — na tela só aparece a rádio do site (pílula e
 * cartão com arte própria), sem marca nem link do YouTube.
 *
 * Começa sozinha no primeiro clique/toque/tecla em qualquer lugar do site
 * (nenhum navegador deixa tocar som antes disso). A pílula no canto pausa,
 * pula e abre o cartão completo (lista de faixas, volume); o X do cartão volta
 * para a pílula sem parar a música.
 *
 * Atenção: player escondido e só o áudio vão contra as regras do YouTube para
 * players incorporados. Foi escolha do dono do site, ciente de que o YouTube
 * pode bloquear o player aqui (aí a rádio avisa que não carregou).
 *
 * Pausar pelos botões daqui é lembrado: quem pausou não ouve a rádio começar
 * sozinha na próxima visita. Toca em todo o site, salas incluídas. Só pausa
 * sozinha quando a sua transmissão capturaria o som do próprio navegador
 * (Ponte com "tudo menos um app", ou o app escolhido é o navegador): aí ela
 * entraria no áudio de quem assiste. Volta quando essa captura acaba.
 * O aviso vem de useRoomSession pelo evento RADIO_HOLD_EVENT.
 */

/** Evento da janela: detail = true segura a rádio, false solta. */
export const RADIO_HOLD_EVENT = 'alexandrus:radio-hold';

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const PLAYING = 1;
const POS_KEY = 'alexandrus:radio:pos';
const VOL_KEY = 'alexandrus:radio:vol';
/** A pessoa pausou a rádio: não começa sozinha de novo. */
const OFF_KEY = 'alexandrus:radio:off';

let apiPromise: Promise<YTNamespace> | null = null;

/** Carrega a IFrame API do YouTube uma vez só. */
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('youtube-api'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

function readNumber(key: string, fallback: number, min: number, max: number) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = Number(raw);
    return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, v: number) {
  try {
    localStorage.setItem(key, String(Math.round(v)));
  } catch {
    /* sem armazenamento */
  }
}

function readOff() {
  try {
    return localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

function saveOff(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch {
    /* sem armazenamento */
  }
}

function clock(t: number) {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';
/** pill = só a pílula no canto; full = cartão completo. A música independe disso. */
type Mode = 'pill' | 'full';

export function Radio() {
  const [mode, setMode] = useState<Mode>('pill');
  /** Segurada: a sua transmissão capturaria o som da rádio. */
  const [held, setHeld] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(() => readNumber(POS_KEY, RADIO.firstStart, 0, RADIO.length));
  const [volume, setVolume] = useState(() => readNumber(VOL_KEY, 40, 0, 100));
  const [list, setList] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  /** O objeto do player existe antes de ficar pronto, mas sem os métodos: só chame depois do onReady. */
  const readyRef = useRef(false);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const timeRef = useRef(time);
  timeRef.current = time;
  const listRef = useRef<HTMLOListElement>(null);
  /** Já começou alguma vez nesta visita (o clique inicial só vale uma vez). */
  const startedRef = useRef(false);
  /** Estava tocando quando foi segurada: volta a tocar quando soltar. */
  const resumeRef = useRef(false);
  const heldRef = useRef(false);

  const current = trackAt(time);
  const track = RADIO_TRACKS[current];
  /** O player, só se já estiver pronto para receber comandos. */
  const ready = () => (readyRef.current ? playerRef.current : null);

  /** Toca. Sempre depois de uma interação de quem está no site. */
  const start = useCallback(() => {
    startedRef.current = true;
    saveOff(false);
    if (playerRef.current) {
      // ainda carregando: o onReady já vai tocar
      if (readyRef.current) playerRef.current.playVideo();
      return;
    }
    setStatus('loading');
    loadApi()
      .then((YT) => {
        const el = hostRef.current;
        if (!el || playerRef.current) return;
        const mount = document.createElement('div');
        el.replaceChildren(mount);
        playerRef.current = new YT.Player(mount, {
          host: 'https://www.youtube-nocookie.com',
          videoId: RADIO.videoId,
          width: '200',
          height: '200',
          playerVars: {
            autoplay: 1,
            start: Math.floor(timeRef.current),
            playsinline: 1,
            rel: 0,
            controls: 0,
            disablekb: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              readyRef.current = true;
              setStatus('ready');
              e.target.setVolume(volumeRef.current);
              if (heldRef.current) resumeRef.current = true;
              else e.target.playVideo();
            },
            onStateChange: (e) => {
              // segurada nunca toca (entraria na transmissão): pausa e espera soltar
              if (e.data === PLAYING && heldRef.current) {
                resumeRef.current = true;
                e.target.pauseVideo();
                return;
              }
              setPlaying(e.data === PLAYING);
            },
            onError: () => setStatus('error'),
          },
        });
      })
      .catch(() => setStatus('error'));
  }, []);

  // Começa sozinha na primeira interação com o site, se a pessoa não pausou antes.
  useEffect(() => {
    if (startedRef.current || readOff()) return;
    const go = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.key === 'Tab' || e.key === 'Shift')) return;
      start();
    };
    const opts = { capture: true, once: true } as const;
    window.addEventListener('pointerdown', go, opts);
    window.addEventListener('keydown', go, opts);
    return () => {
      window.removeEventListener('pointerdown', go, opts);
      window.removeEventListener('keydown', go, opts);
    };
  }, [start]);

  // A sua transmissão capturaria a rádio: segura (pausa e lembra). Acabou: solta e volta.
  useEffect(() => {
    const onHold = (e: Event) => {
      const hold = (e as CustomEvent<boolean>).detail === true;
      if (hold === heldRef.current) return;
      heldRef.current = hold;
      setHeld(hold);
      const p = readyRef.current ? playerRef.current : null;
      if (hold) {
        if (p && p.getPlayerState() === PLAYING) {
          resumeRef.current = true;
          p.pauseVideo();
        }
      } else if (resumeRef.current) {
        resumeRef.current = false;
        p?.playVideo();
      }
    };
    window.addEventListener(RADIO_HOLD_EVENT, onHold);
    return () => window.removeEventListener(RADIO_HOLD_EVENT, onHold);
  }, []);

  // posição: acompanha a faixa e lembra onde parou
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const t = ready()?.getCurrentTime();
      if (typeof t === 'number' && Number.isFinite(t)) {
        setTime(t);
        save(POS_KEY, t >= RADIO.length - 5 ? 0 : t);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    ready()?.setVolume(volume);
    save(VOL_KEY, volume);
  }, [volume]);

  // a lista abre já mostrando a faixa atual
  useEffect(() => {
    if (!list) return;
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [list]);

  // Esc: fecha a lista, depois o cartão (a música continua)
  useEffect(() => {
    if (mode !== 'full') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (list) setList(false);
      else setMode('pill');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, list]);

  const seek = (t: number) => {
    const p = ready();
    setTime(t);
    save(POS_KEY, t);
    if (!p) return;
    p.seekTo(t, true);
    p.playVideo();
  };

  const toggle = () => {
    if (!playerRef.current) return start();
    const p = ready();
    if (!p) return;
    if (p.getPlayerState() === PLAYING) {
      p.pauseVideo();
      saveOff(true);
    } else {
      p.playVideo();
      saveOff(false);
    }
  };

  const prev = () => {
    // como num toca-discos: no começo da faixa volta para a anterior, senão reinicia esta
    const i = time - track.at > 4 ? current : Math.max(0, current - 1);
    seek(RADIO_TRACKS[i].at);
  };
  const next = () => seek(RADIO_TRACKS[Math.min(RADIO_TRACKS.length - 1, current + 1)].at);

  const subtitle = held
    ? 'Pausada: entraria na sua transmissão'
    : status === 'loading'
      ? 'Sintonizando…'
      : status === 'error'
        ? 'Não carregou agora'
        : track.title;
  const playButton = (size: 'sm' | 'md', withName: boolean) => (
    <AeroButton
      size={size}
      variant={size === 'md' ? 'blue' : 'glass'}
      iconOnly
      icon={playing ? 'pause' : 'play'}
      aria-label={playing ? (withName ? 'Pausar a rádio' : 'Pausar') : withName ? 'Tocar a rádio' : 'Tocar'}
      onClick={toggle}
      disabled={status === 'loading'}
    />
  );

  return (
    <>
      {/* O player de verdade: escondido e fora do alcance do teclado. Fica montado para não perder a posição. */}
      <div ref={hostRef} className="radio__engine" aria-hidden inert />

      {mode === 'pill' && (
        <div className="radio-launch glass glass--frost" role="group" aria-label="Rádio Aero">
          <button type="button" className="radio-launch__open" onClick={() => setMode('full')} aria-label="Abrir a Rádio Aero">
            <span className="radio-launch__disc" data-spin={playing || undefined} aria-hidden>
              <Icon name="music" />
            </span>
            <span className="radio-launch__text">
              <strong>Rádio Aero</strong>
              <span>{subtitle}</span>
            </span>
          </button>
          {playButton('sm', true)}
          {status === 'ready' && <AeroButton size="sm" variant="glass" iconOnly icon="next" aria-label="Próxima faixa" onClick={next} />}
        </div>
      )}

      <section className="radio glass glass--frost" hidden={mode !== 'full'} aria-label="Rádio Aero">
        <header className="radio__head">
          <span className="radio__title">
            <strong>Rádio Aero</strong>
            <span>Frutiger Aero chill mix</span>
          </span>
          <AeroButton size="sm" variant="red" className="aero-close" iconOnly icon="x" aria-label="Fechar (a música continua)" onClick={() => setMode('pill')} />
        </header>

        <div className="radio__art" data-playing={playing || undefined} aria-hidden>
          <span className="radio__cd">
            <Icon name="music" />
          </span>
          <span className="radio__bubble radio__bubble--a" />
          <span className="radio__bubble radio__bubble--b" />
          <span className="radio__bubble radio__bubble--c" />
          <span className="radio__art-num">
            {String(current + 1).padStart(2, '0')}
            <small>/{RADIO_TRACKS.length}</small>
          </span>
        </div>

        {held && (
          <p className="radio__error">
            Pausada enquanto você transmite: do jeito que o som está sendo capturado, a rádio entraria no áudio de quem assiste. Ela volta sozinha
            quando você parar ou trocar a fonte.
          </p>
        )}
        {status === 'error' ? (
          <p className="radio__error">A rádio não carregou agora (bloqueador de anúncios ou sem internet?). Tente de novo mais tarde.</p>
        ) : (
          <div className="radio__now" aria-live="polite">
            <span className="radio__track">{status === 'loading' ? 'Sintonizando…' : track.title}</span>
            <span className="radio__game">
              {track.from} · faixa {current + 1} de {RADIO_TRACKS.length} · {clock(time)}
            </span>
          </div>
        )}

        <div className="radio__controls">
          <AeroButton size="sm" variant="glass" iconOnly icon="prev" aria-label="Faixa anterior" onClick={prev} disabled={status !== 'ready'} />
          {playButton('md', false)}
          <AeroButton size="sm" variant="glass" iconOnly icon="next" aria-label="Próxima faixa" onClick={next} disabled={status !== 'ready'} />
          <label className="radio__vol">
            <Icon name={volume === 0 ? 'volumeOff' : 'volume'} />
            <span className="visually-hidden">Volume da rádio</span>
            <input
              className="aero-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              style={{ ['--fill' as string]: `${volume}%` }}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </label>
          <AeroButton size="sm" variant="glass" iconOnly icon="list" aria-label="Lista de faixas" aria-expanded={list} onClick={() => setList((v) => !v)} />
        </div>

        {list && (
          <ol ref={listRef} className="radio__list" aria-label="Faixas do mix">
            {RADIO_TRACKS.map((t, i) => (
              <li key={t.at}>
                <button type="button" aria-current={i === current} onClick={() => seek(t.at)} disabled={status !== 'ready'}>
                  <span className="radio__list-time">{clock(t.at)}</span>
                  <span className="radio__list-title">
                    {t.title}
                    <span>{t.from}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        <p className="radio__credit">
          Mix de {RADIO.channel} · músicas da Nintendo
        </p>
      </section>
    </>
  );
}
