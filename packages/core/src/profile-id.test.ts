import { describe, expect, it } from "vitest";
import { CoreError } from "./error.js";
import {
  formatProfileId,
  type HarnessId,
  isHarnessId,
  parseProfileId,
  type Route,
} from "./profile-id.js";

const roundTrips: Array<[HarnessId, string | null, Route]> = [
  ["claude-code", "sonnet-4.5", "native"],
  ["codex", "gpt-5", "native"],
  ["other:mytool", "deepseek-v3", "openai-compatible"],
  ["gemini", null, "native"],
  ["cursor-agent", null, "native"],
  ["opencode", null, "local"],
  ["codex", "qwen3:8b", "local"],
];

describe("isHarnessId", () => {
  it("takes a plain id for a harness agn has a row for, and other: for anything else", () => {
    for (const id of ["gemini", "cursor-agent", "claude-code", "other:mytool", "other:my-tool"]) {
      expect(isHarnessId(id), id).toBe(true);
    }
  });

  it("refuses an id no harness could have", () => {
    for (const id of ["Gemini", "other:", "", "-gemini", "gemini cli", "2fast"]) {
      expect(isHarnessId(id), id).toBe(false);
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
      "claude-code:sonnet-4.5:carrier-pigeon",
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
