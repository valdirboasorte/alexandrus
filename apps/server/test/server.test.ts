import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import type { CreateRoomResponse, RoomListResponse, ServerMessage } from '../../../packages/protocol/src/index.ts';
import { createAlexandrusServer, type AlexandrusServer } from '../src/index.ts';

let app: AlexandrusServer;
let base: string;

before(async () => {
  app = await createAlexandrusServer({ port: 0, host: '127.0.0.1', maxViewers: 6, hostGraceMs: 200, publicDir: '/nao-existe' });
  base = `127.0.0.1:${app.port}`;
});
after(async () => {
  await app.close();
});

/** Cria direto no registro (o POST /api/rooms tem limite de 10 por minuto por IP). */
async function createRoom(visibility: 'public' | 'private' = 'private', name = 'Minha sala'): Promise<CreateRoomResponse> {
  const r = app.registry.create({ name, hostName: 'Ana', visibility });
  return { room: app.registry.summary(r), hostKey: r.hostKey };
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
  c.send({ t: 'join', v: 2, code, role: 'host', hostKey, name: 'Ana' });
  const joined = await c.waitFor('joined');
  return { c, joined };
}

async function joinViewer(code: string, name = 'Bia') {
  const c = await connect();
  c.send({ t: 'join', v: 2, code, role: 'viewer', name });
  const joined = await c.waitFor('joined');
  return { c, joined };
}

