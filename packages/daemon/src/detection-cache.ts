import type { DoctorResponse } from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import type { LocalServer } from "@agnostic/registry";

/**
 * What one detection run found: the doctor response, plus the local model servers that were
 * answering. The servers are not part of the wire shape; a launch on the `local` route needs them
 * to build the harness's provider overrides, and detecting them again per run would be a second
 * round of loopback calls for an answer that is already here.
 */
export type Detection = DoctorResponse & { servers: LocalServer[] };

export type DetectionCache = {
  /** The last run, waiting for one already in flight rather than starting a second. */
  current(): Promise<Detection>;
  refresh(): Promise<Detection>;
};

/**
 * Detection shells out to every installed harness and asks each for its model list, so it runs at
 * start and on `agn doctor`, never per request. Nothing here is persisted: a model list is only
 * true for as long as the harness that answered stays installed.
 */
export function createDetectionCache(
  detect: () => Promise<Detection>,
  ledger: Ledger,
): DetectionCache {
  let latest: Detection | null = null;
  let inFlight: Promise<Detection> | null = null;
  const announced = new Set<string>();

  const run = async (): Promise<Detection> => {
    const detection = await detect();
    announce(ledger, detection, announced);
    latest = detection;
    return detection;
  };

  const refresh = (): Promise<Detection> => {
    if (inFlight === null) {
      inFlight = run().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };

  return {
    current: () => (latest === null ? refresh() : Promise.resolve(latest)),
    refresh,
  };
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
