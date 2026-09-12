import { rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
import { createApp, realDetect } from "./app.js";
import { ensureAuthToken } from "./auth.js";
import { readDaemonConfig } from "./daemon-config.js";
import { DaemonError } from "./error.js";
import { createEventFeed, type EventFeed } from "./event-feed.js";
import { createLogger, type Logger } from "./log.js";

const LOG_FILE = "agnd.log";

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
  const wanted = opts.port ?? (await readDaemonConfig(paths)).port ?? DEFAULT_DAEMON_PORT;
  const ledger = openLedger(paths.db);
  const feed = createEventFeed(ledger);
  const startedAt = new Date().toISOString();
  // The env agnd was started from is the env detection sees and every harness is launched with;
  // troubleshooting.md says so too.
  const env = scrubEnv(process.env);
  const executor = createTmuxExecutor({ paths });
  let port = wanted;
  const app = createApp({
    ledger,
    paths,
    token,
    log,
    feed,
    version,
    startedAt,
    executor,
    env,
    port: () => port,
    detect: realDetect(env, homedir()),
  });

  let server: ServerType;
  try {
    ({ server, port } = await listen(app, wanted));
  } catch (cause) {
    feed.close();
    await executor.close();
    ledger.close();
    log.close();
    throw bindFailed(wanted, cause);
  }
  const info: DaemonInfo = { pid: process.pid, port, startedAt };
  await writeFile(paths.daemon, `${JSON.stringify(info, null, 2)}\n`, "utf8");
  log.info("daemon listening", { port, pid: process.pid });

  const close = closer({ server, feed, executor, ledger, log, paths });
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
  feed: EventFeed;
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
      parts.feed.close();
      // The exit watcher writes through the ledger, so it stops before the ledger does.
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
