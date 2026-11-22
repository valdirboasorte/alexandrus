import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import type { CreateRoomResponse, RoomListResponse, ServerMessage } from '../../../packages/protocol/src/index.ts';
import { createAlexandrusServer, type AlexandrusServer } from '../src/index.ts';

let app: AlexandrusServer;
let base: string;

before(async () => {
  app = await createAlexandrusServer({ port: 0, host: '127.0.0.1', maxViewers: 2, hostGraceMs: 200, publicDir: '/nao-existe' });
  base = `127.0.0.1:${app.port}`;
});
after(async () => {
  await app.close();
});

async function createRoom(visibility: 'public' | 'private' = 'private', name = 'Minha sala'): Promise<CreateRoomResponse> {
  const r = await fetch(`http://${base}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, hostName: 'Ana', visibility }),
  });
  assert.equal(r.status, 201);
  return (await r.json()) as CreateRoomResponse;
}

interface Client {
  ws: WebSocket;
  msgs: ServerMessage[];
  send(m: unknown): void;
  waitFor<T extends ServerMessage['t']>(t: T, pred?: (m: Extract<ServerMessage, { t: T }>) => boolean): Promise<Extract<ServerMessage, { t: T }>>;
}

async function connect(): Promise<Client> {
  const ws = new WebSocket(`ws://${base}/ws`);
  const msgs: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (d) => {
    msgs.push(JSON.parse(d.toString()));
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  return {
    ws,
    msgs,
    send: (m) => ws.send(JSON.stringify(m)),
    async waitFor(t, pred) {
      const deadline = Date.now() + 2000;
      let seen = 0;
      for (;;) {
        for (; seen < msgs.length; seen++) {
          const m = msgs[seen];
          if (m.t === t && (!pred || pred(m as never))) return m as never;
        }
        if (Date.now() > deadline) throw new Error(`timeout esperando ${t}; recebido: ${JSON.stringify(msgs)}`);
        await new Promise<void>((res) => {
          waiters.push(res);
          setTimeout(res, 50);
        });
      }
    },
  };
}

async function joinHost(code: string, hostKey: string) {
  const c = await connect();
  c.send({ t: 'join', code, role: 'host', hostKey, name: 'Ana' });
  const joined = await c.waitFor('joined');
  return { c, joined };
}

async function joinViewer(code: string, name = 'Bia') {
  const c = await connect();
  c.send({ t: 'join', code, role: 'viewer', name });
  const joined = await c.waitFor('joined');
  return { c, joined };
}

test('cria sala via HTTP e busca', async () => {
  const { room, hostKey } = await createRoom('private');
  assert.equal(room.code.length, 6);
  assert.ok(hostKey.length >= 40);
  assert.equal(room.hostOnline, false);
  const r = await fetch(`http://${base}/api/rooms/${room.code.toLowerCase()}`);
  assert.equal(r.status, 200);
  const body = (await r.json()) as { room: { code: string } };
  assert.equal(body.room.code, room.code);
  const nf = await fetch(`http://${base}/api/rooms/ZZZZZZ`);
  assert.equal(nf.status, 404);
  const health = (await (await fetch(`http://${base}/api/health`)).json()) as { ok: boolean; version: string };
  assert.equal(health.ok, true);
  const ice = (await (await fetch(`http://${base}/api/ice`)).json()) as { ttl: number };
  assert.equal(ice.ttl, 0);
});

test('lista pública esconde salas privadas', async () => {
  const pub = await createRoom('public', 'Pública');
  const priv = await createRoom('private', 'Privada');
  const list = (await (await fetch(`http://${base}/api/rooms`)).json()) as RoomListResponse;
  const codes = list.rooms.map((r) => r.code);
  assert.ok(codes.includes(pub.room.code));
  assert.ok(!codes.includes(priv.room.code));
});

test('espectador em sala inexistente → room-not-found', async () => {
  const c = await connect();
  c.send({ t: 'join', code: 'ZZZZZZ', role: 'viewer', name: 'x' });
  const e = await c.waitFor('error');
  assert.equal(e.code, 'room-not-found');
  c.ws.close();
});

test('mensagem antes de entrar → not-joined; chave errada → bad-host-key', async () => {
  const { room } = await createRoom();
  const c = await connect();
  c.send({ t: 'stream', info: {} });
  assert.equal((await c.waitFor('error')).code, 'not-joined');
  c.send({ t: 'join', code: room.code, role: 'host', hostKey: 'errada', name: 'Ana' });
  assert.equal((await c.waitFor('error', (m) => m.code === 'bad-host-key')).code, 'bad-host-key');
  c.ws.close();
});

test('host + espectador: peer-joined e resumo com viewers=1', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  assert.equal(h.joined.role, 'host');
  assert.equal(h.joined.room.hostOnline, true);
  const v = await joinViewer(room.code);
  assert.equal(v.joined.peers.length, 1);
  assert.equal(v.joined.peers[0].role, 'host');
  const pj = await h.c.waitFor('peer-joined');
  assert.equal(pj.peer.id, v.joined.you);
  assert.equal((await h.c.waitFor('room', (m) => m.room.viewers === 1)).room.viewers, 1);
  assert.equal((await v.c.waitFor('room', (m) => m.room.viewers === 1)).room.viewers, 1);
  h.c.ws.close();
  v.c.ws.close();
});

test('relay de signal host↔espectador; espectador→espectador rejeitado', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v1 = await joinViewer(room.code, 'V1');
  const v2 = await joinViewer(room.code, 'V2');
  h.c.send({ t: 'signal', to: v1.joined.you, data: { kind: 'offer', sdp: 'sdp-x' } });
  const s1 = await v1.c.waitFor('signal');
  assert.equal(s1.from, h.joined.you);
  assert.deepEqual(s1.data, { kind: 'offer', sdp: 'sdp-x' });
  v1.c.send({ t: 'signal', to: h.joined.you, data: { kind: 'answer', sdp: 'sdp-y' } });
  const s2 = await h.c.waitFor('signal');
  assert.equal(s2.from, v1.joined.you);
  v1.c.send({ t: 'signal', to: v2.joined.you, data: { kind: 'request-offer' } });
  assert.equal((await v1.c.waitFor('error')).code, 'not-allowed');
  assert.ok(!v2.c.msgs.some((m) => m.t === 'signal'));
  for (const c of [h.c, v1.c, v2.c]) c.ws.close();
});

