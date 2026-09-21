// @vitest-environment happy-dom
import type { Recommendation } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { RecommendationCard } from "./recommendation-card";
import type { RecommendationState } from "./use-recommendation";

const RECOMMENDATION: Recommendation = {
  recommended: {
    profileId: "claude-code:opus:native",
    reason: "strong debug evidence for this agent and model; included in your plan",
    evidence: "strong",
    sources: ["swe-bench-verified"],
  },
  alternative: { profileId: "codex:gpt-5.6-sol:native", reason: "related benchmarks only" },
  worthTrying: {
    profileId: "pi:kimi:openrouter",
    reason: "scores 11 points higher",
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

function card(state: RecommendationState) {
  return render(<RecommendationCard state={state} />);
}

describe("RecommendationCard", () => {
  it("renders one row per line", () => {
    const { container, unmount } = card({
      status: "ready",
      recommendation: RECOMMENDATION,
      error: null,
    });
    expect(container.querySelectorAll("dt")).toHaveLength(5);
    expect(container.textContent).toContain("claude-code:opus:native");
    expect(container.textContent).toContain("evidence: strong");
    unmount();
  });

  it("leaves out the lines a pick has nothing to say about", () => {
    const { container, unmount } = card({
      status: "ready",
      recommendation: { ...RECOMMENDATION, worthTrying: null, riskNote: null },
      error: null,
    });
    expect(container.querySelectorAll("dt")).toHaveLength(3);
    unmount();
  });

  it("shows the daemon's own words when it refuses", () => {
    const error = new ApiError("no profile is eligible", {
      code: "no-eligible-profile",
      hint: "Run `agn doctor`.",
      status: 409,
    });
    const { container, unmount } = card({ status: "error", recommendation: null, error });
    expect(container.textContent).toContain("no profile is eligible");
    expect(container.textContent).toContain("Run agn doctor.");
    unmount();
  });

  it("asks for a prompt before there is anything to pick for", () => {
    const { container, unmount } = card({ status: "idle", recommendation: null, error: null });
    expect(container.textContent).toContain("Type a prompt to see agn's pick.");
    unmount();
  });

  it("keeps the card it has while the next pick is on its way", () => {
    const { container, unmount } = card({
      status: "pending",
      recommendation: RECOMMENDATION,
      error: null,
    });
    expect(container.querySelectorAll("dt")).toHaveLength(5);
    unmount();
  });

  it("says it is thinking when there is no card yet", () => {
    const { container, unmount } = card({ status: "pending", recommendation: null, error: null });
    expect(container.textContent).toContain("Thinking…");
    unmount();
  });
});
