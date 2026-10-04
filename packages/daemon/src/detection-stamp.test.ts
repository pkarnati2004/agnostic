import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessReport } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authFilesStamp, harnessBinariesStamp } from "./detection-stamp.js";
import { fixtureDetection } from "./test-detection.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-auth-files-"));
});

afterEach(() => rm(home, { recursive: true, force: true }));

describe("authFilesStamp", () => {
  it("is stable when none of the harnesses' auth files exist", async () => {
    const first = await authFilesStamp(home);
    const second = await authFilesStamp(home);
    expect(first).toBe(second);
    // Codex and Claude Code are read for both login and plan; both are missing here.
    expect(first).toContain(".codex/auth.json:-");
    expect(first).toContain(".claude.json:-");
  });

  it("changes once a tracked auth file is written", async () => {
    const before = await authFilesStamp(home);
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex/auth.json"), "{}");
    const after = await authFilesStamp(home);
    expect(after).not.toBe(before);
  });

  it("changes again when the same file's contents change size", async () => {
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex/auth.json"), "{}");
    const first = await authFilesStamp(home);
    await writeFile(join(home, ".codex/auth.json"), '{"tokens":{"id_token":"x"}}');
    const second = await authFilesStamp(home);
    expect(second).not.toBe(first);
  });

  it("changes when a file is only touched, same size and content", async () => {
    await writeFile(join(home, ".claude.json"), "{}");
    const first = await authFilesStamp(home);
    // A re-login can rewrite a file with byte-identical content; only mtime moves.
    const bumped = new Date(Date.now() + 60_000);
    await utimes(join(home, ".claude.json"), bumped, bumped);
    const second = await authFilesStamp(home);
    expect(second).not.toBe(first);
  });

  it("is not affected by a file no harness reads", async () => {
    const before = await authFilesStamp(home);
    await writeFile(join(home, "unrelated.json"), "{}");
    const after = await authFilesStamp(home);
    expect(after).toBe(before);
  });

  it("covers each tracked file once even though claude-code names it as both login and plan source", async () => {
    const stamp = await authFilesStamp(home);
    const occurrences = stamp
      .split("|")
      .filter((entry: string) => entry.startsWith(".claude.json:"));
    expect(occurrences).toHaveLength(1);
  });
});

describe("harnessBinariesStamp", () => {
  /** The fixture's first harness report, pointed at a file this test owns. */
  function reportFor(path: string | null): HarnessReport[] {
    const [first] = fixtureDetection().harnesses;
    if (first === undefined) {
      throw new Error("the fixture detection has no harnesses");
    }
    return [{ ...first, path }];
  }

  async function binary(name: string): Promise<string> {
    const path = join(home, name);
    await writeFile(path, "#!/bin/sh\n");
    return path;
  }

  it("is stable while the binary is untouched", async () => {
    const reports = reportFor(await binary("claude"));
    expect(await harnessBinariesStamp(reports)).toBe(await harnessBinariesStamp(reports));
  });

  it("changes when the binary is replaced with one of the same size", async () => {
    const path = await binary("claude");
    const before = await harnessBinariesStamp(reportFor(path));
    // An upgrade can write the same number of bytes; it always moves mtime.
    const bumped = new Date(Date.now() + 60_000);
    await utimes(path, bumped, bumped);
    expect(await harnessBinariesStamp(reportFor(path))).not.toBe(before);
  });

  it("changes when the harness is found at another path", async () => {
    const before = await harnessBinariesStamp(reportFor(await binary("claude")));
    expect(await harnessBinariesStamp(reportFor(await binary("claude-2")))).not.toBe(before);
  });

  it("reads a harness installed nowhere as absent, with no path to stat", async () => {
    expect(await harnessBinariesStamp(reportFor(null))).toBe("claude-code:-");
  });

  it("reads a path that no longer exists as absent", async () => {
    const stamp = await harnessBinariesStamp(reportFor(join(home, "removed")));
    expect(stamp).toBe(`claude-code:${join(home, "removed")}:-`);
  });
});
