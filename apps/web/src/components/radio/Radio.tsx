import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { RADIO, RADIO_TRACKS, trackAt } from '../../content/radio.ts';
import { AeroButton } from '../ui/AeroButton.tsx';
import { Icon } from '../ui/Icon.tsx';
import './radio.css';

/*
 * Rádio Aero: o mix do YouTube tocando pelo player oficial (IFrame API), num
 * cartão de vidro no canto. Regras do YouTube que este componente segue:
 * - o player fica visível enquanto toca (mínimo 200×200, nada por cima dele);
 *   fechar o cartão pausa, então nunca toca "escondido";
 * - só começa a tocar depois do clique de quem abriu;
 * - youtube-nocookie.com: sem cookies de rastreio até a pessoa dar play.
 * Nas salas (/sala/…) a rádio pausa e some: não pode vazar para dentro de uma
 * transmissão nem tocar por cima de uma.
 */

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

function clock(t: number) {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

export function Radio() {
  const { pathname } = useLocation();
  const inRoom = pathname.startsWith('/sala/');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(() => readNumber(POS_KEY, RADIO.firstStart, 0, RADIO.length));
  const [volume, setVolume] = useState(() => readNumber(VOL_KEY, 60, 0, 100));
  const [list, setList] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const timeRef = useRef(time);
  timeRef.current = time;
  const listRef = useRef<HTMLOListElement>(null);

  const current = trackAt(time);
  const track = RADIO_TRACKS[current];

  /** Abre o cartão e toca (o clique de quem abriu é o que libera o som). */
  const openAndPlay = useCallback(() => {
    setOpen(true);
    const p = playerRef.current;
    if (p) {
      p.playVideo();
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
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            start: Math.floor(timeRef.current),
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              setStatus('ready');
              e.target.setVolume(volumeRef.current);
              e.target.playVideo();
            },
            onStateChange: (e) => setPlaying(e.data === PLAYING),
            onError: () => setStatus('error'),
          },
        });
      })
      .catch(() => setStatus('error'));
  }, []);

  /** Fechar = pausar. A rádio nunca toca com o player escondido. */
  const close = useCallback(() => {
    playerRef.current?.pauseVideo();
    setPlaying(false);
    setOpen(false);
    setList(false);
  }, []);

  // entrou numa sala: pausa e fecha
  useEffect(() => {
    if (inRoom) close();
  }, [inRoom, close]);

  // posição: acompanha a faixa e lembra onde parou
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const t = playerRef.current?.getCurrentTime();
      if (typeof t === 'number' && Number.isFinite(t)) {
        setTime(t);
        save(POS_KEY, t >= RADIO.length - 5 ? 0 : t);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    playerRef.current?.setVolume(volume);
    save(VOL_KEY, volume);
  }, [volume]);

  // a lista abre já mostrando a faixa atual
  useEffect(() => {
    if (!list) return;
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [list]);

  // Esc fecha a lista, depois o cartão
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (list) setList(false);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, list, close]);

  const seek = (t: number) => {
    const p = playerRef.current;
    setTime(t);
    save(POS_KEY, t);
    if (!p) return;
    p.seekTo(t, true);
    p.playVideo();
  };

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return openAndPlay();
    if (p.getPlayerState() === PLAYING) p.pauseVideo();
    else p.playVideo();
  };

  const prev = () => {
    // como num toca-discos: no começo da faixa volta para a anterior, senão reinicia esta
    const i = time - track.at > 4 ? current : Math.max(0, current - 1);
    seek(RADIO_TRACKS[i].at);
  };
  const next = () => seek(RADIO_TRACKS[Math.min(RADIO_TRACKS.length - 1, current + 1)].at);

  return (
    <>
      {!open && !inRoom && (
        <button type="button" className="radio-launch glass glass--frost" onClick={openAndPlay} aria-label="Abrir a Rádio Aero e tocar">
          <span className="radio-launch__disc" aria-hidden>
            <Icon name="music" />
          </span>
          <span className="radio-launch__text">
            <strong>Rádio Aero</strong>
            <span>{track.title}</span>
          </span>
        </button>
      )}

      {/* Fica montado mesmo fechado ou numa sala: o player do YouTube continua de onde parou. */}
      <section className="radio glass glass--frost" hidden={!open || inRoom} aria-label="Rádio Aero">
        <header className="radio__head">
          <span className="radio__disc" data-spin={playing || undefined} aria-hidden>
            <Icon name="music" />
          </span>
          <span className="radio__title">
            <strong>Rádio Aero</strong>
            <span>pelo YouTube · {RADIO.channel}</span>
          </span>
          <AeroButton size="sm" variant="glass" iconOnly icon="x" aria-label="Fechar e pausar a rádio" onClick={close} />
        </header>

        {/* O player do YouTube: sempre visível enquanto toca, nada por cima. */}
        <div className="radio__screen">
          <div ref={hostRef} className="radio__player" />
          {status === 'loading' && <p className="radio__msg">Sintonizando…</p>}
          {status === 'error' && (
            <p className="radio__msg">
              O player do YouTube não carregou aqui (bloqueador de anúncios ou sem internet?).{' '}
              <a href={`https://www.youtube.com/watch?v=${RADIO.videoId}&t=${Math.floor(time)}s`} target="_blank" rel="noreferrer">
                Ouvir no YouTube
              </a>
            </p>
          )}
        </div>

        <div className="radio__now" aria-live="polite">
          <span className="radio__track">{track.title}</span>
          <span className="radio__game">
            {track.from} · faixa {current + 1} de {RADIO_TRACKS.length} · {clock(time)}
          </span>
        </div>

        <div className="radio__controls">
          <AeroButton size="sm" variant="glass" iconOnly icon="prev" aria-label="Faixa anterior" onClick={prev} disabled={status !== 'ready'} />
          <AeroButton
            size="md"
            variant="blue"
            iconOnly
            icon={playing ? 'pause' : 'play'}
            aria-label={playing ? 'Pausar' : 'Tocar'}
            onClick={toggle}
            disabled={status === 'loading'}
          />
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
          <AeroButton
            size="sm"
            variant="glass"
            iconOnly
            icon="list"
            aria-label="Lista de faixas"
            aria-expanded={list}
            onClick={() => setList((v) => !v)}
          />
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
          Mix “{RADIO.title}”, de{' '}
          <a href={RADIO.channelUrl} target="_blank" rel="noreferrer">
            {RADIO.channel}
          </a>
          , tocando direto do YouTube. Músicas © Nintendo.{' '}
          <a href={`https://www.youtube.com/watch?v=${RADIO.videoId}`} target="_blank" rel="noreferrer">
            Ver no YouTube
          </a>
        </p>
      </section>
    </>
  );
}
