import type { DaemonContext, DaemonDeps } from "./app.js";
import { authFilesStamp } from "./auth-files.js";
import { createCatalogChecker } from "./catalog-check.js";
import { closeOutcome } from "./close-outcome.js";
import { createDetectionCache } from "./detection-cache.js";
import { createTaskLifecycle } from "./task-lifecycle.js";
import { createUsageScanner } from "./usage-scan.js";

/**
 * The things the daemon owns for the life of the process, wired to each other and started. They
 * are built here rather than in `createApp` because they feed each other - a close prices its
 * usage, a catalog update invalidates detection - and none of that is the routes' business.
 */
export function createContext(deps: DaemonDeps): DaemonContext {
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
  start(ctx);
  return ctx;
}

function start(ctx: DaemonContext): void {
  // The subscription ends when the executor closes, which the daemon does before the ledger.
  ctx.executor.onEvent(ctx.lifecycle.onExited);
  // Detection shells out; starting it here means the first `agn doctor` does not wait for it.
  ctx.detection.refresh().catch((cause: unknown) => {
    ctx.log.error("detection failed", { message: reason(cause) });
  });
  // A task the ledger calls running may have died while the daemon was down (ADR 014), and one
  // still queued was being launched by that daemon. The verdict sweep runs after both, so a task
  // settled here is swept in the same pass.
  ctx.lifecycle
    .reconcileAll()
    .then(() => ctx.lifecycle.failQueued())
    .then(() => ctx.verdicts.runOnce())
    .catch((cause: unknown) => {
      ctx.log.error("start-up reconcile failed", { message: reason(cause) });
    });
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
