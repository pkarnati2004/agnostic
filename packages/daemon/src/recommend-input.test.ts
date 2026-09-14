import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Catalog } from "@agnostic/catalog";
import {
  agnosticPaths,
  type ExecutorProvider,
  newId,
  type Outcome,
  type Recommendation,
  type Repo,
  type Task,
} from "@agnostic/core";
import { openLedger } from "@agnostic/ledger";
import { afterEach, describe, expect, it } from "vitest";
import type { DaemonContext } from "./app.js";
import { writeDaemonConfigPlans } from "./daemon-config.js";
import type { Detection } from "./detection-cache.js";
import type { EventFeed } from "./event-feed.js";
import type { Logger } from "./log.js";
import { buildRecommendInput } from "./recommend-input.js";
import type { TaskLifecycle } from "./task-lifecycle.js";
import { fixtureCatalog, fixtureCatalogStore, fixtureDetection } from "./test-detection.js";
import { createWorkspace } from "./test-workspace.js";

/**
 * `buildRecommendInput` reads a repo's `.ag/` files, the ledger and the daemon's own config; this
 * builds just enough of a `DaemonContext` to exercise that reading without a running app.
 */
async function daemon(detection: Detection, catalog: Catalog) {
  const home = await mkdtemp(join(tmpdir(), "agn-recommend-input-"));
  const paths = agnosticPaths(home);
  const ledger = openLedger(paths.db);
  const repoPath = await createWorkspace({});
  const repo: Repo = {
    id: newId(),
    path: repoPath,
    kind: "git",
    name: "petal",
    addedAt: new Date().toISOString(),
  };
  ledger.repos.insert(repo);
  const ctx: DaemonContext = {
    ledger,
    paths,
    token: "test-token",
    log: stubLog(),
    version: "0.0.0-test",
    startedAt: new Date().toISOString(),
    port: () => 0,
    detect: () => Promise.resolve(detection),
    detectEditors: () => Promise.resolve([]),
    catalog: fixtureCatalogStore(catalog),
    catalogSource: {
      manifestUrl: "http://127.0.0.1:1/manifest.json",
      fileUrl: "http://127.0.0.1:1/catalog.json",
    },
    catalogCheck: false,
    executor: stubExecutor(),
    env: { PATH: "/opt/bin" },
    home,
    feed: stubFeed(),
    detection: {
      current: () => Promise.resolve(detection),
      refresh: () => Promise.resolve(detection),
    },
    lifecycle: stubLifecycle(),
    usage: { scan: () => Promise.resolve({ inserted: 0 }) },
    verdicts: { runOnce: () => Promise.resolve(), close: () => undefined },
    catalogChecker: {
      update: () => Promise.reject(new Error("no catalog check in this test")),
      lastCheck: () => null,
      close: () => {},
    },
  };
  return {
    ctx,
    repo,
    ledger,
    close: async () => {
      ledger.close();
      await rm(home, { recursive: true, force: true });
      await rm(repoPath, { recursive: true, force: true });
    },
  };
}

function stubLog(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    close: () => undefined,
  };
}

function stubFeed(): EventFeed {
  return { subscribe: () => () => undefined, close: () => undefined };
}

function stubLifecycle(): TaskLifecycle {
  return {
    onExited: () => undefined,
    stop: (task: Task) => Promise.resolve(task),
    reconcile: (task: Task) => Promise.resolve(task),
    reconcileAll: () => Promise.resolve(),
    failQueued: () => Promise.resolve(),
  };
}

/** Nothing here runs a session; `buildRecommendInput` never touches the executor. */
function stubExecutor(): ExecutorProvider {
  return {
    id: "tmux-local",
    prepare: () => Promise.reject(new Error("not used by buildRecommendInput")),
    launch: () => Promise.reject(new Error("not used by buildRecommendInput")),
    sessionState: () => Promise.resolve("gone" as const),
    attach: () => ({ kind: "tmux", argv: [] }),
    stop: () => Promise.resolve(),
    clean: () => Promise.resolve(),
    detect: () => Promise.resolve([]),
    onEvent: () => () => undefined,
    close: () => Promise.resolve(),
  };
}

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

