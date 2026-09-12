import { type BenchmarkRow, type Catalog, freshBenchmarks, modelRows } from "@agnostic/catalog";
import {
  type CatalogRowsResponse,
  type CatalogShowRow,
  type Event,
  type EvidenceLevel,
  parseProfileId,
} from "@agnostic/core";

type Rows = Pick<CatalogRowsResponse, "rows" | "cited">;

/**
 * The evidence behind one profile: the fresh rows for the model it runs, the ones naming its
 * harness first, and a mark on the rows the last recommendation actually leaned on. Nothing is
 * scored again here - the marks come from what was stored when the recommendation was made.
 */
export function catalogRowsFor(opts: {
  catalog: Catalog;
  profileId: string;
  now: Date;
  recommendation: Event<"recommendation.made"> | null;
}): Rows {
  // Throws invalid-profile-id, which is a 400: the caller asked about something that is not one.
  const { harness, model, route } = parseProfileId(opts.profileId);
  const cited = citedBy(opts.recommendation, opts.profileId);
  if (model === null) {
    // A `:default:` profile names no model, so there is nothing in the catalog to look up.
    return { rows: [], cited };
  }
  const canonical =
    modelRows(opts.catalog, harness, route).find((row) => row.model === model)?.canonical ?? model;
  const rows: CatalogShowRow[] = freshBenchmarks(opts.catalog, opts.now)
    .filter(
      (scored) =>
        scored.row.model === canonical &&
        (scored.row.harness === harness || scored.row.harness === null),
    )
    .sort(byHarnessThenDate)
    .map(({ row, weight }) => ({
      source: row.source,
      date: row.date,
      benchmark: row.benchmark,
      model: row.model,
      harness: row.harness,
      taskClass: row.taskClass,
      metric: row.metric,
      score: row.score,
      weight,
      cited: cited !== null && isCited(row, cited.evidence, cited.sources),
    }));
  return { rows, cited };
}

/** A row naming the harness is stronger evidence than a bare-model row, so it is shown first. */
function byHarnessThenDate(left: { row: BenchmarkRow }, right: { row: BenchmarkRow }): number {
  const named = Number(right.row.harness !== null) - Number(left.row.harness !== null);
  return named === 0 ? right.row.date.localeCompare(left.row.date) : named;
}

/** Only the last recommendation, and only when the profile it picked is the one being shown. */
function citedBy(event: Event<"recommendation.made"> | null, profileId: string): Rows["cited"] {
  if (event === null) {
    return null;
  }
  const { recommended } = event.payload.recommendation;
  if (recommended.profileId !== profileId) {
    return null;
  }
  return { evidence: recommended.evidence, sources: recommended.sources };
}

/**
 * The level the recommendation claimed decides which of its sources' rows carry the mark. Chunk 12
 * adds the task class the recommendation was made for; until it does, `strong` marks the same
 * harness rows as `some`.
 */
function isCited(row: BenchmarkRow, evidence: EvidenceLevel, sources: string[]): boolean {
  if (!sources.includes(row.source)) {
    return false;
  }
  switch (evidence) {
    case "strong":
    case "some":
      return row.harness !== null;
    case "model-level":
      return row.harness === null;
    case "none":
      return false;
  }
}
