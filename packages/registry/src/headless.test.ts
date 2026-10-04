import { describe, expect, it } from "vitest";
import { isHeadlessInvocation } from "./headless.js";

describe("isHeadlessInvocation", () => {
  it("reads Claude Code's print flags", () => {
    expect(isHeadlessInvocation("claude-code", ["/usr/local/bin/claude", "-p", "sum this"])).toBe(
      true,
    );
    expect(isHeadlessInvocation("claude-code", ["claude", "--print", "sum this"])).toBe(true);
    expect(
      isHeadlessInvocation("claude-code", ["claude", "--output-format=json", "sum this"]),
    ).toBe(true);
  });

  it("takes a -p after the separator as prompt text, not a flag", () => {
    expect(isHeadlessInvocation("claude-code", ["claude", "--", "explain -p"])).toBe(false);
  });

  it("leaves an interactive Claude Code session alone", () => {
    expect(isHeadlessInvocation("claude-code", ["claude", "--model", "opus"])).toBe(false);
  });

  it("reads Codex's exec subcommand, and only as the first operand", () => {
    expect(isHeadlessInvocation("codex", ["codex", "exec", "ship it"])).toBe(true);
    expect(isHeadlessInvocation("codex", ["codex", "write an exec helper"])).toBe(false);
  });

  it("looks past the interpreter a harness script runs under", () => {
    expect(isHeadlessInvocation("codex", ["node", "/opt/bin/codex", "exec", "x"])).toBe(true);
    expect(isHeadlessInvocation("claude-code", ["node", "/opt/bin/claude", "-p", "x"])).toBe(true);
  });

  it("matches Codex's packaged binary through its name prefix", () => {
    expect(isHeadlessInvocation("codex", ["/opt/codex-aarch64-apple-darwin", "exec"])).toBe(true);
  });

  it("reads Pi's print flag, short and long, and OpenCode's run subcommand", () => {
    expect(isHeadlessInvocation("pi", ["pi", "--print", "x"])).toBe(true);
    expect(isHeadlessInvocation("pi", ["pi", "-p", "x"])).toBe(true);
    expect(isHeadlessInvocation("pi", ["pi"])).toBe(false);
    expect(isHeadlessInvocation("opencode", ["opencode", "run", "x"])).toBe(true);
    expect(isHeadlessInvocation("opencode", ["opencode"])).toBe(false);
  });

  it("knows no headless form for a row that names none", () => {
    // Tier 2 and the hook families alike: a row with no `headlessDetect` is never a headless run.
    expect(isHeadlessInvocation("aider", ["aider", "--message", "x"])).toBe(false);
    expect(isHeadlessInvocation("grok", ["grok", "-p", "x"])).toBe(false);
    expect(isHeadlessInvocation("other:mytool", ["mytool", "exec", "-p"])).toBe(false);
  });
});
