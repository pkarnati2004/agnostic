import { describe, expect, it } from "vitest";
import { type Outcome, OutcomeSchema, outcomeVerdict } from "./outcome.js";

const outcome: Outcome = {
  taskId: "t3n9v2wxyz",
  testsBefore: false,
  testsAfter: true,
  accepted: true,
  reverted: false,
  agentLines: 240,
  humanChangedLines: 12,
  humanEditRatio: 0.05,
  durationSec: 812,
  costUsd: null,
  tokens: 143_000,
  resolvedModel: "claude-sonnet-4.5",
};

describe("OutcomeSchema", () => {
  it("parses a recorded outcome", () => {
    expect(OutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it("accepts all-null diff fields and an unreported model", () => {
    const unknownOutcome: Outcome = {
      ...outcome,
      testsBefore: null,
      testsAfter: null,
      accepted: null,
      reverted: null,
      agentLines: null,
      humanChangedLines: null,
      humanEditRatio: null,
      resolvedModel: null,
    };
    expect(OutcomeSchema.parse(unknownOutcome)).toEqual(unknownOutcome);
  });

  it("requires resolvedModel to be present, as a string or null", () => {
    const { resolvedModel: _resolvedModel, ...withoutResolvedModel } = outcome;
    expect(OutcomeSchema.safeParse(withoutResolvedModel).success).toBe(false);
    expect(OutcomeSchema.safeParse({ ...outcome, resolvedModel: null }).success).toBe(true);
    expect(
      OutcomeSchema.safeParse({ ...outcome, resolvedModel: "claude-sonnet-4.5" }).success,
    ).toBe(true);
  });

  it("rejects the wrong type in every field", () => {
    const wrong: Record<keyof Outcome, unknown> = {
      taskId: "nope",
      testsBefore: "yes",
      testsAfter: "no",
      accepted: 1,
      reverted: 0,
      agentLines: 1.5,
      humanChangedLines: -1,
      humanEditRatio: "half",
      durationSec: null,
      costUsd: "free",
      tokens: null,
      resolvedModel: 4.5,
    };
    for (const [field, value] of Object.entries(wrong)) {
      expect(OutcomeSchema.safeParse({ ...outcome, [field]: value }).success).toBe(false);
    }
  });
});

describe("outcomeVerdict", () => {
  it("reads the row's two flags, and says none when there is no row", () => {
    expect(outcomeVerdict(null)).toBe("none");
    expect(outcomeVerdict(outcome)).toBe("accepted");
    expect(outcomeVerdict({ ...outcome, accepted: false, reverted: true })).toBe("reverted");
    expect(outcomeVerdict({ ...outcome, accepted: false, reverted: false })).toBe("open");
  });

  it("calls a task nobody has decided about open, whichever way the nulls fall", () => {
    expect(outcomeVerdict({ ...outcome, accepted: null, reverted: null })).toBe("open");
  });
});
