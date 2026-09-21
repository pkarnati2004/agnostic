import { formatProfileId, type HarnessId, type Profile, type Route } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { LocalServer } from "./detect-local-servers.js";
import type { RegistryError } from "./error.js";
import { launchSpec, resumeSpec } from "./launch.js";

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

const server: LocalServer = {
  name: "ollama",
  port: 11434,
  baseUrl: "http://127.0.0.1:11434",
  models: ["qwen3:8b"],
};

function codeOf(build: () => unknown): string {
  try {
    build();
  } catch (error) {
    return (error as RegistryError).code;
  }
  throw new Error("expected a RegistryError");
}

describe("launchSpec on the native route", () => {
  it("starts Claude Code with the prompt as an argument", () => {
    expect(
      launchSpec(profile("claude-code", null, "native"), { prompt: "fix it", env: {} }),
    ).toEqual({ command: "claude", args: ["fix it"], env: {}, promptAfterStart: null });
  });

  it("adds each harness's own model flag", () => {
    expect(
      launchSpec(profile("claude-code", "opus", "native"), { prompt: "go", env: {} }).args,
    ).toEqual(["--model", "opus", "go"]);
    expect(
      launchSpec(profile("codex", "gpt-5.6-sol", "native"), { prompt: "go", env: {} }).args,
    ).toEqual(["-m", "gpt-5.6-sol", "go"]);
    expect(launchSpec(profile("pi", "anthropic/claude", "native"), { env: {} }).args).toEqual([
      "--model",
      "anthropic/claude",
    ]);
    expect(
      launchSpec(profile("opencode", "anthropic/claude-sonnet-4-5", "native"), { env: {} }).args,
    ).toEqual(["--model", "anthropic/claude-sonnet-4-5"]);
  });

  it("never leaks the caller's environment onto a route that adds none", () => {
    expect(
      launchSpec(profile("claude-code", "opus", "native"), {
        env: { HOME: "/fixture", ANTHROPIC_API_KEY: "sk-ambient", OPENROUTER_API_KEY: "or" },
      }).env,
    ).toEqual({});
  });

  it("passes a model nobody listed straight through", () => {
    expect(launchSpec(profile("claude-code", "made-up", "native"), { env: {} }).args).toEqual([
      "--model",
      "made-up",
    ]);
  });

  it("delivers the prompt the way each harness takes it", () => {
    expect(launchSpec(profile("opencode", null, "native"), { prompt: "go", env: {} }).args).toEqual(
      ["--prompt", "go"],
    );
    expect(launchSpec(profile("gemini", null, "native"), { prompt: "go", env: {} }).args).toEqual([
      "-i",
      "go",
    ]);
    expect(launchSpec(profile("copilot", null, "native"), { prompt: "go", env: {} }).args).toEqual([
      "-i",
      "go",
    ]);
  });

  it("ends the args with the separator before a prompt that could read as a flag", () => {
    expect(
      launchSpec(profile("grok", null, "native"), { prompt: "--help me", env: {} }).args,
    ).toEqual(["--", "--help me"]);
  });

  it("hands back the prompt to type for a harness with no prompt argument", () => {
    const spec = launchSpec(profile("aider", null, "native"), { prompt: "go", env: {} });
    expect(spec.args).toEqual([]);
    expect(spec.promptAfterStart).toBe("go");
  });

  it("keeps the launch tokens a harness needs before anything else", () => {
    expect(launchSpec(profile("kiro", null, "native"), { prompt: "go", env: {} }).args).toEqual([
      "chat",
      "--tui",
    ]);
  });

  it("runs an executable the table has never heard of", () => {
    expect(launchSpec(profile("other:mytool", null, "native"), { prompt: "go", env: {} })).toEqual({
      command: "mytool",
      args: [],
      env: {},
      promptAfterStart: "go",
    });
  });
});

