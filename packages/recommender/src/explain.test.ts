import type { TaskClass } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { EvidenceSummary } from "./catalog-evidence.js";
import { explain } from "./explain.js";
import type { Scored } from "./score-profiles.js";
import { testProfile } from "./test-catalog.js";

const debugSmall: TaskClass = {
  intent: "debug",
  scope: "small",
  risk: [],
  needsBrowser: false,
  automaticIntent: null,
};

function scored(over: Partial<Scored> & Pick<Scored, "evidence">): Scored {
  return { profile: testProfile({}), own: null, costUsd: null, score: 0.5, ...over };
}

const strong: EvidenceSummary = {
  level: "strong",
  score: 0.9,
  sources: ["swe-bench-verified"],
  classes: ["debug"],
};

describe("explain", () => {
  it("names the class the evidence is for and what the run costs", () => {
    expect(explain(scored({ evidence: strong }), debugSmall)).toBe(
      "strong debug evidence for this agent and model; included in your plan",
    );
  });

  it("names the repo's own record when there is enough of it to have counted", () => {
    expect(explain(scored({ evidence: strong, own: { kept: 0.84, tasks: 31 } }), debugSmall)).toBe(
      "strong debug evidence for this agent and model; your own results here: 31 tasks, 84% kept; included in your plan",
    );
  });

  it("lists the classes behind related evidence", () => {
    const evidence: EvidenceSummary = {
      level: "some",
      score: 0.6,
      sources: [],
      classes: ["general", "refactor"],
    };
    expect(explain(scored({ evidence }), debugSmall)).toBe(
      "related benchmarks only (general, refactor); included in your plan",
    );
  });

  it("says when only the model was measured, and prices the API key", () => {
    const evidence: EvidenceSummary = {
      level: "model-level",
      score: 0.4,
      sources: [],
      classes: ["debug"],
    };
    const byKey = scored({
      evidence,
      profile: testProfile({ billing: "api-key" }),
      costUsd: 2.1,
    });
    expect(explain(byKey, debugSmall)).toBe("model-level evidence only; about $2.10 by API key");
  });

  it("prices credits as metered and says nothing about a local model's bill", () => {
    const evidence: EvidenceSummary = {
      level: "model-level",
      score: 0.4,
      sources: [],
      classes: ["debug"],
    };
    const credits = scored({
      evidence,
      profile: testProfile({ billing: "credits" }),
      costUsd: 0.63,
    });
    expect(explain(credits, debugSmall)).toBe(
      "model-level evidence only; metered credits, about $0.63",
    );
    const local = scored({
      evidence,
      profile: testProfile({ harness: "opencode", route: "local", billing: "local" }),
    });
    expect(explain(local, debugSmall)).toBe("model-level evidence only; free, local");
    const unknown = scored({ evidence, profile: testProfile({ billing: "unknown" }) });
    expect(explain(unknown, debugSmall)).toBe("model-level evidence only; billing unknown");
  });

  it("says plainly that there was nothing to go on", () => {
    const evidence: EvidenceSummary = { level: "none", score: 0, sources: [], classes: [] };
    expect(explain(scored({ evidence }), debugSmall)).toBe("no evidence; using your default");
  });

  it("does not claim an intent it did not recognise", () => {
    const general = { ...debugSmall, intent: "general" } as const;
    expect(explain(scored({ evidence: { ...strong, classes: ["general"] } }), general)).toBe(
      "no intent recognised; strong evidence for this agent and model; included in your plan",
    );
  });
});
