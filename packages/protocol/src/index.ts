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

export const PROTOCOL_VERSION = 1;

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
}

export const OFFLINE_STREAM: StreamInfo = {
  live: false,
  source: null,
  audio: 'none',
  audioEnabled: false,
  audioProcess: null,
  startedAt: null,
};

export interface RoomSummary {
  code: string;
  name: string;
  hostName: string;
  visibility: Visibility;
  hostOnline: boolean;
  viewers: number;
  maxViewers: number;
  createdAt: number;
  stream: StreamInfo;
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
  /** Topologia em malha: o anfitrião envia uma cópia para cada espectador. */
  defaultMaxViewers: 12,
  /** Quanto tempo a sala espera o anfitrião voltar (recarregou a página, caiu a rede). */
  hostGraceMs: 60_000,
  /** Sala criada e nunca aberta pelo anfitrião expira depois disso. */
  unclaimedRoomMs: 10 * 60_000,
  maxMessageBytes: 64 * 1024,
} as const;

/* ------------------------------------------------------------------ */
/* WebSocket /ws                                                        */
/* ------------------------------------------------------------------ */

export type SignalData =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } | null }
  /** Espectador pede uma nova oferta (entrou atrasado, ICE falhou, recarregou o player). */
  | { kind: 'request-offer' };

export type ClientMessage =
  | { t: 'join'; code: string; role: 'host'; hostKey: string; name: string }
  | { t: 'join'; code: string; role: 'viewer'; name: string }
  | { t: 'signal'; to: string; data: SignalData }
  /** Só o anfitrião: estado da transmissão (ao vivo, fonte, áudio). */
  | { t: 'stream'; info: StreamInfo }
  /** Só o anfitrião: renomear sala / mudar visibilidade. */
  | { t: 'room-update'; name?: string; visibility?: Visibility }
  | { t: 'ping'; ts: number }
  | { t: 'leave' }
  /** Só o anfitrião: encerra a sala para todos. */
  | { t: 'end' };

export type ServerMessage =
  | { t: 'joined'; you: string; role: Role; room: RoomSummary; peers: PeerInfo[] }
  | { t: 'peer-joined'; peer: PeerInfo }
  | { t: 'peer-left'; peerId: string }
  | { t: 'room'; room: RoomSummary }
  | { t: 'signal'; from: string; data: SignalData }
  | { t: 'ended'; reason: EndReason }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; ts: number };

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
  | 'rate-limited';

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
