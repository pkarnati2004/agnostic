import type { HarnessId } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { RegistryError } from "./error.js";
import { harnessDefinition, harnesses } from "./harness-list.js";

const TIER_1: HarnessId[] = ["claude-code", "codex", "pi", "opencode"];

describe("the harness table", () => {
  it("holds Orca's list minus its wrapper, tier 1 first, with unique ids", () => {
    expect(harnesses).toHaveLength(35);
    expect(harnesses.slice(0, 4).map((def) => def.id)).toEqual(TIER_1);
    expect(harnesses.filter((def) => def.tier === 1)).toHaveLength(4);
    expect(new Set(harnesses.map((def) => def.id)).size).toBe(harnesses.length);
    expect(harnesses.map((def) => def.id)).not.toContain("other:claude-agent-teams");
  });

  it("throws harness-unknown for an id that is not a harness and not other:<binary>", () => {
    expect(() => harnessDefinition("nope" as HarnessId)).toThrowError(RegistryError);
    try {
      harnessDefinition("nope" as HarnessId);
    } catch (error) {
      expect((error as RegistryError).code).toBe("harness-unknown");
      expect((error as RegistryError).hint).toContain("other:<binary>");
    }
  });

  it("pins the launch tokens of the three harnesses that need them", () => {
    expect(harnessDefinition("other:kiro").launch).toEqual(["chat", "--tui"]);
    expect(harnessDefinition("other:hermes").launch).toEqual(["--tui"]);
    expect(harnessDefinition("other:command-code").launch).toEqual(["--trust"]);
    const withLaunchTokens = harnesses.filter((def) => def.launch.length > 0).map((def) => def.id);
    expect(withLaunchTokens).toEqual(["other:kiro", "other:command-code", "other:hermes"]);
  });

  it("gives every tier-1 harness a headless form and no tier-2 row one", () => {
    expect(harnessDefinition("claude-code").headless).toEqual([
      "-p",
      "--output-format",
      "text",
      "--permission-mode",
      "plan",
    ]);
    expect(harnessDefinition("codex").headless).toEqual([
      "exec",
      "--skip-git-repo-check",
      "-s",
      "read-only",
    ]);
    expect(harnessDefinition("pi").headless).toEqual(["--print", "--no-session", "--mode", "text"]);
    expect(harnessDefinition("opencode").headless).toEqual(["run", "--format", "default"]);
    expect(harnesses.filter((def) => def.headless !== null).map((def) => def.id)).toEqual(TIER_1);
    expect(harnessDefinition("other:anything").headless).toBeNull();
  });

  it("pins every binary that differs from the harness id", () => {
    expect(harnessDefinition("claude-code").binary).toBe("claude");
    expect(harnessDefinition("other:kiro").binary).toBe("kiro-cli");
    expect(harnessDefinition("other:aug").binary).toBe("auggie");
    expect(harnessDefinition("other:continue").binary).toBe("cn");
    expect(harnessDefinition("other:qwen-code").binary).toBe("qwen");
    expect(harnessDefinition("other:mistral-vibe").binary).toBe("vibe");
    expect(harnessDefinition("other:cursor").binary).toBe("cursor-agent");
    expect(harnessDefinition("other:antigravity").binary).toBe("agy");
    expect(harnessDefinition("other:trae").binary).toBe("traecli");
    expect(harnessDefinition("other:mimo-code").binary).toBe("mimo");
    expect(harnessDefinition("other:command-code").binary).toBe("command-code");
  });

  it("keeps the aliases that are the only name on PATH for some installs", () => {
    expect(harnessDefinition("other:kimi").aliases).toEqual(["kimi-code"]);
    expect(harnessDefinition("other:kimi").processNames).toContain("kimi-code");
    expect(harnessDefinition("other:mistral-vibe").aliases).toEqual(["mistral-vibe"]);
  });

  it("carries the packaged-binary process prefixes", () => {
    expect(harnessDefinition("codex").processNames).toEqual(["codex", "codex-"]);
    expect(harnessDefinition("other:grok").processNames).toEqual(["grok", "grok-"]);
  });

  it("pins prompt delivery, including the separator for prompts that look like flags", () => {
    expect(harnessDefinition("claude-code").prompt).toEqual({ kind: "argv" });
    expect(harnessDefinition("codex").prompt).toEqual({ kind: "argv" });
    expect(harnessDefinition("pi").prompt).toEqual({ kind: "argv" });
    expect(harnessDefinition("opencode").prompt).toEqual({ kind: "flag", flag: "--prompt" });
    expect(harnessDefinition("other:gemini").prompt).toEqual({ kind: "flag", flag: "-i" });
    expect(harnessDefinition("other:copilot").prompt).toEqual({ kind: "flag", flag: "-i" });
    expect(harnessDefinition("other:aider").prompt).toEqual({ kind: "type-after-start" });
    for (const id of ["other:grok", "other:trae", "other:prime-agent"] as HarnessId[]) {
      expect(harnessDefinition(id).prompt).toEqual({ kind: "argv", separator: "--" });
    }
  });

  it("names the hook payload key each tier-1 harness reports its session under", () => {
    expect(harnessDefinition("claude-code").sessionCapture).toEqual({
      source: "hook",
      key: "session_id",
    });
    expect(harnessDefinition("codex").sessionCapture).toEqual({
      source: "hook",
      key: "session_id",
    });
    expect(harnessDefinition("pi").sessionCapture).toEqual({ source: "hook", key: "session_id" });
    expect(harnessDefinition("opencode").sessionCapture).toEqual({
      source: "hook",
      key: "sessionID",
    });
  });

  it("gives every tier-1 harness a probe and nobody else one", () => {
    expect(harnessDefinition("claude-code").modelSource?.args).toEqual([
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
    ]);
    expect(harnessDefinition("codex").modelSource?.args).toEqual(["debug", "models"]);
    expect(harnessDefinition("pi").modelSource?.args).toEqual(["--list-models"]);
    expect(harnessDefinition("opencode").modelSource?.args).toEqual(["models"]);
    expect(harnessDefinition("claude-code").modelSource?.stdin).toContain("list_models");
    for (const id of ["codex", "pi", "opencode"] as HarnessId[]) {
      expect(harnessDefinition(id).modelSource?.stdin).toBeNull();
    }
  });

  it("leaves tier 2 with launch and attach only", () => {
    for (const def of harnesses.filter((row) => row.tier === 2)) {
      expect(def.modelSource).toBeNull();
      expect(def.modelFlag).toBeNull();
      expect(def.resume).toBeNull();
      expect(def.hooks).toBeNull();
      expect(def.sessionCapture).toBeNull();
      expect(def.authFile).toBeNull();
      expect(def.routes).toEqual(["native"]);
    }
  });

  it("gives every harness that can be resumed a transcript directory to check it against", () => {
    // The daemon looks for the session file `--resume` reads before it hands an id back, so a
    // harness that kept its sessions anywhere else would lose native resume without saying so.
    for (const def of harnesses.filter((row) => row.resume !== null)) {
      expect(def.transcriptsDir).not.toBeNull();
    }
  });

  it("always offers the native route first", () => {
    for (const def of harnesses) {
      expect(def.routes[0]).toBe("native");
    }
  });
});

