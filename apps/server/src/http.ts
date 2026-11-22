import { createHmac } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import {
  LIMITS,
  PROTOCOL_VERSION,
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
import type { Config } from './config.ts';
import { corsHeaders, isOriginAllowed } from './origins.ts';
import type { RoomRegistry } from './rooms.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const MAX_BODY = 8 * 1024;
const CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 60_000;

class HttpError extends Error {
  status: number;
  code: ErrorCode;
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function baseHeaders(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function sendError(res: ServerResponse, status: number, error: ErrorCode, message: string) {
  const body: ApiError = { error, message };
  sendJson(res, status, body);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'bad-request', 'Corpo da requisição grande demais.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'bad-request', 'JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

export function createHttpHandler(registry: RoomRegistry, config: Config) {
  const createHits = new Map<string, number[]>();
  const sweep = setInterval(() => {
    const cutoff = Date.now() - CREATE_WINDOW_MS;
    for (const [ip, hits] of createHits) {
      const keep = hits.filter((t) => t > cutoff);
      if (keep.length) createHits.set(ip, keep);
      else createHits.delete(ip);
    }
  }, CREATE_WINDOW_MS);
  sweep.unref();

  function clientIp(req: IncomingMessage): string {
    if (config.trustProxy) {
      const xff = req.headers['x-forwarded-for'];
      const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  function iceConfig(): IceConfigResponse {
    const iceServers: IceConfigResponse['iceServers'] = [];
    if (config.stunUrls.length) iceServers.push({ urls: config.stunUrls });
    if (config.turnUrls.length && config.turnSecret) {
      const expiry = Math.floor(Date.now() / 1000) + config.turnTtl;
      const username = `${expiry}:alexandrus`;
      const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
      iceServers.push({ urls: config.turnUrls, username, credential });
      return { iceServers, ttl: config.turnTtl };
    }
    return { iceServers, ttl: 0 };
  }

  async function createRoom(req: IncomingMessage, res: ServerResponse) {
    const ip = clientIp(req);
    const now = Date.now();
    const hits = (createHits.get(ip) ?? []).filter((t) => t > now - CREATE_WINDOW_MS);
    if (hits.length >= CREATE_LIMIT) {
      createHits.set(ip, hits);
      return sendError(res, 429, 'rate-limited', 'Muitas salas criadas. Tente de novo em instantes.');
    }
    hits.push(now);
    createHits.set(ip, hits);

    const body = await readBody(req);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'bad-request', 'Requisição inválida.');
    }
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
    const room = registry.create({ name, hostName, visibility });
    const out: CreateRoomResponse = { room: registry.summary(room), hostKey: room.hostKey };
    sendJson(res, 201, out);
  }

  async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
    const root = resolve(config.publicDir);
    if (!existsSync(root)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Alexandrus: a interface web não foi compilada. Rode o servidor de desenvolvimento do web (npm run dev -w apps/web).\n');
      return;
    }
    let rel: string;
    try {
      rel = normalize(decodeURIComponent(pathname));
    } catch {
      return sendError(res, 400, 'bad-request', 'Caminho inválido.');
    }
    if (rel.includes('\0')) return sendError(res, 400, 'bad-request', 'Caminho inválido.');
    let file = join(root, rel);
    if (file !== root && !file.startsWith(root + sep)) return sendError(res, 403, 'not-allowed', 'Acesso negado.');
    let isFile = false;
    try {
      isFile = statSync(file).isFile();
    } catch {
      /* não existe */
    }
    if (!isFile) {
      if (extname(rel) && pathname.startsWith('/assets/')) return sendError(res, 404, 'room-not-found', 'Arquivo não encontrado.');
      file = join(root, 'index.html'); // fallback SPA
      if (!existsSync(file)) return sendError(res, 404, 'room-not-found', 'Arquivo não encontrado.');
    }
    const ext = extname(file).toLowerCase();
    const type = MIME[ext] ?? 'application/octet-stream';
    const headers: Record<string, string> = { 'Content-Type': type };
    if (pathname.startsWith('/assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    else headers['Cache-Control'] = 'no-cache';
    if (ext === '.html') headers['Permissions-Policy'] = 'display-capture=(self), fullscreen=(self)';
    const data = await readFile(file);
    headers['Content-Length'] = String(data.length);
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const method = req.method ?? 'GET';
    const pathname = new URL(req.url ?? '/', 'http://x').pathname;

    if (pathname.startsWith('/api/')) {
      if (!isOriginAllowed(req, config.allowedOrigins)) return sendError(res, 403, 'not-allowed', 'Origem não permitida.');
      for (const [k, v] of Object.entries(corsHeaders(req, config.allowedOrigins))) res.setHeader(k, v);
      if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (pathname === '/api/health' && method === 'GET') {
        const out: HealthResponse = { ok: true, version: '0.1.0', protocol: PROTOCOL_VERSION, rooms: registry.count() };
        return sendJson(res, 200, out);
      }
      if (pathname === '/api/ice' && method === 'GET') return sendJson(res, 200, iceConfig());
      if (pathname === '/api/rooms') {
        if (method === 'POST') return createRoom(req, res);
        if (method === 'GET') {
          const out: RoomListResponse = { rooms: registry.listPublic() };
          return sendJson(res, 200, out);
        }
        return sendError(res, 405, 'bad-request', 'Método não permitido.');
      }
      const m = pathname.match(/^\/api\/rooms\/([^/]+)$/);
      if (m) {
        if (method !== 'GET') return sendError(res, 405, 'bad-request', 'Método não permitido.');
        let raw = m[1];
        try {
          raw = decodeURIComponent(raw);
        } catch {
          /* mantém cru */
        }
        const code = normalizeRoomCode(raw);
        const room = code ? registry.get(code) : undefined;
        if (!room) return sendError(res, 404, 'room-not-found', 'Sala não encontrada.');
        const out: RoomResponse = { room: registry.summary(room) };
        return sendJson(res, 200, out);
      }
      return sendError(res, 404, 'room-not-found', 'Rota não encontrada.');
    }

    if (method !== 'GET' && method !== 'HEAD') return sendError(res, 405, 'bad-request', 'Método não permitido.');
    return serveStatic(req, res, pathname);
  }

  return (req: IncomingMessage, res: ServerResponse) => {
    baseHeaders(res);
    route(req, res).catch((err) => {
      if (res.headersSent) return res.end();
      if (err instanceof HttpError) return sendError(res, err.status, err.code, err.message);
      console.error(err);
      sendError(res, 500, 'bad-request', 'Erro interno do servidor.');
    });
  };
}
