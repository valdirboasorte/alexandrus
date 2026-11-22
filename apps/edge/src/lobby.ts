import { DurableObject } from 'cloudflare:workers';
import type { RoomSummary } from '../../../packages/protocol/src/index.ts';

const STALE_MS = 6 * 60 * 60_000;
const MAX_LIST = 50;
const PREFIX = 'r:';

interface Entry {
  summary: RoomSummary;
  at: number;
}

/** Lista de salas públicas (instância única, idFromName("lobby")). */
export class Lobby extends DurableObject {
  async upsert(summary: RoomSummary): Promise<void> {
    const entry: Entry = { summary, at: Date.now() };
    await this.ctx.storage.put(PREFIX + summary.code, entry);
  }

  async remove(code: string): Promise<void> {
    await this.ctx.storage.delete(PREFIX + code);
  }

  private async fresh(): Promise<RoomSummary[]> {
    const all = await this.ctx.storage.list<Entry>({ prefix: PREFIX });
    const cutoff = Date.now() - STALE_MS;
    const out: RoomSummary[] = [];
    const stale: string[] = [];
    for (const [key, e] of all) {
      if (e.at < cutoff || e.summary.visibility !== 'public') stale.push(key);
      else out.push(e.summary);
    }
    if (stale.length) await this.ctx.storage.delete(stale);
    return out;
  }

  async list(): Promise<RoomSummary[]> {
    const rooms = await this.fresh();
    return rooms
      .sort((a, b) => Number(b.stream.live) - Number(a.stream.live) || b.viewers - a.viewers || b.createdAt - a.createdAt)
      .slice(0, MAX_LIST);
  }

  async count(): Promise<number> {
    return (await this.fresh()).length;
  }
}
