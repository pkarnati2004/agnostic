import { describe, expect, it } from "vitest";
import { type Recommendation, RecommendationSchema } from "./recommendation.js";

const recommendation: Recommendation = {
  recommended: {
    profileId: "claude-code:sonnet-4.5:native",
    reason: "best measured score on refactors in this repo",
    evidence: "strong",
    sources: ["local-outcomes", "catalog:swe-bench-2026-05"],
  },
  alternative: { profileId: "codex:gpt-5:native", reason: "close second, cheaper per task" },
  worthTrying: {
    profileId: "opencode:default:local",
    reason: "untested here",
    enable: "start the local model server",
  },
  riskNote: null,
};

describe("RecommendationSchema", () => {
  it("parses the full shape", () => {
    expect(RecommendationSchema.parse(recommendation)).toEqual(recommendation);
  });

  it("accepts null alternative, worthTrying and riskNote", () => {
    const bare = { ...recommendation, alternative: null, worthTrying: null, riskNote: null };
    expect(RecommendationSchema.parse(bare)).toEqual(bare);
  });

  it("rejects wrong types", () => {
    const wrong: unknown[] = [
      { ...recommendation, recommended: { ...recommendation.recommended, evidence: "vibes" } },
      { ...recommendation, recommended: { ...recommendation.recommended, sources: "one" } },
      { ...recommendation, alternative: { profileId: "codex:gpt-5:native" } },
      { ...recommendation, worthTrying: { profileId: "x", reason: "y" } },
      { ...recommendation, riskNote: 7 },
    ];
    for (const value of wrong) {
      expect(RecommendationSchema.safeParse(value).success).toBe(false);
    }
  });
});
