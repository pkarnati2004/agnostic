import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { run } from "@agnostic/core";
import { writeConfigFile } from "../config-file.js";

/**
 * A hook agn installs per repo lands in a file the repo should not commit. `.gitignore` is the
 * repo's own business, so the path goes in `.git/info/exclude`, and only when git does not already
 * ignore it.
 */
export async function excludeFromGit(repoPath: string, pattern: string): Promise<void> {
  const gitDir = await gitCommonDir(repoPath);
  if (gitDir === null || (await gitIgnores(repoPath, pattern))) {
    return;
  }
  const file = join(gitDir, "info", "exclude");
  const text = await readFile(file, "utf8").catch(() => "");
  if (text.split("\n").some((line) => line.trim() === pattern)) {
    return;
  }
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  // Rewritten whole and renamed into place: git reads this file whenever it walks the worktree.
  await writeConfigFile(file, `${text}${separator}${pattern}\n`);
}

/** The common dir, so a repo checked out as a worktree writes its exclude file where git reads it. */
async function gitCommonDir(repoPath: string): Promise<string | null> {
  const result = await run("git", ["-C", repoPath, "rev-parse", "--git-common-dir"], {
    timeoutMs: 5_000,
  }).catch(() => null);
  return result === null ? null : resolve(repoPath, result.stdout.trim());
}

async function gitIgnores(repoPath: string, pattern: string): Promise<boolean> {
  return await run("git", ["-C", repoPath, "check-ignore", "-q", pattern], {
    timeoutMs: 5_000,
  }).then(
    () => true,
    () => false,
  );
}
