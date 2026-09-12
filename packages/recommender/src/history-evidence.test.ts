import type { Outcome, TaskClass } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { type HistoryRow, historyEvidence } from "./history-evidence.js";

const debugSmall: TaskClass = {
  intent: "debug",
  scope: "small",
  risk: [],
  needsBrowser: false,
  automaticIntent: null,
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

function rows(count: number): HistoryRow[] {
  return Array.from({ length: count }, () => ({
    taskClass: debugSmall,
    profileId: "claude-code:opus:native",
    outcome,
  }));
}

describe("historyEvidence", () => {
  it("says nothing until a repo has enough finished tasks to say it with", () => {
    expect(historyEvidence([], debugSmall, "claude-code:opus:native")).toBeNull();
    expect(historyEvidence(rows(29), debugSmall, "claude-code:opus:native")).toBeNull();
  });

  it("counts only this profile on this kind of task", () => {
    expect(historyEvidence(rows(40), debugSmall, "codex:gpt-5.6-sol:native")).toBeNull();
    const refactor = { ...debugSmall, intent: "refactor" } as const;
    expect(historyEvidence(rows(40), refactor, "claude-code:opus:native")).toBeNull();
  });

  it("still leaves the pick to the catalog until chunk 15 defines the metrics", () => {
    expect(historyEvidence(rows(30), debugSmall, "claude-code:opus:native")).toBeNull();
  });
});
