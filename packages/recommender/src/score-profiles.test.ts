import { type Catalog, emptyCatalog } from "@agnostic/catalog";
import type { OptimizePreset, TaskClass } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { type ScoreInput, scoreProfiles } from "./score-profiles.js";
import { fixtureCatalog, NOW, testPreferences, testProfile } from "./test-catalog.js";

let catalog: Catalog;

beforeAll(async () => {
  catalog = await fixtureCatalog();
});

const debugSmall: TaskClass = {
  intent: "debug",
  scope: "small",
  risk: [],
  needsBrowser: false,
  automaticIntent: null,
};

function input(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    preferences: testPreferences(),
    catalog,
    activeProfileIds: [],
    history: [],
    now: NOW,
    ...over,
  };
}

function preset(optimize: OptimizePreset): ScoreInput {
  return input({ preferences: testPreferences({ optimize }) });
}

// Strong debug evidence, but every token is billed.
const opusByKey = testProfile({ billing: "api-key" });
// Weaker evidence, and nothing on top of what the user already pays for.
const codex = testProfile({ harness: "codex", model: "gpt-5.6-sol" });

describe("scoreProfiles", () => {
  it("ranks the better evidence first when quality is what the repo optimizes for", () => {
    const ranked = scoreProfiles(preset("quality"), debugSmall, [opusByKey, codex]);
    expect(ranked.map((row) => row.profile.id)).toEqual([opusByKey.id, codex.id]);
  });

  it("lets cost flip that same pair when the repo optimizes for cost", () => {
    const ranked = scoreProfiles(preset("cost"), debugSmall, [opusByKey, codex]);
    expect(ranked.map((row) => row.profile.id)).toEqual([codex.id, opusByKey.id]);
    expect(ranked[1]?.costUsd).toBeCloseTo(2.1, 10);
    expect(ranked[0]?.costUsd).toBeNull();
  });

  it("charges a local model time rather than money when the repo optimizes for speed", () => {
    const local = testProfile({
      harness: "opencode",
      model: "moonshotai/kimi-k2.7-code",
      route: "local",
      billing: "local",
    });
    const ranked = scoreProfiles(preset("speed"), debugSmall, [local, codex]);
    expect(ranked.map((row) => row.profile.id)).toEqual([codex.id, local.id]);
    // Under balanced weights the same pair keeps the order the evidence gives it.
    const balanced = scoreProfiles(preset("balanced"), debugSmall, [local, codex]);
    expect(balanced[0]?.profile.id).toBe(codex.id);
  });

  it("breaks a tie with the profile this repo is already running in", () => {
    const claude = testProfile({ model: null });
    const pi = testProfile({ harness: "pi", model: null });
    const tied = scoreProfiles(input(), debugSmall, [claude, pi]);
    expect(tied.map((row) => row.profile.id)).toEqual([claude.id, pi.id]);
    const withTask = scoreProfiles(input({ activeProfileIds: [pi.id] }), debugSmall, [claude, pi]);
    expect(withTask.map((row) => row.profile.id)).toEqual([pi.id, claude.id]);
    expect(withTask[0]?.score).toBeCloseTo(0.1, 10);
  });

  it("prefers what the user is not billed for when two profiles score the same", () => {
    const byKey = testProfile({ harness: "pi", model: null, billing: "api-key" });
    const onPlan = testProfile({ model: null });
    // An empty catalog prices nothing and measures nothing, so only billing separates the two.
    const ranked = scoreProfiles(input({ catalog: emptyCatalog() }), debugSmall, [byKey, onPlan]);
    expect(ranked.map((row) => row.profile.id)).toEqual([onPlan.id, byKey.id]);
    expect(ranked.every((row) => row.score === 0)).toBe(true);
  });
});
