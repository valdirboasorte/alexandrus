import { DurableObject } from 'cloudflare:workers';
import {
  LIMITS,
  OFFLINE_STREAM,
  PROTOCOL_VERSION,
  normalizeRoomCode,
  type AudioRoute,
  type ContentKind,
  type EndReason,
  type ErrorCode,
  type LiveStream,
  type PeerInfo,
  type Role,
  type RoomSummary,
  type ServerMessage,
  type SignalData,
  type SourceKind,
  type StreamInfo,
  type Visibility,
} from '../../../packages/protocol/src/index.ts';
import type { Env } from './env.ts';

const SOURCES: readonly string[] = ['monitor', 'window', 'browser'] satisfies SourceKind[];
const AUDIOS: readonly string[] = ['none', 'tab', 'window', 'system', 'process', 'process-exclude'] satisfies AudioRoute[];
const CONTENTS: readonly string[] = ['motion', 'detail', 'film'] satisfies ContentKind[];
const MAX_MSGS_PER_SEC = 40;
const MAX_VIOLATIONS = 3;
const MAX_SDP = 64 * 1024;
const OPEN = 1;

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
      if (c.sdpMLineIndex === null || (typeof c.sdpMLineIndex === 'number' && Number.isFinite(c.sdpMLineIndex))) out.sdpMLineIndex = c.sdpMLineIndex as number | null;
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

