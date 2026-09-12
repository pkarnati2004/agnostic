import { type BenchmarkRow, type Catalog, freshBenchmarks } from "@agnostic/catalog";
import type { EvidenceLevel, Profile, TaskIntent } from "@agnostic/core";
import { canonicalModel } from "./canonical-model.js";

/**
 * How much the catalog has to say about running this task on this profile. `score` is 0 to 1 and
 * already carries the level, so a caller compares two summaries with one number; `sources` is what
 * `agn recommend` names and `agn catalog show` looks up.
 */
export type EvidenceSummary = {
  level: EvidenceLevel;
  score: number;
  sources: string[];
  classes: TaskIntent[];
};

/** A row naming the harness that ran the model outranks one measuring the model on its own. */
const LEVEL_FACTOR: Record<EvidenceLevel, number> = {
  strong: 1,
  some: 0.8,
  "model-level": 0.6,
  none: 0,
};

type ScoredRow = { row: BenchmarkRow; weight: number };

/** Rows for the class that was asked about, then rows for the same profile, then bare-model rows. */
export function catalogEvidence(
  catalog: Catalog,
  profile: Profile,
  intent: TaskIntent,
  now: Date,
): EvidenceSummary {
  const model = canonicalModel(catalog, profile);
  if (model === null) {
    return noEvidence();
  }
  const fresh = freshBenchmarks(catalog, now);
  const byProfile = fresh.filter(
    ({ row }) => row.harness === profile.harness && row.model === model,
  );
  const onClass = byProfile.filter(({ row }) => row.taskClass === intent);
  if (onClass.length > 0) {
    return summarise("strong", onClass, fresh, () => 1);
  }
  if (byProfile.length > 0) {
    // A benchmark that spans intents still measured this profile; one for another intent barely does.
    return summarise("some", byProfile, fresh, (row) => (row.taskClass === "general" ? 1 : 0.5));
  }
  const byModel = fresh.filter(({ row }) => row.harness === null && row.model === model);
  if (byModel.length > 0) {
    return summarise("model-level", byModel, fresh, (row) => bareModelWeight(row, intent));
  }
  return noEvidence();
}

function bareModelWeight(row: BenchmarkRow, intent: TaskIntent): number {
  if (row.taskClass === intent) {
    return 1;
  }
  return row.taskClass === "general" ? 0.75 : 0.5;
}

/**
 * Benchmarks are not on one scale: 61 on Terminal-Bench and 61 on SWE-bench are different claims.
 * Each row is first divided by the best score any profile reached on that benchmark and class, so
 * what is averaged is "how close to the best result this is", not the published number.
 */
function summarise(
  level: EvidenceLevel,
  used: ScoredRow[],
  fresh: ScoredRow[],
  classWeight: (row: BenchmarkRow) => number,
): EvidenceSummary {
  let total = 0;
  let weights = 0;
  for (const { row, weight } of used) {
    const share = weight * classWeight(row);
    total += share * normalise(row, fresh);
    weights += share;
  }
  return {
    level,
    score: weights === 0 ? 0 : (total / weights) * LEVEL_FACTOR[level],
    sources: unique(used.map(({ row }) => row.source)),
    classes: unique(used.map(({ row }) => row.taskClass)),
  };
}

function normalise(row: BenchmarkRow, fresh: ScoredRow[]): number {
  const best = Math.max(
    ...fresh
      .filter(
        (candidate) =>
          candidate.row.benchmark === row.benchmark && candidate.row.taskClass === row.taskClass,
      )
      .map((candidate) => candidate.row.score),
  );
  return best <= 0 ? 0 : row.score / best;
}

function noEvidence(): EvidenceSummary {
  return { level: "none", score: 0, sources: [], classes: [] };
}

/** File order, because that is the order the catalog chose and the order a user will see. */
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
