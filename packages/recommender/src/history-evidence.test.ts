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

function rows(count: number, over: Partial<Outcome> = {}, profileId = PROFILE): HistoryRow[] {
  return Array.from({ length: count }, () => ({
    taskClass: debugSmall,
    profileId,
    outcome: { ...outcome, ...over },
  }));
}

const PROFILE = "claude-code:opus:native";

describe("historyEvidence", () => {
  it("says nothing until a repo has enough finished tasks to say it with", () => {
    expect(historyEvidence([], debugSmall, PROFILE)).toBeNull();
    expect(historyEvidence(rows(29), debugSmall, PROFILE)).toBeNull();
  });

  it("counts only this profile on this kind of task", () => {
    expect(historyEvidence(rows(40), debugSmall, "codex:gpt-5.6-sol:native")).toBeNull();
    const refactor = { ...debugSmall, intent: "refactor" } as const;
    expect(historyEvidence(rows(40), refactor, PROFILE)).toBeNull();
  });

  it("scores accepted work by how much of it survived review", () => {
    const evidence = historyEvidence(rows(30), debugSmall, PROFILE);
    expect(evidence?.tasks).toBe(30);
    expect(evidence?.kept).toBeCloseTo(0.95, 10);
  });

  it("gives a reverted task no credit, however little was changed", () => {
    const history = [
      ...rows(20),
      ...rows(10, { accepted: false, reverted: true, humanEditRatio: 0 }),
    ];
    const evidence = historyEvidence(history, debugSmall, PROFILE);
    expect(evidence?.tasks).toBe(30);
    expect(evidence?.kept).toBeCloseTo(0.95 * (2 / 3), 10);
  });

  it("keeps nothing when the reviewer rewrote more lines than the agent wrote", () => {
    expect(historyEvidence(rows(30, { humanEditRatio: 1.4 }), debugSmall, PROFILE)).toEqual({
      kept: 0,
      tasks: 30,
    });
  });

  it("needs five verdicts of its own before a profile is judged on them", () => {
    const history = [...rows(26), ...rows(4, {}, "codex:gpt-5.6-sol:native")];
    expect(historyEvidence(history, debugSmall, "codex:gpt-5.6-sol:native")).toBeNull();
    expect(historyEvidence(history, debugSmall, PROFILE)?.tasks).toBe(26);
  });

  it("ignores rows with no verdict, which is what a folder task leaves", () => {
    const history = [
      ...rows(25),
      ...rows(5, { accepted: null, reverted: null, humanEditRatio: null }),
    ];
    expect(historyEvidence(history, debugSmall, PROFILE)?.tasks).toBe(25);
  });
});
