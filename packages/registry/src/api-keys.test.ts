import { describe, expect, it } from "vitest";
import { apiKeyVars, nativeApiKey } from "./api-keys.js";

describe("nativeApiKey", () => {
  it("names the key a harness bills by API with", () => {
    expect(nativeApiKey("claude-code")).toBe("ANTHROPIC_API_KEY");
    expect(nativeApiKey("codex")).toBe("OPENAI_API_KEY");
  });

  it("answers null for a harness with no key of its own", () => {
    expect(nativeApiKey("opencode")).toBeNull();
    expect(nativeApiKey("other:ralph")).toBeNull();
  });
});

describe("apiKeyVars", () => {
  const names = () => apiKeyVars().map((row) => row.name);
  const used = (name: string) => apiKeyVars().find((row) => row.name === name)?.usedBy;

  it("lists every native key, then the gateway keys", () => {
    expect(names()).toEqual([
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "XAI_API_KEY",
      "MOONSHOT_API_KEY",
      "OPENROUTER_API_KEY",
    ]);
  });

  it("names each variable once, with every harness that reads it", () => {
    expect(names()).toEqual([...new Set(names())]);
    expect(used("GEMINI_API_KEY")).toEqual(["gemini"]);
    expect(used("OPENROUTER_API_KEY")).toEqual(["pi", "opencode"]);
  });

  it("collects both uses of a key that is a harness's own and a gateway's", () => {
    expect(used("MOONSHOT_API_KEY")).toEqual(["kimi", "claude-code"]);
  });
});
