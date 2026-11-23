import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import {
  LIMITS,
  OFFLINE_STREAM,
  PROTOCOL_VERSION,
  normalizeRoomCode,
  type AudioRoute,
  type ContentKind,
  type ErrorCode,
  type PeerInfo,
  type Role,
  type ServerMessage,
  type SignalData,
  type SourceKind,
  type StreamInfo,
  type Visibility,
} from '../../../packages/protocol/src/index.ts';
import { generatePeerId } from './codes.ts';
import type { Conn, Room, RoomRegistry } from './rooms.ts';

const SOURCES: readonly string[] = ['monitor', 'window', 'browser'] satisfies SourceKind[];
const AUDIOS: readonly string[] = ['none', 'tab', 'window', 'system', 'process', 'process-exclude'] satisfies AudioRoute[];
const CONTENTS: readonly string[] = ['motion', 'detail', 'film'] satisfies ContentKind[];
const MAX_MSGS_PER_SEC = 40;
const MAX_VIOLATIONS = 3;
const MAX_SDP = 64 * 1024;

const ERR_TEXT: Record<ErrorCode, string> = {
  'room-not-found': 'Sala não encontrada.',
  'bad-host-key': 'Chave de anfitrião inválida.',
  'room-full': 'A sala está cheia.',
  'host-already-connected': 'O anfitrião já está conectado em outra aba.',
  'not-joined': 'Entre em uma sala primeiro.',
  'not-allowed': 'Ação não permitida.',
  'peer-not-found': 'Participante não encontrado.',
  'bad-request': 'Mensagem inválida.',
  'rate-limited': 'Mensagens demais. Vá com calma.',
  'stage-full': 'Já há telas demais ao vivo nesta sala.',
  'share-closed': 'O anfitrião não liberou o compartilhamento para os participantes.',
  outdated: 'Esta página está desatualizada. Recarregue (F5).',
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function cleanName(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.trim().slice(0, LIMITS.personNameMax) : '';
  return s || fallback;
}

function validSignal(d: unknown): SignalData | null {
  if (!isObj(d)) return null;
  switch (d.kind) {
    case 'offer':
    case 'answer':
      return typeof d.sdp === 'string' && d.sdp.length <= MAX_SDP ? { kind: d.kind, sdp: d.sdp } : null;
    case 'request-offer':
      return { kind: 'request-offer' };
    case 'bye':
      return { kind: 'bye' };
    case 'ice': {
      const side = d.side;
      if (side !== 'pub' && side !== 'sub') return null;
      if (d.candidate === null) return { kind: 'ice', side, candidate: null };
      const c = d.candidate;
      if (!isObj(c) || typeof c.candidate !== 'string' || c.candidate.length > 4096) return null;
      const out: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } = {
        candidate: c.candidate,
      };
      if (c.sdpMid === null || typeof c.sdpMid === 'string') out.sdpMid = c.sdpMid;
      if (c.sdpMLineIndex === null || (typeof c.sdpMLineIndex === 'number' && Number.isFinite(c.sdpMLineIndex))) out.sdpMLineIndex = c.sdpMLineIndex;
      if (c.usernameFragment === null || typeof c.usernameFragment === 'string') out.usernameFragment = c.usernameFragment;
      return { kind: 'ice', side, candidate: out };
    }
    default:
      return null;
  }
}

