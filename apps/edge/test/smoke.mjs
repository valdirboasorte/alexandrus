// Smoke test do servidor edge. Uso: node test/smoke.mjs [baseUrl] [origin]
import { WebSocket } from 'ws';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const ORIGIN = process.argv[3] ?? 'http://localhost:5173';
const WSBASE = BASE.replace(/^http/, 'ws');
let failed = 0;

function check(name, cond, extra) {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${cond ? '' : ' -> ' + JSON.stringify(extra)}`);
  if (!cond) failed++;
}
const api = async (path, init = {}, origin = ORIGIN) => {
  const res = await fetch(BASE + path, { ...init, headers: { Origin: origin, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};
const post = (body) => api('/api/rooms', { method: 'POST', body: JSON.stringify(body) });

class Client {
  constructor(code, origin = ORIGIN) {
    this.msgs = [];
    this.waiters = [];
    this.ws = new WebSocket(`${WSBASE}/ws?code=${code}`, { headers: { Origin: origin } });
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => !w(m));
    });
    this.closed = new Promise((r) => this.ws.on('close', r));
    this.opened = new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  /** Espera uma mensagem que satisfaça pred (inclui já recebidas após `from`). */
  wait(pred, ms = 5000, from = 0) {
    for (let i = from; i < this.msgs.length; i++) if (pred(this.msgs[i])) return Promise.resolve(this.msgs[i]);
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout esperando mensagem')), ms);
      this.waiters.push((m) => { if (pred(m)) { clearTimeout(t); res(m); return true; } return false; });
    });
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const h = await api('/api/health');
  check('health', h.status === 200 && h.body?.ok === true && h.body.protocol === 1, h);

  const ice = await api('/api/ice');
  check('ice', ice.status === 200 && Array.isArray(ice.body?.iceServers), ice);

  const pub = await post({ name: 'Sala Pública', hostName: 'Ana', visibility: 'public' });
  check('create public', pub.status === 201 && pub.body.room.code.length === 6 && pub.body.hostKey, pub);
  const priv = await post({ name: 'Sala Privada', hostName: 'Bia', visibility: 'private' });
  check('create private', priv.status === 201 && priv.body.room.visibility === 'private', priv);
  const bad = await post({ visibility: 'x' });
  check('create invalid -> 400', bad.status === 400 && bad.body.error === 'bad-request', bad);

  const lst = await api('/api/rooms');
  const codes = lst.body?.rooms?.map((r) => r.code) ?? [];
  check('list shows public, hides private', codes.includes(pub.body.room.code) && !codes.includes(priv.body.room.code), lst.body);

  const got = await api('/api/rooms/' + pub.body.room.code.toLowerCase());
  check('get room by code', got.status === 200 && got.body.room.name === 'Sala Pública', got);
  const nf = await api('/api/rooms/ABCDEF');
  check('get unknown room -> 404', nf.status === 404 && nf.body.error === 'room-not-found', nf);

  // viewer em sala inexistente
  const ghost = new Client('ABCDEF');
  await ghost.opened;
  ghost.send({ t: 'join', code: 'ABCDEF', role: 'viewer', name: 'X' });
  const ge = await ghost.wait((m) => m.t === 'error');
  check('join unknown room -> room-not-found', ge.code === 'room-not-found', ge);
  await ghost.closed;

  const code = pub.body.room.code;
  const hostKey = pub.body.hostKey;

  // chave errada
  const wk = new Client(code);
  await wk.opened;
  wk.send({ t: 'join', code, role: 'host', hostKey: 'errada', name: 'Intruso' });
  const wke = await wk.wait((m) => m.t === 'error');
  check('wrong hostKey -> bad-host-key', wke.code === 'bad-host-key', wke);
  wk.ws.close();

  // host + viewers
  let host = new Client(code);
  await host.opened;
  host.send({ t: 'join', code, role: 'host', hostKey, name: 'Ana' });
  const hj = await host.wait((m) => m.t === 'joined');
  check('host joined', hj.role === 'host' && hj.room.hostOnline === true, hj);

  const dup = new Client(code);
  await dup.opened;
  dup.send({ t: 'join', code, role: 'host', hostKey, name: 'Ana2' });
  const de = await dup.wait((m) => m.t === 'error');
  check('second host -> host-already-connected', de.code === 'host-already-connected', de);
  dup.ws.close();

  const v1 = new Client(code);
  const v2 = new Client(code);
  await Promise.all([v1.opened, v2.opened]);
  v1.send({ t: 'join', code, role: 'viewer', name: 'Caio' });
  const v1j = await v1.wait((m) => m.t === 'joined');
  const pj = await host.wait((m) => m.t === 'peer-joined');
  check('host gets peer-joined', pj.peer.id === v1j.you && pj.peer.role === 'viewer', pj);
  check('viewer sees host in peers', v1j.peers.length === 1 && v1j.peers[0].id === hj.you, v1j);
  const hr = await host.wait((m) => m.t === 'room' && m.room.viewers === 1);
  const vr = await v1.wait((m) => m.t === 'room' && m.room.viewers === 1);
  check('everyone gets room viewers=1', hr && vr);

  v2.send({ t: 'join', code, role: 'viewer', name: 'Duda' });
  const v2j = await v2.wait((m) => m.t === 'joined');

  // sinalização
  host.send({ t: 'signal', to: v1j.you, data: { kind: 'offer', sdp: 'v=0' } });
  const s1 = await v1.wait((m) => m.t === 'signal');
  check('signal host->viewer', s1.from === hj.you && s1.data.kind === 'offer', s1);
  v1.send({ t: 'signal', to: hj.you, data: { kind: 'answer', sdp: 'v=0' } });
  const s2 = await host.wait((m) => m.t === 'signal');
  check('signal viewer->host', s2.from === v1j.you && s2.data.kind === 'answer', s2);
  v1.send({ t: 'signal', to: v2j.you, data: { kind: 'request-offer' } });
  const s3 = await v1.wait((m) => m.t === 'error');
  check('viewer->viewer rejected (not-allowed)', s3.code === 'not-allowed', s3);
  v1.send({ t: 'signal', to: 'nope', data: { kind: 'request-offer' } });
  const s4 = await v1.wait((m) => m.t === 'error' && m.code === 'peer-not-found');
  check('unknown peer -> peer-not-found', !!s4);

  // viewer não pode usar stream
  v1.send({ t: 'stream', info: { live: true, source: 'monitor', audio: 'none', audioEnabled: false } });
  const s5 = await v1.wait((m) => m.t === 'error' && m.code === 'not-allowed');
  check('viewer stream -> not-allowed', !!s5);

  // stream ao vivo
  host.send({ t: 'stream', info: { live: true, source: 'monitor', audio: 'system', audioEnabled: true, width: 1920, height: 1080, fps: 60 } });
  const sr = await v2.wait((m) => m.t === 'room' && m.room.stream.live === true);
  check('stream live broadcast', sr.room.stream.source === 'monitor' && sr.room.stream.startedAt > 0, sr);
  const lst2 = await api('/api/rooms');
  check('list reflects live stream', lst2.body.rooms.find((r) => r.code === code)?.stream.live === true, lst2.body);

  // ping
  host.send({ t: 'ping', ts: 42 });
  const pong = await host.wait((m) => m.t === 'pong');
  check('ping -> pong', pong.ts === 42);

  // host cai
  const mark = v1.msgs.length;
  host.ws.terminate();
  const off = await v1.wait((m) => m.t === 'room' && m.room.hostOnline === false, 5000, mark);
  check('host disconnect -> hostOnline false, stream offline', off.room.stream.live === false, off);

  // host volta dentro da graça
  host = new Client(code);
  await host.opened;
  host.send({ t: 'join', code, role: 'host', hostKey, name: 'Ana' });
  await host.wait((m) => m.t === 'joined');
  const back = await v1.wait((m) => m.t === 'room' && m.room.hostOnline === true, 5000, mark);
  check('host rejoin in grace -> hostOnline true', !!back);

  // host encerra
  const e1 = v1.wait((m) => m.t === 'ended');
  const e2 = v2.wait((m) => m.t === 'ended');
  host.send({ t: 'end' });
  const [r1, r2] = await Promise.all([e1, e2]);
  check('end -> viewers get ended host-ended', r1.reason === 'host-ended' && r2.reason === 'host-ended', [r1, r2]);
  await sleep(300);
  const after = await api('/api/rooms/' + code);
  check('GET room after end -> 404', after.status === 404, after);
  const lst3 = await api('/api/rooms');
  check('list drops ended room', !lst3.body.rooms.some((r) => r.code === code), lst3.body);

  // origem proibida
  const evil = await api('/api/health', {}, 'https://evil.example');
  check('evil origin /api/health -> 403', evil.status === 403, evil);
  const evilWs = await new Promise((res) => {
    const ws = new WebSocket(`${WSBASE}/ws?code=${code}`, { headers: { Origin: 'https://evil.example' } });
    ws.on('unexpected-response', (_q, r) => res(r.statusCode));
    ws.on('open', () => res('open'));
    ws.on('error', () => {});
  });
  check('evil origin WS upgrade -> 403', evilWs === 403, evilWs);

  for (const c of [host, v1, v2]) c.ws.terminate();
}

main()
  .catch((e) => { console.log('FAIL exceção:', e); failed++; })
  .finally(() => {
    console.log(failed ? `\n${failed} falha(s)` : '\nTudo certo');
    process.exit(failed ? 1 : 0);
  });
