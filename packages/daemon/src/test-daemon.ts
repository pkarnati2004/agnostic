import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgnosticPaths,
  agnosticPaths,
  type ExecutorProvider,
  type HarnessId,
  type HarnessReport,
  type Profile,
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
import { createLaunchEnv, type LaunchEnv } from "./test-launch-env.js";
import { createWorkspace, type TestRepoOptions } from "./test-workspace.js";

// Not part of the package's exports: this is what every daemon test builds its fixture from.
export const TEST_TOKEN = "0123456789abcdef";

export type TestDaemon = {
  app: Hono;
  ledger: Ledger;
  paths: AgnosticPaths;
  logFile: string;
  /** Set only when the daemon was built with `tmux: true`. */
  launch: LaunchEnv | null;
  detectCalls(): number;
  addRepo(opts?: TestRepoOptions): Promise<Repo>;
  request(path: string, init?: RequestInit): Promise<Response>;
  listen(): Promise<string>;
  readLog(): Promise<string>;
  close(): Promise<void>;
};

export function fixtureProfile(model: string | null): Profile {
  return {
    id: `claude-code:${model ?? "default"}:native`,
    harness: "claude-code",
    model,
    route: "native",
    billing: "subscription",
    available: true,
    evidence: "binary",
    tier: 1,
  };
}

function fixtureReport(models: string[]): HarnessReport {
  return {
    harness: "claude-code",
    name: "Claude Code",
    binary: "claude",
    path: "/opt/bin/claude",
    version: "2.0.0",
    login: "logged-in",
    billing: "subscription",
    tier: 1,
    models,
    modelSource: "probe",
  };
}

export function fixtureDetection(models: string[] = ["sonnet-4.5"]): Detection {
  return {
    harnesses: [fixtureReport(models)],
    profiles: [null, ...models].map(fixtureProfile),
    servers: [],
    detectedAt: new Date().toISOString(),
    pathVar: "/opt/bin",
  };
}

/** What a launch test detects: the two fake harnesses on PATH, and Pi installed nowhere. */
function launchDetection(binDir: string, servers: LocalServer[]): Detection {
  const installed = (harness: HarnessId, binary: string, path: string | null): HarnessReport => ({
    harness,
    name: binary,
    binary,
    path,
    version: path === null ? null : "1.0.0",
    login: "logged-in",
    billing: "subscription",
    tier: 1,
    models: [],
    modelSource: "none",
  });
  return {
    harnesses: [
      installed("claude-code", "claude", join(binDir, "claude")),
      installed("codex", "codex", join(binDir, "codex")),
      installed("pi", "pi", null),
    ],
    profiles: [fixtureProfile(null)],
    servers,
    detectedAt: new Date().toISOString(),
    pathVar: binDir,
  };
}

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
    alive: () => Promise.resolve(false),
    attach: () => ({ kind: "tmux", argv: [] }),
    stop: () => Promise.resolve(),
    clean: () => Promise.resolve(),
    detect: () => Promise.resolve([]),
    onEvent: () => () => undefined,
    close: () => Promise.resolve(),
  };
}

type TestDaemonOptions = {
  detect?: () => Promise<Detection>;
  feedPollMs?: number;
  heartbeatMs?: number;
  /** A real tmux executor on a private socket, with the fake harnesses on the launch PATH. */
  tmux?: boolean;
  /** Rows that must already be there when the app starts, for the reconcile it runs at start. */
  seed?: (ledger: Ledger) => void;
  /** Local model servers the stub detection reports, for a launch on the `local` route. */
  servers?: LocalServer[];
};

/** Everything a test daemon owns on disk and in memory, before any route exists. */
async function createParts(opts: TestDaemonOptions) {
  const home = await mkdtemp(join(tmpdir(), "agn-daemon-"));
  const paths = agnosticPaths(home);
  const logFile = join(paths.logs, "agnd.log");
  const ledger = openLedger(paths.db);
  const launch = opts.tmux === true ? await createLaunchEnv(home) : null;
  opts.seed?.(ledger);
  return {
    home,
    paths,
    logFile,
    ledger,
    launch,
    log: createLogger(logFile),
    feed: createEventFeed(ledger, opts.feedPollMs),
    executor:
      launch === null
        ? idleExecutor()
        : createTmuxExecutor({ paths, socketName: launch.socketName, env: launch.env }),
    detect:
      opts.detect ??
      (() =>
        Promise.resolve(
          launch === null ? fixtureDetection() : launchDetection(launch.binDir, opts.servers ?? []),
        )),
  };
}

export async function createTestDaemon(opts: TestDaemonOptions = {}): Promise<TestDaemon> {
  const { home, paths, logFile, ledger, launch, log, feed, executor, detect } =
    await createParts(opts);
  const repoDirs: string[] = [];
  let calls = 0;
  let port = 0;

  const app = createApp({
    ledger,
    paths,
    feed,
    executor,
    env: launch?.env ?? { PATH: "/opt/bin" },
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
    readLog: () => readFile(logFile, "utf8"),
    close: async () => {
      await server.stop();
      feed.close();
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