describe("launchSpec on the other routes", () => {
  it("points Claude Code at the Moonshot gateway with the key from the environment", () => {
    const spec = launchSpec(profile("claude-code", "kimi-k2.6", "anthropic-gateway"), {
      env: { MOONSHOT_API_KEY: "moon-key", OPENROUTER_API_KEY: "other-key" },
    });
    expect(spec.args).toEqual(["--model", "kimi-k2.6"]);
    expect(spec.env).toEqual({
      ANTHROPIC_BASE_URL: "https://api.moonshot.ai/anthropic",
      ANTHROPIC_AUTH_TOKEN: "moon-key",
    });
  });

  it("namespaces the model for OpenRouter and passes only that key", () => {
    const spec = launchSpec(profile("pi", "moonshotai/kimi-k2.6", "openrouter"), {
      env: { OPENROUTER_API_KEY: "or-key", MOONSHOT_API_KEY: "moon-key" },
    });
    expect(spec.args).toEqual(["--model", "openrouter/moonshotai/kimi-k2.6"]);
    expect(spec.env).toEqual({ OPENROUTER_API_KEY: "or-key" });
  });

  it("routes OpenCode over OpenRouter the same way as Pi", () => {
    const spec = launchSpec(profile("opencode", "moonshotai/kimi-k2.6", "openrouter"), {
      env: { OPENROUTER_API_KEY: "or-key" },
    });
    expect(spec.args).toEqual(["--model", "openrouter/moonshotai/kimi-k2.6"]);
    expect(spec.env).toEqual({ OPENROUTER_API_KEY: "or-key" });
  });

  it("writes Codex's local provider overrides in order", () => {
    const spec = launchSpec(profile("codex", "qwen3:8b", "local"), {
      env: {},
      servers: [server],
      prompt: "go",
    });
    expect(spec.args).toEqual([
      "-c",
      "model_provider=agn-local",
      "-c",
      "model_providers.agn-local.name=agn-local",
      "-c",
      "model_providers.agn-local.base_url=http://127.0.0.1:11434/v1",
      "-c",
      "model=qwen3:8b",
      "go",
    ]);
    expect(spec.env).toEqual({});
  });

  it("refuses what it cannot build", () => {
    expect(
      codeOf(() =>
        launchSpec(profile("claude-code", "kimi-k2.6", "anthropic-gateway"), { env: {} }),
      ),
    ).toBe("provider-key-missing");
    expect(
      codeOf(() => launchSpec(profile("codex", "kimi-k2.6", "anthropic-gateway"), { env: {} })),
    ).toBe("route-unsupported");
    expect(
      codeOf(() => launchSpec(profile("codex", "llama4", "local"), { env: {}, servers: [server] })),
    ).toBe("server-not-found");
    expect(codeOf(() => launchSpec(profile("codex", null, "local"), { env: {} }))).toBe(
      "server-not-found",
    );
  });
});

describe("resumeSpec", () => {
  it("uses each harness's own resume argv and carries no prompt", () => {
    expect(resumeSpec(profile("claude-code", null, "native"), "abc-123", {})).toEqual({
      command: "claude",
      args: ["--resume", "abc-123"],
      env: {},
    });
    expect(resumeSpec(profile("codex", null, "native"), " abc-123 ", {})).toEqual({
      command: "codex",
      args: ["resume", "abc-123"],
      env: {},
    });
  });

  it("keeps the route's environment, since the session resumes on the same route", () => {
    expect(
      resumeSpec(profile("claude-code", "kimi-k2.6", "anthropic-gateway"), "abc", {
        MOONSHOT_API_KEY: "moon-key",
      }).env,
    ).toEqual({
      ANTHROPIC_BASE_URL: "https://api.moonshot.ai/anthropic",
      ANTHROPIC_AUTH_TOKEN: "moon-key",
    });
  });

  it("will not resume against a local server it cannot point the harness at", () => {
    expect(codeOf(() => resumeSpec(profile("codex", "qwen3:8b", "local"), "abc", {}))).toBe(
      "resume-unsupported",
    );
  });

  it("says so when a harness cannot resume at all", () => {
    for (const harness of ["cursor-agent", "command-code", "aider", "other:mytool"]) {
      expect(codeOf(() => resumeSpec(profile(harness, null, "native"), "abc", {}))).toBe(
        "resume-unsupported",
      );
    }
  });

  it("builds the resume argv each harness documents", () => {
    const args = (harness: HarnessId, session: string) =>
      resumeSpec(profile(harness, null, "native"), session, {}).args;
    expect(args("claude-code", "abc")).toEqual(["--resume", "abc"]);
    expect(args("codex", "abc")).toEqual(["resume", "abc"]);
    expect(args("kimi", "abc")).toEqual(["--session", "abc"]);
    expect(args("opencode", "abc")).toEqual(["--session", "abc"]);
    // Copilot documents the joined form alone.
    expect(args("copilot", "abc")).toEqual(["--resume=abc"]);
    // Pi resumes by the transcript path its extension reported, which takes the same checks.
    expect(args("pi", "/home/u/.pi/agent/sessions/x/2026_a.jsonl")).toEqual([
      "--session",
      "/home/u/.pi/agent/sessions/x/2026_a.jsonl",
    ]);
  });

  it("refuses a session id a harness would misread", () => {
    const invalid = ["   ", "-last", "a".repeat(513), "abc\u0007def"];
    for (const id of invalid) {
      expect(codeOf(() => resumeSpec(profile("claude-code", null, "native"), id, {}))).toBe(
        "session-id-invalid",
      );
    }
    expect(
      resumeSpec(profile("claude-code", null, "native"), "a".repeat(512), {}).args[1],
    ).toHaveLength(512);
  });
});
