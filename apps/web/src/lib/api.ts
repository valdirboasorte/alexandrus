import type {
  ApiError,
  CreateRoomRequest,
  CreateRoomResponse,
  HealthResponse,
  IceConfigResponse,
  RoomListResponse,
  RoomResponse,
  RoomSummary,
} from '@protocol';

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 8000);
  try {
    const res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const err = body as Partial<ApiError> | null;
      throw new ApiFailure(res.status, err?.error ?? 'bad-request', err?.message ?? 'O servidor respondeu com erro.');
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiFailure) throw e;
    if ((e as Error).name === 'AbortError') throw new ApiFailure(0, 'timeout', 'O servidor demorou demais para responder.');
    throw new ApiFailure(0, 'offline', 'Não foi possível falar com o servidor do Alexandrus.');
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  health: () => request<HealthResponse>('/api/health', { timeoutMs: 4000 }),
  createRoom: (body: CreateRoomRequest) => request<CreateRoomResponse>('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
  listRooms: () => request<RoomListResponse>('/api/rooms').then((r) => r.rooms),
  getRoom: (code: string) => request<RoomResponse>(`/api/rooms/${encodeURIComponent(code)}`).then((r): RoomSummary => r.room),
  ice: () => request<IceConfigResponse>('/api/ice'),
};

/** Link público de uma sala, para copiar e mandar no Discord. */
export function roomLink(code: string) {
  return `${window.location.origin}/sala/${code}`;
}
