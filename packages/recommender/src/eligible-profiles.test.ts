import { describe, expect, it } from "vitest";
import { eligibleProfiles } from "./eligible-profiles.js";
import { testPreferences, testProfile } from "./test-catalog.js";

const subscription = testProfile({});
const apiKey = testProfile({ harness: "codex", model: "gpt-5.6-sol", billing: "api-key" });
const credits = testProfile({ model: "fable", billing: "credits" });
const local = testProfile({
  harness: "opencode",
  model: "qwen3",
  route: "local",
  billing: "local",
});

describe("eligibleProfiles", () => {
  it("drops what agn cannot run and what it only launches", () => {
    const unavailable = testProfile({ model: "sonnet-4.5", available: false });
    const tierTwo = testProfile({ harness: "aider", model: null, tier: 2 });
    expect(
      eligibleProfiles([unavailable, tierTwo, subscription], testPreferences()).map((p) => p.id),
    ).toEqual([subscription.id]);
  });

  it("keeps only subscriptions when the repo asks for them", () => {
    const prefs = testPreferences({ subscriptionsOnly: true });
    const unknown = testProfile({ harness: "pi", model: null, billing: "unknown" });
    const kept = eligibleProfiles([subscription, apiKey, credits, local, unknown], prefs);
    expect(kept.map((profile) => profile.id)).toEqual([subscription.id]);
  });

  it("drops local profiles when the repo says not to", () => {
    const prefs = testPreferences({ allowLocal: false });
    expect(eligibleProfiles([subscription, local], prefs).map((p) => p.id)).toEqual([
      subscription.id,
    ]);
    expect(eligibleProfiles([subscription, local], testPreferences())).toHaveLength(2);
  });

  it("answers with an empty list rather than a relaxed one", () => {
    expect(eligibleProfiles([apiKey], testPreferences({ subscriptionsOnly: true }))).toEqual([]);
    expect(eligibleProfiles([], testPreferences())).toEqual([]);
  });
});
