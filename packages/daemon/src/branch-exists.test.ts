import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import { branchExists } from "./branch-verdict.js";
import { DaemonError } from "./error.js";
import { shimGit } from "./test-git-shim.js";

const repos: string[] = [];

afterEach(async () => {
  for (const path of repos.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]): Promise<unknown> {
  return run("git", ["-C", cwd, "-c", "user.email=t@agn.test", "-c", "user.name=agn", ...args]);
}

/** A repo the test owns, with one commit on `main`. */
async function gitRepo(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "agn-branch-exists-"));
  repos.push(path);
  await git(path, ["init", "-q", "-b", "main"]);
  await writeFile(join(path, "README.md"), "# fixture\n");
  await git(path, ["add", "README.md"]);
  await git(path, ["commit", "-q", "-m", "first"]);
  return path;
}

/**
 * `branchExists` is the boundary from ADR 022's "read-only" note: a git that answers may say gone,
 * a git that does not answer must never be read as gone. Exercised at the unit level with a shim
 * because the daemon-level handoff and resume tests only prove each caller reacts correctly to
 * what this function already decided.
 */
describe("branchExists", () => {
  it("throws git-unavailable rather than answering when git will not run at all", async () => {
    const repo = await gitRepo();
    const restore = await shimGit("fatal: Unable to create '.git/index.lock': File exists.");
    try {
      await expect(branchExists(repo, "agn/task")).rejects.toMatchObject({
        code: "git-unavailable",
      });
    } finally {
      restore();
    }
  });

  it("reads exit 1 with the ref-not-found wording as the branch being gone", async () => {
    const repo = await gitRepo();
    const restore = await shimGit("fatal: Needed a single revision", 1);
    try {
      expect(await branchExists(repo, "agn/task")).toBe(false);
    } finally {
      restore();
    }
  });

  it("does not read an unrelated exit 1 as the branch being gone", async () => {
    // Same exit code `--quiet` uses for a missing ref, but a message that says something else -
    // the wording, not the exit code alone, is what tells the two apart (branch-verdict.ts).
    const repo = await gitRepo();
    const restore = await shimGit(
      "fatal: not a git repository (or any of the parent directories)",
      1,
    );
    try {
      const error: unknown = await branchExists(repo, "agn/task").catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(DaemonError);
      expect((error as DaemonError).code).toBe("git-unavailable");
    } finally {
      restore();
    }
  });
});
