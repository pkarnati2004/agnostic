import { type Catalog, entitlement, knowsPlan, type PlanRow } from "@agnostic/catalog";
import type {
  AgnosticPaths,
  ExecutorProvider,
  HarnessReport,
  Plan,
  PlanOption,
  Plans,
} from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import {
  detectHarnesses,
  detectLocalServers,
  detectTools,
  enumerateProfiles,
  type HarnessStatus,
  planVendor,
} from "@agnostic/registry";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { bearerAuth } from "./auth.js";
import { authFilesStamp } from "./auth-files.js";
import { readDaemonConfig } from "./daemon-config.js";
import { createDetectionCache, type Detection, type DetectionCache } from "./detection-cache.js";
import { errorBody } from "./error.js";
import type { EventFeed } from "./event-feed.js";
import { type Logger, requestLog } from "./log.js";
import { adoptRoutes } from "./routes/adopt.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { hookRoutes } from "./routes/hooks.js";
import { profileRoutes } from "./routes/profiles.js";
import { recommendRoutes } from "./routes/recommend.js";
import { repoRoutes } from "./routes/repos.js";
import { syncRoutes } from "./routes/sync.js";
import { taskRoutes } from "./routes/tasks.js";
import { usageRoutes } from "./routes/usage.js";
import { createTaskLifecycle, type TaskLifecycle } from "./task-lifecycle.js";
import { createUsageScanner, type UsageScanner } from "./usage-scan.js";

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
  /** Loaded once at start; chunk 17 reloads it after a download. */
  catalog: Catalog;
  /** Owned by the caller: its exit watcher and its tmux clients outlive any one request. */
  executor: ExecutorProvider;
  /** The base environment every harness is launched with: the daemon's own, scrubbed. */
  env: Record<string, string>;
  /** The user's home, where the harnesses keep their auth files. */
  home: string;
  /** Owned by the caller: it polls the ledger, so it has to stop before the ledger closes. */
  feed: EventFeed;
  heartbeatMs?: number;
};

/** What a route gets: the deps plus the things the app owns for the life of the process. */
export type DaemonContext = DaemonDeps & {
  detection: DetectionCache;
  lifecycle: TaskLifecycle;
  usage: UsageScanner;
};

export function createApp(deps: DaemonDeps): Hono {
  const detection = createDetectionCache(deps.detect, deps.ledger, () => authFilesStamp(deps.home));
  const usage = createUsageScanner({ ...deps, detection });
  // A task that has just closed has written its last turn; chunk 15 prices it from these rows.
  const lifecycle = createTaskLifecycle({
    ...deps,
    afterClose: async (task) => {
      await usage.scan({ taskId: task.id });
    },
  });
  const ctx: DaemonContext = { ...deps, detection, lifecycle, usage };
  // The subscription ends when the executor closes, which the daemon does before the ledger.
  deps.executor.onEvent(lifecycle.onExited);
  // Detection shells out; starting it here means the first `agn doctor` does not wait for it.
  ctx.detection.refresh().catch((cause: unknown) => {
    deps.log.error("detection failed", { message: reason(cause) });
  });
  // A task the ledger calls running may have died while the daemon was down (ADR 014).
  lifecycle.reconcileAll().catch((cause: unknown) => {
    deps.log.error("start-up reconcile failed", { message: reason(cause) });
  });

  const app = new Hono();
  app.use("*", requestLog(deps.log));
  app.use("*", bearerAuth(deps.token));
  app.route("/", healthRoutes(ctx));
  app.route("/", repoRoutes(ctx));
  app.route("/", taskRoutes(ctx));
  app.route("/", adoptRoutes(ctx));
  app.route("/", profileRoutes(ctx));
  app.route("/", recommendRoutes(ctx));
  app.route("/", eventRoutes(ctx));
  app.route("/", hookRoutes(ctx));
  app.route("/", syncRoutes(ctx));
  app.route("/", usageRoutes(ctx));

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
 * installed tier-1 harness for its own model list and reads its plan, so this only joins the
 * result to the catalog and flattens it for the wire. config.yaml is read per run, because
 * `agn doctor --plan` writes it between runs.
 */
export function realDetect(
  env: Record<string, string>,
  home: string,
  paths: AgnosticPaths,
  catalog: Catalog,
): () => Promise<Detection> {
  return async () => {
    const { plans } = await readDaemonConfig(paths);
    const statuses = await detectHarnesses({ env, home, models: catalog.models });
    const servers = await detectLocalServers();
    return {
      harnesses: statuses.map((status) => toReport(status, plans, catalog)),
      profiles: enumerateProfiles({
        statuses,
        env,
        servers,
        models: catalog.models,
        entitlements: catalog.entitlements,
        catalogPlans: catalog.plans,
        configPlans: plans,
      }),
      tools: await detectTools({ env, home }),
      servers,
      detectedAt: new Date().toISOString(),
      pathVar: env.PATH ?? "",
    };
  };
}

export function planOptions(rows: PlanRow[]): PlanOption[] {
  return rows.map((row) => ({ vendor: row.vendor, id: row.id, displayName: row.displayName }));
}

function toReport(status: HarnessStatus, plans: Plans, catalog: Catalog): HarnessReport {
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
    planVendor: planVendor(status.harness),
    plan: planReport(status, plans, catalog),
  };
}

/** A detected plan wins over config.yaml, and doctor says which of the two it is showing. */
function planReport(status: HarnessStatus, plans: Plans, catalog: Catalog): HarnessReport["plan"] {
  const vendor = planVendor(status.harness);
  if (vendor === null) {
    return null;
  }
  const value = status.plan ?? plans[vendor] ?? null;
  if (value === null) {
    return null;
  }
  return {
    value,
    source: status.plan === null ? "config" : "detected",
    known: knowsPlan(catalog, vendor, value),
    // The harness's own files are the confirmation; a plan only config.yaml claims is confirmed
    // by the models the harness offers, and contradicted when one of them needs another plan.
    confirmed: status.plan !== null || !contradicts(status, value, catalog),
  };
}

/** A model the plan cannot run at all, yet the harness lists it: the plan on file is out of date. */
function contradicts(status: HarnessStatus, plan: Plan, catalog: Catalog): boolean {
  return (status.models?.models ?? []).some(
    (model) => entitlement(catalog, status.harness, model, plan) === "unavailable",
  );
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
