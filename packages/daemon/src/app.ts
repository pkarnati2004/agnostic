import {
  type Catalog,
  type CatalogSource,
  entitlement,
  knowsPlan,
  type PlanRow,
} from "@agnostic/catalog";
import type {
  AgnosticPaths,
  Editor,
  ExecutorProvider,
  HarnessReport,
  Plan,
  PlanOption,
  Plans,
} from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import {
  detectEditors,
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
import { type CatalogChecker, createCatalogChecker } from "./catalog-check.js";
import type { CatalogStore } from "./catalog-store.js";
import { closeOutcome } from "./close-outcome.js";
import { readDaemonConfig } from "./daemon-config.js";
import { createDetectionCache, type Detection, type DetectionCache } from "./detection-cache.js";
import { errorBody, noRoute } from "./error.js";
import type { EventFeed } from "./event-feed.js";
import { type Logger, requestLog } from "./log.js";
import { originCheck } from "./origin.js";
import { adoptRoutes } from "./routes/adopt.js";
import { catalogRoutes } from "./routes/catalog.js";
import { editorRoutes } from "./routes/editors.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { hookRoutes } from "./routes/hooks.js";
import { outcomeRoutes } from "./routes/outcomes.js";
import { profileRoutes } from "./routes/profiles.js";
import { recommendRoutes } from "./routes/recommend.js";
import { repoRoutes } from "./routes/repos.js";
import { syncRoutes } from "./routes/sync.js";
import { taskRoutes } from "./routes/tasks.js";
import { usageRoutes } from "./routes/usage.js";
import { createTaskLifecycle, type TaskLifecycle } from "./task-lifecycle.js";
import { createTerminalSocket, type UpgradeHandler } from "./terminal-socket.js";
import { createUsageScanner, type UsageScanner } from "./usage-scan.js";
import type { VerdictSweep } from "./verdict-sweep.js";

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
  /** Scanned per open request rather than cached: an editor installed today is there today. */
  detectEditors: () => Promise<Editor[]>;
  /** Loaded at start and reloaded after a download, so an update needs no restart. */
  catalog: CatalogStore;
  /** The URLs the daily check reads; `AGNOSTIC_CATALOG_URL` points them at a mirror or a test. */
  catalogSource: CatalogSource;
  /** `catalog_check` in config.yaml: false means agn never reaches out on its own (ADR 002). */
  catalogCheck: boolean;
  /** Owned by the caller: its exit watcher and its tmux clients outlive any one request. */
  executor: ExecutorProvider;
  /** The base environment every harness is launched with: the daemon's own, scrubbed. */
  env: Record<string, string>;
  /** The user's home, where the harnesses keep their auth files. */
  home: string;
  /** Owned by the caller: it polls the ledger, so it has to stop before the ledger closes. */
  feed: EventFeed;
  /** Owned by the caller for the same reason: its timer writes outcome rows (ADR 022). */
  verdicts: VerdictSweep;
  heartbeatMs?: number;
};

/** What a route gets: the deps plus the things the app owns for the life of the process. */
export type DaemonContext = DaemonDeps & {
  detection: DetectionCache;
  lifecycle: TaskLifecycle;
  usage: UsageScanner;
  catalogChecker: CatalogChecker;
};

/**
 * The app owns the catalog checker, the terminal sockets and the closes still running, so the
 * caller gets back what it has to close, and the upgrade handler to put on its own http server.
 */
export function createApp(deps: DaemonDeps): {
  app: Hono;
  close: () => Promise<void>;
  upgrade: UpgradeHandler;
} {
  const detection = createDetectionCache(deps.detect, deps.ledger, () => authFilesStamp(deps.home));
  const usage = createUsageScanner({ ...deps, detection });
  // A task that has just closed has written its last turn, and its worktree is nobody else's:
  // the usage rows are read first, then the outcome row is priced from them.
  const lifecycle = createTaskLifecycle({
    ...deps,
    afterClose: async (task) => {
      await usage.scan({ taskId: task.id });
      await closeOutcome(ctx, task);
    },
  });
  const ctx: DaemonContext = {
    ...deps,
    detection,
    lifecycle,
    usage,
    // Its timers are unref'd, so nothing waits on a check that is still in flight at shutdown.
    catalogChecker: createCatalogChecker({
      store: deps.catalog,
      source: deps.catalogSource,
      paths: deps.paths,
      log: deps.log,
      enabled: deps.catalogCheck,
      // A newer catalog can move model lists and entitlements, which is what detection reports.
      onUpdated: () => detection.refresh().then(() => undefined),
    }),
  };
  // The subscription ends when the executor closes, which the daemon does before the ledger.
  deps.executor.onEvent(lifecycle.onExited);
  // Detection shells out; starting it here means the first `agn doctor` does not wait for it.
  ctx.detection.refresh().catch((cause: unknown) => {
    deps.log.error("detection failed", { message: reason(cause) });
  });
  // A task the ledger calls running may have died while the daemon was down (ADR 014), and one
  // still queued was being launched by that daemon. The verdict sweep runs after both, so a task
  // settled here is swept in the same pass.
  lifecycle
    .reconcileAll()
    .then(() => lifecycle.failQueued())
    .then(() => deps.verdicts.runOnce())
    .catch((cause: unknown) => {
      deps.log.error("start-up reconcile failed", { message: reason(cause) });
    });

  const terminalSocket = createTerminalSocket(ctx);

  const app = new Hono();
  app.use("*", requestLog(deps.log));
  // Before the token check, and over /health too: a foreign page learns nothing, not even the home.
  app.use("*", originCheck(deps.port));
  app.use("*", bearerAuth(deps.token));
  app.route("/", healthRoutes(ctx));
  app.route("/", repoRoutes(ctx));
  app.route("/", taskRoutes(ctx));
  app.route("/", adoptRoutes(ctx));
  app.route("/", profileRoutes(ctx));
  app.route("/", recommendRoutes(ctx));
  app.route("/", editorRoutes(ctx));
  app.route("/", eventRoutes(ctx));
  app.route("/", hookRoutes(ctx));
  app.route("/", syncRoutes(ctx));
  app.route("/", usageRoutes(ctx));
  app.route("/", outcomeRoutes(ctx));
  app.route("/", catalogRoutes(ctx));

  app.notFound((c) => {
    const { status, body } = errorBody(noRoute(c.req.path));
    return c.json(body, status as ContentfulStatusCode);
  });
  app.onError((err, c) => {
    const { status, body } = errorBody(err);
    if (status >= 500) {
      // The client is told "internal error"; the only place the real one exists is this line.
      deps.log.error(`unhandled ${c.req.method} ${c.req.path}`, { message: reason(err) });
    }
    return c.json(body, status as ContentfulStatusCode);
  });
  return {
    app,
    upgrade: terminalSocket.upgrade,
    // The sockets go first: an upgraded socket is not an http connection, so the server's own
    // `closeAllConnections` never sees it and `close` would wait for it forever. A close that is
    // still scanning writes through the ledger, so the caller's shutdown waits for it last.
    close: async () => {
      terminalSocket.close();
      ctx.catalogChecker.close();
      await lifecycle.drain();
    },
  };
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
  store: CatalogStore,
): () => Promise<Detection> {
  return async () => {
    const { plans } = await readDaemonConfig(paths);
    // Read per run rather than captured: an update lands in the middle of a daemon's life.
    const { catalog } = store.current();
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

/** The editors of the machine the daemon runs on, which is the machine the user is sitting at. */
export function realDetectEditors(
  env: Record<string, string>,
  home: string,
): () => Promise<Editor[]> {
  return () => detectEditors({ env, home });
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
