import type { Lobby } from './lobby.ts';
import type { Room } from './room.ts';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  LOBBY: DurableObjectNamespace<Lobby>;
  ROOM_CREATE?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  ALLOWED_ORIGINS?: string;
  STUN_URLS?: string;
  TURN_URLS?: string;
  TURN_SECRET?: string;
  TURN_TTL?: string;
  MAX_VIEWERS?: string;
}
