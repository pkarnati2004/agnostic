import { type Catalog, emptyCatalog } from "@agnostic/catalog";
import type { Outcome, TaskClass } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { RecommenderError } from "./error.js";
import type { HistoryRow } from "./history-evidence.js";
import { type Candidate, type RecommendInput, recommend } from "./recommend.js";
import { fixtureCatalog, NOW, testPreferences, testProfile } from "./test-catalog.js";

let catalog: Catalog;

beforeAll(async () => {
  catalog = await fixtureCatalog();
});

const opus = testProfile({});
const codex = testProfile({ harness: "codex", model: "gpt-5.6-sol" });
const fable = testProfile({ model: "fable", billing: "credits" });

const kimiOnPi: Candidate = {
  profile: testProfile({
    harness: "pi",
    model: "moonshotai/kimi-k2.7-code",
    route: "openrouter",
    billing: "api-key",
    available: false,
    evidence: "env",
  }),
  enable: "export OPENROUTER_API_KEY=<your key>",
};

function input(over: Partial<RecommendInput> = {}): RecommendInput {
  return {
    prompt: "fix the flaky auth test in petal",
    preferences: testPreferences(),
    profiles: [opus, codex, fable],
    candidates: [],
    catalog,
    defaultProfileId: null,
    activeProfileIds: [],
    history: [],
    intent: null,
    now: NOW,
    ...over,
  };
}

describe("recommend", () => {
  it("picks the profile with the strongest evidence and says what it was", () => {
    const result = recommend(input());
    expect(result.recommended.profileId).toBe(opus.id);
    expect(result.recommended.evidence).toBe("strong");
    expect(result.recommended.reason).toBe(
      "strong debug evidence for this agent and model; included in your plan",
    );
    expect(result.recommended.sources).toEqual(["swe-bench-verified", "terminal-bench"]);
    expect(result.taskClass).toEqual({
      intent: "debug",
      scope: "small",
      risk: ["auth"],
      needsBrowser: false,
      automaticIntent: null,
    });
  });

  it("offers a second opinion from another agent", () => {
    const result = recommend(input());
    expect(result.alternative?.profileId).toBe(codex.id);
    expect(result.alternative?.reason).toBe(
      "related benchmarks only (general); included in your plan",
    );
  });

  it("has no alternative when only one profile is eligible", () => {
    expect(recommend(input({ profiles: [opus] })).alternative).toBeNull();
  });

  it("advises an independent review for a task that touches a risk area", () => {
    expect(recommend(input()).riskNote).toBe("touches auth; an independent review is advised");
    expect(recommend(input({ prompt: "add a --verbose flag" })).riskNote).toBeNull();
  });

  it("says when no profile meets the evidence the repo asks for", () => {
    const note = recommend(input({ profiles: [fable] })).riskNote;
    expect(note).toBe(
      "touches auth; an independent review is advised; no available profile has strong evidence",
    );
    // The floor emptied the set, so the ranking stands rather than refusing.
    expect(recommend(input({ profiles: [fable] })).recommended.profileId).toBe(fable.id);
  });

  it("suggests enabling a profile that is well ahead of the pick", () => {
    const result = recommend(input({ candidates: [kimiOnPi] }));
    expect(result.worthTrying).toEqual({
      profileId: kimiOnPi.profile.id,
      reason: "scores 11 points higher on debug benchmarks",
      enable: "export OPENROUTER_API_KEY=<your key>",
    });
  });

  it("keeps quiet about a candidate that is not clearly ahead, or that runs locally", () => {
    const behind: Candidate = {
      profile: testProfile({ harness: "codex", model: "gpt-5.6-sol", available: false }),
      enable: "npm i -g @openai/codex",
    };
    expect(recommend(input({ candidates: [behind] })).worthTrying).toBeNull();
    const local: Candidate = {
      profile: testProfile({
        harness: "pi",
        model: "moonshotai/kimi-k2.7-code",
        route: "local",
        billing: "local",
        available: false,
      }),
      enable: "start the model server",
    };
    expect(recommend(input({ candidates: [local] })).worthTrying).toBeNull();
  });

  it("uses the repo's default when the catalog knows nothing, without failing", () => {
    const result = recommend(
      input({ catalog: emptyCatalog(), defaultProfileId: codex.id, candidates: [kimiOnPi] }),
    );
    expect(result.recommended.profileId).toBe(codex.id);
    expect(result.recommended.reason).toBe("no evidence; using your default");
    expect(result.recommended.evidence).toBe("none");
    expect(result.recommended.sources).toEqual([]);
    expect(result.worthTrying).toBeNull();
  });

  it("falls back to the first subscription profile when the repo has no default", () => {
    const byKey = testProfile({ harness: "pi", model: null, billing: "api-key" });
    const result = recommend(input({ catalog: emptyCatalog(), profiles: [byKey, codex, opus] }));
    expect(result.recommended.profileId).toBe(codex.id);
    expect(result.recommended.reason).toBe("no evidence; using your default");
  });

  it("refuses when nothing this machine has is allowed to run the task", () => {
    const prefs = testPreferences({ subscriptionsOnly: true });
    const byKey = testProfile({ harness: "pi", model: null, billing: "api-key" });
    expect(() => recommend(input({ profiles: [byKey], preferences: prefs }))).toThrow(
      RecommenderError,
    );
    try {
      recommend(input({ profiles: [], preferences: prefs }));
      expect.unreachable("an empty machine has nothing to recommend");
    } catch (error) {
      expect((error as RecommenderError).code).toBe("no-eligible-profile");
    }
  });

  it("takes --intent over the classifier, and records what it replaced", () => {
    const result = recommend(input({ prompt: "why is the login flow slow", intent: "debug" }));
    expect(result.taskClass.intent).toBe("debug");
    expect(result.taskClass.automaticIntent).toBe("research");
  });

  it("still scores on the catalog once a repo has thirty outcomes of its own", () => {
    const result = recommend(input({ history: history(30) }));
    expect(result.recommended.profileId).toBe(opus.id);
    expect(result.recommended.evidence).toBe("strong");
  });
});

function history(count: number): HistoryRow[] {
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
  const taskClass: TaskClass = {
    intent: "debug",
    scope: "small",
    risk: ["auth"],
    needsBrowser: false,
    automaticIntent: null,
  };
  return Array.from(
    { length: count },
    (): HistoryRow => ({ taskClass, profileId: codex.id, outcome }),
  );
}