function sanitizeStream(v: unknown): StreamInfo | null {
  if (!isObj(v)) return null;
  if (typeof v.live !== 'boolean' || typeof v.audioEnabled !== 'boolean') return null;
  if (typeof v.audio !== 'string' || !AUDIOS.includes(v.audio)) return null;
  let source: SourceKind | null = null;
  if (v.source !== null && v.source !== undefined) {
    if (typeof v.source !== 'string' || !SOURCES.includes(v.source)) return null;
    source = v.source as SourceKind;
  }
  const info: StreamInfo = { live: v.live, source, audio: v.audio as AudioRoute, audioEnabled: v.audioEnabled };
  if (v.audioProcess === null || v.audioProcess === undefined) info.audioProcess = null;
  else if (typeof v.audioProcess === 'string' && v.audioProcess.length <= 64) info.audioProcess = v.audioProcess;
  else return null;
  for (const k of ['width', 'height', 'fps'] as const) {
    const n = v[k];
    if (n === undefined) continue;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100_000) return null;
    info[k] = n;
  }
  if (v.startedAt === null) info.startedAt = null;
  else if (typeof v.startedAt === 'number' && Number.isFinite(v.startedAt)) info.startedAt = v.startedAt;
  else if (v.startedAt !== undefined) return null;
  if (v.content !== undefined) {
    if (typeof v.content !== 'string' || !CONTENTS.includes(v.content)) return null;
    info.content = v.content as ContentKind;
  }
  if (info.live && info.startedAt == null) info.startedAt = Date.now();
  if (!info.live) info.startedAt = null;
  return info;
}

