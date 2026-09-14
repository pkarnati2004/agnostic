import type { Recommendation, TaskClass } from "@agnostic/core";

export type RecommendationLabel = "Task" | "Recommended" | "Alternative" | "Worth trying" | "Risk";

export type RecommendationLineView = { label: RecommendationLabel; text: string };

/**
 * The five lines `agn recommend` prints, split into label and text so the card can lay them out.
 * Written here rather than imported: the page cannot load the cli package. The one difference is
 * the override marker, which says "chosen" where the command says `--intent`; a dialog has no flag.
 */
export function recommendationLines(recommendation: Recommendation): RecommendationLineView[] {
  const { recommended, alternative, worthTrying, riskNote } = recommendation;
  const lines: RecommendationLineView[] = [
    { label: "Task", text: taskText(recommendation.taskClass) },
    {
      label: "Recommended",
      text: `${recommended.profileId} - ${recommended.reason} · evidence: ${evidence(recommended.evidence)}${sources(recommended.sources)}`,
    },
    {
      label: "Alternative",
      text: alternative === null ? "none" : `${alternative.profileId} - ${alternative.reason}`,
    },
  ];
  if (worthTrying !== null) {
    lines.push({
      label: "Worth trying",
      text: `${worthTrying.profileId} - ${worthTrying.reason} · enable: ${worthTrying.enable}`,
    });
  }
  if (riskNote !== null) {
    lines.push({ label: "Risk", text: riskNote });
  }
  return lines;
}

function taskText(taskClass: TaskClass): string {
  const intent =
    taskClass.automaticIntent === null
      ? taskClass.intent
      : `${taskClass.intent} (chosen; the prompt reads as ${taskClass.automaticIntent})`;
  const parts = [intent, taskClass.scope];
  if (taskClass.risk.length > 0) {
    parts.push(`risk: ${taskClass.risk.join(", ")}`);
  }
  if (taskClass.needsBrowser) {
    parts.push("needs a browser");
  }
  return parts.join(", ");
}

/** "model-level" is a level in the API and a sentence in the output. */
function evidence(level: Recommendation["recommended"]["evidence"]): string {
  return level === "model-level" ? "model-level only" : level;
}

function sources(ids: string[]): string {
  return ids.length === 0 ? "" : ` · sources: ${ids.join(", ")}`;
}
