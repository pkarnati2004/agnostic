import { newId, type Repo } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import { writeDaemonConfig } from "./daemon-config-write.js";
import type { Detection } from "./detection-cache.js";
import { buildRecommendInput } from "./recommend-input.js";
import { fixtureCatalog, fixtureDetection } from "./test-detection.js";
import {
  fixtureOutcome,
  fixtureRecommendation,
  fixtureTask,
  recommendContext,
} from "./test-recommend-context.js";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe("buildRecommendInput", () => {
  it("reads the repo's preferences and profiles, and the fallback intent when none is given", async () => {
    const { ctx, repo, close } = await recommendContext(fixtureDetection(), await fixtureCatalog());
    cleanup = close;
    const input = await buildRecommendInput(ctx, repo, "fix the flaky auth test");
    expect(input.prompt).toBe("fix the flaky auth test");
    expect(input.preferences.subscriptionsOnly).toBe(false);
    expect(input.profiles).toEqual(fixtureDetection().profiles);
    expect(input.defaultProfileId).toBeNull();
    expect(input.intent).toBeNull();
  });

  it("overrides subscriptions_only and carries --intent for this call only", async () => {
    const { ctx, repo, close } = await recommendContext(fixtureDetection(), await fixtureCatalog());
    cleanup = close;
    const input = await buildRecommendInput(ctx, repo, "why is the login flow slow", {
      subscriptionsOnly: true,
      intent: "debug",
    });
    expect(input.preferences.subscriptionsOnly).toBe(true);
    expect(input.intent).toBe("debug");
  });

  it("collects the profile ids of tasks live on this repo, and no others", async () => {
    const { ctx, repo, ledger, close } = await recommendContext(
      fixtureDetection(),
      await fixtureCatalog(),
    );
    cleanup = close;
    const other: Repo = { ...repo, id: newId(), path: `${repo.path}-other` };
    ledger.repos.insert(other);
    ledger.tasks.insert(
      fixtureTask({ repoId: repo.id, status: "running", profileId: "claude-code:opus:native" }),
    );
    ledger.tasks.insert(
      fixtureTask({ repoId: repo.id, status: "waiting", profileId: "codex:default:native" }),
    );
    ledger.tasks.insert(
      fixtureTask({ repoId: repo.id, status: "done", profileId: "codex:opus:native" }),
    );
    ledger.tasks.insert(
      fixtureTask({ repoId: other.id, status: "running", profileId: "pi:default:native" }),
    );

    const input = await buildRecommendInput(ctx, repo, "ship it");
    expect(input.activeProfileIds.sort()).toEqual(
      ["claude-code:opus:native", "codex:default:native"].sort(),
    );
  });

  it("turns a finished task into history only when it has both an outcome and a stored pick", async () => {
    const { ctx, repo, ledger, close } = await recommendContext(
      fixtureDetection(),
      await fixtureCatalog(),
    );
    cleanup = close;
    const recommendation = fixtureRecommendation;
    const withBoth = fixtureTask({ repoId: repo.id, status: "done", recommendation });
    const noOutcome = fixtureTask({ repoId: repo.id, status: "done", recommendation });
    const noRecommendation = fixtureTask({ repoId: repo.id, status: "done" });
    const stillRunning = fixtureTask({ repoId: repo.id, status: "running", recommendation });
    for (const row of [withBoth, noOutcome, noRecommendation, stillRunning]) {
      ledger.tasks.insert(row);
    }
    ledger.outcomes.record({ ...fixtureOutcome, taskId: withBoth.id });
    ledger.outcomes.record({ ...fixtureOutcome, taskId: stillRunning.id });

    const input = await buildRecommendInput(ctx, repo, "ship it");
    expect(input.history).toEqual([
      {
        taskClass: recommendation.taskClass,
        profileId: withBoth.profileId,
        outcome: { ...fixtureOutcome, taskId: withBoth.id },
      },
    ]);
  });

  it("names the install command for a harness detection did not find", async () => {
    const { ctx, repo, close } = await recommendContext(fixtureDetection(), await fixtureCatalog());
    cleanup = close;
    const input = await buildRecommendInput(ctx, repo, "ship it");
    const codex = input.candidates.find(
      (candidate) => candidate.profile.id === "codex:gpt-6-astra:native",
    );
    expect(codex?.enable).toBe("npm i -g @openai/codex");
  });

  it("prefers the plan the harness itself reports over the one configured on this machine", async () => {
    const catalog = await fixtureCatalog();
    // The stub detection reports claude-code on max20, which already includes fable.
    const { ctx, repo, close } = await recommendContext(fixtureDetection(), catalog);
    cleanup = close;
    await writeDaemonConfig(ctx.paths, { plans: { claude: "pro" } });
    const input = await buildRecommendInput(ctx, repo, "ship it");
    expect(
      input.candidates.some((candidate) => candidate.profile.id === "claude-code:fable:native"),
    ).toBe(false);
  });

  it("falls back to the configured plan once detection has none to report", async () => {
    const catalog = await fixtureCatalog();
    const detection = fixtureDetection();
    const undetected: Detection = {
      ...detection,
      harnesses: detection.harnesses.map((report) => ({
        ...report,
        planVendor: null,
        plan: null,
      })),
    };
    const { ctx, repo, close } = await recommendContext(undetected, catalog);
    cleanup = close;
    await writeDaemonConfig(ctx.paths, { plans: { claude: "pro" } });
    const input = await buildRecommendInput(ctx, repo, "ship it");
    const fable = input.candidates.find(
      (candidate) => candidate.profile.id === "claude-code:fable:native",
    );
    expect(fable?.enable).toBe("upgrade your claude plan: fable is credits on pro");
  });
});