test('cria sala via HTTP e busca', async () => {
  const r0 = await fetch(`http://${base}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Minha sala', hostName: 'Ana', visibility: 'private' }),
  });
  assert.equal(r0.status, 201);
  const { room, hostKey } = (await r0.json()) as CreateRoomResponse;
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
  c.send({ t: 'join', v: 2, code: 'ZZZZZZ', role: 'viewer', name: 'x' });
  const e = await c.waitFor('error');
  assert.equal(e.code, 'room-not-found');
  c.ws.close();
});

test('mensagem antes de entrar → not-joined; chave errada → bad-host-key', async () => {
  const { room } = await createRoom();
  const c = await connect();
  c.send({ t: 'stream', info: {} });
  assert.equal((await c.waitFor('error')).code, 'not-joined');
  c.send({ t: 'join', v: 2, code: room.code, role: 'host', hostKey: 'errada', name: 'Ana' });
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

test('relay de signal host↔espectador e espectador↔espectador', async () => {
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
  const s3 = await v2.c.waitFor('signal');
  assert.equal(s3.from, v1.joined.you);
  assert.deepEqual(s3.data, { kind: 'request-offer' });
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

test('tela diz o que passa (content): film chega a quem assiste; valor inválido → bad-request', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v = await joinViewer(room.code);
  h.c.send({ t: 'stream', info: { live: true, source: 'browser', audio: 'tab', audioEnabled: true, content: 'film' } });
  const m = await v.c.waitFor('room', (x) => x.room.stream.live);
  assert.equal(m.room.streams[0].info.content, 'film');
  h.c.send({ t: 'stream', info: { live: true, source: 'browser', audio: 'tab', audioEnabled: true, content: 'novela' } });
  assert.equal((await h.c.waitFor('error')).code, 'bad-request');
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
  const vs: Awaited<ReturnType<typeof joinViewer>>[] = [];
  for (let i = 0; i < 6; i++) vs.push(await joinViewer(room.code));
  const c = await connect();
  c.send({ t: 'join', v: 2, code: room.code, role: 'viewer', name: 'C' });
  assert.equal((await c.waitFor('error')).code, 'room-full');
  for (const x of [h.c, c, ...vs.map((v) => v.c)]) x.ws.close();
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

const LIVE = { live: true, source: 'window', audio: 'tab', audioEnabled: true } as const;

test('join com protocolo antigo → outdated e fecha', async () => {
  const { room } = await createRoom();
  const c = await connect();
  const closed = new Promise<void>((res) => c.ws.once('close', () => res()));
  c.send({ t: 'join', v: 1, code: room.code, role: 'viewer', name: 'x' });
  assert.equal((await c.waitFor('error')).code, 'outdated');
  await closed;
  const d = await connect();
  d.send({ t: 'join', code: room.code, role: 'viewer', name: 'x' });
  assert.equal((await d.waitFor('error')).code, 'outdated');
  d.ws.close();
});

test('espectador vê host e outros espectadores; peer-joined chega a todos', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v1 = await joinViewer(room.code, 'V1');
  const v2 = await joinViewer(room.code, 'V2');
  assert.equal(v2.joined.peers.length, 2);
  assert.deepEqual(v2.joined.peers.map((p) => p.role).sort(), ['host', 'viewer']);
  const pj = await v1.c.waitFor('peer-joined', (m) => m.peer.id === v2.joined.you);
  assert.equal(pj.peer.role, 'viewer');
  v2.c.ws.close();
  assert.equal((await v1.c.waitFor('peer-left')).peerId, v2.joined.you);
  assert.equal((await h.c.waitFor('peer-left')).peerId, v2.joined.you);
  h.c.ws.close();
  v1.c.ws.close();
});

test('espectador publica tela com shareOpen; aparece em streams com host:false', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v = await joinViewer(room.code, 'V1');
  assert.equal(v.joined.room.shareOpen, true);
  assert.equal(v.joined.room.maxPresenters, 4);
  v.c.send({ t: 'stream', info: LIVE });
  const m = await h.c.waitFor('room', (x) => x.room.streams.length === 1);
  assert.equal(m.room.streams[0].host, false);
  assert.equal(m.room.streams[0].peerId, v.joined.you);
  assert.equal(m.room.streams[0].name, 'V1');
  // host offline: stream cai para a primeira tela ao vivo
  assert.equal(m.room.stream.live, true);
  h.c.ws.close();
  v.c.ws.close();
});

test('shareOpen:false limpa telas de espectadores e bloqueia novas', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v = await joinViewer(room.code);
  v.c.send({ t: 'stream', info: LIVE });
  await h.c.waitFor('room', (x) => x.room.streams.length === 1);
  h.c.send({ t: 'room-update', shareOpen: 'nao' });
  assert.equal((await h.c.waitFor('error')).code, 'bad-request');
  h.c.send({ t: 'room-update', shareOpen: false });
  const m = await v.c.waitFor('room', (x) => !x.room.shareOpen);
  assert.equal(m.room.streams.length, 0);
  assert.equal(m.room.stream.live, false);
  v.c.send({ t: 'stream', info: LIVE });
  assert.equal((await v.c.waitFor('error')).code, 'share-closed');
  h.c.send({ t: 'stream', info: LIVE });
  await v.c.waitFor('room', (x) => x.room.streams.length === 1 && x.room.streams[0].host);
  h.c.ws.close();
  v.c.ws.close();
});

test('5a tela ao vivo → stage-full', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const vs: Awaited<ReturnType<typeof joinViewer>>[] = [];
  for (let i = 0; i < 4; i++) vs.push(await joinViewer(room.code, `V${i}`));
  h.c.send({ t: 'stream', info: LIVE });
  for (let i = 0; i < 3; i++) vs[i].c.send({ t: 'stream', info: LIVE });
  await h.c.waitFor('room', (x) => x.room.streams.length === 4);
  vs[3].c.send({ t: 'stream', info: LIVE });
  assert.equal((await vs[3].c.waitFor('error')).code, 'stage-full');
  // quem já está ao vivo pode atualizar a própria tela
  vs[0].c.send({ t: 'stream', info: { ...LIVE, audioEnabled: false } });
  await h.c.waitFor('room', (x) => x.room.streams.some((s) => s.peerId === vs[0].joined.you && !s.info.audioEnabled));
  assert.equal(h.c.msgs.filter((m) => m.t === 'error').length, 0);
  h.c.ws.close();
  for (const v of vs) v.c.ws.close();
});

test('ice sem side → bad-request; bye é encaminhado', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v = await joinViewer(room.code);
  v.c.send({ t: 'signal', to: h.joined.you, data: { kind: 'ice', candidate: null } });
  assert.equal((await v.c.waitFor('error')).code, 'bad-request');
  v.c.send({ t: 'signal', to: h.joined.you, data: { kind: 'ice', side: 'sub', candidate: null } });
  assert.deepEqual((await h.c.waitFor('signal')).data, { kind: 'ice', side: 'sub', candidate: null });
  v.c.send({ t: 'signal', to: h.joined.you, data: { kind: 'bye' } });
  assert.deepEqual((await h.c.waitFor('signal', (m) => m.data.kind === 'bye')).data, { kind: 'bye' });
  v.c.send({ t: 'signal', to: v.joined.you, data: { kind: 'bye' } });
  assert.equal((await v.c.waitFor('error', (m) => m.code === 'peer-not-found')).code, 'peer-not-found');
  h.c.ws.close();
  v.c.ws.close();
});

test('host sem tela: stream = 1a tela de espectador; some quando ele desconecta', async () => {
  const { room, hostKey } = await createRoom();
  const h = await joinHost(room.code, hostKey);
  const v1 = await joinViewer(room.code, 'V1');
  const v2 = await joinViewer(room.code, 'V2');
  v1.c.send({ t: 'stream', info: { ...LIVE, startedAt: 2000 } });
  v2.c.send({ t: 'stream', info: { ...LIVE, startedAt: 1000 } });
  const m = await h.c.waitFor('room', (x) => x.room.streams.length === 2);
  assert.deepEqual(m.room.streams.map((s) => s.name), ['V2', 'V1']);
  assert.equal(m.room.stream.startedAt, 1000);
  h.c.send({ t: 'stream', info: { ...LIVE, startedAt: 3000 } });
  const m2 = await v1.c.waitFor('room', (x) => x.room.streams.length === 3);
  assert.equal(m2.room.stream.startedAt, 3000);
  h.c.ws.close();
  await v1.c.waitFor('room', (x) => !x.room.hostOnline);
  v2.c.ws.close();
  const m3 = await v1.c.waitFor('room', (x) => x.room.streams.length === 1 && x.room.viewers === 1);
  assert.equal(m3.room.streams[0].name, 'V1');
  v1.c.ws.close();
});
