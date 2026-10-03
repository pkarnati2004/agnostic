// @vitest-environment happy-dom
import type { Profile, Recommendation } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { PROFILE } from "../test/workspace-fixture";
import { RecommendationCard } from "./recommendation-card";
import type { RecommendationState } from "./use-recommendation";

const CODEX: Profile = {
  ...PROFILE,
  id: "codex:gpt-5.6-sol:native",
  harness: "codex",
  model: "gpt-5.6-sol",
  billing: "credits",
};

const RECOMMENDATION: Recommendation = {
  recommended: {
    profileId: PROFILE.id,
    reason: "strong debug evidence for this agent and model",
    evidence: "strong",
    sources: ["SWE-bench Verified", "your history · 14"],
  },
  alternative: { profileId: CODEX.id, reason: "related benchmarks only" },
  worthTrying: {
    profileId: "gemini:gemini-3-pro:native",
    reason: "scores 11 points higher",
    enable: "GEMINI_API_KEY",
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

function card(state: RecommendationState, compact = false) {
  return render(<RecommendationCard state={state} profiles={[PROFILE, CODEX]} compact={compact} />);
}

function ready(recommendation: Recommendation): RecommendationState {
  return { status: "ready", recommendation, error: null };
}

function section(container: HTMLElement): HTMLElement {
  const found = container.querySelector("section");
  if (found === null) {
    throw new Error("the card drew no section");
  }
  return found;
}

describe("RecommendationCard", () => {
  it("records the evidence level on the card itself, at every level", () => {
    for (const evidence of ["strong", "some", "model-level", "none"] as const) {
      const { container, unmount } = card(
        ready({ ...RECOMMENDATION, recommended: { ...RECOMMENDATION.recommended, evidence } }),
      );
      expect(section(container).dataset.evidence).toBe(evidence);
      unmount();
    }
  });

  it("names the pick, what it costs, why, and what the reason was read from", () => {
    const { container, unmount } = card(ready(RECOMMENDATION));

    expect(container.textContent).toContain("Recommended");
    expect(container.textContent).toContain("claude-code · opus");
    expect(container.textContent).toContain("included in plan");
    expect(container.textContent).toContain("strong debug evidence");
    expect(container.textContent).toContain("Evidence: strong");
    expect(container.textContent).toContain("SWE-bench Verified");
    unmount();
  });

  it("names the alternative with its billing, and the enabling step for what is worth trying", () => {
    const { container, unmount } = card(ready(RECOMMENDATION));

    expect(container.textContent).toContain("Alternative");
    expect(container.textContent).toContain("codex · gpt-5.6-sol");
    expect(container.textContent).toContain("credits");
    expect(container.textContent).toContain("Worth trying");
    expect(container.textContent).toContain("GEMINI_API_KEY");
    unmount();
  });

  it("says so plainly with no evidence, and drops the comparison it cannot make", () => {
    const { container, unmount } = card(
      ready({
        ...RECOMMENDATION,
        recommended: { ...RECOMMENDATION.recommended, evidence: "none", sources: [] },
      }),
    );

    expect(container.textContent).toContain("Your default");
    expect(container.textContent).toContain("No evidence; using your default.");
    expect(container.textContent).not.toContain("Alternative");
    expect(container.textContent).not.toContain("Worth trying");
    expect(container.textContent).not.toContain("strong debug evidence");
    unmount();
  });

  it("draws the risk note as its own line, named as a risk", () => {
    const { container, unmount } = card(ready(RECOMMENDATION));
    expect(container.textContent).toContain("Risk: touches auth");
    unmount();
  });

  it("colours the risk box for the warning tone, never the destructive one", () => {
    const { container, unmount } = card(ready(RECOMMENDATION));
    const box = Array.from(container.querySelectorAll("div")).find((div) =>
      div.textContent?.startsWith("Risk:"),
    );
    const mark = box?.querySelector("svg");

    // happy-dom drops the box's own `color-mix(...)` style as unparsed, so the icon's plain
    // `var(--warning)` is what is left to check the tone by; either way, "destructive" is absent.
    expect(mark?.getAttribute("style")).toContain("--warning");
    expect(box?.innerHTML ?? "").not.toContain("destructive");
    unmount();
  });

  it("says the alternative is none rather than leaving the row empty", () => {
    const { container, unmount } = card(ready({ ...RECOMMENDATION, alternative: null }));
    expect(container.textContent).toContain("Alternativenone");
    unmount();
  });

  it("drops the sources where there is no room for them", () => {
    const { container, unmount } = card(ready(RECOMMENDATION), true);

    expect(container.textContent).not.toContain("SWE-bench Verified");
    expect(container.textContent).toContain("Evidence: strong");
    unmount();
  });

  it("shows the daemon's own words when it refuses, with the command as code", () => {
    const error = new ApiError("no profile is eligible", {
      code: "no-eligible-profile",
      hint: "Run `agn doctor`.",
      status: 409,
    });
    const { container, unmount } = card({ status: "error", recommendation: null, error });

    expect(container.textContent).toContain("no profile is eligible");
    expect(container.querySelector("code")?.textContent).toBe("agn doctor");
    unmount();
  });

  it("asks for a prompt before there is anything to pick for", () => {
    const { container, unmount } = card({ status: "idle", recommendation: null, error: null });
    expect(container.textContent).toContain("Type a prompt to see agn's pick.");
    unmount();
  });

  it("keeps the card it has while the next pick is on its way, and says it is busy", () => {
    const { container, unmount } = card({
      status: "pending",
      recommendation: RECOMMENDATION,
      error: null,
    });

    expect(section(container).getAttribute("aria-busy")).toBe("true");
    expect(container.textContent).toContain("claude-code · opus");
    unmount();
  });
});
