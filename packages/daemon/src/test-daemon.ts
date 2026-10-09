import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Catalog, catalogSource } from "@agnostic/catalog";
import {
  type AgnosticPaths,
  agnosticPaths,
  type DaemonInfo,
  type Editor,
  type RegisterRepoResponse,
  type Repo,
} from "@agnostic/core";
import { createTmuxExecutor, readTmuxVersion, tmuxConfigStale } from "@agnostic/executor-tmux";
import { type Ledger, openLedger } from "@agnostic/ledger";
import type { LocalServer } from "@agnostic/registry";
import { type ServerType, serve } from "@hono/node-server";
import type { Hono } from "hono";
import { createApp } from "./app.js";
import { createCatalogStore } from "./catalog-store.js";
import type { Detection } from "./detection-cache.js";
import { createEventFeed } from "./event-feed.js";
import { createLogger } from "./log.js";
import type { UpgradeHandler } from "./terminal-socket.js";
import {
  fixtureCatalog,
  fixtureCatalogPath,
  fixtureDetection,
  fixtureEditors,
  launchDetection,
} from "./test-detection.js";
import { idleExecutor } from "./test-idle-executor.js";
import { createLaunchEnv, type LaunchEnv } from "./test-launch-env.js";
import { createWorkspace, type TestRepoOptions } from "./test-workspace.js";
import { createVerdictSweep, type VerdictSweep } from "./verdict-sweep.js";

// Not part of the package's exports: this is what every daemon test builds its fixture from.
export const TEST_TOKEN = "0123456789abcdef";

export type TestDaemon = {
  app: Hono;
  ledger: Ledger;
  paths: AgnosticPaths;
  /** The home the daemon reads harness auth files and transcripts under. */
  home: string;
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
function listener(app: Hono, upgrade: UpgradeHandler, onPort: (port: number) => void) {
  let server: ServerType | null = null;
  return {
    start: (): Promise<string> =>
      new Promise((ready) => {
        server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, (address) => {
          onPort(address.port);
          ready(`http://127.0.0.1:${address.port}`);
        });
        server.on("upgrade", upgrade);
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

/** A test's shim ahead of the real tool on the PATH every command the daemon runs is found on. */
function shimmed(env: Record<string, string>, prefix?: string): Record<string, string> {
  return prefix === undefined ? env : { ...env, PATH: `${prefix}:${env.PATH ?? ""}` };
}

type TestDaemonOptions = {
  detect?: (paths: AgnosticPaths) => Promise<Detection>;
  feedPollMs?: number;
  heartbeatMs?: number;
  /** A real tmux executor on a private socket, with the fake harnesses on the launch PATH. */
  tmux?: boolean;
  /** Put first on the PATH the daemon runs commands with, for a test that shims a real tool. */
  pathPrefix?: string;
  /** Rows that must already be there when the app starts, for the reconcile it runs at start. */
  seed?: (ledger: Ledger) => void;
  /** Local model servers the stub detection reports, for a launch on the `local` route. */
  servers?: LocalServer[];
  /** The catalog the app is built with; the complete fixture unless a test needs another. */
  catalog?: Catalog;
  /** The base the catalog update reads; a port nothing listens on unless a test serves one. */
  catalogUrl?: string;
  /** Off by default: no test reaches off this machine on a timer. */
  catalogCheck?: boolean;
  /**
   * The home the daemon reads harness auth files and transcripts under; the state directory by
   * default. A usage test points it at a tree holding `.claude/projects` and `.codex/sessions`.
   */
  userHome?: string;
  /** The editors the stub detection reports; `[]` is a machine with none installed. */
  editors?: Editor[];
  /** A directory standing in for `packages/ui/dist`; null is a checkout nobody has built. */
  uiDist?: string;
  /** Merged over the base environment every harness is launched with, for a fixture to read. */
  env?: Record<string, string>;
  /** Short enough that a test can watch a hanging harness be given up on. */
  specTimeoutMs?: number;
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
      : await createTmuxExecutor({ paths, socketName: launch.socketName, env: launch.env });
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

  const {
    app,
    close: closeApp,
    upgrade,
  } = createApp({
    ledger,
    paths,
    feed,
    executor,
    // Never the default socket: a test that has no tmux of its own has no server to report on.
    tmuxConfigStale: () =>
      launch === null
        ? Promise.resolve(false)
        : tmuxConfigStale({ paths, socketName: launch.socketName, env: launch.env }),
    // A test without a tmux of its own gets the answer a current machine would give, so no route
    // test depends on what `tmux -V` says on the machine running the suite.
    tmuxVersion: () =>
      launch === null ? Promise.resolve({ version: "3.4", ok: true }) : readTmuxVersion(launch.env),
    verdicts,
    home: userHome,
    catalog: createCatalogStore({
      loaded: {
        catalog: opts.catalog ?? (await fixtureCatalog()),
        origin: "bundled",
        path: fixtureCatalogPath(),
        problems: [],
      },
      downloaded: paths.catalog,
      bundled: fixtureCatalogPath(),
      log,
    }),
    // 127.0.0.1:1 refuses at once, so an update in a test that serves nothing fails locally.
    catalogSource: catalogSource({ AGNOSTIC_CATALOG_URL: opts.catalogUrl ?? "http://127.0.0.1:1" }),
    catalogCheck: opts.catalogCheck ?? false,
    // HOME is always the test's own: an installer that writes per user must never find the real one.
    env: shimmed(
      { ...(launch?.env ?? { PATH: "/opt/bin", HOME: userHome }), ...opts.env },
      opts.pathPrefix,
    ),
    token: TEST_TOKEN,
    log,
    version: "0.0.0-test",
    startedAt: new Date().toISOString(),
    port: () => port,
    detect: () => {
      calls += 1;
      return detect();
    },
    detectEditors: () => Promise.resolve(opts.editors ?? fixtureEditors),
    uiDist: opts.uiDist ?? null,
    ...(opts.heartbeatMs === undefined ? {} : { heartbeatMs: opts.heartbeatMs }),
    ...(opts.specTimeoutMs === undefined ? {} : { specTimeoutMs: opts.specTimeoutMs }),
  });
  const server = listener(app, upgrade, (bound) => {
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
    home: userHome,
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
      // The app's terminal sockets first: the server does not count them, so it would wait forever.
      await closeApp();
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
