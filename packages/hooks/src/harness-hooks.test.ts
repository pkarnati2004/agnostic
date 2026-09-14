import { describe, expect, it } from "vitest";
import { hookInstaller, hookParser } from "./harness-hooks.js";

describe("the harness hook table", () => {
  it.each(["claude-code", "codex"] as const)("has an installer and a parser for %s", (harness) => {
    expect(hookInstaller(harness)?.harness).toBe(harness);
    expect(hookParser(harness)?.harness).toBe(harness);
  });

  it.each(["pi", "opencode", "other:aider"] as const)("has nothing for %s yet", (harness) => {
    expect(hookInstaller(harness)).toBeNull();
    expect(hookParser(harness)).toBeNull();
  });
});
