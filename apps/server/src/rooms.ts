import {
  LIMITS,
  OFFLINE_STREAM,
  type EndReason,
  type LiveStream,
  type Role,
  type RoomSummary,
  type ServerMessage,
  type StreamInfo,
  type Visibility,
} from '../../../packages/protocol/src/index.ts';
import { PlaygroundEngine, type PgActor } from '../../../packages/protocol/src/playground-engine.ts';
import { generateHostKey, generateRoomCode } from './codes.ts';

/** Conexão abstrata (WebSocket hoje; outro transporte amanhã). */
export interface Conn {
  id: string;
  name: string;
  joinedAt: number;
  role: Role;
  /** A tela deste participante (offline quando não compartilha). */
  stream: StreamInfo;
  /** Entrou no Playground: quem é e se está com o quadro aberto. */
  pg?: { actor: PgActor; paint: boolean };
  send(msg: ServerMessage): void;
  close(): void;
}

export interface Room {
  code: string;
  name: string;
  hostName: string;
  visibility: Visibility;
  hostKey: string;
  createdAt: number;
  maxViewers: number;
  shareOpen: boolean;
  host: Conn | null;
  viewers: Map<string, Conn>;
  everHosted: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Playground da sala (criado no primeiro uso; some junto com a sala). */
  pg: PlaygroundEngine | null;
}

export interface CreateRoomInput {
  name: string;
  hostName: string;
  visibility: Visibility;
}

/** Interface mínima, para trocar por Redis/Durable Objects depois. */
export interface RoomStore {
  create(input: CreateRoomInput): Room;
  get(code: string): Room | undefined;
  listPublic(): RoomSummary[];
  summary(room: Room): RoomSummary;
  end(room: Room, reason: EndReason): void;
  count(): number;
}

export interface RegistryOptions {
  maxViewers: number;
  hostGraceMs?: number;
  unclaimedRoomMs?: number;
}

export class RoomRegistry implements RoomStore {
  private rooms = new Map<string, Room>();
  private maxViewers: number;
  private hostGraceMs: number;
  private unclaimedRoomMs: number;

  constructor(opts: RegistryOptions) {
    this.maxViewers = opts.maxViewers;
    this.hostGraceMs = opts.hostGraceMs ?? LIMITS.hostGraceMs;
    this.unclaimedRoomMs = opts.unclaimedRoomMs ?? LIMITS.unclaimedRoomMs;
  }

  create(input: CreateRoomInput): Room {
    const room: Room = {
      code: generateRoomCode((c) => this.rooms.has(c)),
      name: input.name,
      hostName: input.hostName,
      visibility: input.visibility,
      hostKey: generateHostKey(),
      createdAt: Date.now(),
      maxViewers: this.maxViewers,
      shareOpen: true,
      host: null,
      viewers: new Map(),
      everHosted: false,
      timer: null,
      pg: null,
    };
    this.rooms.set(room.code, room);
    room.timer = setTimeout(() => this.end(room, 'expired'), this.unclaimedRoomMs);
    room.timer.unref();
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  count(): number {
    return this.rooms.size;
  }

  /** Todos os participantes conectados (anfitrião primeiro). */
  everyone(room: Room): Conn[] {
    return [...(room.host ? [room.host] : []), ...room.viewers.values()];
  }

  summary(room: Room): RoomSummary {
    const streams: LiveStream[] = this.everyone(room)
      .filter((c) => c.stream.live)
      .map((c) => ({ peerId: c.id, name: c.name, host: c.role === 'host', info: c.stream }))
      .sort((a, b) => (a.info.startedAt ?? 0) - (b.info.startedAt ?? 0) || (a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0));
    const hostLive = streams.find((s) => s.host);
    return {
      code: room.code,
      name: room.name,
      hostName: room.hostName,
      visibility: room.visibility,
      hostOnline: room.host !== null,
      viewers: room.viewers.size,
      maxViewers: room.maxViewers,
      createdAt: room.createdAt,
      stream: hostLive?.info ?? streams[0]?.info ?? { ...OFFLINE_STREAM },
      streams,
      shareOpen: room.shareOpen,
      maxPresenters: LIMITS.maxPresenters,
    };
  }

  listPublic(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => r.visibility === 'public')
      .map((r) => this.summary(r))
      .sort((a, b) => Number(b.stream.live) - Number(a.stream.live) || b.viewers - a.viewers || b.createdAt - a.createdAt)
      .slice(0, 50);
  }

  /** Transmite o resumo da sala a todos. */
  broadcastRoom(room: Room): void {
    const msg: ServerMessage = { t: 'room', room: this.summary(room) };
    for (const c of this.everyone(room)) c.send(msg);
  }

  /** Anfitrião conectou (ou voltou): cancela timers. */
  hostConnected(room: Room, conn: Conn): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.host = conn;
    room.everHosted = true;
  }

  /** Anfitrião saiu: período de graça (a tela dele some junto). */
  hostDisconnected(room: Room, conn: Conn): void {
    if (room.host !== conn) return;
    room.host = null;
    conn.stream = { ...OFFLINE_STREAM };
    this.broadcastRoom(room);
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => this.end(room, 'host-timeout'), this.hostGraceMs);
    room.timer.unref();
  }

  end(room: Room, reason: EndReason): void {
    if (this.rooms.get(room.code) !== room) return;
    this.rooms.delete(room.code);
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const everyone = this.everyone(room);
    room.host = null;
    room.viewers.clear();
    for (const c of everyone) {
      c.send({ t: 'ended', reason });
      c.close();
    }
  }

  /** Encerra tudo (desligamento do servidor) sem avisar motivo de negócio. */
  shutdown(): void {
    for (const room of [...this.rooms.values()]) {
      if (room.timer) clearTimeout(room.timer);
      room.timer = null;
      room.host?.close();
      for (const v of room.viewers.values()) v.close();
    }
    this.rooms.clear();
  }
}
