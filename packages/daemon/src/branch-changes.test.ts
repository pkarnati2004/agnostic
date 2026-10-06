import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Repo, run, type Task } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileChanges } from "./branch-changes.js";

let path: string;

beforeEach(async () => {
  path = await mkdtemp(join(tmpdir(), "agn-changes-"));
  await git(["init", "-q", "-b", "main"]);
  await writeFile(join(path, "README.md"), "# fixture\n");
  await git(["add", "README.md"]);
  await git(["commit", "-q", "-m", "first"]);
});

afterEach(() => rm(path, { recursive: true, force: true }));

function git(args: string[]): Promise<unknown> {
  return run("git", [
    "-C",
    path,
    "-c",
    "user.email=t@agn.test",
    "-c",
    "user.name=agn test",
    ...args,
  ]);
}

function repo(kind: Repo["kind"] = "git"): Repo {
  return {
    id: "r7k2m4pqrs",
    path,
    kind,
    name: "fixture",
    addedAt: "2026-09-12T10:00:00.000Z",
    status: "active",
  };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t3n9v2wxyz",
    repoId: "r7k2m4pqrs",
    title: "add a flag",
    prompt: "add a flag",
    profileId: "claude-code:default:native",
    worktreePath: path,
    branch: "work",
    status: "stopped",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: "2026-09-12T10:00:00.000Z",
    updatedAt: "2026-09-12T10:00:00.000Z",
    ...over,
  };
}

describe("fileChanges", () => {
  it("reports the branch's diff stat against HEAD and what is left uncommitted", async () => {
    await git(["switch", "-q", "-c", "work"]);
    await writeFile(join(path, "flag.ts"), "export const flag = true;\n");
    await git(["add", "flag.ts"]);
    await git(["commit", "-q", "-m", "add the flag"]);
    // The main checkout sits on its own branch while a task runs; the diff is read from there.
    await git(["switch", "-q", "main"]);
    await writeFile(join(path, "unstaged.ts"), "half done\n");

    const changes = await fileChanges(repo(), task(), null);
    expect(changes.kind).toBe("git");
    if (changes.kind !== "git") {
      return;
    }
    expect(changes.committed.join("\n")).toContain("flag.ts");
    expect(changes.uncommitted).toEqual(["?? unstaged.ts"]);
    expect(changes.worktreePath).toBe(path);
  });

  it("reads the diff against the repo's base_branch when it has one", async () => {
    await git(["switch", "-q", "-c", "release"]);
    await writeFile(join(path, "released.ts"), "shipped\n");
    await git(["add", "released.ts"]);
    await git(["commit", "-q", "-m", "release"]);
    await git(["switch", "-q", "-c", "work"]);
    await writeFile(join(path, "flag.ts"), "export const flag = true;\n");
    await git(["add", "flag.ts"]);
    await git(["commit", "-q", "-m", "add the flag"]);
    await git(["switch", "-q", "main"]);

    const changes = await fileChanges(repo(), task(), config("release"));
    expect(changes.kind === "git" && changes.committed.join("\n")).toContain("flag.ts");
    expect(changes.kind === "git" && changes.committed.join("\n")).not.toContain("released.ts");
  });

  it("reports a rename and a binary file in the diff stat", async () => {
    await writeFile(join(path, "img.bin"), Buffer.from([0, 1, 2, 3]));
    await git(["add", "img.bin"]);
    await git(["commit", "-q", "-m", "add the binary"]);
    await git(["switch", "-q", "-c", "work"]);
    await git(["mv", "README.md", "renamed.md"]);
    await writeFile(join(path, "img.bin"), Buffer.from([0, 1, 2, 3, 4, 5]));
    await git(["add", "-A"]);
    await git(["commit", "-q", "-m", "rename and grow the binary"]);
    await git(["switch", "-q", "main"]);

    const changes = await fileChanges(repo(), task(), null);
    const stat = changes.kind === "git" ? changes.committed.join("\n") : "";
    expect(stat).toContain("README.md => renamed.md");
    expect(stat).toContain("img.bin");
    expect(stat).toContain("Bin");
  });

  it("reports nothing rather than failing when git cannot answer", async () => {
    const changes = await fileChanges(repo(), task({ branch: "never-existed" }), null);
    expect(changes).toEqual({ kind: "git", committed: [], uncommitted: [], worktreePath: path });
  });

  it("reports nothing when the configured base branch was deleted", async () => {
    await git(["switch", "-q", "-c", "release"]);
    await git(["switch", "-q", "-c", "work"]);
    await writeFile(join(path, "flag.ts"), "export const flag = true;\n");
    await git(["add", "flag.ts"]);
    await git(["commit", "-q", "-m", "add the flag"]);
    await git(["switch", "-q", "main"]);
    await git(["branch", "-D", "release"]);

    const changes = await fileChanges(repo(), task(), config("release"));
    expect(changes.kind === "git" && changes.committed).toEqual([]);
  });

  it("reports nothing in a repo with no commits at all", async () => {
    const empty = await mkdtemp(join(tmpdir(), "agn-changes-empty-"));
    try {
      await run("git", ["-C", empty, "init", "-q", "-b", "main"]);
      const changes = await fileChanges(
        { ...repo(), path: empty },
        task({ worktreePath: empty }),
        null,
      );
      expect(changes).toEqual({ kind: "git", committed: [], uncommitted: [], worktreePath: empty });
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("has nothing to read in a worktree that was cleaned", async () => {
    const changes = await fileChanges(repo(), task({ worktreePath: join(path, "gone") }), null);
    expect(changes.kind === "git" && changes.worktreePath).toBe(null);
  });

  it("tracks no files at all in a folder repo", async () => {
    expect(await fileChanges(repo("folder"), task(), null)).toEqual({ kind: "folder" });
  });
});

function config(baseBranch: string) {
  return {
    id: "r7k2m4pqrs",
    testCommand: null,
    lintCommand: null,
    defaultProfileId: null,
    baseBranch,
    branchPrefix: null,
    setupCommand: null,
    cleanAfterMerge: false,
  };
}
