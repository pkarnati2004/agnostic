import { describe, expect, it } from "vitest";
import { installCommand } from "./install-commands.js";

describe("installCommand", () => {
  it("names a global install for every tier-1 harness", () => {
    expect(installCommand("claude-code")).toBe("npm i -g @anthropic-ai/claude-code");
    expect(installCommand("codex")).toBe("npm i -g @openai/codex");
    expect(installCommand("pi")).toBe("npm i -g @earendil-works/pi-coding-agent");
    expect(installCommand("opencode")).toBe("npm i -g opencode-ai");
  });

  it("has nothing to say about a harness agn only launches", () => {
    expect(installCommand("aider")).toBeNull();
  });
});