function keyMatches(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function peerInfo(c: Conn): PeerInfo {
  return { id: c.id, name: c.name, role: c.role, joinedAt: c.joinedAt };
}

export interface Signaling {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  close(): void;
}

export function createSignaling(registry: RoomRegistry, opts: { isAllowed?: (req: IncomingMessage) => boolean } = {}): Signaling {
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxMessageBytes });
  const alive = new WeakSet<WebSocket>();

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  wss.on('connection', (ws) => {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));

    const sendMsg = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const fail = (code: ErrorCode) => sendMsg({ t: 'error', code, message: ERR_TEXT[code] });

    let room: Room | null = null;
    let role: Role | null = null;
    let conn: Conn | null = null;
    let windowStart = Date.now();
    let count = 0;
    let violations = 0;

    const leave = () => {
      if (!room || !conn || !role) return;
      const r = room;
      const c = conn;
      room = null;
      conn = null;
      if (role === 'host') {
        for (const o of r.viewers.values()) o.send({ t: 'peer-left', peerId: c.id });
        registry.hostDisconnected(r, c);
      } else if (r.viewers.get(c.id) === c) {
        r.viewers.delete(c.id);
        for (const o of registry.everyone(r)) o.send({ t: 'peer-left', peerId: c.id });
        registry.broadcastRoom(r);
      }
    };

    ws.on('message', (raw, isBinary) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_MSGS_PER_SEC) {
        if (count === MAX_MSGS_PER_SEC + 1) {
          fail('rate-limited');
          if (++violations >= MAX_VIOLATIONS) ws.close(1008, 'rate-limited');
        }
        return;
      }
      if (isBinary) return fail('bad-request');
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return fail('bad-request');
      }
      if (!isObj(msg) || typeof msg.t !== 'string') return fail('bad-request');

      if (msg.t === 'ping') {
        if (typeof msg.ts !== 'number') return fail('bad-request');
        return sendMsg({ t: 'pong', ts: msg.ts });
      }

      if (msg.t === 'join') {
        if (room) return fail('bad-request');
        if (typeof msg.v !== 'number' || msg.v < PROTOCOL_VERSION) {
          fail('outdated');
          ws.close(1000);
          return;
        }
        if (typeof msg.code !== 'string') return fail('bad-request');
        if (msg.role !== 'host' && msg.role !== 'viewer') return fail('bad-request');
        const code = normalizeRoomCode(msg.code);
        const target = code ? registry.get(code) : undefined;
        if (!target) return fail('room-not-found');
        const id = generatePeerId();
        const base = { id, joinedAt: Date.now(), stream: { ...OFFLINE_STREAM }, send: sendMsg, close: () => ws.close(1000) };

        if (msg.role === 'host') {
          if (typeof msg.hostKey !== 'string' || !keyMatches(msg.hostKey, target.hostKey)) return fail('bad-host-key');
          if (target.host) return fail('host-already-connected');
          const c: Conn = { ...base, role: 'host', name: cleanName(msg.name, 'Anfitrião') };
          target.hostName = c.name;
          registry.hostConnected(target, c);
          room = target;
          role = 'host';
          conn = c;
          sendMsg({
            t: 'joined',
            you: id,
            role: 'host',
            room: registry.summary(target),
            peers: [...target.viewers.values()].map(peerInfo),
          });
          for (const v of target.viewers.values()) {
            v.send({ t: 'peer-joined', peer: peerInfo(c) });
            v.send({ t: 'room', room: registry.summary(target) });
          }
          return;
        }

        if (target.viewers.size >= target.maxViewers) return fail('room-full');
        const c: Conn = { ...base, role: 'viewer', name: cleanName(msg.name, 'Visitante') };
        target.viewers.set(id, c);
        room = target;
        role = 'viewer';
        conn = c;
        sendMsg({
          t: 'joined',
          you: id,
          role: 'viewer',
          room: registry.summary(target),
          peers: registry.everyone(target).filter((o) => o !== c).map(peerInfo),
        });
        for (const o of registry.everyone(target)) if (o !== c) o.send({ t: 'peer-joined', peer: peerInfo(c) });
        registry.broadcastRoom(target);
        return;
      }

      if (!room || !conn || !role) return fail('not-joined');
      const r = room;

      switch (msg.t) {
        case 'signal': {
          if (typeof msg.to !== 'string') return fail('bad-request');
          const data = validSignal(msg.data);
          if (!data) return fail('bad-request');
          const target = msg.to === conn.id ? undefined : registry.everyone(r).find((o) => o.id === msg.to);
          if (!target) return fail('peer-not-found');
          target.send({ t: 'signal', from: conn.id, data });
          return;
        }
        case 'stream': {
          const info = sanitizeStream(msg.info);
          if (!info) return fail('bad-request');
          if (role !== 'host' && !r.shareOpen) return fail('share-closed');
          if (info.live && !conn.stream.live && registry.everyone(r).filter((o) => o.stream.live).length >= LIMITS.maxPresenters) {
            return fail('stage-full');
          }
          conn.stream = info;
          registry.broadcastRoom(r);
          return;
        }
        case 'room-update': {
          if (role !== 'host') return fail('not-allowed');
          let name: string | undefined;
          let visibility: Visibility | undefined;
          let shareOpen: boolean | undefined;
          if (msg.shareOpen !== undefined) {
            if (typeof msg.shareOpen !== 'boolean') return fail('bad-request');
            shareOpen = msg.shareOpen;
          }
          if (msg.name !== undefined) {
            if (typeof msg.name !== 'string') return fail('bad-request');
            name = msg.name.trim();
            if (name.length < 1 || name.length > LIMITS.roomNameMax) return fail('bad-request');
          }
          if (msg.visibility !== undefined) {
            if (msg.visibility !== 'public' && msg.visibility !== 'private') return fail('bad-request');
            visibility = msg.visibility;
          }
          if (name !== undefined) r.name = name;
          if (visibility !== undefined) r.visibility = visibility;
          if (shareOpen !== undefined) {
            r.shareOpen = shareOpen;
            if (!shareOpen) for (const v of r.viewers.values()) v.stream = { ...OFFLINE_STREAM };
          }
          registry.broadcastRoom(r);
          return;
        }
        case 'leave':
          leave();
          return;
        case 'end':
          if (role !== 'host') return fail('not-allowed');
          registry.end(r, 'host-ended');
          return;
        default:
          return fail('bad-request');
      }
    });

    ws.on('close', leave);
    ws.on('error', () => ws.terminate());
  });

  return {
    handleUpgrade(req, socket, head) {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (path !== '/ws') {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      if (opts.isAllowed && !opts.isAllowed(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    },
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
