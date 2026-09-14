import type { Recommendation, TaskClass } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { INTENT_FLAG_HELP, intentFlag } from "../intent-flag.js";
import { resolveRepo } from "../resolve-repo.js";

type RecommendFlags = { repo?: string; intent?: string; subscriptionsOnly?: boolean };

export function recommendCommand(ctx: CliContext): Command {
  return new Command("recommend")
    .description("say which agent and model to run a task on, without starting it")
    .argument("<prompt>", "what the agent would be asked to do")
    .option("--repo <repo>", "repo id, prefix or path; defaults to the one you are in")
    .option("--intent <intent>", INTENT_FLAG_HELP)
    .option("--subscriptions-only", "consider only profiles your plan already covers")
    .action(async (prompt: string, flags: RecommendFlags, command: Command) => {
      const intent = intentFlag(flags.intent, command);
      const { repoId } = await resolveRepo(ctx, flags.repo);
      const client = await ctx.client();
      const response = await client.recommend({
        repoId,
        prompt,
        ...(intent === undefined ? {} : { intent }),
        ...(flags.subscriptionsOnly === true ? { subscriptionsOnly: true } : {}),
      });
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of recommendLines(response.recommendation)) {
        ctx.io.out(line);
      }
    });
}

/**
 * Five lines, the same on a terminal and in a pipe (ADR 012). The class comes first because a
 * misclassification is the one mistake a rule-based classifier makes, and this is where it shows.
 */
function recommendLines(recommendation: Recommendation): string[] {
  const { recommended, alternative, worthTrying, riskNote } = recommendation;
  const lines = [
    taskLine(recommendation.taskClass),
    `Recommended: ${recommended.profileId} - ${recommended.reason} · evidence: ${label(recommended.evidence)}${sources(recommended.sources)}`,
    `Alternative: ${alternative === null ? "none" : `${alternative.profileId} - ${alternative.reason}`}`,
  ];
  if (worthTrying !== null) {
    lines.push(
      `Worth trying: ${worthTrying.profileId} - ${worthTrying.reason} · enable: ${worthTrying.enable}`,
    );
  }
  if (riskNote !== null) {
    lines.push(`Risk: ${riskNote}`);
  }
  return lines;
}

function taskLine(taskClass: TaskClass): string {
  const intent =
    taskClass.automaticIntent === null
      ? taskClass.intent
      : `${taskClass.intent} (--intent; the prompt reads as ${taskClass.automaticIntent})`;
  const parts = [intent, taskClass.scope];
  if (taskClass.risk.length > 0) {
    parts.push(`risk: ${taskClass.risk.join(", ")}`);
  }
  if (taskClass.needsBrowser) {
    parts.push("needs a browser");
  }
  return `Task: ${parts.join(", ")}`;
}

/** "model-level" is a level in the API and a sentence in the output. */
function label(evidence: Recommendation["recommended"]["evidence"]): string {
  return evidence === "model-level" ? "model-level only" : evidence;
}

function sources(ids: string[]): string {
  return ids.length === 0 ? "" : ` · sources: ${ids.join(", ")}`;
}
