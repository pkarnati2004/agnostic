import type { BenchmarkRow, Catalog } from "./catalog-schema.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A result keeps its full weight for half a year, then fades out over the next half. */
export const FRESH_DAYS = 180;
export const STALE_DAYS = 360;

export function freshness(date: string, now: Date): number {
  const days = (now.getTime() - Date.parse(`${date}T00:00:00Z`)) / DAY_MS;
  if (days <= FRESH_DAYS) {
    // A row dated in the future is a clock problem, not a reason to discount the number.
    return 1;
  }
  if (days >= STALE_DAYS) {
    return 0;
  }
  return (STALE_DAYS - days) / (STALE_DAYS - FRESH_DAYS);
}

/** The rows still worth scoring, each with the weight its age has left it. */
export function freshBenchmarks(
  catalog: Catalog,
  now: Date,
): Array<{ row: BenchmarkRow; weight: number }> {
  return catalog.benchmarks
    .map((row) => ({ row, weight: freshness(row.date, now) }))
    .filter((scored) => scored.weight > 0);
}
