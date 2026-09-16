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
import { type Ledger, openLedger } from "@agnostic/ledger";
import type { DaemonContext } from "./app.js";
import type { Detection } from "./detection-cache.js";
import type { EventFeed } from "./event-feed.js";
import type { Logger } from "./log.js";
import { createNativeResumeWatch } from "./native-resume-watch.js";
import type { TaskLifecycle } from "./task-lifecycle.js";
import { fixtureCatalogStore } from "./test-detection.js";
import { createWorkspace } from "./test-workspace.js";

interface RecommendContext {
  ctx: DaemonContext;
  repo: Repo;
  ledger: Ledger;
  close: () => Promise<void>;
}

/**
 * `buildRecommendInput` reads a repo's `.ag/` files, the ledger and the daemon's own config; this
 * builds just enough of a `DaemonContext` to exercise that reading without a running app.
 */
export async function recommendContext(
  detection: Detection,
  catalog: Catalog,
): Promise<RecommendContext> {
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
    uiDist: null,
    detection: {
      current: () => Promise.resolve(detection),
      refresh: () => Promise.resolve(detection),
    },
    lifecycle: stubLifecycle(),
    resumeWatch: createNativeResumeWatch({ ledger, log: stubLog() }),
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
    settled: () => Promise.resolve(),
    drain: () => Promise.resolve(),
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
    terminal: () => Promise.reject(new Error("not used by buildRecommendInput")),
    stop: () => Promise.resolve(),
    clean: () => Promise.resolve(),
    detect: () => Promise.resolve([]),
    onEvent: () => () => undefined,
    close: () => Promise.resolve(),
  };
}

export function fixtureTask(over: Partial<Task> & Pick<Task, "repoId">): Task {
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

export const fixtureRecommendation: Recommendation = {
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

export const fixtureOutcome: Outcome = {
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
