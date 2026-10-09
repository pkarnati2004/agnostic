import { errorMessage } from "@agnostic/core";
import type { DaemonContext, DaemonDeps } from "./app.js";
import { createCatalogChecker } from "./catalog-check.js";
import { closeOutcome } from "./close-outcome.js";
import { createDetectionCache } from "./detection-cache.js";
import { authFilesStamp, harnessBinariesStamp } from "./detection-stamp.js";
import { createNativeResumeWatch } from "./native-resume-watch.js";
import { createTaskLifecycle } from "./task-lifecycle.js";
import { createUsageScanner } from "./usage-scan.js";

/**
 * How recently a probe has to have run for the next one to be skipped. Long enough to cover a
 * daemon start: the probe at start and the one a due catalog check runs five seconds later
 * (ADR 024) would otherwise shell out to every harness twice for the same answer. The daily tick
 * is a day outside this window and probes.
 */
const RECENT_PROBE_MS = 30_000;

/**
 * The things the daemon owns for the life of the process, wired to each other and started. They
 * are built here rather than in `createApp` because they feed each other - a close prices its
 * usage, a catalog update invalidates detection - and none of that is the routes' business.
 */
export function createContext(deps: DaemonDeps): DaemonContext {
  const detection = createDetectionCache(deps.detect, deps.ledger, {
    authFiles: () => authFilesStamp(deps.home),
    binaries: (detected) => harnessBinariesStamp(detected.harnesses),
  });
  // Stamped when a probe starts and again when it settles, so one still in flight also counts.
  let probedAt = Number.NEGATIVE_INFINITY;
  // Detection is the daemon's own business: a probe that fails is logged, never a caller's error.
  const reprobe = (): Promise<void> => {
    if (Date.now() - probedAt < RECENT_PROBE_MS) {
      return Promise.resolve();
    }
    probedAt = Date.now();
    return detection
      .refresh()
      .then(
        () => undefined,
        (cause: unknown) => {
          deps.log.error("detection failed", { message: errorMessage(cause) });
        },
      )
      .finally(() => {
        probedAt = Date.now();
      });
  };
  const usage = createUsageScanner({ ...deps, detection });
  const resumeWatch = createNativeResumeWatch({ ledger: deps.ledger, log: deps.log });
  // A task that has just closed has written its last turn, and its worktree is nobody else's:
  // the usage rows are read first, then the outcome row is priced from them.
  const lifecycle = createTaskLifecycle({
    ...deps,
    afterClose: async (task) => {
      // First, and synchronous: a session id that killed this launch must be gone from the row
      // before anything a user can click reads it again. Isolated, because a close still owes its
      // usage rows and its outcome even when the ledger write behind this one fails.
      try {
        resumeWatch.closed(task);
      } catch (cause: unknown) {
        deps.log.error("resumed session id not cleared", {
          taskId: task.id,
          message: errorMessage(cause),
        });
      }
      await usage.scan({ taskId: task.id });
      await closeOutcome(ctx, task);
    },
  });
  const ctx: DaemonContext = {
    ...deps,
    detection,
    lifecycle,
    usage,
    resumeWatch,
    // Its timers are unref'd, so nothing waits on a check that is still in flight at shutdown.
    catalogChecker: createCatalogChecker({
      store: deps.catalog,
      source: deps.catalogSource,
      paths: deps.paths,
      log: deps.log,
      enabled: deps.catalogCheck,
      onChecked: reprobe,
    }),
  };
  start(ctx, reprobe);
  return ctx;
}

function start(ctx: DaemonContext, reprobe: () => Promise<void>): void {
  // The subscription ends when the executor closes, which the daemon does before the ledger.
  ctx.executor.onEvent(ctx.lifecycle.onExited);
  // Detection shells out; starting it here means the first `agn doctor` does not wait for it.
  void reprobe();
  // A task the ledger calls running may have died while the daemon was down (ADR 014), and one
  // still queued was being launched by that daemon. The verdict sweep runs after both, so a task
  // settled here is swept in the same pass.
  ctx.lifecycle
    .reconcileAll()
    .then(() => ctx.lifecycle.failQueued())
    .then(() => ctx.verdicts.runOnce())
    .catch((cause: unknown) => {
      ctx.log.error("start-up reconcile failed", { message: errorMessage(cause) });
    });
}
