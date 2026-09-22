import { type HarnessId, HarnessIdSchema, type Support } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { harnessDefinition, harnesses } from "./harness-list.js";
import { harnessSupport } from "./harness-support.js";

const FULL: HarnessId[] = ["claude-code", "codex", "pi", "opencode"];

/** The label doctor prints for each tier-1 row, from ADR 035's table. */
const SUPPORT: [HarnessId, Support][] = [
  ["claude-code", "full"],
  ["codex", "full"],
  ["pi", "full"],
  ["opencode", "full"],
  ["gemini", "status"],
  ["droid", "status"],
  ["cursor-agent", "status"],
  ["kimi", "status"],
  ["devin", "status"],
  ["openclaude", "status"],
  ["command-code", "status"],
  ["omp", "full"],
  ["mimo-code", "status"],
  ["grok", "status"],
  ["copilot", "status"],
];

describe("the harness table", () => {
  it("gives every row a plain id, unique, with no other: prefix left", () => {
    expect(harnesses).toHaveLength(38);
    for (const def of harnesses) {
      expect(def.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
    expect(new Set(harnesses.map((def) => def.id)).size).toBe(harnesses.length);
    expect(harnesses.map((def) => def.id)).not.toContain("claude-agent-teams");
  });

  it("has an id every registry row parses under HarnessIdSchema, plain or under other:", () => {
    for (const def of harnesses) {
      expect(HarnessIdSchema.safeParse(def.id).success).toBe(true);
      expect(HarnessIdSchema.safeParse(`other:${def.id}`).success).toBe(true);
    }
  });

  it("puts the four harnesses agn reads transcripts for first, and hooks every tier-1 row", () => {
    expect(harnesses.slice(0, 4).map((def) => def.id)).toEqual(FULL);
    const tier1 = harnesses.filter((def) => def.tier === 1);
    expect(tier1).toHaveLength(15);
    for (const def of tier1) {
      expect(def.hooks).not.toBeNull();
    }
  });

  it("labels each tier-1 harness with the support ADR 035 gives it", () => {
    for (const [id, support] of SUPPORT) {
      expect([id, harnessSupport(harnessDefinition(id))]).toEqual([id, support]);
    }
    expect(harnessSupport(harnessDefinition("aider"))).toBe("basic");
    expect(harnessSupport(harnessDefinition("other:mytool"))).toBe("basic");
  });

  it("names the file or directory each hook family reads", () => {
    expect(harnessDefinition("claude-code").hooks).toEqual({
      container: "settings-json",
      file: ".claude/settings.local.json",
      scope: "repo",
    });
    expect(harnessDefinition("gemini").hooks).toEqual({
      container: "settings-json",
      file: ".gemini/settings.json",
      scope: "user",
    });
    expect(harnessDefinition("codex").hooks).toEqual({
      container: "codex-hooks",
      file: ".codex/hooks.json",
    });
    expect(harnessDefinition("kimi").hooks).toEqual({
      container: "hooks-toml",
      file: ".kimi-code/config.toml",
    });
    expect(harnessDefinition("grok").hooks).toEqual({ container: "hooks-dir", dir: ".grok/hooks" });
    expect(harnessDefinition("omp").hooks).toEqual({
      container: "pi-extension",
      dir: ".omp/agent/extensions",
    });
    expect(harnessDefinition("mimo-code").hooks).toEqual({
      container: "opencode-plugin",
      dir: ".config/mimocode/plugins",
    });
  });

  it("pins the launch tokens of the three harnesses that need them", () => {
    expect(harnessDefinition("kiro").launch).toEqual(["chat", "--tui"]);
    expect(harnessDefinition("hermes").launch).toEqual(["--tui"]);
    expect(harnessDefinition("command-code").launch).toEqual(["--trust"]);
    const withLaunchTokens = harnesses.filter((def) => def.launch.length > 0).map((def) => def.id);
    expect(withLaunchTokens).toEqual(["command-code", "kiro", "hermes"]);
  });

  it("gives the four full harnesses a headless form and no other row one", () => {
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
    expect(harnesses.filter((def) => def.headless !== null).map((def) => def.id)).toEqual(FULL);
    expect(harnessDefinition("other:anything").headless).toBeNull();
  });

  it("pins every binary that differs from the harness id", () => {
    expect(harnessDefinition("claude-code").binary).toBe("claude");
    expect(harnessDefinition("kiro").binary).toBe("kiro-cli");
    expect(harnessDefinition("aug").binary).toBe("auggie");
    expect(harnessDefinition("continue").binary).toBe("cn");
    expect(harnessDefinition("qwen-code").binary).toBe("qwen");
    expect(harnessDefinition("mistral-vibe").binary).toBe("vibe");
    expect(harnessDefinition("cursor-agent").binary).toBe("cursor-agent");
    expect(harnessDefinition("antigravity").binary).toBe("agy");
    expect(harnessDefinition("trae").binary).toBe("traecli");
    expect(harnessDefinition("mimo-code").binary).toBe("mimo");
    expect(harnessDefinition("command-code").binary).toBe("command-code");
  });

  it("keeps the aliases that are the only name on PATH for some installs", () => {
    expect(harnessDefinition("kimi").aliases).toEqual(["kimi-code"]);
    expect(harnessDefinition("kimi").processNames).toContain("kimi-code");
    expect(harnessDefinition("mistral-vibe").aliases).toEqual(["mistral-vibe"]);
    expect(harnessDefinition("deepseek").aliases).toEqual(["dsh"]);
  });

  it("carries the packaged-binary process prefixes", () => {
    expect(harnessDefinition("codex").processNames).toEqual(["codex", "codex-"]);
    expect(harnessDefinition("grok").processNames).toEqual(["grok", "grok-"]);
  });

  it("pins prompt delivery, including the separator for prompts that look like flags", () => {
    expect(harnessDefinition("claude-code").prompt).toEqual({ kind: "argv" });
    expect(harnessDefinition("codex").prompt).toEqual({ kind: "argv" });
    expect(harnessDefinition("pi").prompt).toEqual({ kind: "argv" });
    expect(harnessDefinition("opencode").prompt).toEqual({ kind: "flag", flag: "--prompt" });
    expect(harnessDefinition("gemini").prompt).toEqual({ kind: "flag", flag: "-i" });
    expect(harnessDefinition("copilot").prompt).toEqual({ kind: "flag", flag: "-i" });
    expect(harnessDefinition("aider").prompt).toEqual({ kind: "type-after-start" });
    expect(harnessDefinition("devin").prompt).toEqual({ kind: "type-after-start" });
    for (const id of ["grok", "trae", "prime-agent"] as HarnessId[]) {
      expect(harnessDefinition(id).prompt).toEqual({ kind: "argv", separator: "--" });
    }
  });

  it("names the hook payload key each harness reports its session under", () => {
    expect(harnessDefinition("claude-code").sessionCapture).toEqual({
      source: "hook",
      key: "session_id",
      form: "id",
    });
    // Pi's extension reports the transcript path its own `--session` takes, not the id beside it.
    expect(harnessDefinition("pi").sessionCapture).toEqual({
      source: "hook",
      key: "session_file",
      form: "file",
    });
    expect(harnessDefinition("opencode").sessionCapture).toEqual({
      source: "hook",
      key: "sessionID",
      form: "id",
    });
    expect(harnessDefinition("grok").sessionCapture).toEqual({
      source: "hook",
      key: "sessionId",
      form: "id",
    });
    expect(harnessDefinition("cursor-agent").sessionCapture).toBeNull();
  });

  it("gives the four full harnesses, Cursor and Grok a probe, and nobody else one", () => {
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
    expect(harnessDefinition("cursor-agent").modelSource?.args).toEqual(["--list-models"]);
    expect(harnessDefinition("claude-code").modelSource?.stdin).toContain("list_models");
    for (const id of ["codex", "pi", "opencode", "cursor-agent", "grok"] as HarnessId[]) {
      expect(harnessDefinition(id).modelSource?.stdin).toBeNull();
    }
    const probed = harnesses.filter((def) => def.modelSource !== null);
    expect(probed.map((def) => def.id)).toEqual([...FULL, "cursor-agent", "grok"]);
  });

  it("points every plan vendor's row at the file that names its login", () => {
    const authFiles: [HarnessId, string][] = [
      ["gemini", ".gemini/oauth_creds.json"],
      ["grok", ".grok/auth.json"],
      ["kimi", ".kimi-code/credentials/kimi-code.json"],
      ["cursor-agent", ".cursor/auth.json"],
    ];
    for (const [id, file] of authFiles) {
      expect(harnessDefinition(id).authFile, id).toBe(file);
    }
    // xAI is the only one of the four that names the tier on disk.
    expect(harnessDefinition("grok").planSource?.file).toBe(".grok/auth.json");
    for (const id of ["gemini", "kimi", "cursor-agent"] as HarnessId[]) {
      expect(harnessDefinition(id).planSource, id).toBeNull();
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

  it("gives every harness agn checks a session against a transcript directory", () => {
    // The daemon looks for the session file `--resume` reads before it hands one back, so a
    // harness checked against a tree it does not write would lose native resume without saying so.
    for (const def of harnesses.filter((row) => row.resume?.evidence !== "unchecked")) {
      expect(def.resume === null || def.transcriptsDir !== null).toBe(true);
    }
  });

  it("always offers the native route first", () => {
    for (const def of harnesses) {
      expect(def.routes[0]).toBe("native");
    }
  });
});
