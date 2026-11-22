import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from '../../../packages/protocol/src/index.ts';

export interface Config {
  port: number;
  host: string;
  publicDir: string;
  stunUrls: string[];
  turnUrls: string[];
  turnSecret: string | null;
  turnTtl: number;
  maxViewers: number;
  trustProxy: boolean;
  /** Origens de sites hospedados fora deste servidor (ex.: https://alexandrus.vercel.app). */
  allowedOrigins: string[];
  hostGraceMs: number;
  unclaimedRoomMs: number;
}

function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : def;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    port: num(env.PORT, 8790),
    host: env.HOST || '0.0.0.0',
    publicDir: env.PUBLIC_DIR ? resolve(env.PUBLIC_DIR) : resolve(here, '../../web/dist'),
    stunUrls: list(env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478'),
    turnUrls: list(env.TURN_URLS),
    turnSecret: env.TURN_SECRET || null,
    turnTtl: num(env.TURN_TTL, 3600),
    maxViewers: num(env.MAX_VIEWERS, LIMITS.defaultMaxViewers),
    trustProxy: env.TRUST_PROXY === '1',
    allowedOrigins: list(env.ALLOWED_ORIGINS).map((o) => o.replace(/\/$/, '')),
    hostGraceMs: LIMITS.hostGraceMs,
    unclaimedRoomMs: LIMITS.unclaimedRoomMs,
  };
}
