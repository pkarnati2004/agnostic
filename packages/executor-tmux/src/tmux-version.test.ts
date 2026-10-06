import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  parseTmuxVersion,
  REATTACH_FLOOR,
  readTmuxVersion,
  tmuxVersionAtLeast,
} from "./tmux-version.js";

describe("parseTmuxVersion", () => {
  it("reads the word tmux prints after its name", () => {
    expect(parseTmuxVersion("tmux 3.4\n")).toBe("3.4");
    expect(parseTmuxVersion("tmux 3.3a")).toBe("3.3a");
    expect(parseTmuxVersion("tmux next-3.5\n")).toBe("next-3.5");
    expect(parseTmuxVersion("  tmux master  ")).toBe("master");
  });

  it("answers null for anything that is not tmux speaking", () => {
    expect(parseTmuxVersion("hello there")).toBeNull();
    expect(parseTmuxVersion("")).toBeNull();
  });

  it("still reads the word after tmux's name when that word is not a real version", () => {
    // parseTmuxVersion only reads the shape of the line; tmuxVersionAtLeast is what refuses "abc".
    expect(parseTmuxVersion("tmux abc")).toBe("abc");
  });
});

describe("tmuxVersionAtLeast", () => {
  it("puts 3.2 below the reattach floor and 3.3 at it", () => {
    expect(tmuxVersionAtLeast("3.2a", REATTACH_FLOOR)).toBe(false);
    expect(tmuxVersionAtLeast("3.3", REATTACH_FLOOR)).toBe(true);
    expect(tmuxVersionAtLeast("3.4", REATTACH_FLOOR)).toBe(true);
    expect(tmuxVersionAtLeast("2.9", REATTACH_FLOOR)).toBe(false);
    expect(tmuxVersionAtLeast("4.0", REATTACH_FLOOR)).toBe(true);
  });

  it("takes the untagged builds, which are ahead of every release", () => {
    expect(tmuxVersionAtLeast("next", REATTACH_FLOOR)).toBe(true);
    expect(tmuxVersionAtLeast("next-3.5", REATTACH_FLOOR)).toBe(true);
    expect(tmuxVersionAtLeast("master", REATTACH_FLOOR)).toBe(true);
  });

  it("refuses a string with no version number in it", () => {
    expect(tmuxVersionAtLeast("abc", REATTACH_FLOOR)).toBe(false);
  });
});

describe("readTmuxVersion", () => {
  const empty = mkdtempSync(join(tmpdir(), "agn-no-tmux-"));
  afterAll(() => rmSync(empty, { recursive: true, force: true }));

  it("answers no version, not ok, on a PATH with no tmux, and throws nothing", async () => {
    await expect(readTmuxVersion({ PATH: empty })).resolves.toEqual({
      version: null,
      ok: false,
    });
  });

  it("answers no version for a tmux whose version word has no number in it", async () => {
    const fake = mkdtempSync(join(tmpdir(), "agn-odd-tmux-"));
    writeFileSync(join(fake, "tmux"), "#!/bin/sh\necho 'tmux abc'\n");
    chmodSync(join(fake, "tmux"), 0o755);
    await expect(readTmuxVersion({ PATH: fake })).resolves.toEqual({ version: null, ok: false });
    rmSync(fake, { recursive: true, force: true });
  });

  it("reads the tmux the tests run against", async () => {
    const report = await readTmuxVersion({ PATH: process.env.PATH ?? "" });
    expect(report.version).toMatch(/^(\d+\.\d+|next|master)/);
    expect(report.ok).toBe(true);
  });
});
