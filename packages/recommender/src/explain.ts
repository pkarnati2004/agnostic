import type { EvidenceLevel, TaskClass, TaskIntent } from "@agnostic/core";
import type { Scored } from "./score-profiles.js";

/** The one sentence under a pick: what the evidence is, and what running it costs the user. */
export function explain(scored: Scored, taskClass: TaskClass): string {
  const reason = [
    evidenceReason(scored.evidence.level, taskClass.intent, scored.evidence.classes),
    ownResults(scored),
  ]
    .filter((part) => part !== null)
    .join("; ");
  // Nothing to say about the bill when there was nothing to go on in the first place.
  return scored.evidence.level === "none" && scored.own === null
    ? reason
    : `${reason}; ${billingPhrase(scored)}`;
}

/** The repo's own record, once there is enough of it to have moved the score (ADR 022). */
function ownResults(scored: Scored): string | null {
  if (scored.own === null) {
    return null;
  }
  const kept = Math.round(scored.own.kept * 100);
  return `your own results here: ${scored.own.tasks} tasks, ${kept}% kept`;
}

function evidenceReason(level: EvidenceLevel, intent: TaskIntent, classes: TaskIntent[]): string {
  switch (level) {
    case "strong":
      return intent === "general"
        ? "no intent recognised; strong evidence for this agent and model"
        : `strong ${intent} evidence for this agent and model`;
    case "some":
      return `related benchmarks only (${classes.join(", ")})`;
    case "model-level":
      return "model-level evidence only";
    case "none":
      return "no evidence; using your default";
  }
}

function billingPhrase(scored: Scored): string {
  switch (scored.profile.billing) {
    case "subscription":
      return "included in your plan";
    case "credits":
      return `metered credits, about ${dollars(scored.costUsd)}`;
    case "api-key":
      return `about ${dollars(scored.costUsd)} by API key`;
    case "local":
      return "free, local";
    case "unknown":
      return "billing unknown";
  }
}

/** Two decimals: a task costs dollars, and a rounder number would claim a precision agn has not. */
function dollars(costUsd: number | null): string {
  return `$${(costUsd ?? 0).toFixed(2)}`;
}
