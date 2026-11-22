// Uso: node tools/ws-smoke.mjs <pid-com-audio> [porta]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WebSocket = require('../../../node_modules/ws');
const pid = Number(process.argv[2]);
const port = Number(process.argv[3] || 47613);
const url = `ws://127.0.0.1:${port}`;
const fail = (m) => { console.error('FALHA:', m); process.exit(1); };

const evil = new WebSocket(url, { origin: 'https://evil.example' });
const evilResult = await new Promise((res) => {
  evil.on('unexpected-response', (_q, r) => res(r.statusCode));
  evil.on('open', () => res('open'));
  evil.on('error', () => {});
});
console.log('origem evil ->', evilResult);
if (evilResult !== 403) fail('origem nao permitida deveria receber 403');

const ws = new WebSocket(url, { origin: 'http://localhost:5173' });
let bytes = 0;
const texts = [];
let waiters = [];
ws.on('message', (d, isBin) => {
  if (isBin) { bytes += d.length; return; }
  const m = JSON.parse(d.toString()); texts.push(m); console.log('<-', JSON.stringify(m).slice(0, 300));
  waiters = waiters.filter((w) => !(w.t === m.t && (w.fn(m), true)));
});
const wait = (t) => new Promise((r, j) => { waiters.push({ t, fn: r }); setTimeout(() => j(new Error('timeout ' + t)), 6000); });
await new Promise((r) => ws.on('open', r));
ws.send(JSON.stringify({ t: 'hello' })); await wait('hello');
ws.send(JSON.stringify({ t: 'ping' })); await wait('pong');
ws.send(JSON.stringify({ t: 'list' })); await wait('sessions');
ws.send(JSON.stringify({ t: 'start', pid, mode: 'include' }));
const st = await Promise.race([wait('started'), wait('error')]);
bytes = 0;
await new Promise((r) => setTimeout(r, 2000));
console.log('bytes em 2s:', bytes, '(esperado ~384000)');
ws.send(JSON.stringify({ t: 'stop' })); await wait('stopped');
ws.close();
if (bytes < 288000 || bytes > 480000) fail('bytes fora da faixa');
console.log('OK');
process.exit(0);
