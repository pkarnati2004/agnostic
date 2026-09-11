import { describe, expect, it } from "vitest";
import { RegistryError } from "./error.js";
import { parseSeedModels, seedModels } from "./seed-models.js";

const ids = (
  harness: "claude-code" | "codex" | "pi" | "opencode",
  route: "native" | "openrouter" | "anthropic-gateway",
) => seedModels(harness, route).map((seed) => seed.model);

describe("seedModels", () => {
  it("keeps the Claude Code aliases in order", () => {
    expect(ids("claude-code", "native")).toEqual(["fable", "opus", "sonnet", "haiku"]);
  });

  it("lists the Codex models newest first and marks the old one legacy", () => {
    expect(ids("codex", "native")).toEqual([
      "gpt-6-astra",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
    ]);
    expect(
      seedModels("codex", "native")
        .filter((seed) => seed.legacy)
        .map((s) => s.model),
    ).toEqual(["gpt-5.5"]);
  });

  it("has the OpenRouter ids for Pi and OpenCode and the Moonshot ids for Claude Code", () => {
    expect(ids("pi", "openrouter")).toEqual([
      "moonshotai/kimi-k2.7-code",
      "moonshotai/kimi-k2.6",
      "moonshotai/kimi-k2.5",
    ]);
    expect(ids("opencode", "openrouter")).toEqual(ids("pi", "openrouter"));
    expect(ids("claude-code", "anthropic-gateway")).toEqual(["kimi-k2.7-code", "kimi-k2.6"]);
  });

  it("has no rows for a route a harness cannot take", () => {
    expect(ids("pi", "native")).toEqual([]);
    expect(seedModels("other:aider", "native")).toEqual([]);
  });

  it("defaults legacy to false so every row is answerable", () => {
    expect(seedModels("claude-code", "native").every((seed) => seed.legacy === false)).toBe(true);
  });
});

describe("parseSeedModels", () => {
  it("names the row it refused", () => {
    const bad = [
      { harness: "claude-code", model: "opus", route: "native" },
      { harness: "not-a-harness", model: "x", route: "native" },
    ];
    expect(() => parseSeedModels(bad)).toThrowError(/row 1/);
    try {
      parseSeedModels(bad);
    } catch (error) {
      expect((error as RegistryError).code).toBe("seed-invalid");
    }
  });

  it("refuses a row with no model and a file that is not a list", () => {
    expect(() => parseSeedModels([{ harness: "codex", route: "native" }])).toThrowError(
      RegistryError,
    );
    expect(() => parseSeedModels({ rows: [] })).toThrowError(RegistryError);
  });
});
