import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Catalog } from "@agnostic/catalog";
import {
  type AgnosticPaths,
  agnosticPaths,
  type DaemonInfo,
  type ExecutorProvider,
  type RegisterRepoResponse,
  type Repo,
} from "@agnostic/core";
import { createTmuxExecutor } from "@agnostic/executor-tmux";
import { type Ledger, openLedger } from "@agnostic/ledger";
import type { LocalServer } from "@agnostic/registry";
import { type ServerType, serve } from "@hono/node-server";
import type { Hono } from "hono";
import { createApp } from "./app.js";
import type { Detection } from "./detection-cache.js";
import { createEventFeed } from "./event-feed.js";
import { createLogger } from "./log.js";
import { fixtureCatalog, fixtureDetection, launchDetection } from "./test-detection.js";
import { createLaunchEnv, type LaunchEnv } from "./test-launch-env.js";
import { createWorkspace, type TestRepoOptions } from "./test-workspace.js";
import { createVerdictSweep, type VerdictSweep } from "./verdict-sweep.js";

// Not part of the package's exports: this is what every daemon test builds its fixture from.
export const TEST_TOKEN = "0123456789abcdef";

export type TestDaemon = {
  app: Hono;
  ledger: Ledger;
  paths: AgnosticPaths;
  logFile: string;
  /** Set only when the daemon was built with `tmux: true`. */
  launch: LaunchEnv | null;
  /** No timer: a test that cares about verdicts runs the sweep itself (ADR 022). */
  verdicts: VerdictSweep;
  detectCalls(): number;
  addRepo(opts?: TestRepoOptions): Promise<Repo>;
  request(path: string, init?: RequestInit): Promise<Response>;
  listen(): Promise<string>;
  /** Listens, and writes the two files a hook script reads to find this daemon. */
  serve(): Promise<string>;
  readLog(): Promise<string>;
  close(): Promise<void>;
};

/** Polls until the check passes, so a test never sleeps for a fixed time it does not need. */
export async function waitFor(
  what: string,
  check: () => Promise<boolean> | boolean,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${what} was still not true after ${timeoutMs}ms`);
}

/** A real loopback listener, for the tests that need frames on the wire and not just a Response. */
function listener(app: Hono, onPort: (port: number) => void) {
  let server: ServerType | null = null;
  return {
    start: (): Promise<string> =>
      new Promise((ready) => {
        server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, (address) => {
          onPort(address.port);
          ready(`http://127.0.0.1:${address.port}`);
        });
      }),
    stop: async (): Promise<void> => {
      if (server === null) {
        return;
      }
      if ("closeAllConnections" in server) {
        server.closeAllConnections();
      }
      await new Promise<void>((done) => server?.close(() => done()));
    },
  };
}

/** Nothing runs: the daemon tests that never start a task must not need tmux to be installed. */
function idleExecutor(): ExecutorProvider {
  const refuse = () => Promise.reject(new Error("this test daemon has no executor"));
  return {
    id: "tmux-local",
    prepare: refuse,
    launch: refuse,
    sessionState: () => Promise.resolve("gone" as const),
    attach: () => ({ kind: "tmux", argv: [] }),
    stop: () => Promise.resolve(),
    clean: () => Promise.resolve(),
    detect: () => Promise.resolve([]),
    onEvent: () => () => undefined,
    close: () => Promise.resolve(),
  };
}

type TestDaemonOptions = {
  detect?: (paths: AgnosticPaths) => Promise<Detection>;
  feedPollMs?: number;
  heartbeatMs?: number;
  /** A real tmux executor on a private socket, with the fake harnesses on the launch PATH. */
  tmux?: boolean;
  /** Rows that must already be there when the app starts, for the reconcile it runs at start. */
  seed?: (ledger: Ledger) => void;
  /** Local model servers the stub detection reports, for a launch on the `local` route. */
  servers?: LocalServer[];
  /** The catalog the app is built with; the complete fixture unless a test needs another. */
  catalog?: Catalog;
  /**
   * The home the daemon reads harness auth files and transcripts under; the state directory by
   * default. A usage test points it at a tree holding `.claude/projects` and `.codex/sessions`.
   */
  userHome?: string;
};

