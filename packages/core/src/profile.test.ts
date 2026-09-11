import { describe, expect, it } from "vitest";
import { CoreError } from "./error.js";
import {
  formatProfileId,
  type HarnessId,
  type Profile,
  ProfileSchema,
  parseProfileId,
  type Route,
} from "./profile.js";

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

const roundTrips: Array<[HarnessId, string | null, Route]> = [
  ["claude-code", "sonnet-4.5", "native"],
  ["codex", "gpt-5", "native"],
  ["other:aider", "deepseek-v3", "openai-compatible"],
  ["opencode", null, "local"],
];

describe("formatProfileId and parseProfileId", () => {
  it("round-trips every harness shape, including a null model", () => {
    for (const [harness, model, route] of roundTrips) {
      const id = formatProfileId(harness, model, route);
      expect(parseProfileId(id)).toEqual({ harness, model, route });
    }
  });

  it("round-trips the exact ids used elsewhere in the docs", () => {
    expect(formatProfileId("claude-code", "fable", "native")).toBe("claude-code:fable:native");
    expect(parseProfileId("claude-code:fable:native")).toEqual({
      harness: "claude-code",
      model: "fable",
      route: "native",
    });

    expect(formatProfileId("claude-code", "kimi-k2.6", "anthropic-gateway")).toBe(
      "claude-code:kimi-k2.6:anthropic-gateway",
    );
    expect(parseProfileId("claude-code:kimi-k2.6:anthropic-gateway")).toEqual({
      harness: "claude-code",
      model: "kimi-k2.6",
      route: "anthropic-gateway",
    });
  });

  it("writes a null model as the default segment", () => {
    expect(formatProfileId("opencode", null, "local")).toBe("opencode:default:local");
  });

  it("throws CoreError with a stable code on anything else", () => {
    for (const id of ["", "claude-code", "claude-code:sonnet-4.5", "nope:sonnet-4.5:native"]) {
      expect(() => parseProfileId(id)).toThrowError(CoreError);
      try {
        parseProfileId(id);
      } catch (error) {
        expect((error as CoreError).code).toBe("invalid-profile-id");
        expect((error as CoreError).hint).toBeDefined();
      }
    }
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
