import type {
  EvidenceLevel,
  Preferences,
  Profile,
  Recommendation,
  RiskRule,
  TaskClass,
  TaskIntent,
} from "@agnostic/core";
import { catalogEvidence } from "./catalog-evidence.js";
import { classifyTask, withIntent } from "./classify-task.js";
import { eligibleProfiles } from "./eligible-profiles.js";
import { RecommenderError } from "./error.js";
import { explain } from "./explain.js";
import { type Scored, type ScoreInput, scoreProfiles } from "./score-profiles.js";

/** A profile this machine cannot run yet, with the one step that would enable it. */
export type Candidate = { profile: Profile; enable: string };

export type RecommendInput = ScoreInput & {
  prompt: string;
  profiles: Profile[];
  candidates: Candidate[];
  /** `default_profile` from `.ag/agnostic.yaml`, which decides the pick when nothing else can. */
  defaultProfileId: string | null;
  /** `--intent`, which replaces what the classifier read out of the prompt. */
  intent: TaskIntent | null;
};

/** How far ahead a profile the user has not enabled must be before agn suggests enabling it. */
const WORTH_TRYING_MARGIN = 0.1;

/**
 * The whole pick, from a prompt to a profile: classify, filter, score, and say why. Everything it
 * needs is an argument, so the same input always gives the same answer and a test needs no daemon.
 */
export function recommend(input: RecommendInput): Recommendation {
  const taskClass = classOf(input);
  const eligible = eligibleProfiles(input.profiles, input.preferences);
  if (eligible.length === 0) {
    throw noEligibleProfile(input.preferences);
  }
  const scored = scoreProfiles(input, taskClass, eligible);
  const rules = matchedRules(input.preferences.riskRules, taskClass);
  const meeting = scored.filter((row) => meets(row, rules));
  // An evidence floor no profile clears cannot decide anything; the ranking stands and says so.
  const ranked = meeting.length === 0 ? scored : meeting;
  const pick = blind(scored) ? fallback(input, scored) : first(ranked);
  // The second opinion comes from the whole ranking: an evidence floor decides what agn starts,
  // not what it is willing to mention.
  const alternative = nextBest(scored, pick);
  return {
    recommended: {
      profileId: pick.profile.id,
      reason: explain(pick, taskClass),
      evidence: pick.evidence.level,
      sources: pick.evidence.sources,
    },
    alternative:
      alternative === null
        ? null
        : { profileId: alternative.profile.id, reason: explain(alternative, taskClass) },
    worthTrying: worthTrying(input, taskClass, pick),
    riskNote: riskNote(rules, taskClass, meeting.length === 0),
    taskClass,
  };
}

function classOf(input: RecommendInput): TaskClass {
  const automatic = classifyTask(input.prompt, input.preferences.riskRules);
  return input.intent === null ? automatic : withIntent(automatic, input.intent);
}

/** Nothing in the catalog touches anything this machine can run. */
function blind(scored: Scored[]): boolean {
  return scored.every((row) => row.evidence.level === "none");
}

/**
 * With no evidence there is nothing to rank, so agn uses what the repo already chose, then the
 * first profile the user does not pay per token for, and says plainly that it is not a finding.
 */
function fallback(input: RecommendInput, scored: Scored[]): Scored {
  const configured = scored.find((row) => row.profile.id === input.defaultProfileId);
  const subscription = scored.find((row) => row.profile.billing === "subscription");
  return configured ?? subscription ?? first(scored);
}

/** A second opinion is worth more from another agent than from the same one on another model. */
function nextBest(ranked: Scored[], pick: Scored): Scored | null {
  const rest = ranked.filter((row) => row.profile.id !== pick.profile.id);
  return rest.find((row) => row.profile.harness !== pick.profile.harness) ?? rest[0] ?? null;
}

function worthTrying(
  input: RecommendInput,
  taskClass: TaskClass,
  pick: Scored,
): Recommendation["worthTrying"] {
  const ahead = input.candidates
    .filter((candidate) => candidate.profile.route !== "local")
    .map((candidate) => ({
      candidate,
      evidence: catalogEvidence(input.catalog, candidate.profile, taskClass.intent, input.now),
    }))
    .filter(
      ({ evidence }) =>
        evidence.level !== "none" && evidence.score >= pick.evidence.score + WORTH_TRYING_MARGIN,
    )
    .sort((a, b) => b.evidence.score - a.evidence.score);
  const best = ahead[0];
  if (best === undefined) {
    return null;
  }
  const points = Math.round((best.evidence.score - pick.evidence.score) * 100);
  return {
    profileId: best.candidate.profile.id,
    reason: `scores ${points} points higher on ${taskClass.intent} benchmarks`,
    enable: best.candidate.enable,
  };
}

function matchedRules(rules: RiskRule[], taskClass: TaskClass): RiskRule[] {
  return rules.filter((rule) => taskClass.risk.includes(rule.area));
}

/** Weakest first, so "at least this level" is one comparison. */
const EVIDENCE_ASCENDING: EvidenceLevel[] = ["none", "model-level", "some", "strong"];

function meets(row: Scored, rules: RiskRule[]): boolean {
  return rules.every(
    (rule) =>
      EVIDENCE_ASCENDING.indexOf(row.evidence.level) >=
      EVIDENCE_ASCENDING.indexOf(rule.minEvidence),
  );
}

/** The strictest floor among the matched rules, which is the one that emptied the set. */
function strictestFloor(rules: RiskRule[]): EvidenceLevel {
  return rules
    .map((rule) => rule.minEvidence)
    .reduce(
      (strictest, level) =>
        EVIDENCE_ASCENDING.indexOf(level) > EVIDENCE_ASCENDING.indexOf(strictest)
          ? level
          : strictest,
      "none",
    );
}

/** What the user is told about the areas this task touches, in the order the rules are written. */
function riskNote(rules: RiskRule[], taskClass: TaskClass, unmet: boolean): string | null {
  if (taskClass.risk.length === 0) {
    return null;
  }
  const parts = [`touches ${taskClass.risk.join(", ")}`];
  if (rules.some((rule) => rule.review === "independent")) {
    parts.push("an independent review is advised");
  }
  if (unmet) {
    parts.push(`no available profile has ${strictestFloor(rules)} evidence`);
  }
  return parts.join("; ");
}

function first(scored: Scored[]): Scored {
  const [pick] = scored;
  if (pick === undefined) {
    // Unreachable: the caller has already refused an empty set.
    throw new RecommenderError("nothing to recommend", { code: "no-eligible-profile" });
  }
  return pick;
}

function noEligibleProfile(prefs: Preferences): RecommenderError {
  const because = prefs.subscriptionsOnly
    ? "subscriptions_only is on and no subscription profile is available"
    : "no supported agent is installed and available";
  return new RecommenderError(`nothing to run this task on: ${because}`, {
    code: "no-eligible-profile",
    hint: "Run `agn doctor` to see what is installed, or relax subscriptions_only in .ag/preferences.yaml.",
  });
}
