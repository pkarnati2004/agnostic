import type { AgnosticPaths, HarnessReport } from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import {
  detectHarnesses,
  detectLocalServers,
  enumerateProfiles,
  type HarnessStatus,
} from "@agnostic/registry";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { bearerAuth } from "./auth.js";
import { createDetectionCache, type Detection, type DetectionCache } from "./detection-cache.js";
import { errorBody } from "./error.js";
import type { EventFeed } from "./event-feed.js";
import { type Logger, requestLog } from "./log.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { profileRoutes } from "./routes/profiles.js";
import { repoRoutes } from "./routes/repos.js";
import { taskRoutes } from "./routes/tasks.js";

export type DaemonDeps = {
  ledger: Ledger;
  paths: AgnosticPaths;
  token: string;
  log: Logger;
  version: string;
  startedAt: string;
  /** The bound port, which is only known after listen when the caller asked for port 0. */
  port: () => number;
  /** Injected, so a test never detects a real harness and never runs a real probe. */
  detect: () => Promise<Detection>;
  /** Owned by the caller: it polls the ledger, so it has to stop before the ledger closes. */
  feed: EventFeed;
  heartbeatMs?: number;
};

/** What a route gets: the deps plus the one thing the app owns for the life of the process. */
export type DaemonContext = DaemonDeps & { detection: DetectionCache };

export function createApp(deps: DaemonDeps): Hono {
  const ctx: DaemonContext = {
    ...deps,
    detection: createDetectionCache(deps.detect, deps.ledger),
  };
  // Detection shells out; starting it here means the first `agn doctor` does not wait for it.
  ctx.detection.refresh().catch((cause: unknown) => {
    deps.log.error("detection failed", { message: reason(cause) });
  });

  const app = new Hono();
  app.use("*", requestLog(deps.log));
  app.use("*", bearerAuth(deps.token));
  app.route("/", healthRoutes(ctx));
  app.route("/", repoRoutes(ctx));
  app.route("/", taskRoutes(ctx));
  app.route("/", profileRoutes(ctx));
  app.route("/", eventRoutes(ctx));

  app.notFound((c) =>
    c.json({ error: { code: "not-found", message: `no route for ${c.req.path}` } }, 404),
  );
  app.onError((err, c) => {
    const { status, body } = errorBody(err);
    if (status >= 500) {
      // The client is told "internal error"; the only place the real one exists is this line.
      deps.log.error(`unhandled ${c.req.method} ${c.req.path}`, { message: reason(err) });
    }
    return c.json(body, status as ContentfulStatusCode);
  });
  return app;
}

/**
 * The real thing, in the environment `agnd` was started from: `detectHarnesses` already asks each
 * installed tier-1 harness for its own model list, so this only flattens the result for the wire.
 */
export function realDetect(env: Record<string, string>, home: string): () => Promise<Detection> {
  return async () => {
    const statuses = await detectHarnesses({ env, home });
    const servers = await detectLocalServers();
    return {
      harnesses: statuses.map(toReport),
      profiles: enumerateProfiles(statuses, env, servers),
      detectedAt: new Date().toISOString(),
      pathVar: env.PATH ?? "",
    };
  };
}

function toReport(status: HarnessStatus): HarnessReport {
  return {
    harness: status.harness,
    name: status.name,
    binary: status.binary,
    path: status.path,
    version: status.version,
    login: status.login,
    billing: status.billing,
    tier: status.tier,
    models: status.models?.models ?? [],
    modelSource: status.models?.origin ?? "none",
  };
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
