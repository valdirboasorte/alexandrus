import type { IncomingMessage } from 'node:http';

/*
 * Quem pode usar este servidor a partir de um navegador.
 * - Sem ALLOWED_ORIGINS configurado: aberto (desenvolvimento).
 * - Mesma origem (o servidor servindo o próprio site): sempre permitido.
 * - Site hospedado em outro lugar (ex.: Vercel): precisa estar em ALLOWED_ORIGINS.
 * Clientes sem Origin (curl, testes) passam: a proteção é contra páginas de outros sites.
 */
export function isOriginAllowed(req: IncomingMessage, allowed: string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (allowed.length === 0) return true;
  if (allowed.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Cabeçalhos CORS para a API quando o site vem de outra origem permitida. */
export function corsHeaders(req: IncomingMessage, allowed: string[]): Record<string, string> {
  const origin = req.headers.origin;
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