function task(over: Partial<Task> & Pick<Task, "repoId">): Task {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: "a task",
    prompt: "p",
    profileId: "claude-code:opus:native",
    worktreePath: null,
    branch: null,
    status: "done",
    origin: "agn",
    baseCommit: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

const recommendation: Recommendation = {
  recommended: {
    profileId: "claude-code:opus:native",
    reason: "strong debug evidence for this agent and model",
    evidence: "strong",
    sources: ["swe-bench-verified"],
  },
  alternative: null,
  worthTrying: null,
  riskNote: null,
  taskClass: {
    intent: "debug",
    scope: "small",
    risk: [],
    needsBrowser: false,
    automaticIntent: null,
  },
};

const outcome: Outcome = {
  taskId: "k3m8q2rstu",
  testsBefore: false,
  testsAfter: true,
  accepted: true,
  reverted: false,
  agentLines: 40,
  humanChangedLines: 2,
  humanEditRatio: 0.05,
  durationSec: 600,
  costUsd: null,
  tokens: 120_000,
  resolvedModel: "claude-opus-5",
};

describe("buildRecommendInput", () => {
  it("reads the repo's preferences and profiles, and the fallback intent when none is given", async () => {
    const { ctx, repo, close } = await daemon(fixtureDetection(), await fixtureCatalog());
    cleanup = close;
    const input = await buildRecommendInput(ctx, repo, "fix the flaky auth test");
    expect(input.prompt).toBe("fix the flaky auth test");
    expect(input.preferences.subscriptionsOnly).toBe(false);
    expect(input.profiles).toEqual(fixtureDetection().profiles);
    expect(input.defaultProfileId).toBeNull();
    expect(input.intent).toBeNull();
  });

  it("overrides subscriptions_only and carries --intent for this call only", async () => {
    const { ctx, repo, close } = await daemon(fixtureDetection(), await fixtureCatalog());
    cleanup = close;
    const input = await buildRecommendInput(ctx, repo, "why is the login flow slow", {
      subscriptionsOnly: true,
      intent: "debug",
    });
    expect(input.preferences.subscriptionsOnly).toBe(true);
    expect(input.intent).toBe("debug");
  });

  it("collects the profile ids of tasks live on this repo, and no others", async () => {
    const { ctx, repo, ledger, close } = await daemon(fixtureDetection(), await fixtureCatalog());
    cleanup = close;
    const other: Repo = { ...repo, id: newId(), path: `${repo.path}-other` };
    ledger.repos.insert(other);
    ledger.tasks.insert(
      task({ repoId: repo.id, status: "running", profileId: "claude-code:opus:native" }),
    );
    ledger.tasks.insert(
      task({ repoId: repo.id, status: "waiting", profileId: "codex:default:native" }),
    );
    ledger.tasks.insert(task({ repoId: repo.id, status: "done", profileId: "codex:opus:native" }));
    ledger.tasks.insert(
      task({ repoId: other.id, status: "running", profileId: "pi:default:native" }),
    );

    const input = await buildRecommendInput(ctx, repo, "ship it");
    expect(input.activeProfileIds.sort()).toEqual(
      ["claude-code:opus:native", "codex:default:native"].sort(),
    );
  });

  it("turns a finished task into history only when it has both an outcome and a stored pick", async () => {
    const { ctx, repo, ledger, close } = await daemon(fixtureDetection(), await fixtureCatalog());
    cleanup = close;
    const withBoth = task({ repoId: repo.id, status: "done", recommendation });
    const noOutcome = task({ repoId: repo.id, status: "done", recommendation });
    const noRecommendation = task({ repoId: repo.id, status: "done" });
    const stillRunning = task({ repoId: repo.id, status: "running", recommendation });
    for (const row of [withBoth, noOutcome, noRecommendation, stillRunning]) {
      ledger.tasks.insert(row);
    }
    ledger.outcomes.record({ ...outcome, taskId: withBoth.id });
    ledger.outcomes.record({ ...outcome, taskId: stillRunning.id });

    const input = await buildRecommendInput(ctx, repo, "ship it");
    expect(input.history).toEqual([
      {
        taskClass: recommendation.taskClass,
        profileId: withBoth.profileId,
        outcome: { ...outcome, taskId: withBoth.id },
      },
    ]);
  });

  it("names the install command for a harness detection did not find", async () => {
    const { ctx, repo, close } = await daemon(fixtureDetection(), await fixtureCatalog());
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
    const { ctx, repo, close } = await daemon(fixtureDetection(), catalog);
    cleanup = close;
    await writeDaemonConfigPlans(ctx.paths, { claude: "pro" });
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
    const { ctx, repo, close } = await daemon(undetected, catalog);
    cleanup = close;
    await writeDaemonConfigPlans(ctx.paths, { claude: "pro" });
    const input = await buildRecommendInput(ctx, repo, "ship it");
    const fable = input.candidates.find(
      (candidate) => candidate.profile.id === "claude-code:fable:native",
    );
    expect(fable?.enable).toBe("upgrade your claude plan: fable is credits on pro");
  });
});
