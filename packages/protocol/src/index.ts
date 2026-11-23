/**
 * Alexandrus — protocolo compartilhado entre o navegador (apps/web) e o
 * servidor de sinalização (apps/server).
 *
 * Regras deste arquivo:
 * - Só sintaxe "apagável" de TypeScript (sem enum, sem namespace, sem
 *   parameter properties): o servidor roda este arquivo direto no Node 24
 *   com type stripping, sem etapa de build.
 * - Importe por caminho relativo (nunca por node_modules), porque o Node não
 *   remove tipos de arquivos dentro de node_modules.
 */

import type { PgAction, PgEvent } from './playground.ts';

export * from './playground.ts';

export const PROTOCOL_VERSION = 2;

/* ------------------------------------------------------------------ */
/* Códigos de sala                                                      */
/* ------------------------------------------------------------------ */

/** Sem 0/O, 1/I/L: fácil de ditar numa call. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/** "k7q2mx", "K7Q-2MX", " k7q 2mx " → "K7Q2MX"; inválido → null. */
export function normalizeRoomCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of raw) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return raw;
}

/** "K7Q2MX" → "K7Q-2MX" (só para exibir). */
export function formatRoomCode(code: string): string {
  return code.length === ROOM_CODE_LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/** Extrai o código de um link colado (".../sala/K7Q2MX") ou do próprio código. */
export function roomCodeFromInput(input: string): string | null {
  const m = input.match(/\/sala\/([A-Za-z0-9-]{6,8})/);
  return normalizeRoomCode(m ? m[1] : input);
}

/* ------------------------------------------------------------------ */
/* Modelos                                                              */
/* ------------------------------------------------------------------ */

export type Visibility = 'public' | 'private';
export type Role = 'host' | 'viewer';

/** O que está sendo capturado, segundo o próprio navegador (track.getSettings().displaySurface). */
export type SourceKind = 'monitor' | 'window' | 'browser';

/**
 * De onde vem o áudio da transmissão.
 * - none: sem áudio.
 * - tab: áudio da aba capturada (isolado pelo próprio Chrome/Edge).
 * - window: áudio da janela capturada, entregue pelo navegador (Chrome 141+,
 *   opção windowAudio). Só é marcado quando o navegador de fato devolveu uma
 *   faixa de áudio para uma captura de janela.
 * - system: áudio do sistema inteiro via Chrome (inclui Discord — risco de eco).
 * - process: áudio de um processo, via Alexandrus Ponte (WASAPI process loopback).
 * - process-exclude: tudo menos um processo (ex.: tudo menos o Discord), via Ponte.
 */
export type AudioRoute = 'none' | 'tab' | 'window' | 'system' | 'process' | 'process-exclude';

/**
 * O que está passando, segundo quem compartilha:
 * - motion: jogo (fluidez, atraso mínimo);
 * - detail: texto e apps (nitidez);
 * - film: filme/série (nitidez e um buffer maior em quem assiste, para não travar).
 */
export type ContentKind = 'motion' | 'detail' | 'film';

export interface StreamInfo {
  live: boolean;
  source: SourceKind | null;
  audio: AudioRoute;
  /** "Áudio da fonte" ligado. Desligado = a faixa continua, mas envia silêncio. */
  audioEnabled: boolean;
  /** Nome do processo quando audio é process/process-exclude (ex.: "eldenring.exe"). */
  audioProcess?: string | null;
  width?: number;
  height?: number;
  fps?: number;
  startedAt?: number | null;
  /** Ausente = motion (páginas antigas). */
  content?: ContentKind;
}

export const OFFLINE_STREAM: StreamInfo = {
  live: false,
  source: null,
  audio: 'none',
  audioEnabled: false,
  audioProcess: null,
  startedAt: null,
};

/** Uma tela ao vivo na sala. Qualquer participante pode ter uma (até LIMITS.maxPresenters). */
export interface LiveStream {
  /** Id de quem está compartilhando (o mesmo de PeerInfo.id). */
  peerId: string;
  name: string;
  /** É o anfitrião da sala. */
  host: boolean;
  info: StreamInfo;
}

export interface RoomSummary {
  code: string;
  name: string;
  hostName: string;
  visibility: Visibility;
  hostOnline: boolean;
  viewers: number;
  maxViewers: number;
  createdAt: number;
  /**
   * A tela em destaque: a do anfitrião se ele estiver ao vivo, senão a primeira
   * que começou, senão OFFLINE_STREAM. É o que as listas de salas mostram.
   */
  stream: StreamInfo;
  /** Todas as telas ao vivo agora, na ordem em que começaram (só live: true). */
  streams: LiveStream[];
  /** Participantes (além do anfitrião) podem compartilhar a tela. */
  shareOpen: boolean;
  maxPresenters: number;
}

export interface PeerInfo {
  id: string;
  name: string;
  role: Role;
  joinedAt: number;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */

export interface CreateRoomRequest {
  name: string;
  hostName: string;
  visibility: Visibility;
}

export interface CreateRoomResponse {
  room: RoomSummary;
  /** Segredo do anfitrião. Guardado só no navegador de quem criou. */
  hostKey: string;
}

export interface RoomListResponse {
  rooms: RoomSummary[];
}

export interface RoomResponse {
  room: RoomSummary;
}

export interface IceConfigResponse {
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
  /** Segundos até as credenciais TURN expirarem (0 = sem TURN). */
  ttl: number;
}

export interface HealthResponse {
  ok: true;
  version: string;
  protocol: number;
  rooms: number;
}

export interface ApiError {
  error: ErrorCode;
  message: string;
}

export const LIMITS = {
  roomNameMax: 60,
  personNameMax: 32,
  /** Topologia em malha: quem compartilha envia uma cópia para cada pessoa que assiste. */
  defaultMaxViewers: 12,
  /** Telas ao vivo ao mesmo tempo na mesma sala. */
  maxPresenters: 4,
  /** Quanto tempo a sala espera o anfitrião voltar (recarregou a página, caiu a rede). */
  hostGraceMs: 60_000,
  /** Sala criada e nunca aberta pelo anfitrião expira depois disso. */
  unclaimedRoomMs: 10 * 60_000,
  maxMessageBytes: 64 * 1024,
} as const;

/* ------------------------------------------------------------------ */
/* WebSocket /ws                                                        */
/* ------------------------------------------------------------------ */

/**
 * Sinalização WebRTC entre dois participantes. Cada tela ao vivo tem uma
 * conexão por pessoa que assiste, e quem assiste é quem pede:
 *
 *   espectador → apresentador: request-offer (quero assistir), answer, bye (parei)
 *   apresentador → espectador: offer
 *
 * Duas pessoas podem assistir uma à outra ao mesmo tempo, então o ICE diz de
 * que lado veio: side 'pub' = de quem compartilha, 'sub' = de quem assiste.
 */
export type SignalData =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | {
      kind: 'ice';
      side: 'pub' | 'sub';
      candidate: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } | null;
    }
  /** Espectador pede uma oferta nova (começou a assistir, ICE falhou, recarregou o player). */
  | { kind: 'request-offer' }
  /** Espectador parou de assistir esta tela: o apresentador fecha a conexão. */
  | { kind: 'bye' };

export type ClientMessage =
  /** v = PROTOCOL_VERSION do cliente; versões antigas recebem 'outdated'. */
  | { t: 'join'; v: number; code: string; role: 'host'; hostKey: string; name: string }
  | { t: 'join'; v: number; code: string; role: 'viewer'; name: string }
  | { t: 'signal'; to: string; data: SignalData }
  /**
   * Estado da MINHA tela (ao vivo, fonte, áudio). O anfitrião sempre pode;
   * os outros só com shareOpen, e só se houver vaga (maxPresenters).
   */
  | { t: 'stream'; info: StreamInfo }
  /** Só o anfitrião: renomear sala, visibilidade, deixar os outros compartilharem. */
  | { t: 'room-update'; name?: string; visibility?: Visibility; shareOpen?: boolean }
  | { t: 'ping'; ts: number }
  /** Playground (só depois de 'joined', se o servidor anunciou PG_FEATURE). */
  | { t: 'pg'; a: PgAction }
  | { t: 'leave' }
  /** Só o anfitrião: encerra a sala para todos. */
  | { t: 'end' };

export type ServerMessage =
  /** peers = todos os outros participantes já na sala (anfitrião e espectadores). */
  | { t: 'joined'; you: string; role: Role; room: RoomSummary; peers: PeerInfo[]; features?: string[] }
  /** Enviados a todos os outros participantes. */
  | { t: 'peer-joined'; peer: PeerInfo }
  | { t: 'peer-left'; peerId: string }
  | { t: 'room'; room: RoomSummary }
  | { t: 'signal'; from: string; data: SignalData }
  | { t: 'ended'; reason: EndReason }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; ts: number }
  | { t: 'pg'; e: PgEvent };

