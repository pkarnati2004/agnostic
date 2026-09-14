import type { Recommendation } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { recommendationLines } from "./recommendation-lines";

// The example in docs/recommendations.md, which is what `agn recommend` prints for that prompt.
const FULL: Recommendation = {
  recommended: {
    profileId: "claude-code:opus:native",
    reason: "strong debug evidence for this agent and model; included in your plan",
    evidence: "strong",
    sources: ["swe-bench-verified", "terminal-bench"],
  },
  alternative: {
    profileId: "codex:gpt-5.6-sol:native",
    reason: "related benchmarks only (general); included in your plan",
  },
  worthTrying: {
    profileId: "pi:moonshotai/kimi-k2.7-code:openrouter",
    reason: "scores 11 points higher on debug benchmarks",
    enable: "export OPENROUTER_API_KEY=<your key>",
  },
  riskNote: "touches auth; an independent review is advised",
  taskClass: {
    intent: "debug",
    scope: "small",
    risk: ["auth"],
    needsBrowser: false,
    automaticIntent: null,
  },
};

describe("recommendationLines", () => {
  it("says what the command says", () => {
    expect(recommendationLines(FULL)).toEqual([
      { label: "Task", text: "debug, small, risk: auth" },
      {
        label: "Recommended",
        text: "claude-code:opus:native - strong debug evidence for this agent and model; included in your plan · evidence: strong · sources: swe-bench-verified, terminal-bench",
      },
      {
        label: "Alternative",
        text: "codex:gpt-5.6-sol:native - related benchmarks only (general); included in your plan",
      },
      {
        label: "Worth trying",
        text: "pi:moonshotai/kimi-k2.7-code:openrouter - scores 11 points higher on debug benchmarks · enable: export OPENROUTER_API_KEY=<your key>",
      },
      { label: "Risk", text: "touches auth; an independent review is advised" },
    ]);
  });

  it("leaves out what there is nothing to say about", () => {
    const lines = recommendationLines({
      ...FULL,
      alternative: null,
      worthTrying: null,
      riskNote: null,
    });
    expect(lines).toHaveLength(3);
    expect(lines[2]).toEqual({ label: "Alternative", text: "none" });
  });

  it("marks an intent the user chose and the one the prompt reads as", () => {
    const lines = recommendationLines({
      ...FULL,
      taskClass: { ...FULL.taskClass, intent: "refactor", automaticIntent: "debug" },
    });
    expect(lines[0]?.text).toBe("refactor (chosen; the prompt reads as debug), small, risk: auth");
  });

  it("spells out a model-level level, and a scope with no risk or browser", () => {
    const lines = recommendationLines({
      ...FULL,
      recommended: { ...FULL.recommended, evidence: "model-level", sources: [] },
      taskClass: { ...FULL.taskClass, risk: [], needsBrowser: true },
    });
    expect(lines[0]?.text).toBe("debug, small, needs a browser");
    expect(lines[1]?.text).toContain("· evidence: model-level only");
    expect(lines[1]?.text).not.toContain("sources");
  });
});
