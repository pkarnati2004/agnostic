import { describe, expect, it } from "vitest";
import { HarnessIdSchema, type Profile, ProfileSchema } from "./profile.js";

const profile: Profile = {
  id: "claude-code:sonnet-4.5:native",
  harness: "claude-code",
  model: "sonnet-4.5",
  route: "native",
  billing: "subscription",
  available: true,
  evidence: "hook",
  tier: 1,
};

describe("HarnessIdSchema", () => {
  it("takes a harness id, and refuses anything that is not one or is not a string", () => {
    expect(HarnessIdSchema.safeParse("other:mytool").success).toBe(true);
    expect(HarnessIdSchema.safeParse("Gemini").success).toBe(false);
    expect(HarnessIdSchema.safeParse(7).success).toBe(false);
  });
});

describe("ProfileSchema", () => {
  it("parses a valid profile", () => {
    expect(ProfileSchema.parse(profile)).toEqual(profile);
  });

  it("rejects an id that disagrees with harness, model or route", () => {
    expect(ProfileSchema.safeParse({ ...profile, id: "codex:sonnet-4.5:native" }).success).toBe(
      false,
    );
    expect(ProfileSchema.safeParse({ ...profile, model: "opus-4.1" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...profile, route: "openrouter" }).success).toBe(false);
  });

  it("rejects the wrong type in every field", () => {
    const wrong: Record<keyof Profile, unknown> = {
      id: 7,
      harness: "other:",
      model: 4.5,
      route: "carrier-pigeon",
      billing: "invoice",
      available: "yes",
      evidence: "guess",
      tier: 3,
    };
    for (const [field, value] of Object.entries(wrong)) {
      expect(ProfileSchema.safeParse({ ...profile, [field]: value }).success).toBe(false);
    }
  });
});

describe("the billing and evidence a plan decides", () => {
  it("takes a metered model on a subscription, and an unknown plan as its own evidence", () => {
    const metered: Profile = { ...profile, billing: "credits", evidence: "unknown-plan" };
    expect(ProfileSchema.parse(metered)).toEqual(metered);
  });

  it("still refuses a billing or evidence agn does not define", () => {
    expect(ProfileSchema.safeParse({ ...profile, billing: "free" }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...profile, evidence: "vibes" }).success).toBe(false);
  });
});
