import { formatProfileId, type HarnessId, type Profile, type Route } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { RegistryError } from "./error.js";
import { headlessSpec } from "./launch.js";

function profile(harness: HarnessId, model: string | null, route: Route): Profile {
  return {
    id: formatProfileId(harness, model, route),
    harness,
    model,
    route,
    billing: "unknown",
    available: true,
    evidence: "binary",
    tier: harness.startsWith("other:") ? 2 : 1,
  };
}

function codeOf(build: () => unknown): string {
  try {
    build();
  } catch (error) {
    return (error as RegistryError).code;
  }
  throw new Error("expected a RegistryError");
}

describe("headlessSpec", () => {
  it("builds the one read-only form of each tier-1 harness, model flag included", () => {
    expect(
      headlessSpec(profile("claude-code", "haiku", "native"), { prompt: "go", env: {} }),
    ).toEqual({
      command: "claude",
      args: ["-p", "--output-format", "text", "--permission-mode", "plan", "--model", "haiku"],
      env: {},
      input: "go",
    });
    expect(
      headlessSpec(profile("codex", "gpt-5.6-sol", "native"), { prompt: "go", env: {} }).args,
    ).toEqual(["exec", "--skip-git-repo-check", "-s", "read-only", "-m", "gpt-5.6-sol"]);
    expect(
      headlessSpec(profile("pi", "gpt-5-mini", "native"), { prompt: "go", env: {} }).args,
    ).toEqual(["--print", "--no-session", "--mode", "text", "--model", "gpt-5-mini"]);
    expect(
      headlessSpec(profile("opencode", "anthropic/claude", "native"), { prompt: "go", env: {} })
        .args,
    ).toEqual(["run", "--format", "default", "--model", "anthropic/claude"]);
  });

  it("leaves the model flag off a profile that has no model", () => {
    expect(
      headlessSpec(profile("claude-code", null, "native"), { prompt: "go", env: {} }).args,
    ).toEqual(["-p", "--output-format", "text", "--permission-mode", "plan"]);
  });

  it("carries the gateway key and the namespaced model on the openrouter route", () => {
    const spec = headlessSpec(profile("pi", "z-ai/glm-5", "openrouter"), {
      prompt: "go",
      env: { OPENROUTER_API_KEY: "or-key" },
    });
    expect(spec.args).toEqual([
      "--print",
      "--no-session",
      "--mode",
      "text",
      "--model",
      "openrouter/z-ai/glm-5",
    ]);
    expect(spec.env).toEqual({ OPENROUTER_API_KEY: "or-key" });
  });

  it("refuses a local route and any harness with no headless form", () => {
    expect(
      codeOf(() => headlessSpec(profile("codex", "qwen3:8b", "local"), { prompt: "go", env: {} })),
    ).toBe("headless-unsupported");
    expect(
      codeOf(() => headlessSpec(profile("other:aider", null, "native"), { prompt: "go", env: {} })),
    ).toBe("headless-unsupported");
  });

  it("passes the prompt as input and never on the command line", () => {
    const spec = headlessSpec(profile("claude-code", null, "native"), {
      prompt: "line one\nline two",
      env: {},
    });
    expect(spec.input).toBe("line one\nline two");
    expect(spec.args).not.toContain("line one\nline two");
  });
});
