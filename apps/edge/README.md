# Alexandrus Edge

Servidor de salas e sinalização do Alexandrus rodando na Cloudflare: um Worker na frente, um Durable Object `Room` por sala (WebSocket Hibernation API, SQLite) e um `Lobby` único com a lista de salas públicas. Mesmo protocolo e mesmas mensagens de `apps/server`.

## Desenvolvimento

```
npm run dev -w apps/edge        # wrangler dev em http://127.0.0.1:8788
npm run smoke -w apps/edge      # node test/smoke.mjs [baseUrl] [origin]
```

O smoke test usa a origem `http://localhost:5173`; passe `--var ALLOWED_ORIGINS:...` ao `wrangler dev` para liberá-la.

## Deploy

```
npx wrangler deploy
```

O cliente conecta em `wss://<worker>/ws?code=K7Q2MX` e depois envia a mensagem `join` normal.

## Variáveis (`wrangler.jsonc`)

- `ALLOWED_ORIGINS`: origens de navegador permitidas (separadas por vírgula).
- `STUN_URLS`, `MAX_VIEWERS`.
- Opcionais: `TURN_URLS`, `TURN_SECRET` (use `wrangler secret put`), `TURN_TTL` (padrão 3600).
- Binding `ROOM_CREATE`: limite de 10 salas por minuto por `cf-connecting-ip`.

## Limites e diferenças em relação ao servidor Node

- Não serve o site (o web fica na Vercel); só `/api/*` e `/ws`.
- `/api/health` conta só salas públicas (vêm do Lobby).
- Sala inexistente: o socket é aceito, responde `room-not-found` ao `join` e fecha.
- Limite de 40 mensagens/s por socket é em memória (zera se o Durable Object hibernar).
- Sem heartbeat ping/pong do servidor; a Cloudflare cuida da conexão.
- Anfitrião some: 60 s de tolerância; sala nunca aberta expira em 10 min (um alarme por sala).
- Sala encerrada apaga todo o armazenamento do Durable Object.
