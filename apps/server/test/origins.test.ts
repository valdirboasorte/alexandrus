import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createAlexandrusServer, type AlexandrusServer } from '../src/index.ts';

// Site hospedado em outro lugar (ex.: Vercel) falando com este servidor.
const SITE = 'https://alexandrus.example.app';
let app: AlexandrusServer;
let base: string;

before(async () => {
  app = await createAlexandrusServer({ port: 0, host: '127.0.0.1', publicDir: '/nao-existe', allowedOrigins: [SITE] });
  base = `http://127.0.0.1:${app.port}`;
});

after(async () => {
  await app.close();
});

function wsStatus(origin: string): Promise<'open' | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { origin });
    ws.on('open', () => {
      ws.close();
      resolve('open');
    });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('error', () => {});
  });
}

test('origem permitida recebe CORS e preflight 204', async () => {
  const r = await fetch(`${base}/api/health`, { headers: { Origin: SITE } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), SITE);
  const pre = await fetch(`${base}/api/rooms`, { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods') ?? '', /POST/);
});

test('outra origem é recusada na API e no WebSocket', async () => {
  const r = await fetch(`${base}/api/health`, { headers: { Origin: 'https://outro.site' } });
  assert.equal(r.status, 403);
  assert.equal(await wsStatus('https://outro.site'), 403);
  assert.equal(await wsStatus(SITE), 'open');
});

test('mesma origem continua funcionando (servidor servindo o próprio site)', async () => {
  const r = await fetch(`${base}/api/health`, { headers: { Origin: base } });
  assert.equal(r.status, 200);
  assert.equal(await wsStatus(base), 'open');
});
