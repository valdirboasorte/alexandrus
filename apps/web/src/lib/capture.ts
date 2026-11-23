import type { AudioRoute, ContentKind, SourceKind } from '@protocol';

export type { ContentKind };

/*
 * Captura de tela pelo navegador (getDisplayMedia), com as opções que fazem
 * diferença para o Alexandrus e a leitura honesta do que veio de fato.
 */

/** O que a pessoa escolheu no Alexandrus (antes do seletor do navegador). */
export type SourceChoice = 'app' | 'monitor' | 'window' | 'browser';

/** Para monitor/janela: de onde tirar o som. */
export type AudioPlan = 'ponte' | 'browser' | 'system' | 'none';

export type Resolution = '720p' | '1080p' | '1440p' | 'native';
export type Quality = 'leve' | 'equilibrada' | 'alta' | 'maxima';

export interface CaptureSettings {
  resolution: Resolution;
  fps: 30 | 60;
  quality: Quality;
  content: ContentKind;
  /** Baixa a qualidade sozinho para quem está com a rede ruim (ver rtc/adaptive.ts). */
  auto: boolean;
}

export const DEFAULT_SETTINGS: CaptureSettings = {
  resolution: '1080p',
  fps: 60,
  quality: 'equilibrada',
  content: 'motion',
  auto: true,
};

export const RESOLUTIONS: Record<Resolution, { label: string; w?: number; h?: number }> = {
  '720p': { label: '720p', w: 1280, h: 720 },
  '1080p': { label: '1080p', w: 1920, h: 1080 },
  '1440p': { label: '1440p', w: 2560, h: 1440 },
  native: { label: 'Original' },
};

/** Teto de bitrate de vídeo por espectador (bps). */
export const QUALITY_BITRATE: Record<Quality, { label: string; bps: number }> = {
  leve: { label: 'Leve', bps: 2_500_000 },
  equilibrada: { label: 'Equilibrada', bps: 6_000_000 },
  alta: { label: 'Alta', bps: 12_000_000 },
  maxima: { label: 'Máxima', bps: 20_000_000 },
};

export interface CaptureResult {
  stream: MediaStream;
  video: MediaStreamTrack;
  /** Faixa de áudio entregue pelo navegador (aba, janela ou sistema), se houver. */
  browserAudio: MediaStreamTrack | null;
  surface: SourceKind;
  /** Rota de áudio do navegador, decidida a partir do que veio. */
  browserAudioRoute: Extract<AudioRoute, 'tab' | 'window' | 'system' | 'none'>;
  label: string;
}

export class CaptureCancelled extends Error {
  constructor() {
    super('Compartilhamento cancelado.');
  }
}

function videoConstraints(s: CaptureSettings, surface: DisplayCaptureSurfaceType) {
  const r = RESOLUTIONS[s.resolution];
  const v: MediaTrackConstraints & Record<string, unknown> = {
    displaySurface: surface,
    frameRate: { ideal: s.fps, max: s.fps },
    cursor: 'always',
  };
  if (r.w && r.h) {
    v.width = { ideal: r.w, max: r.w };
    v.height = { ideal: r.h, max: r.h };
  }
  return v;
}

const SOURCE_AUDIO: MediaTrackConstraints & Record<string, unknown> = {
  // Som de jogo/música: nada de processamento de voz.
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
  sampleRate: 48000,
  // O anfitrião continua ouvindo a aba normalmente.
  suppressLocalAudioPlayback: false,
};

/**
 * Abre o seletor do navegador.
 * - wantBrowserAudio: pedir áudio ao navegador (aba/janela/sistema).
 * - allowSystemAudio: só com consentimento explícito, porque inclui a call.
 */
export async function captureDisplay(
  choice: SourceChoice,
  settings: CaptureSettings,
  opts: { wantBrowserAudio: boolean; allowSystemAudio: boolean },
): Promise<CaptureResult> {
  const surface: DisplayCaptureSurfaceType = choice === 'app' ? 'window' : choice;
  const options: DisplayMediaStreamOptions & Record<string, unknown> = {
    video: videoConstraints(settings, surface),
    audio: opts.wantBrowserAudio ? SOURCE_AUDIO : false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    monitorTypeSurfaces: 'include',
    systemAudio: opts.allowSystemAudio ? 'include' : 'exclude',
    // Chrome 141+: áudio da própria janela. Nunca 'system' aqui.
    windowAudio: opts.wantBrowserAudio ? 'window' : 'exclude',
    // Não transmitir o som que a própria página do Alexandrus toca.
    restrictOwnAudio: true,
    preferCurrentTab: false,
  };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(options);
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'NotAllowedError' || name === 'AbortError') throw new CaptureCancelled();
    throw e;
  }

  const [video] = stream.getVideoTracks();
  const audioTracks = stream.getAudioTracks();
  const got = (video.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface;
  const real: SourceKind = got === 'browser' || got === 'window' || got === 'monitor' ? got : surface;

  let browserAudio: MediaStreamTrack | null = audioTracks[0] ?? null;
  let route: CaptureResult['browserAudioRoute'] = 'none';
  if (browserAudio) {
    route = real === 'browser' ? 'tab' : real === 'window' ? 'window' : 'system';
    // A pessoa escolheu outra coisa no seletor e o navegador trouxe o som do
    // sistema inteiro sem consentimento no Alexandrus: descartar.
    if (route === 'system' && !opts.allowSystemAudio) {
      browserAudio.stop();
      stream.removeTrack(browserAudio);
      browserAudio = null;
      route = 'none';
    }
  }

  video.contentHint = contentHint(settings.content);

  return { stream, video, browserAudio, surface: real, browserAudioRoute: route, label: video.label };
}

/** Dica para o codificador: filme e jogo são imagem natural; texto é tela. */
export function contentHint(c: ContentKind): 'motion' | 'detail' {
  return c === 'detail' ? 'detail' : 'motion';
}

export const CONTENT_LABEL: Record<ContentKind, string> = {
  motion: 'Jogo',
  film: 'Filme ou série',
  detail: 'Texto e apps',
};

/** Filme pede mais banda que o padrão: no mínimo a qualidade Alta. */
export function withContent(s: CaptureSettings, content: ContentKind): CaptureSettings {
  const low = s.quality === 'leve' || s.quality === 'equilibrada';
  return { ...s, content, quality: content === 'film' && low ? 'alta' : s.quality };
}

/** Buffer de quem assiste um filme: um pouco de atraso em troca de não travar. */
export const FILM_BUFFER_MS = 500;

/** Ajusta resolução/FPS ao vivo, sem novo seletor. */
export async function applyVideoSettings(video: MediaStreamTrack, s: CaptureSettings) {
  const r = RESOLUTIONS[s.resolution];
  const c: MediaTrackConstraints = { frameRate: { ideal: s.fps, max: s.fps } };
  if (r.w && r.h) {
    c.width = { ideal: r.w, max: r.w };
    c.height = { ideal: r.h, max: r.h };
  }
  try {
    await video.applyConstraints(c);
  } catch {
    /* alguns tamanhos não se aplicam a todas as superfícies */
  }
  video.contentHint = contentHint(s.content);
}

export const SURFACE_LABEL: Record<SourceKind, string> = {
  monitor: 'Tela inteira',
  window: 'Janela',
  browser: 'Aba do navegador',
};

export const ROUTE_LABEL: Record<AudioRoute, string> = {
  none: 'Sem som',
  tab: 'Som da aba',
  window: 'Som da janela',
  system: 'Som do sistema inteiro',
  process: 'Som do aplicativo',
  'process-exclude': 'Tudo menos um app',
};
