import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessId } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionEvidence } from "./session-evidence.js";

const ID = "9f1c2b84-0a3d-4c77-9a2e-6d5b1e7f0c31";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-evidence-"));
});

afterEach(() => rm(home, { recursive: true, force: true }));

/** Writes an empty transcript at a path under the home, creating whatever it needs on the way. */
async function seed(...parts: string[]): Promise<void> {
  const file = join(home, ...parts);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, "", "utf8");
}

function evidence(harness: HarnessId, sessionId = ID) {
  return sessionEvidence({ home, harness, sessionId });
}

describe("sessionEvidence", () => {
  it("finds the Claude Code transcript named for the id under its project directory", async () => {
    await seed(".claude", "projects", "-Users-a-repo", `${ID}.jsonl`);
    expect(await evidence("claude-code")).toBe("found");
  });

  it("finds a sub-agent transcript one directory below the project", async () => {
    await seed(".claude", "projects", "-Users-a-repo", "subagents", `${ID}.jsonl`);
    expect(await evidence("claude-code")).toBe("found");
  });

  it("finds the Codex rollout whose name carries the id after its timestamp", async () => {
    await seed(".codex", "sessions", "2026", "09", "16", `rollout-2026-09-16T10-00-00-${ID}.jsonl`);
    expect(await evidence("codex")).toBe("found");
  });

  it("does not walk deeper than any harness writes", async () => {
    await seed(".claude", "projects", "-Users-a-repo", "one", "two", "three", `${ID}.jsonl`);
    expect(await evidence("claude-code")).toBe("none");
  });

  it("reads a tree that holds only other sessions as none", async () => {
    await seed(
      ".claude",
      "projects",
      "-Users-a-repo",
      "8b7a6c55-1111-2222-3333-444455556666.jsonl",
    );
    expect(await evidence("claude-code")).toBe("none");
  });

  it("ignores a file named for the id that is not a transcript", async () => {
    await seed(".claude", "projects", "-Users-a-repo", `${ID}.json`);
    expect(await evidence("claude-code")).toBe("none");
  });

  it("reads a home the harness has never written under as none", async () => {
    expect(await evidence("claude-code")).toBe("none");
  });

  // Root reads every directory whatever its mode, so there is nothing to check there.
  it.skipIf(process.getuid?.() === 0)(
    "reads a tree it cannot open as unreadable, so the id keeps the benefit of the doubt",
    async () => {
      const root = join(home, ".claude", "projects");
      await mkdir(root, { recursive: true });
      await chmod(root, 0o000);
      try {
        expect(await evidence("claude-code")).toBe("unreadable");
      } finally {
        await chmod(root, 0o700);
      }
    },
  );

  it("reads a harness with no transcript directory as none", async () => {
    expect(await evidence("pi")).toBe("none");
  });

  it("never looks outside the tree for an id that is a path", async () => {
    await seed(".claude", "escaped.jsonl");
    await seed(".claude", "projects", "-Users-a-repo", "kept.jsonl");
    expect(await evidence("claude-code", "../escaped")).toBe("none");
  });

  it("reads a directory named for the id as none, since a transcript is a file", async () => {
    await mkdir(join(home, ".claude", "projects", "-Users-a-repo", `${ID}.jsonl`), {
      recursive: true,
    });
    expect(await evidence("claude-code")).toBe("none");
  });

  it("does not find a transcript that names the id under a different harness's root", async () => {
    await seed(".codex", "sessions", "2026", "09", "16", `rollout-2026-09-16T10-00-00-${ID}.jsonl`);
    expect(await evidence("claude-code")).toBe("none");
  });

  it("finds a transcript that is a symlink, since the walk only ever reads the name", async () => {
    // A dotfiles repo or another volume holds the file; `--resume` opens the link just the same.
    await seed("store", `${ID}.jsonl`);
    const project = join(home, ".claude", "projects", "-Users-a-repo");
    await mkdir(project, { recursive: true });
    await symlink(join(home, "store", `${ID}.jsonl`), join(project, `${ID}.jsonl`));
    expect(await evidence("claude-code")).toBe("found");
  });

  it("reads a tree whose only project directory is a symlink as unreadable", async () => {
    // The transcript is reachable only through the link, which the walk declines to follow, so
    // "none" would be a guess about somewhere it never looked.
    await seed("elsewhere", `${ID}.jsonl`);
    await mkdir(join(home, ".claude", "projects"), { recursive: true });
    await symlink(join(home, "elsewhere"), join(home, ".claude", "projects", "-Users-a-repo"));
    expect(await evidence("claude-code")).toBe("unreadable");
  });

  it("still finds a real transcript when a symlinked directory sits beside it", async () => {
    await seed(".claude", "projects", "-Users-a-repo", `${ID}.jsonl`);
    await symlink(join(home, ".claude"), join(home, ".claude", "projects", "-Users-b-repo"));
    expect(await evidence("claude-code")).toBe("found");
  });

  it("cannot be made to loop by a symlink pointing back up its own tree", async () => {
    const root = join(home, ".claude", "projects");
    await mkdir(root, { recursive: true });
    await symlink(root, join(root, "loop"));
    expect(await evidence("claude-code")).toBe("unreadable");
  });

  it("does not read one session's transcript as another whose id it contains", async () => {
    await seed(".claude", "projects", "-Users-a-repo", `${ID}.jsonl`);
    // Both halves of the collision: an id that is a hyphen-aligned tail of the file's id, and one
    // that starts mid-block. Either would resume natively on an id the harness does not hold.
    expect(await evidence("claude-code", "0a3d-4c77-9a2e-6d5b1e7f0c31")).toBe("none");
    expect(await evidence("claude-code", "c2b84-0a3d-4c77-9a2e-6d5b1e7f0c31")).toBe("none");
  });

  it("does not read a Codex rollout as a session whose id it merely contains", async () => {
    await seed(".codex", "sessions", "2026", "09", "16", `rollout-2026-09-16T10-00-00-${ID}.jsonl`);
    expect(await evidence("codex", "5b1e7f0c31")).toBe("none");
    expect(await evidence("codex", ID.slice(0, -4))).toBe("none");
    expect(await evidence("codex", ID)).toBe("found");
  });

  it("stops at the entry cap rather than reading a runaway tree to the end", async () => {
    const dir = join(home, ".claude", "projects");
    await mkdir(dir, { recursive: true });
    // None of these name the id; only the cap explains why a real match one level down is missed.
    await Promise.all(
      Array.from({ length: 5_001 }, (_, i) => writeFile(join(dir, `f${i}.jsonl`), "", "utf8")),
    );
    await seed(".claude", "projects", "elsewhere", `${ID}.jsonl`);
    expect(await evidence("claude-code")).toBe("unreadable");
  });
});
