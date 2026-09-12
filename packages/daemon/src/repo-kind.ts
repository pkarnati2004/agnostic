import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { RepoKind } from "@agnostic/core";

/**
 * ADR 001: a repo is git when `.git` is there, a folder otherwise. It is re-detected on every
 * `agn add` and every `agn run`, so `git init` in a folder workspace takes effect on the next run.
 */
export async function detectRepoKind(path: string): Promise<RepoKind> {
  try {
    await stat(join(path, ".git"));
    return "git";
  } catch {
    return "folder";
  }
}
