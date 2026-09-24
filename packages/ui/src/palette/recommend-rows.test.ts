import type { Recommendation } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { recommendRows } from "./recommend-rows";

function recommendation(over: Partial<Recommendation> = {}): Recommendation {
  return {
    recommended: {
      profileId: "claude-code:opus:native",
      reason: "strongest on refactors in this repo",
      evidence: "strong",
      sources: ["outcomes"],
    },
    alternative: { profileId: "codex:gpt-5:native", reason: "cheaper, and close behind" },
    worthTrying: null,
    riskNote: null,
    taskClass: {
      intent: "refactor",
      scope: "medium",
      risk: [],
      needsBrowser: false,
      automaticIntent: null,
    },
    ...over,
  };
}

describe("recommendRows", () => {
  it("offers both profiles and a way back", () => {
    const rows = recommendRows("port the parser", recommendation(), {
      runOn: vi.fn(),
      back: vi.fn(),
    });
    expect(rows.map((row) => row.label)).toEqual([
      "Run on claude-code:opus:native",
      "Run on codex:gpt-5:native",
      "Back",
    ]);
    expect(rows[0]?.hint).toBe("strongest on refactors in this repo");
  });

  it("offers one profile when agn had no second pick", () => {
    const rows = recommendRows("port the parser", recommendation({ alternative: null }), {
      runOn: vi.fn(),
      back: vi.fn(),
    });
    expect(rows.map((row) => row.id)).toEqual(["run-on:claude-code:opus:native", "back"]);
  });

  it("runs the prompt as it was typed, on the profile of the row", () => {
    const runOn = vi.fn();
    const back = vi.fn();
    const rows = recommendRows("port the parser", recommendation(), { runOn, back });
    rows[1]?.run();
    rows[2]?.run();
    expect(runOn).toHaveBeenCalledWith({
      prompt: "port the parser",
      profile: "codex:gpt-5:native",
    });
    expect(back).toHaveBeenCalledTimes(1);
  });
});
