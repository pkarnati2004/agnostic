import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authFilesStamp } from "./auth-files.js";

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
    const occurrences = stamp.split("|").filter((entry) => entry.startsWith(".claude.json:"));
    expect(occurrences).toHaveLength(1);
  });
});
