import {
  LIMITS,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  type ApiError,
  type CreateRoomResponse,
  type ErrorCode,
  type HealthResponse,
  type IceConfigResponse,
  type RoomListResponse,
  type RoomResponse,
  type Visibility,
} from '../../../packages/protocol/src/index.ts';
import type { Env } from './env.ts';

export { Room } from './room.ts';
export { Lobby } from './lobby.ts';

const MAX_BODY = 8 * 1024;

class HttpError extends Error {
  status: number;
  code: ErrorCode;
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const list = (v: string | undefined): string[] => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const num = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : def;
};
const allowedOf = (env: Env): string[] => list(env.ALLOWED_ORIGINS).map((o) => o.replace(/\/$/, ''));

function isOriginAllowed(req: Request, allowed: string[]): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) return true;
  if (allowed.length === 0) return true;
  if (allowed.includes(origin)) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

function corsHeaders(req: Request, allowed: string[]): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}

function jsonError(status: number, error: ErrorCode, message: string, extra: Record<string, string> = {}): Response {
  const body: ApiError = { error, message };
  return json(status, body, extra);
}

function randomCode(): string {
  const buf = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  let code = '';
 
  for (const b of buf) code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return code;
}

async function iceConfig(env: Env): Promise<IceConfigResponse> {
  const iceServers: IceConfigResponse['iceServers'] = [];
  const stun = list(env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478');
  if (stun.length) iceServers.push({ urls: stun });
  const turn = list(env.TURN_URLS);
  if (turn.length && env.TURN_SECRET) {
    const ttl = num(env.TURN_TTL, 3600);
    const username = `${Math.floor(Date.now() / 1000) + ttl}:alexandrus`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TURN_SECRET), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username)));
    let s = '';
    for (const b of sig) s += String.fromCharCode(b);
    iceServers.push({ urls: turn, username, credential: btoa(s) });
    return { iceServers, ttl };
  }
  return { iceServers, ttl: 0 };
}

async function readBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) throw new HttpError(413, 'bad-request', 'Corpo da requisição grande demais.');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'bad-request', 'JSON inválido.');
  }
}

async function createRoom(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (env.ROOM_CREATE) {
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.ROOM_CREATE.limit({ key: ip });
    if (!success) return jsonError(429, 'rate-limited', 'Muitas salas criadas. Tente de novo em instantes.', cors);
  }
  const body = await readBody(req);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'bad-request', 'Requisição inválida.');
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const hostName = str(b.hostName) || 'Anfitrião';
  if (hostName.length > LIMITS.personNameMax) throw new HttpError(400, 'bad-request', `O seu nome pode ter no máximo ${LIMITS.personNameMax} caracteres.`);
  const name = str(b.name) || `Sala de ${hostName}`;
  if (name.length > LIMITS.roomNameMax) throw new HttpError(400, 'bad-request', `O nome da sala pode ter no máximo ${LIMITS.roomNameMax} caracteres.`);
  let visibility: Visibility = 'private';
  if (b.visibility !== undefined) {
    if (b.visibility !== 'public' && b.visibility !== 'private') throw new HttpError(400, 'bad-request', 'Visibilidade inválida.');
    visibility = b.visibility;
  }
  const maxViewers = num(env.MAX_VIEWERS, LIMITS.defaultMaxViewers);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.init({ code, name, hostName, visibility, maxViewers });
    if ('taken' in res) continue;
    const out: CreateRoomResponse = { room: res.room, hostKey: res.hostKey };
    return json(201, out, cors);
  }
  throw new HttpError(503, 'bad-request', 'Não foi possível gerar um código de sala único.');
}

async function handleApi(req: Request, env: Env, pathname: string): Promise<Response> {
  const allowed = allowedOf(env);
  if (!isOriginAllowed(req, allowed)) return jsonError(403, 'not-allowed', 'Origem não permitida.');
  const cors = corsHeaders(req, allowed);
  const method = req.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const lobby = () => env.LOBBY.get(env.LOBBY.idFromName('lobby'));

  if (pathname === '/api/health' && method === 'GET') {
    const out: HealthResponse = { ok: true, version: '0.1.0', protocol: PROTOCOL_VERSION, rooms: await lobby().count() };
    return json(200, out, cors);
  }
  if (pathname === '/api/ice' && method === 'GET') return json(200, await iceConfig(env), cors);
  if (pathname === '/api/rooms') {
    if (method === 'POST') return createRoom(req, env, cors);
    if (method === 'GET') {
      const out: RoomListResponse = { rooms: await lobby().list() };
      return json(200, out, cors);
    }
    return jsonError(405, 'bad-request', 'Método não permitido.', cors);
  }
  const m = pathname.match(/^\/api\/rooms\/([^/]+)$/);
  if (m) {
    if (method !== 'GET') return jsonError(405, 'bad-request', 'Método não permitido.', cors);
    let raw = m[1];
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* mantém cru */
    }
    const code = normalizeRoomCode(raw);
    const room = code ? await env.ROOMS.get(env.ROOMS.idFromName(code)).summary() : null;
    if (!room) return jsonError(404, 'room-not-found', 'Sala não encontrada.', cors);
    const out: RoomResponse = { room };
    return json(200, out, cors);
  }
  return jsonError(404, 'room-not-found', 'Rota não encontrada.', cors);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, env, url.pathname);
      if (url.pathname === '/ws') {
        if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
        if (!isOriginAllowed(req, allowedOf(env))) return new Response('Forbidden', { status: 403 });
        const code = normalizeRoomCode(url.searchParams.get('code') ?? '');
        if (!code) return new Response('Bad Request', { status: 400 });
        return await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
      }
      return jsonError(404, 'room-not-found', 'Rota não encontrada.');
    } catch (err) {
      if (err instanceof HttpError) return jsonError(err.status, err.code, err.message);
      console.error(err);
      return jsonError(500, 'bad-request', 'Erro interno do servidor.');
    }
  },
} satisfies ExportedHandler<Env>;
