import { type Catalog, type CatalogSource, entitlement, type PlanRow } from "@agnostic/catalog";
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
  harnessDefinition,
  harnessSupport,
  planVendor,
  resolvePlan,
} from "@agnostic/registry";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createContext } from "./app-context.js";
import { bearerAuth } from "./auth.js";
import type { CatalogChecker } from "./catalog-check.js";
import type { CatalogStore } from "./catalog-store.js";
import { readDaemonConfig } from "./daemon-config.js";
import type { Detection, DetectionCache } from "./detection-cache.js";
import { errorBody, noRoute } from "./error.js";
import type { EventFeed } from "./event-feed.js";
import { limitCapture } from "./limit-capture.js";
import { type Logger, requestLog } from "./log.js";
import type { NativeResumeWatch } from "./native-resume-watch.js";
import { originCheck } from "./origin.js";
import { adoptRoutes } from "./routes/adopt.js";
import { branchRoutes } from "./routes/branch.js";
import { catalogRoutes } from "./routes/catalog.js";
import { changesRoutes } from "./routes/changes.js";
import { compareRoutes } from "./routes/compares.js";
import { configRoutes } from "./routes/config.js";
import { editorRoutes } from "./routes/editors.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { hookRoutes } from "./routes/hooks.js";
import { outcomeRoutes } from "./routes/outcomes.js";
import { profileRoutes } from "./routes/profiles.js";
import { recommendRoutes } from "./routes/recommend.js";
import { repoRoutes } from "./routes/repos.js";
import { specRoutes } from "./routes/spec.js";
import { syncRoutes } from "./routes/sync.js";
import { taskRoutes } from "./routes/tasks.js";
import { uiRoutes } from "./routes/ui.js";
import { usageRoutes } from "./routes/usage.js";
import type { TaskLifecycle } from "./task-lifecycle.js";
import { createTerminalSocket, type UpgradeHandler } from "./terminal-socket.js";
import type { UsageScanner } from "./usage-scan.js";
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
  /** Asked by `agn doctor`: whether the running tmux server predates the settings agn writes now. */
  tmuxConfigStale: () => Promise<boolean>;
  /** The base environment every harness is launched with: the daemon's own, scrubbed. */
  env: Record<string, string>;
  /** The user's home, where the harnesses keep their auth files. */
  home: string;
  /** Where `packages/ui/dist` sits, or null when the workspace has not been built. */
  uiDist: string | null;
  /** Owned by the caller: it polls the ledger, so it has to stop before the ledger closes. */
  feed: EventFeed;
  /** Owned by the caller for the same reason: its timer writes outcome rows (ADR 022). */
  verdicts: VerdictSweep;
  heartbeatMs?: number;
  /** How long a headless spec call may take before it is given up on; 90 s unless a test says. */
  specTimeoutMs?: number;
};

/** What a route gets: the deps plus the things the app owns for the life of the process. */
export type DaemonContext = DaemonDeps & {
  detection: DetectionCache;
  lifecycle: TaskLifecycle;
  usage: UsageScanner;
  /** Watches a native resume until a hook proves the id it was launched with (ADR 008). */
  resumeWatch: NativeResumeWatch;
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
  const ctx = createContext(deps);
  const terminalSocket = createTerminalSocket(ctx);

  const app = new Hono();
  app.use("*", requestLog(deps.log));
  // Before the token check, and over /health too: a foreign page learns nothing, not even the home.
  app.use("*", originCheck(deps.port));
  app.use("*", bearerAuth(deps.token));
  app.route("/", healthRoutes(ctx));
  app.route("/", repoRoutes(ctx));
  app.route("/", taskRoutes(ctx));
  app.route("/", compareRoutes(ctx));
  app.route("/", adoptRoutes(ctx));
  app.route("/", profileRoutes(ctx));
  app.route("/", recommendRoutes(ctx));
  app.route("/", specRoutes(ctx));
  app.route("/", editorRoutes(ctx));
  app.route("/", changesRoutes(ctx));
  app.route("/", branchRoutes(ctx));
  app.route("/", eventRoutes(ctx));
  app.route("/", hookRoutes(ctx));
  app.route("/", syncRoutes(ctx));
  app.route("/", usageRoutes(ctx));
  app.route("/", outcomeRoutes(ctx));
  app.route("/", catalogRoutes(ctx));
  app.route("/", configRoutes(ctx));
  app.route("/", uiRoutes(ctx));

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
      await ctx.lifecycle.drain();
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
    const { plans, hooks } = await readDaemonConfig(paths);
    // Read per run rather than captured: an update lands in the middle of a daemon's life.
    const { catalog } = store.current();
    const statuses = await detectHarnesses({ env, home, models: catalog.models });
    const servers = await detectLocalServers();
    const scope = { home: env.HOME ?? home, env, paths, config: hooks };
    return {
      harnesses: await Promise.all(
        statuses.map(async (status) => ({
          ...toReport(status, plans, catalog),
          limitCapture: await limitCapture(status.harness, status.path !== null, scope),
        })),
      ),
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

function toReport(
  status: HarnessStatus,
  plans: Plans,
  catalog: Catalog,
): Omit<HarnessReport, "limitCapture"> {
  return {
    harness: status.harness,
    name: status.name,
    binary: status.binary,
    path: status.path,
    version: status.version,
    login: status.login,
    billing: status.billing,
    tier: status.tier,
    support: harnessSupport(harnessDefinition(status.harness)),
    models: status.models?.models ?? [],
    modelSource: status.models?.origin ?? "none",
    planVendor: planVendor(status.harness),
    limitSource: harnessDefinition(status.harness).limitSource,
    usageSource: harnessDefinition(status.harness).usageSource?.kind ?? null,
    plan: planReport(status, plans, catalog),
  };
}

/** A detected plan the catalog knows wins over config.yaml, and doctor says which one it shows. */
function planReport(status: HarnessStatus, plans: Plans, catalog: Catalog): HarnessReport["plan"] {
  const vendor = planVendor(status.harness);
  if (vendor === null) {
    return null;
  }
  const choice = resolvePlan(status.plan, plans[vendor], vendor, catalog.plans);
  if (choice === null) {
    return null;
  }
  return {
    ...choice,
    // The harness's own files are the confirmation; a plan only config.yaml claims is confirmed
    // by the models the harness offers, and contradicted when one of them needs another plan.
    confirmed: choice.source === "detected" || !contradicts(status, choice.value, catalog),
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
