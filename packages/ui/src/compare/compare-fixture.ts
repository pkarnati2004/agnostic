import type { CompareResponse, CompareTaskRow, Outcome, UsageSum } from "@agnostic/core";
import { taskRow } from "../changes/changes-fixture";

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
    taskId: "task1",
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

export function compareRow(over: Partial<CompareTaskRow> = {}): CompareTaskRow {
  return {
    ...taskRow({ compareId: "cmp1" }),
    outcome: null,
    usage: NO_USAGE,
    billing: "api-key",
    changes: { files: 3, additions: 42, deletions: 7 },
    ...over,
  };
}

export function compareResponse(over: Partial<CompareResponse> = {}): CompareResponse {
  return {
    compareId: "cmp1",
    repoId: "repo1",
    prompt: "add invite links",
    title: "Add the invite links",
    tasks: [
      compareRow(),
      compareRow({
        id: "task2",
        profileId: "codex:gpt-5-codex:native",
        worktreePath: "/tmp/wt/task2",
        branch: "agn/invite-links-c3d4",
      }),
    ],
    pickedTaskId: null,
    ...over,
  };
}
