import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgnosticPaths,
  agnosticPaths,
  type DoctorResponse,
  type HarnessReport,
  type Profile,
} from "@agnostic/core";
import { type Ledger, openLedger } from "@agnostic/ledger";
import { type ServerType, serve } from "@hono/node-server";
import type { Hono } from "hono";
import { createApp } from "./app.js";
import { createEventFeed } from "./event-feed.js";
import { createLogger } from "./log.js";

// Not part of the package's exports: this is what every daemon test builds its fixture from.
export const TEST_TOKEN = "0123456789abcdef";

export type TestDaemon = {
  app: Hono;
  ledger: Ledger;
  paths: AgnosticPaths;
  logFile: string;
  detectCalls(): number;
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

export function fixtureDetection(models: string[] = ["sonnet-4.5"]): DoctorResponse {
  return {
    harnesses: [fixtureReport(models)],
    profiles: [null, ...models].map(fixtureProfile),
    detectedAt: new Date().toISOString(),
    pathVar: "/opt/bin",
  };
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

export async function createTestDaemon(
  opts: { detect?: () => Promise<DoctorResponse>; feedPollMs?: number; heartbeatMs?: number } = {},
): Promise<TestDaemon> {
  const home = await mkdtemp(join(tmpdir(), "agn-daemon-"));
  const paths = agnosticPaths(home);
  const logFile = join(paths.logs, "agnd.log");
  const log = createLogger(logFile);
  const ledger = openLedger(paths.db);
  const feed = createEventFeed(ledger, opts.feedPollMs);
  const detect = opts.detect ?? (() => Promise.resolve(fixtureDetection()));
  let calls = 0;
  let port = 0;

  const app = createApp({
    ledger,
    paths,
    feed,
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

  return {
    app,
    ledger,
    paths,
    logFile,
    detectCalls: () => calls,
    request: async (path, init) =>
      app.request(path, {
        ...init,
        headers: { authorization: `Bearer ${TEST_TOKEN}`, ...init?.headers },
      }),
    listen: server.start,
    readLog: () => readFile(logFile, "utf8"),
    close: async () => {
      await server.stop();
      feed.close();
      ledger.close();
      log.close();
      await rm(home, { recursive: true, force: true });
    },
  };
}