describe("an open harness id", () => {
  it("synthesises a launch-and-attach row for any executable", () => {
    expect(harnessDefinition("other:mytool")).toEqual({
      id: "other:mytool",
      name: "mytool",
      binary: "mytool",
      aliases: [],
      processNames: ["mytool"],
      launch: [],
      headless: null,
      prompt: { kind: "type-after-start" },
      modelFlag: null,
      modelSource: null,
      planSource: null,
      routes: ["native"],
      resume: null,
      sessionCapture: null,
      hooks: null,
      authFile: null,
      transcriptsDir: null,
      tier: 2,
    });
  });

  it("never shadows a harness the table knows about", () => {
    expect(harnessDefinition("other:kiro").launch).toEqual(["chat", "--tui"]);
    expect(harnessDefinition("other:aider").name).toBe("Aider");
    expect(harnesses.map((def) => def.id)).not.toContain("other:mytool");
  });

  it("rejects an id whose binary segment is empty, a path, or shell-splittable", () => {
    for (const id of ["other:", "other:bin/tool", "other:my tool"] as HarnessId[]) {
      expect(() => harnessDefinition(id)).toThrowError(RegistryError);
      try {
        harnessDefinition(id);
      } catch (error) {
        expect((error as RegistryError).code).toBe("harness-unknown");
      }
    }
  });
});
