import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { writeConfigFile } from "@agnostic/hooks";
import { gitLines, gitStdout } from "./git-read.js";

/**
 * A hook file agn writes inside a repo is not the repo's to commit. `.gitignore` is the repo's own
 * business, so the path goes in `info/exclude` of the common dir, which every worktree reads.
 */
export async function excludeFromGit(dir: string, path: string): Promise<boolean> {
  const file = await excludeFile(dir);
  if (file === null) {
    return false;
  }
  const text = await readExclude(file);
  if (text.split("\n").some((line) => line.trim() === path)) {
    return false;
  }
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  // Rewritten whole and renamed into place: git reads this file whenever it walks the worktree.
  await writeConfigFile(file, `${text}${separator}${path}\n`);
  return true;
}

/** Removes the lines equal to `path` and leaves every other line as it was. */
export async function includeInGit(dir: string, path: string): Promise<boolean> {
  const file = await excludeFile(dir);
  if (file === null) {
    return false;
  }
  const lines = (await readExclude(file)).split("\n");
  const kept = lines.filter((line) => line.trim() !== path);
  if (kept.length === lines.length) {
    return false;
  }
  await writeConfigFile(file, kept.join("\n"));
  return true;
}

/**
 * A hook file inside the directory it was written to is agn's to keep out of the user's commits.
 * The installer reports the path the registry gave it, so no harness is named here; a file under
 * HOME is outside the directory and left alone.
 */
export async function keepOutOfGit(
  dir: string,
  file: string,
  mode: "exclude" | "include",
): Promise<void> {
  const path = relative(dir, file);
  if (path === "" || path === ".." || path.startsWith("../") || isAbsolute(path)) {
    return;
  }
  await (mode === "exclude" ? excludeFromGit(dir, path) : includeInGit(dir, path));
}

/** Null for a directory git refuses: a folder repo is nothing to keep out of git. */
async function excludeFile(dir: string): Promise<string | null> {
  const common = gitLines(await gitStdout(dir, ["rev-parse", "--git-common-dir"]))[0];
  return common === undefined ? null : join(resolve(dir, common.trim()), "info", "exclude");
}

async function readExclude(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw cause;
  }
}
