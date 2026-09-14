import { rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { catalogSource, loadCatalog } from "@agnostic/catalog";
import {
  type AgnosticPaths,
  agnosticHome,
  agnosticPaths,
  type DaemonInfo,
  DEFAULT_DAEMON_PORT,
  type ExecutorProvider,
  scrubEnv,
} from "@agnostic/core";
import { createTmuxExecutor } from "@agnostic/executor-tmux";
import { writeHookScript } from "@agnostic/hooks";
import { type Ledger, openLedger } from "@agnostic/ledger";
import { type ServerType, serve } from "@hono/node-server";
import type { Hono } from "hono";
import { createApp, realDetect, realDetectEditors } from "./app.js";
import { ensureAuthToken } from "./auth.js";
import { createCatalogStore } from "./catalog-store.js";
import { readDaemonConfig } from "./daemon-config.js";
import { DaemonError } from "./error.js";
import { createEventFeed, type EventFeed } from "./event-feed.js";
import { createLogger, type Logger } from "./log.js";
import { createVerdictSweep, type VerdictSweep } from "./verdict-sweep.js";

const LOG_FILE = "agnd.log";

/** How often a merged or deleted branch is noticed without anyone asking (ADR 022). */
const SWEEP_MS = 5 * 60_000;

// The version the health route reports comes from the package that is actually running.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

type RunningDaemon = { port: number; close(): Promise<void> };

/**
 * The foreground daemon: one HTTP server on loopback, one ledger, one log. `daemon.json` is
 * written only after the port is actually bound, so a file that exists means a port that answered.
 */
export async function runDaemon(
  opts: { home?: string; port?: number } = {},
): Promise<RunningDaemon> {
  const paths = agnosticPaths(opts.home === undefined ? agnosticHome() : resolve(opts.home));
  const log = createLogger(join(paths.logs, LOG_FILE));
  const token = await ensureAuthToken(paths, log);
  // The one hook command on this machine, so an install has a script to point at.
  await writeHookScript(paths);
  const config = await readDaemonConfig(paths);
  // The env agnd was started from is the env detection sees and every harness is launched with;
  // troubleshooting.md says so too.
  const env = scrubEnv(process.env);
  // Checked here, with the config: a bad AGNOSTIC_CATALOG_URL refuses to start before the ledger,
  // the executor and the log are open.
  const source = catalogSource(env);
  const wanted = opts.port ?? config.port ?? DEFAULT_DAEMON_PORT;
  const ledger = openLedger(paths.db);
  const feed = createEventFeed(ledger);
  const startedAt = new Date().toISOString();
  const executor = createTmuxExecutor({ paths });
  const verdicts = createVerdictSweep({ ledger, executor, log }, SWEEP_MS);
  const home = homedir();
  // The store owns the reload, so a catalog downloaded while the daemon runs is served at once.
  const catalog = createCatalogStore({
    loaded: await loadCatalog({ downloaded: paths.catalog }),
    downloaded: paths.catalog,
    log,
  });
  let port = wanted;
  const { app, close: closeApp } = createApp({
    ledger,
    paths,
    token,
    log,
    feed,
    version,
    startedAt,
    executor,
    env,
    home,
    catalog,
    verdicts,
    catalogSource: source,
    catalogCheck: config.catalogCheck,
    port: () => port,
    detect: realDetect(env, home, paths, catalog),
    detectEditors: realDetectEditors(env, home),
  });

  let server: ServerType;
  try {
    ({ server, port } = await listen(app, wanted));
  } catch (cause) {
    await closeApp();
    feed.close();
    verdicts.close();
    await executor.close();
    ledger.close();
    log.close();
    throw bindFailed(wanted, cause);
  }
  const info: DaemonInfo = { pid: process.pid, port, startedAt };
  await writeFile(paths.daemon, `${JSON.stringify(info, null, 2)}\n`, "utf8");
  log.info("daemon listening", { port, pid: process.pid });

  const close = closer({ server, closeApp, feed, verdicts, executor, ledger, log, paths });
  const shutdown = () => {
    void close().then(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return {
    port,
    close: async () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      await close();
    },
  };
}

function listen(app: Hono, port: number): Promise<{ server: ServerType; port: number }> {
  return new Promise((resolveListen, reject) => {
    // ADR 002: loopback only. There is no option to bind anywhere else.
    const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, (address) => {
      resolveListen({ server, port: address.port });
    });
    server.once("error", reject);
  });
}

function closer(parts: {
  server: ServerType;
  /** Stops the catalog checker and waits for any close still running; the rest is the caller's. */
  closeApp: () => Promise<void>;
  feed: EventFeed;
  verdicts: VerdictSweep;
  executor: ExecutorProvider;
  ledger: Ledger;
  log: Logger;
  paths: AgnosticPaths;
}): () => Promise<void> {
  let closed: Promise<void> | null = null;
  return () => {
    closed ??= (async () => {
      // Open SSE streams would hold `close` forever, so the sockets go first.
      if ("closeAllConnections" in parts.server) {
        parts.server.closeAllConnections();
      }
      await new Promise<void>((done) => parts.server.close(() => done()));
      await parts.closeApp();
      parts.feed.close();
      // The exit watcher and the sweep write through the ledger, so both stop before it does.
      parts.verdicts.close();
      await parts.executor.close();
      parts.ledger.close();
      await rm(parts.paths.daemon, { force: true });
      parts.log.info("daemon stopped");
      parts.log.close();
    })();
    return closed;
  };
}

function bindFailed(port: number, cause: unknown): DaemonError {
  if (cause instanceof Error && "code" in cause && cause.code === "EADDRINUSE") {
    return new DaemonError(`another process holds port ${port}`, {
      code: "port-in-use",
      hint: "Set `port` in ~/.agnostic/config.yaml, or run `agn daemon restart --force`.",
      cause,
    });
  }
  return new DaemonError(`the daemon could not bind 127.0.0.1:${port}`, {
    code: "bind-failed",
    hint: "Check ~/.agnostic/logs/agnd.log.",
    cause,
  });
}