export type EndReason = 'host-ended' | 'host-timeout' | 'expired';

export type ErrorCode =
  | 'room-not-found'
  | 'bad-host-key'
  | 'room-full'
  | 'host-already-connected'
  | 'not-joined'
  | 'not-allowed'
  | 'peer-not-found'
  | 'bad-request'
  | 'rate-limited'
  /** Já há LIMITS.maxPresenters telas ao vivo. */
  | 'stage-full'
  /** O anfitrião não deixou os participantes compartilharem. */
  | 'share-closed'
  /** Página antiga (protocolo anterior): recarregar resolve. */
  | 'outdated';

/* ------------------------------------------------------------------ */
/* Alexandrus Ponte (app auxiliar do Windows) — ws://127.0.0.1:47613     */
/* ------------------------------------------------------------------ */

export const PONTE_DEFAULT_PORT = 47613;

export interface PonteAudioSession {
  pid: number;
  name: string;
  title: string;
  state: 'active' | 'inactive' | 'expired';
  isSystemSounds: boolean;
}

export type PonteClientMessage =
  | { t: 'hello' }
  | { t: 'list' }
  | { t: 'start'; pid: number; mode: 'include' | 'exclude' }
  | { t: 'stop' }
  | { t: 'ping' };

export type PonteServerMessage =
  | { t: 'hello'; app: 'alexandrus-ponte'; version: string; windowsBuild: number; processLoopback: boolean }
  | { t: 'sessions'; items: PonteAudioSession[] }
  | { t: 'started'; pid: number; name: string; mode: 'include' | 'exclude'; sampleRate: number; channels: number; format: 's16le' }
  | { t: 'stopped'; reason: 'requested' | 'process-exited' | 'error' | 'replaced' }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong' };
