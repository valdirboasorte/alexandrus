/*
 * Onde está o servidor de salas.
 * - Vazio (padrão): mesma origem do site (desenvolvimento com Vite, ou o
 *   servidor do Alexandrus servindo o próprio site).
 * - VITE_ALEXANDRUS_SERVER=https://servidor.exemplo: site estático hospedado
 *   em outro lugar (ex.: Vercel), que não roda WebSocket.
 */
const configured = String(import.meta.env.VITE_ALEXANDRUS_SERVER ?? '')
  .trim()
  .replace(/\/+$/, '');

export const SERVER_BASE = configured;

export function apiUrl(path: string) {
  return `${SERVER_BASE}${path}`;
}

/**
 * URL do WebSocket de sinalização. O código da sala vai na query: na
 * Cloudflare é ele que leva a conexão ao Durable Object certo (o servidor
 * Node simplesmente ignora).
 */
export function signalingUrl(code?: string) {
  const query = code ? `?code=${encodeURIComponent(code)}` : '';
  if (SERVER_BASE) return `${SERVER_BASE.replace(/^http/, 'ws')}/ws${query}`;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws${query}`;
}
