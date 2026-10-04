import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type CatalogSource, updateCatalog } from "@agnostic/catalog";
import {
  type AgnosticPaths,
  type CatalogCheckState,
  CatalogCheckStateSchema,
  type CatalogUpdate,
  CoreError,
} from "@agnostic/core";
import { planVendor } from "@agnostic/registry";
import type { CatalogStore } from "./catalog-store.js";
import type { Logger } from "./log.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Late enough that a daemon start is never waiting on a network round trip (ADR 024). */
const START_DELAY_MS = 5_000;

export type CatalogChecker = {
  /** The manual path, which runs whether or not the daily check is enabled. */
  update(): Promise<CatalogUpdate>;
  lastCheck(): CatalogCheckState | null;
  close(): void;
};

type CheckerDeps = {
  store: CatalogStore;
  source: CatalogSource;
  paths: AgnosticPaths;
  log: Logger;
  enabled: boolean;
  /** Run once per check, after a download that landed has been reloaded. */
  onChecked: () => Promise<void>;
  fetch?: typeof fetch;
  now?: () => Date;
  intervalMs?: number;
  startDelayMs?: number;
};

/** Writes the outcome of one check to the state file; the timestamp is the checker's to stamp. */
type RecordCheck = (outcome: Omit<CatalogCheckState, "checkedAt">) => Promise<void>;

/**
 * Once a day, and once at start when the last recorded check is older than that: a laptop daemon
 * is restarted often and rarely runs for a whole day, so the state file is what makes "daily"
 * true either way. A check that fails is a warning in the log and nothing a user is shown.
 */
export function createCatalogChecker(deps: CheckerDeps): CatalogChecker {
  const now = deps.now ?? (() => new Date());
  const intervalMs = deps.intervalMs ?? DAY_MS;
  // Read once, here, so `lastCheck` is an answer rather than a promise the routes have to await.
  let state = readState(deps.paths.catalogCheck, deps.log);
  let inFlight: Promise<CatalogUpdate> | null = null;

  const record: RecordCheck = async (outcome) => {
    const next: CatalogCheckState = { checkedAt: now().toISOString(), ...outcome };
    state = next;
    await mkdir(dirname(deps.paths.catalogCheck), { recursive: true });
    await writeFile(deps.paths.catalogCheck, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  };

  const update = (): Promise<CatalogUpdate> => {
    // One check at a time: the timer and `agn catalog update` share whichever is already going.
    inFlight ??= check(deps, record).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const timers = deps.enabled
    ? schedule(update, {
        due: due(state, now(), intervalMs),
        intervalMs,
        startDelayMs: deps.startDelayMs ?? START_DELAY_MS,
      })
    : [];

  return {
    update,
    lastCheck: () => state,
    close: () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    },
  };
}

/** One fetch-verify-replace round, recorded whether it landed a new catalog or failed. */
async function check(deps: CheckerDeps, record: RecordCheck): Promise<CatalogUpdate> {
  const localVersion = deps.store.current().catalog.version;
  try {
    const update = await updateCatalog({
      source: deps.source,
      localVersion,
      downloaded: deps.paths.catalog,
      vendorOf: planVendor,
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    });
    if (update.outcome === "updated") {
      deps.log.info("catalog updated", { from: localVersion, to: update.remoteVersion });
      await deps.store.reload();
      // The only outcome a caller waits on the probe for: the new catalog can move the
      // entitlements detection reads, so `agn catalog update` answers from the fresh detection.
      await probe(deps);
    } else {
      void probe(deps);
    }
    await record({
      outcome: update.outcome,
      localVersion,
      remoteVersion: update.remoteVersion,
      message: null,
    });
    return update;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    deps.log.warn("catalog check failed", {
      code: cause instanceof CoreError ? cause.code : "internal",
      message,
    });
    await record({ outcome: "failed", localVersion, remoteVersion: null, message });
    void probe(deps);
    throw cause;
  }
}

/**
 * Every check re-probes the harnesses, whether or not a new catalog landed and whether or not the
 * check itself failed (tech lead, 2026-10-01): a harness can change the models it offers without a
 * catalog release. Nothing the check returns depends on the probe except after a download, so it is
 * started and left to run - the probe shells out to every harness, and no response waits for that.
 * A probe that fails is logged here and never reported as the check's own failure.
 */
function probe(deps: CheckerDeps): Promise<void> {
  return deps.onChecked().catch((cause: unknown) => {
    deps.log.warn("re-probe after catalog check failed", {
      message: cause instanceof Error ? cause.message : String(cause),
    });
  });
}

/** Unref'd: a pending check never keeps the process, or a test, alive. */
function schedule(
  update: () => Promise<CatalogUpdate>,
  opts: { due: boolean; intervalMs: number; startDelayMs: number },
): NodeJS.Timeout[] {
  // The check is the daemon's own business: its failures are logged inside `update`, not here.
  const quietly = () => void update().catch(() => undefined);
  const timers = [setInterval(quietly, opts.intervalMs)];
  if (opts.due) {
    timers.push(setTimeout(quietly, opts.startDelayMs));
  }
  for (const timer of timers) {
    timer.unref?.();
  }
  return timers;
}

function due(state: CatalogCheckState | null, now: Date, intervalMs: number): boolean {
  return state === null || now.getTime() - Date.parse(state.checkedAt) >= intervalMs;
}

/** A missing file is the first run; an unreadable one is treated the same and says so once. */
function readState(path: string, log: Logger): CatalogCheckState | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const parsed = CatalogCheckStateSchema.safeParse(safeJson(text));
  if (!parsed.success) {
    log.warn("catalog check state unreadable", { path });
    return null;
  }
  return parsed.data;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