/** Everything a test daemon owns on disk and in memory, before any route exists. */
async function createParts(opts: TestDaemonOptions) {
  const home = await mkdtemp(join(tmpdir(), "agn-daemon-"));
  const userHome = opts.userHome ?? home;
  const paths = agnosticPaths(home);
  const logFile = join(paths.logs, "agnd.log");
  const ledger = openLedger(paths.db);
  const launch = opts.tmux === true ? await createLaunchEnv(home) : null;
  opts.seed?.(ledger);
  const log = createLogger(logFile);
  const executor =
    launch === null
      ? idleExecutor()
      : createTmuxExecutor({ paths, socketName: launch.socketName, env: launch.env });
  return {
    home,
    userHome,
    logFile,
    paths,
    ledger,
    launch,
    log,
    executor,
    verdicts: createVerdictSweep({ ledger, executor, log }, null),
    feed: createEventFeed(ledger, opts.feedPollMs),
    // The paths are handed over so a test can run the real detection against this daemon's config.
    detect: () =>
      opts.detect === undefined
        ? Promise.resolve(
            launch === null
              ? fixtureDetection()
              : launchDetection(launch.binDir, opts.servers ?? []),
          )
        : opts.detect(paths),
  };
}

export async function createTestDaemon(opts: TestDaemonOptions = {}): Promise<TestDaemon> {
  const { home, userHome, paths, logFile, ledger, launch, log, feed, executor, verdicts, detect } =
    await createParts(opts);
  const repoDirs: string[] = [];
  let calls = 0;
  let port = 0;

  const app = createApp({
    ledger,
    paths,
    feed,
    executor,
    verdicts,
    home: userHome,
    catalog: opts.catalog ?? (await fixtureCatalog()),
    // HOME is always the test's own: an installer that writes per user must never find the real one.
    env: launch?.env ?? { PATH: "/opt/bin", HOME: userHome },
    token: TEST_TOKEN,
    log,
    version: "0.0.0-test",
    startedAt: new Date().toISOString(),
    port: () => port,
    detect: () => {
      calls += 1;
      return detect();
    },
    ...(opts.heartbeatMs === undefined ? {} : { heartbeatMs: opts.heartbeatMs }),
  });
  const server = listener(app, (bound) => {
    port = bound;
  });
  // createApp starts the first detection; every test may assume it has already finished.
  await new Promise((done) => setImmediate(done));

  const request: TestDaemon["request"] = async (path, init) =>
    await app.request(path, {
      ...init,
      headers: { authorization: `Bearer ${TEST_TOKEN}`, ...init?.headers },
    });

  return {
    app,
    ledger,
    paths,
    logFile,
    launch,
    verdicts,
    detectCalls: () => calls,
    addRepo: async (repoOpts = {}) => {
      const path = await createWorkspace(repoOpts);
      repoDirs.push(path);
      const response = await request("/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      return ((await response.json()) as RegisterRepoResponse).repo;
    },
    request,
    listen: server.start,
    serve: async () => {
      const url = await server.start();
      const info: DaemonInfo = { pid: process.pid, port, startedAt: new Date().toISOString() };
      await mkdir(paths.home, { recursive: true });
      await writeFile(paths.daemon, JSON.stringify(info), "utf8");
      await writeFile(paths.authToken, TEST_TOKEN, { mode: 0o600 });
      return url;
    },
    readLog: () => readFile(logFile, "utf8"),
    close: async () => {
      await server.stop();
      feed.close();
      verdicts.close();
      await executor.close();
      await launch?.cleanup();
      ledger.close();
      log.close();
      await rm(home, { recursive: true, force: true });
      for (const dir of repoDirs) {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
