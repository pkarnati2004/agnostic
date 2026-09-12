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
import { type HistoryRow, historyEvidence } from "./history-evidence.js";
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

/** A placeholder until chunk 15 measures real durations: a local model is the slowest thing here. */
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
    evidence: evidenceFor(input, taskClass, profile),
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

function evidenceFor(input: ScoreInput, taskClass: TaskClass, profile: Profile): EvidenceSummary {
  const evidence = catalogEvidence(input.catalog, profile, taskClass.intent, input.now);
  // chunk 15: with 30 outcomes or more for this repo and class, its own numbers lead the catalog's.
  const own = historyEvidence(input.history, taskClass, profile.id);
  return own === null ? evidence : { ...evidence, score: own };
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
