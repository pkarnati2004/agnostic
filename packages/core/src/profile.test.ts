import { describe, expect, it } from "vitest";
import { CoreError } from "./error.js";
import {
  formatProfileId,
  type HarnessId,
  HarnessIdSchema,
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
  ["other:mytool", "deepseek-v3", "openai-compatible"],
  ["gemini", null, "native"],
  ["cursor-agent", null, "native"],
  ["opencode", null, "local"],
  ["codex", "qwen3:8b", "local"],
];

describe("HarnessIdSchema", () => {
  it("takes a plain id for a harness agn has a row for, and other: for anything else", () => {
    for (const id of ["gemini", "cursor-agent", "claude-code", "other:mytool", "other:my-tool"]) {
      expect(HarnessIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("refuses an id no harness could have", () => {
    for (const id of ["Gemini", "other:", "", "-gemini", "gemini cli", "2fast"]) {
      expect(HarnessIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

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

  it("keeps a model with colons in it whole, the way Ollama tags are written", () => {
    expect(parseProfileId("codex:qwen3:8b:local")).toEqual({
      harness: "codex",
      model: "qwen3:8b",
      route: "local",
    });
    expect(parseProfileId("other:mytool:qwen3:8b:local")).toEqual({
      harness: "other:mytool",
      model: "qwen3:8b",
      route: "local",
    });
  });

  it("writes a null model as the default segment", () => {
    expect(formatProfileId("opencode", null, "local")).toBe("opencode:default:local");
  });

  it("throws CoreError with a stable code on anything else", () => {
    const invalid = [
      "",
      "nope",
      "claude-code",
      "claude-code:sonnet-4.5",
      "Nope:sonnet-4.5:native",
      "other:default:native",
      "claude-code::native",
    ];
    for (const id of invalid) {
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
