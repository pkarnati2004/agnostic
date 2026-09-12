import type { HarnessId, Plans, Repo, TaskIntent } from "@agnostic/core";
import { readPreferences, readRepoConfig } from "@agnostic/core";
import type { HistoryRow, RecommendInput } from "@agnostic/recommender";
import type { DaemonContext } from "./app.js";
import { readDaemonConfig } from "./daemon-config.js";
import type { Detection } from "./detection-cache.js";
import { worthTryingCandidates } from "./worth-trying-candidates.js";

type RecommendOptions = {
  /** Overrides `subscriptions_only` in preferences.yaml for this call only. */
  subscriptionsOnly?: boolean;
  /** `--intent`, which replaces what the classifier reads out of the prompt. */
  intent?: TaskIntent;
};

/**
 * Everything the recommender needs, gathered in the one place that can reach it all. The package
 * itself reads nothing: this is what keeps it a pure function of its arguments.
 */
export async function buildRecommendInput(
  ctx: DaemonContext,
  repo: Repo,
  prompt: string,
  opts: RecommendOptions = {},
): Promise<RecommendInput> {
  const preferences = await readPreferences(repo.path);
  const config = await readRepoConfig(repo.path);
  const detection = await ctx.detection.current();
  const { plans } = await readDaemonConfig(ctx.paths);
  return {
    prompt,
    preferences:
      opts.subscriptionsOnly === undefined
        ? preferences
        : { ...preferences, subscriptionsOnly: opts.subscriptionsOnly },
    profiles: detection.profiles,
    candidates: worthTryingCandidates(
      ctx.catalog,
      detection.profiles,
      installedHarnesses(detection),
      knownPlans(detection, plans),
    ),
    catalog: ctx.catalog,
    defaultProfileId: config?.defaultProfileId ?? null,
    // A task that is running or waiting still holds this repo's context in its own session.
    activeProfileIds: ctx.ledger.tasks
      .list({ repoId: repo.id, status: ["running", "waiting"] })
      .map((task) => task.profileId),
    history: historyRows(ctx, repo.id),
    intent: opts.intent ?? null,
    now: new Date(),
  };
}

/** Only a finished task with both an outcome and the class it was picked for can teach anything. */
function historyRows(ctx: DaemonContext, repoId: string): HistoryRow[] {
  return ctx.ledger.tasks.list({ repoId, status: "done" }).flatMap((task) => {
    const outcome = ctx.ledger.outcomes.get(task.id);
    if (outcome === null || task.recommendation === undefined) {
      return [];
    }
    return [{ taskClass: task.recommendation.taskClass, profileId: task.profileId, outcome }];
  });
}

function installedHarnesses(detection: Detection): Set<HarnessId> {
  return new Set(
    detection.harnesses.filter((report) => report.path !== null).map((report) => report.harness),
  );
}

/** What the harness itself said wins over config.yaml, the same way `agn doctor` reports it. */
function knownPlans(detection: Detection, configured: Plans): Plans {
  const plans: Plans = { ...configured };
  for (const report of detection.harnesses) {
    if (report.planVendor !== null && report.plan !== null) {
      plans[report.planVendor] = report.plan.value;
    }
  }
  return plans;
}
