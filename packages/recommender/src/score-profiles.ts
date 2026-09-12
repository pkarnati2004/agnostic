import type { Catalog } from "@agnostic/catalog";
import type {
  Billing,
  EvidenceLevel,
  OptimizePreset,
  Preferences,
  Profile,
  Route,
  TaskClass,
} from "@agnostic/core";
import { catalogEvidence, type EvidenceSummary } from "./catalog-evidence.js";
import { type HistoryEvidence, type HistoryRow, historyEvidence } from "./history-evidence.js";
import { marginalCostUsd } from "./marginal-cost.js";

/** Everything scoring reads. `recommend` passes its whole input, which is a superset of this. */
export type ScoreInput = {
  preferences: Preferences;
  catalog: Catalog;
  /** Profile ids of tasks running or waiting on this repo, which already hold its context. */
  activeProfileIds: string[];
  history: HistoryRow[];
  now: Date;
};

export type Scored = {
  profile: Profile;
  evidence: EvidenceSummary;
  /** This repo's own results for the profile, once there are enough of them; null until then. */
  own: HistoryEvidence | null;
  costUsd: number | null;
  score: number;
};

type Weights = { quality: number; cost: number; time: number };

/** `.ag/preferences.yaml` picks one of these four; every other number in scoring is fixed. */
const WEIGHTS: Record<OptimizePreset, Weights> = {
  quality: { quality: 1, cost: 0.1, time: 0.1 },
  balanced: { quality: 1, cost: 0.4, time: 0.2 },
  cost: { quality: 1, cost: 1, time: 0.2 },
  speed: { quality: 1, cost: 0.3, time: 1 },
};

/** How far the repo's own results lead the catalog's once there are enough of them (ADR 022). */
const OWN_WEIGHT = 0.7;

/** A placeholder until outcomes measure real durations: a local model is the slowest thing here. */
const TIME_BY_ROUTE: Record<Route, number> = {
  local: 1,
  "anthropic-gateway": 0.5,
  "openai-compatible": 0.5,
  openrouter: 0.5,
  native: 0,
};

/** Staying where the context already is, worth about as much as a small quality difference. */
const CONTINUITY_BONUS = 0.1;

const LEVEL_ORDER: EvidenceLevel[] = ["strong", "some", "model-level", "none"];

/** On an equal score, the profile that costs the user least to be wrong about comes first. */
const BILLING_ORDER: Billing[] = ["subscription", "local", "credits", "api-key", "unknown"];

/**
 * Every eligible profile, best first. The score is evidence minus what it costs in money and in
 * time, plus a nudge towards the profile this repo is already running in.
 */
export function scoreProfiles(
  input: ScoreInput,
  taskClass: TaskClass,
  eligible: Profile[],
): Scored[] {
  const weights = WEIGHTS[input.preferences.optimize];
  const rows = eligible.map((profile) => ({
    profile,
    ...evidenceFor(input, taskClass, profile),
    costUsd: marginalCostUsd(input.catalog, profile, taskClass.scope),
  }));
  // Cost is relative: the dearest eligible profile pays the full weight, and nothing else does.
  const dearest = Math.max(0, ...rows.map((row) => row.costUsd ?? 0));
  const scored = rows.map((row) => ({
    ...row,
    score:
      weights.quality * row.evidence.score -
      weights.cost * (dearest === 0 ? 0 : (row.costUsd ?? 0) / dearest) -
      weights.time * TIME_BY_ROUTE[row.profile.route] +
      (input.activeProfileIds.includes(row.profile.id) ? CONTINUITY_BONUS : 0),
  }));
  return rank(scored);
}

/**
 * With thirty outcomes or more for this class on this repo, what happened here leads what the
 * catalog says, without silencing it: a profile the repo has kept is only as good as the benchmarks
 * agree it is. The evidence level is the catalog's either way, because that is what it describes.
 */
function evidenceFor(
  input: ScoreInput,
  taskClass: TaskClass,
  profile: Profile,
): { evidence: EvidenceSummary; own: HistoryEvidence | null } {
  const evidence = catalogEvidence(input.catalog, profile, taskClass.intent, input.now);
  const own = historyEvidence(input.history, taskClass, profile.id);
  if (own === null) {
    return { evidence, own };
  }
  const score = OWN_WEIGHT * own.kept + (1 - OWN_WEIGHT) * evidence.score;
  return { evidence: { ...evidence, score }, own };
}

/** Deterministic all the way down, so the same machine and catalog always answer the same. */
function rank(scored: Scored[]): Scored[] {
  return scored
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byScore = b.row.score - a.row.score;
      if (byScore !== 0) {
        return byScore;
      }
      const byLevel =
        LEVEL_ORDER.indexOf(a.row.evidence.level) - LEVEL_ORDER.indexOf(b.row.evidence.level);
      if (byLevel !== 0) {
        return byLevel;
      }
      const byBilling =
        BILLING_ORDER.indexOf(a.row.profile.billing) - BILLING_ORDER.indexOf(b.row.profile.billing);
      return byBilling === 0 ? a.index - b.index : byBilling;
    })
    .map(({ row }) => row);
}
