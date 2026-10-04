import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTrustBlock } from "./config-block.js";
import { codexEventLabel, trustedHash, trustKey } from "./trust.js";

const COMMAND = "sh '/home/u/.agnostic/hooks/post.sh' codex";

describe("Codex hook trust", () => {
  it.each([
    ["SessionStart", "session_start"],
    ["UserPromptSubmit", "user_prompt_submit"],
    ["PreToolUse", "pre_tool_use"],
    ["Stop", "stop"],
  ])("labels %s as %s", (event, label) => {
    expect(codexEventLabel(event)).toBe(label);
  });

  it("keys a handler by its file, event, group and position", () => {
    expect(trustKey("/home/u/.codex/hooks.json", "stop", 0, 0)).toBe(
      "/home/u/.codex/hooks.json:stop:0:0",
    );
  });

  it("hashes the handler definition Codex hashes, with its keys in order", () => {
    const canonical =
      '{"event_name":"stop","hooks":[{"async":false,"command":' +
      `${JSON.stringify(COMMAND)},"timeout":5,"type":"command"}]}`;
    const expected = `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
    expect(trustedHash({ label: "stop", command: COMMAND, timeoutSec: 5 })).toBe(expected);
  });

  it("includes a matcher in the hash when the group has one", () => {
    const without = trustedHash({ label: "pre_tool_use", command: COMMAND, timeoutSec: 5 });
    const withMatcher = trustedHash({
      label: "pre_tool_use",
      command: COMMAND,
      timeoutSec: 5,
      matcher: "Ask",
    });
    expect(withMatcher).not.toBe(without);
  });

  it("puts its tables in a marked block and keeps every other byte", () => {
    const original = 'notify = ["x"]\n\n[projects."/x"]\ntrust_level = "trusted"\n';
    const updated = withTrustBlock(original, [{ key: "k", hash: "sha256:abc" }]);
    expect(updated.startsWith(original)).toBe(true);
    // Every table agn writes carries its marker, so a later install knows it wrote this one.
    expect(updated).toContain('[hooks.state."k"]\n# agn\ntrusted_hash = "sha256:abc"');
  });

  it("replaces the block it wrote before, in place", () => {
    const original = "notify = []\n";
    const first = withTrustBlock(original, [{ key: "k", hash: "sha256:one" }]);
    const second = withTrustBlock(first, [{ key: "k", hash: "sha256:two" }]);
    expect(second).toBe(first.replace("sha256:one", "sha256:two"));
  });

  it("removes the whole block and leaves every line the user wrote", () => {
    const original = "notify = []\n";
    const installed = withTrustBlock(original, [{ key: "k", hash: "sha256:one" }]);
    const removed = withTrustBlock(installed, []);
    expect(removed.trimEnd()).toBe(original.trimEnd());
    expect(removed).not.toContain("hooks.state");
  });

  it("refuses a file whose block is half there", () => {
    const broken = `notify = []\n# <<< agn hooks <<<\n`;
    expect(() => withTrustBlock(broken, [{ key: "k", hash: "sha256:one" }])).toThrow(
      expect.objectContaining({ code: "hook-config-unwritable" }),
    );
  });

  it("refuses a file with two agn blocks rather than guess which one is current", () => {
    const twice =
      "notify = []\n" +
      "# >>> agn hooks: managed block, edits here are replaced >>>\n" +
      '[hooks.state."k"]\ntrusted_hash = "sha256:one"\n' +
      "# <<< agn hooks <<<\n" +
      "# >>> agn hooks: managed block, edits here are replaced >>>\n" +
      '[hooks.state."k"]\ntrusted_hash = "sha256:one"\n' +
      "# <<< agn hooks <<<\n";
    expect(() => withTrustBlock(twice, [{ key: "k", hash: "sha256:two" }])).toThrow(
      expect.objectContaining({ code: "hook-config-unwritable" }),
    );
  });

  it("refuses to write a table Codex already recorded elsewhere", () => {
    const approved = 'notify = []\n\n[hooks.state."k"]\ntrusted_hash = "sha256:theirs"\n';
    expect(() => withTrustBlock(approved, [{ key: "k", hash: "sha256:ours" }])).toThrow(
      expect.objectContaining({ code: "hook-config-unwritable" }),
    );
  });
});
