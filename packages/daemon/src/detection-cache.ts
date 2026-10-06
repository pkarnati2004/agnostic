import type { DoctorResponse, HarnessReport } from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import type { LocalServer } from "@agnostic/registry";

/**
 * What one detection run found: the doctor response, plus the local model servers that were
 * answering. The servers are not part of the wire shape; a launch on the `local` route needs them
 * to build the harness's provider overrides, and detecting them again per run would be a second
 * round of loopback calls for an answer that is already here.
 */
export type Detection = Omit<
  DoctorResponse,
  "plans" | "planOptions" | "tmuxConfigStale" | "named" | "keys" | "tmux"
> & {
  servers: LocalServer[];
};

export type DetectionCache = {
  /** The last run, waiting for one already in flight rather than starting a second. */
  current(): Promise<Detection>;
  refresh(): Promise<Detection>;
};

/** What a cached detection goes stale on, each stamped once per run and again on every read. */
export type StaleWhen = {
  /** The harness auth files change: a re-login or a plan change rewrites one of them. */
  authFiles?: () => Promise<string>;
  /** A harness binary changes: the detection's own paths, stat'd as of that run. */
  binaries?: (detection: Detection) => Promise<string>;
};

/**
 * Detection shells out to every installed harness and asks each for its model list, so it runs at
 * start, on the daily catalog tick, when a stamped file changes and on `agn doctor`, never per
 * request. Nothing here is persisted: a model list is only true for as long as the harness that
 * answered stays installed.
 */
export function createDetectionCache(
  detect: () => Promise<Detection>,
  ledger: Ledger,
  stale: StaleWhen = {},
): DetectionCache {
  const authFiles = stale.authFiles ?? nothing;
  const binaries = stale.binaries ?? nothing;
  let latest: Detection | null = null;
  let latestStamp: Promise<string> = Promise.resolve("");
  let inFlight: Promise<Detection> | null = null;
  let queued: Promise<Detection> | null = null;
  const announced = new Set<string>();

  // The auth files are stamped as the run starts, so one rewritten while detection is running is
  // seen as a change. The binaries are stamped from the detection itself, which is what resolved
  // their paths, so the first read after a run does not find its own stamp stale.
  // Each half has one `|`-separated segment per registry entry, a count that does not change
  // between runs, so joining the two on `|` cannot read as a different split of the same string.
  const stampOf = async (auth: Promise<string>, detection: Detection): Promise<string> =>
    `${await auth}|${await binaries(detection)}`;

  const run = async (): Promise<Detection> => {
    const taken = authFiles();
    const detection = await detect();
    announce(ledger, detection, announced);
    announcePlans(ledger, latest, detection);
    latest = detection;
    latestStamp = stampOf(taken, detection);
    return detection;
  };

  const start = (): Promise<Detection> => {
    const running = run().finally(() => {
      inFlight = null;
    });
    inFlight = running;
    return running;
  };

  /**
   * A run that was already going when this call arrived cannot answer for it: `agn doctor --plan`
   * writes the config and then asks, and must see what it just wrote. So one more run is queued
   * behind the current one, and everyone who asks meanwhile shares that one rather than piling up.
   */
  const refresh = (): Promise<Detection> => {
    if (inFlight === null) {
      return start();
    }
    queued ??= inFlight.catch(ignoreFailure).then(() => {
      queued = null;
      return start();
    });
    return queued;
  };

  const current = async (): Promise<Detection> => {
    if (latest === null) {
      return refresh();
    }
    const now = stampOf(authFiles(), latest);
    return (await now) === (await latestStamp) ? latest : refresh();
  };

  return { current, refresh };
}

/** A cache given no stamp never goes stale on a file; the daemon always gives it both. */
function nothing(): Promise<string> {
  return Promise.resolve("");
}

/** A failed run is the caller's to handle; the run queued behind it still has to start. */
function ignoreFailure(): undefined {
  return undefined;
}

/**
 * A plan that changed since the last run, which is how the ledger records a re-login or an
 * upgrade. Billing needs no recomputing here: the detection this event came from already
 * enumerated the profiles against the new plan.
 */
function announcePlans(ledger: Ledger, before: Detection | null, after: Detection): void {
  if (before === null) {
    return;
  }
  const was = new Map(before.harnesses.map((report) => [report.harness, report.plan]));
  for (const report of after.harnesses) {
    const previous = was.get(report.harness) ?? null;
    if (!changed(previous, report.plan)) {
      continue;
    }
    ledger.events.append({
      ts: after.detectedAt,
      kind: "plan.changed",
      payload: {
        harness: report.harness,
        from: previous?.value ?? null,
        to: report.plan?.value ?? null,
        source: report.plan?.source ?? previous?.source ?? "detected",
      },
    });
  }
}

/** Where the plan was read from is not a change of plan; only the name is. */
function changed(before: HarnessReport["plan"], after: HarnessReport["plan"]): boolean {
  return (before?.value ?? null) !== (after?.value ?? null);
}

// One event per profile this process has not seen, so a newly probed model announces itself once.
function announce(ledger: Ledger, detection: Detection, announced: Set<string>): void {
  for (const profile of detection.profiles) {
    if (!profile.available || announced.has(profile.id)) {
      continue;
    }
    announced.add(profile.id);
    ledger.events.append({
      ts: detection.detectedAt,
      kind: "profile.detected",
      payload: { profile },
    });
  }
}
