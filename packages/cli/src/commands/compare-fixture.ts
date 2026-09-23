// The stubbed daemon and the rows the two `agn compare` test files share.
import type {
  CompareResponse,
  CompareTaskRow,
  Outcome,
  PickCompareRequest,
  Recommendation,
  RecommendRequest,
  StartCompareRequest,
  Task,
  UsageSum,
} from "@agnostic/core";
import { createTestContext } from "../test-context.js";
import { compareCommand } from "./compare.js";

export const NOW = Date.parse("2026-09-22T12:00:00.000Z");

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    repoId: "r1",
    title: "Add the retry budget",
    prompt: "add the retry budget",
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: "/wt/t1",
    branch: "agn/retry-budget-a1b2",
    status: "running",
    origin: "agn",
    baseCommit: "c0ffee1",
    compareId: "cmp1",
    createdAt: "2026-09-22T11:56:00.000Z",
    updatedAt: "2026-09-22T11:56:00.000Z",
    ...over,
  };
}

export const NO_USAGE: UsageSum = {
  tokens: 0,
  tokensInput: null,
  tokensOutput: null,
  tokensCacheRead: null,
  tokensCacheWrite: null,
  costUsd: null,
};

export function outcome(over: Partial<Outcome> = {}): Outcome {
  return {
    taskId: "t1",
    testsBefore: true,
    testsAfter: true,
    accepted: null,
    reverted: null,
    agentLines: 120,
    humanChangedLines: null,
    humanEditRatio: null,
    durationSec: 243,
    costUsd: null,
    tokens: 4000,
    resolvedModel: "claude-sonnet-4.5",
    ...over,
  };
}

export function row(over: Partial<CompareTaskRow> = {}): CompareTaskRow {
  return {
    ...task(),
    worktreePresent: true,
    outcome: null,
    usage: NO_USAGE,
    billing: "api-key",
    changes: { files: 3, additions: 42, deletions: 7 },
    ...over,
  };
}

export const RECOMMENDATION: Recommendation = {
  recommended: {
    profileId: "claude-code:sonnet-4.5:native",
    reason: "best on debug",
    evidence: "strong",
    sources: ["terminal-bench"],
  },
  alternative: { profileId: "codex:gpt-5-codex:native", reason: "close second" },
  worthTrying: null,
  riskNote: null,
  taskClass: {
    intent: "debug",
    scope: "small",
    risk: [],
    needsBrowser: false,
    automaticIntent: "debug",
  },
};

type Calls = {
  started: { repoId: string; body: StartCompareRequest }[];
  recommended: RecommendRequest[];
  picked: { id: string; body: PickCompareRequest }[];
};

export function cli(
  over: {
    tasks?: Task[];
    compare?: Partial<CompareResponse>;
    recommendation?: Recommendation;
  } = {},
) {
  const calls: Calls = { started: [], recommended: [], picked: [] };
  const tasks = over.tasks ?? [task(), task({ id: "t2", profileId: "codex:gpt-5-codex:native" })];
  const test = createTestContext({
    client: {
      listRepos: () =>
        Promise.resolve({
          repos: [
            {
              id: "r1",
              path: "/work",
              kind: "git" as const,
              name: "petal",
              addedAt: "2026-09-01T00:00:00.000Z",
              status: "active" as const,
              testCommand: null,
              pathPresent: true,
            },
          ],
          cursor: 0,
        }),
      recommend: (body) => {
        calls.recommended.push(body);
        return Promise.resolve({ recommendation: over.recommendation ?? RECOMMENDATION });
      },
      startCompare: (repoId, body) => {
        calls.started.push({ repoId, body });
        return Promise.resolve({ compareId: "cmp1", tasks });
      },
      getCompare: () =>
        Promise.resolve({
          compareId: "cmp1",
          repoId: "r1",
          prompt: "add the retry budget",
          title: "Add the retry budget",
          tasks: [row()],
          pickedTaskId: null,
          ...over.compare,
        }),
      pickCompare: (id, body) => {
        calls.picked.push({ id, body });
        return Promise.resolve({
          compareId: "cmp1",
          kept: task(),
          cleaned: [task({ id: "t2", profileId: "codex:gpt-5-codex:native", status: "stopped" })],
        });
      },
    },
  });
  return { ...test, calls };
}

/** The command under test alone, so `agn compare` parses exactly as the program registers it. */
export function run(test: ReturnType<typeof cli>, argv: string[]): Promise<unknown> {
  const command = compareCommand(test.ctx)
    .exitOverride()
    .configureOutput({ writeOut: () => undefined, writeErr: () => undefined });
  for (const child of command.commands) {
    child.copyInheritedSettings(command);
  }
  return command.parseAsync(["node", "compare", ...argv]);
}
