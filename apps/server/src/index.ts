import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadConfig, type Config } from './config.ts';
import { createHttpHandler } from './http.ts';
import { RoomRegistry } from './rooms.ts';
import { createSignaling } from './signaling.ts';

export type ServerOptions = Partial<Config>;

export interface AlexandrusServer {
  server: Server;
  port: number;
  registry: RoomRegistry;
  close(): Promise<void>;
}

export async function createAlexandrusServer(options: ServerOptions = {}): Promise<AlexandrusServer> {
  const config: Config = { ...loadConfig(), ...options };
  const registry = new RoomRegistry({
    maxViewers: config.maxViewers,
    hostGraceMs: config.hostGraceMs,
    unclaimedRoomMs: config.unclaimedRoomMs,
  });
  const server = createServer(createHttpHandler(registry, config));
  const signaling = createSignaling(registry);
  server.on('upgrade', (req, socket, head) => signaling.handleUpgrade(req, socket, head));

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => resolveListen());
  });
  const port = (server.address() as AddressInfo).port;

  return {
    server,
    port,
    registry,
    close() {
      registry.shutdown();
      signaling.close();
      return new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections();
      });
    },
  };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const config = loadConfig();
  const app = await createAlexandrusServer(config);
  console.log(`Alexandrus servidor em http://localhost:${app.port} (ws em /ws)`);
  const stop = () => {
    app.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
