import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withHooksBlock, withoutHooksBlock } from "./hooks-toml-file.js";

/** The fixtures are transcribed from Orca's `src/main/kimi/kimi-hook-config-toml.test.ts`. */
const FIXTURES = fileURLToPath(
  new URL("../../../tests/fixtures/hooks/kimi-config/", import.meta.url),
);

const ENTRIES = [
  { event: "Stop", command: "sh '/home/u/.agnostic/hooks/post.sh' kimi", timeout: 5 },
  { event: "PreToolUse", command: "sh '/home/u/.agnostic/hooks/post.sh' kimi", timeout: 5 },
];

const fixture = (name: string) => readFile(join(FIXTURES, name), "utf8");

describe("the Kimi hooks block", () => {
  it("writes one [[hooks]] table per event on an empty file", () => {
    const text = withHooksBlock("", ENTRIES);
    expect(text.match(/\[\[hooks]]/g)).toHaveLength(2);
    expect(text).toContain('event = "Stop"');
    expect(text).toContain(`command = "sh '/home/u/.agnostic/hooks/post.sh' kimi"`);
    expect(text).toContain("timeout = 5");
  });

  it("writes no matcher: Kimi reads one as a regex, and none means every tool", () => {
    expect(withHooksBlock("", ENTRIES)).not.toContain("matcher");
  });

  it("keeps every byte of the tables a user already had", async () => {
    const before = await fixture("with-provider.toml");
    const text = withHooksBlock(before, ENTRIES);
    expect(text.startsWith(before)).toBe(true);
    expect(withoutHooksBlock(text)).toBe(before);
  });

  it("is a no-op the second time", async () => {
    const once = withHooksBlock(await fixture("with-provider.toml"), ENTRIES);
    expect(withHooksBlock(once, ENTRIES)).toBe(once);
  });

  it("refuses a block whose end marker was deleted by hand", async () => {
    const orphaned = await fixture("no-end-marker.toml");
    expect(() => withHooksBlock(orphaned, ENTRIES)).toThrow(
      expect.objectContaining({ code: "hook-config-unwritable" }),
    );
  });

  it("escapes what TOML cannot hold in a basic string", () => {
    const text = withHooksBlock("", [{ event: "Stop", command: 'a"b\\c\td', timeout: 5 }]);
    expect(text).toContain(String.raw`command = "a\"b\\c\td"`);
  });
});
