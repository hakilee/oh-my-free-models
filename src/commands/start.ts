import { ConfigStore } from '../config/store.js';
import { getLogPath } from '../config/paths.js';
import { startDaemon } from '../daemon/daemon.js';
import { startBackgroundLatencyProber } from '../latency/background-prober.js';
import { createOmfmServer, listen } from '../server/create-server.js';

export async function runStartCommand(options: { port?: number; daemon?: boolean; daemonChild?: boolean; store?: ConfigStore; startProber?: typeof startBackgroundLatencyProber } = {}): Promise<void> {
  const store = options.store ?? new ConfigStore();
  store.ensureRoot();
  const config = store.readConfig();
  const port = options.port ?? config.port;
  if (config.port !== port) store.writeConfig({ ...config, port });

  if (options.daemon && !options.daemonChild) {
    const pid = startDaemon({ port, store });
    console.log(`omfm daemon started on port ${port} (pid ${pid})`);
    return;
  }

  const server = createOmfmServer({ store });
  const actualPort = await listen(server, port);
  const prober = (options.startProber ?? startBackgroundLatencyProber)({
    store,
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`omfm background latency probe failed: ${message}`);
    },
  });
  if (options.daemonChild) {
    store.writeDaemon({ pid: process.pid, port: actualPort, logPath: getLogPath(store.paths.root), startedAt: new Date().toISOString() });
  }
  console.log(`omfm listening on http://localhost:${actualPort}`);

  const shutdown = () => {
    prober.stop();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