/** Comparação em tempo constante (sem early-exit no conteúdo). */
function keyMatches(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ba.length ^ bb.length;
  const n = Math.max(ba.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

function randomB64Url(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface Meta {
  code: string;
  name: string;
  hostName: string;
  visibility: Visibility;
  hostKey: string;
  createdAt: number;
  maxViewers: number;
  /** Ausente em metas antigas = true. */
  shareOpen?: boolean;
  hostEverJoined: boolean;
  hostGoneAt: number | null;
}

interface Att {
  id: string;
  role: Role | null;
  name: string;
  joinedAt: number;
  joined: boolean;
  /** A tela deste participante; ausente = offline. */
  stream?: StreamInfo;
}

interface Peer {
  ws: WebSocket;
  a: Att;
}

interface Bucket {
  windowStart: number;
  count: number;
  violations: number;
}

export interface InitInput {
  code: string;
  name: string;
  hostName: string;
  visibility: Visibility;
  maxViewers: number;
}

export class Room extends DurableObject<Env> {
  private meta: Meta | null = null;
  private ended = false;
  private buckets = new WeakMap<WebSocket, Bucket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get<Meta>('meta')) ?? null;
    });
  }

  /* ---------------- RPC ---------------- */

  async init(input: InitInput): Promise<{ room: RoomSummary; hostKey: string } | { taken: true }> {
    if (this.meta) return { taken: true };
    this.ended = false;
    this.meta = {
      code: input.code,
      name: input.name,
      hostName: input.hostName,
      visibility: input.visibility,
      hostKey: randomB64Url(32),
      createdAt: Date.now(),
      maxViewers: input.maxViewers,
      shareOpen: true,
      hostEverJoined: false,
      hostGoneAt: null,
    };
    await this.ctx.storage.put('meta', this.meta);
    await this.ctx.storage.setAlarm(this.meta.createdAt + LIMITS.unclaimedRoomMs);
    const room = this.summary()!;
    this.syncLobby();
    return { room, hostKey: this.meta.hostKey };
  }

  summary(): RoomSummary | null {
    return this.buildSummary();
  }

  /* ---------------- helpers ---------------- */

  private persist(): void {
    void this.ctx.storage.put('meta', this.meta);
  }

  private peers(exclude?: WebSocket): Peer[] {
    const out: Peer[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude || ws.readyState !== OPEN) continue;
      const a = ws.deserializeAttachment() as Att | null;
      if (a?.joined) out.push({ ws, a });
    }
    return out;
  }

  private buildSummary(exclude?: WebSocket): RoomSummary | null {
    const m = this.meta;
    if (!m) return null;
    const ps = this.peers(exclude);
    const streams: LiveStream[] = ps
      .filter((p) => p.a.stream?.live)
      .map((p) => ({ peerId: p.a.id, name: p.a.name, host: p.a.role === 'host', info: p.a.stream as StreamInfo }))
      .sort((x, y) => (x.info.startedAt ?? 0) - (y.info.startedAt ?? 0) || (x.peerId < y.peerId ? -1 : x.peerId > y.peerId ? 1 : 0));
    return {
      code: m.code,
      name: m.name,
      hostName: m.hostName,
      visibility: m.visibility,
      hostOnline: ps.some((p) => p.a.role === 'host'),
      viewers: ps.filter((p) => p.a.role === 'viewer').length,
      maxViewers: m.maxViewers,
      createdAt: m.createdAt,
      stream: streams.find((s) => s.host)?.info ?? streams[0]?.info ?? { ...OFFLINE_STREAM },
      streams,
      shareOpen: m.shareOpen !== false,
      maxPresenters: LIMITS.maxPresenters,
    };
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      if (ws.readyState === OPEN) ws.send(JSON.stringify(msg));
    } catch {
      /* socket já caiu */
    }
  }

  private fail(ws: WebSocket, code: ErrorCode): void {
    this.send(ws, { t: 'error', code, message: ERR_TEXT[code] });
  }

  private syncLobby(exclude?: WebSocket): void {
    const s = this.buildSummary(exclude);
    if (!s) return;
    const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'));
    const p = (s.visibility === 'public' ? lobby.upsert(s) : lobby.remove(s.code)).catch(() => {});
    this.ctx.waitUntil(p);
  }

  private broadcastRoom(exclude?: WebSocket): void {
    const s = this.buildSummary(exclude);
    if (!s) return;
    const msg: ServerMessage = { t: 'room', room: s };
    for (const p of this.peers(exclude)) this.send(p.ws, msg);
    this.syncLobby(exclude);
  }

  private peerInfo(a: Att): PeerInfo {
    return { id: a.id, name: a.name, role: a.role as Role, joinedAt: a.joinedAt };
  }

  private end(reason: EndReason): void {
    if (!this.meta) return;
    const code = this.meta.code;
    const all = this.ctx.getWebSockets();
    const joined = this.peers();
    this.meta = null;
    this.ended = true;
    for (const p of joined) this.send(p.ws, { t: 'ended', reason });
    for (const ws of all) {
      try {
        ws.close(1000, 'ended');
      } catch {
        /* ignore */
      }
    }
    this.ctx.waitUntil(
      this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'))
        .remove(code)
        .catch(() => {}),
    );
    this.ctx.waitUntil(
      (async () => {
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
      })(),
    );
  }

  private leave(ws: WebSocket, a: Att | null): void {
    if (!this.meta || !a?.joined) return;
    const role = a.role;
    try {
      ws.serializeAttachment({ ...a, role: null, joined: false, stream: undefined } satisfies Att);
    } catch {
      /* socket fechado */
    }
    for (const p of this.peers(ws)) this.send(p.ws, { t: 'peer-left', peerId: a.id });
    if (role === 'host') {
      this.meta.hostGoneAt = Date.now();
      this.persist();
      this.broadcastRoom(ws);
      void this.ctx.storage.setAlarm(this.meta.hostGoneAt + LIMITS.hostGraceMs);
    } else {
      this.broadcastRoom(ws);
    }
  }

  /* ---------------- ciclo de vida ---------------- */

  async alarm(): Promise<void> {
    const m = this.meta;
    if (!m) return;
    let at: number;
    let reason: EndReason;
    if (!m.hostEverJoined) {
      at = m.createdAt + LIMITS.unclaimedRoomMs;
      reason = 'expired';
    } else if (m.hostGoneAt !== null) {
      at = m.hostGoneAt + LIMITS.hostGraceMs;
      reason = 'host-timeout';
    } else return;
    if (Date.now() >= at) this.end(reason);
    else await this.ctx.storage.setAlarm(at);
  }

  /* ---------------- WebSocket ---------------- */

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const id = randomB64Url(8).slice(0, 10);
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, role: null, name: '', joinedAt: 0, joined: false } satisfies Att);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): void {
    const now = Date.now();
    let b = this.buckets.get(ws);
    if (!b) this.buckets.set(ws, (b = { windowStart: now, count: 0, violations: 0 }));
    if (now - b.windowStart >= 1000) {
      b.windowStart = now;
      b.count = 0;
    }
    if (++b.count > MAX_MSGS_PER_SEC) {
      if (b.count === MAX_MSGS_PER_SEC + 1) {
        this.fail(ws, 'rate-limited');
        if (++b.violations >= MAX_VIOLATIONS) ws.close(1008, 'rate-limited');
      }
      return;
    }
    if (typeof data !== 'string') {
      if (data.byteLength > LIMITS.maxMessageBytes) return void ws.close(1009, 'too-big');
      return this.fail(ws, 'bad-request');
    }
    if (data.length * 3 > LIMITS.maxMessageBytes && new TextEncoder().encode(data).length > LIMITS.maxMessageBytes) {
      return void ws.close(1009, 'too-big');
    }
    let msg: unknown;
    try {
      msg = JSON.parse(data);
    } catch {
      return this.fail(ws, 'bad-request');
    }
    if (!isObj(msg) || typeof msg.t !== 'string') return this.fail(ws, 'bad-request');

    if (msg.t === 'ping') {
      if (typeof msg.ts !== 'number') return this.fail(ws, 'bad-request');
      return this.send(ws, { t: 'pong', ts: msg.ts });
    }

    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    const m = this.meta;

    if (msg.t === 'join') {
      if (a.joined) return this.fail(ws, 'bad-request');
      if (typeof msg.v !== 'number' || msg.v < PROTOCOL_VERSION) {
        this.fail(ws, 'outdated');
        try {
          ws.close(1000, 'outdated');
        } catch {
          /* ignore */
        }
        return;
      }
      if (typeof msg.code !== 'string') return this.fail(ws, 'bad-request');
      if (msg.role !== 'host' && msg.role !== 'viewer') return this.fail(ws, 'bad-request');
      const code = normalizeRoomCode(msg.code);
      if (!m || !code || code !== m.code) {
        this.fail(ws, 'room-not-found');
        try {
          ws.close(1000, 'room-not-found');
        } catch {
          /* ignore */
        }
        return;
      }
      const joinedAt = Date.now();
      if (msg.role === 'host') {
        if (typeof msg.hostKey !== 'string' || !keyMatches(msg.hostKey, m.hostKey)) return this.fail(ws, 'bad-host-key');
        const ps = this.peers();
        if (ps.some((p) => p.a.role === 'host')) return this.fail(ws, 'host-already-connected');
        const name = cleanName(msg.name, 'Anfitrião');
        const na: Att = { id: a.id, role: 'host', name, joinedAt, joined: true };
        ws.serializeAttachment(na);
        m.hostName = name;
        m.hostEverJoined = true;
        m.hostGoneAt = null;
        this.persist();
        void this.ctx.storage.deleteAlarm();
        const room = this.buildSummary()!;
        this.send(ws, {
          t: 'joined',
          you: a.id,
          role: 'host',
          room,
          peers: ps.map((p) => this.peerInfo(p.a)),
        });
        for (const p of ps) {
          this.send(p.ws, { t: 'peer-joined', peer: this.peerInfo(na) });
          this.send(p.ws, { t: 'room', room });
        }
        this.syncLobby();
        return;
      }
      const ps = this.peers();
      if (ps.filter((p) => p.a.role === 'viewer').length >= m.maxViewers) return this.fail(ws, 'room-full');
      const na: Att = { id: a.id, role: 'viewer', name: cleanName(msg.name, 'Visitante'), joinedAt, joined: true };
      ws.serializeAttachment(na);
      this.send(ws, {
        t: 'joined',
        you: a.id,
        role: 'viewer',
        room: this.buildSummary()!,
        peers: ps.map((p) => this.peerInfo(p.a)),
      });
      for (const p of ps) this.send(p.ws, { t: 'peer-joined', peer: this.peerInfo(na) });
      this.broadcastRoom();
      return;
    }

    if (!m || !a.joined || !a.role) return this.fail(ws, 'not-joined');
    const role = a.role;

    switch (msg.t) {
      case 'signal': {
        if (typeof msg.to !== 'string') return this.fail(ws, 'bad-request');
        const data = validSignal(msg.data);
        if (!data) return this.fail(ws, 'bad-request');
        const ps = this.peers();
        const target = msg.to === a.id ? undefined : ps.find((p) => p.a.id === msg.to);
        if (!target) return this.fail(ws, 'peer-not-found');
        this.send(target.ws, { t: 'signal', from: a.id, data });
        return;
      }
      case 'stream': {
        const info = sanitizeStream(msg.info);
        if (!info) return this.fail(ws, 'bad-request');
        if (role !== 'host' && m.shareOpen === false) return this.fail(ws, 'share-closed');
        if (info.live && !a.stream?.live && this.peers().filter((p) => p.a.stream?.live).length >= LIMITS.maxPresenters) {
          return this.fail(ws, 'stage-full');
        }
        ws.serializeAttachment({ ...a, stream: info } satisfies Att);
        this.broadcastRoom();
        return;
      }
      case 'room-update': {
        if (role !== 'host') return this.fail(ws, 'not-allowed');
        let name: string | undefined;
        let visibility: Visibility | undefined;
        let shareOpen: boolean | undefined;
        if (msg.shareOpen !== undefined) {
          if (typeof msg.shareOpen !== 'boolean') return this.fail(ws, 'bad-request');
          shareOpen = msg.shareOpen;
        }
        if (msg.name !== undefined) {
          if (typeof msg.name !== 'string') return this.fail(ws, 'bad-request');
          name = msg.name.trim();
          if (name.length < 1 || name.length > LIMITS.roomNameMax) return this.fail(ws, 'bad-request');
        }
        if (msg.visibility !== undefined) {
          if (msg.visibility !== 'public' && msg.visibility !== 'private') return this.fail(ws, 'bad-request');
          visibility = msg.visibility;
        }
        if (name !== undefined) m.name = name;
        if (visibility !== undefined) m.visibility = visibility;
        if (shareOpen !== undefined) {
          m.shareOpen = shareOpen;
          if (!shareOpen) {
            for (const p of this.peers()) {
              if (p.a.role !== 'host' && p.a.stream?.live) p.ws.serializeAttachment({ ...p.a, stream: undefined } satisfies Att);
            }
          }
        }
        this.persist();
        this.broadcastRoom();
        return;
      }
      case 'leave':
        return this.leave(ws, a);
      case 'end':
        if (role !== 'host') return this.fail(ws, 'not-allowed');
        return this.end('host-ended');
      default:
        return this.fail(ws, 'bad-request');
    }
  }

  webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): void {
    this.leave(ws, ws.deserializeAttachment() as Att | null);
    try {
      ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000);
    } catch {
      /* já fechado */
    }
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    this.leave(ws, ws.deserializeAttachment() as Att | null);
    try {
      ws.close(1011);
    } catch {
      /* já fechado */
    }
  }
}