test('stream do host é transmitido com live true', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v = await joinViewer(room.code);
  h.c.send({ t: 'stream', info: { live: true, source: 'window', audio: 'tab', audioEnabled: true, width: 1920, height: 1080, fps: 60 } });
  const m = await v.c.waitFor('room', (x) => x.room.stream.live);
  assert.equal(m.room.stream.source, 'window');
  assert.equal(typeof m.room.stream.startedAt, 'number');
  h.c.ws.close();
  v.c.ws.close();
});

test('host encerra → espectadores recebem ended host-ended', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v = await joinViewer(room.code);
  h.c.send({ t: 'end' });
  assert.equal((await v.c.waitFor('ended')).reason, 'host-ended');
  assert.equal((await fetch(`http://${base}/api/rooms/${room.code}`)).status, 404);
});

test('sala cheia → room-full', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const a = await joinViewer(room.code);
  const b = await joinViewer(room.code);
  const c = await connect();
  c.send({ t: 'join', code: room.code, role: 'viewer', name: 'C' });
  assert.equal((await c.waitFor('error')).code, 'room-full');
  for (const x of [h.c, a.c, b.c, c]) x.ws.close();
});

test('host cai → hostOnline false; volta na graça; depois expira host-timeout', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v = await joinViewer(room.code);
  h.c.ws.close();
  const m = await v.c.waitFor('room', (x) => !x.room.hostOnline);
  assert.equal(m.room.stream.live, false);
  // reconecta dentro da graça
  const h2 = await joinHost(room.code, hostKey);
  assert.equal(h2.joined.peers.length, 1);
  await v.c.waitFor('room', (x) => x.room.hostOnline);
  await new Promise((r) => setTimeout(r, 350));
  assert.equal((await fetch(`http://${base}/api/rooms/${room.code}`)).status, 200);
  // cai de novo e não volta
  h2.c.ws.close();
  assert.equal((await v.c.waitFor('ended')).reason, 'host-timeout');
});
