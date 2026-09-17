import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import {
  type AgnosticPaths,
  newId,
  type RegisterRepoRequest,
  type Repo,
  type RepoKind,
  readRepoConfig,
  run,
} from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import { DaemonError } from "./error.js";
import { detectRepoKind } from "./repo-kind.js";

type RegisterOutcome = { repo: Repo; created: boolean };

/**
 * ADR 001: a repo is a path plus a kind. ADR 004: the id in `.ag/agnostic.yaml` is what makes two
 * clones the same repo, it is minted once and never changes, so a second clone is a conflict
 * until the user asks for a new id.
 */
export async function registerRepo(
  ledger: Ledger,
  paths: AgnosticPaths,
  req: RegisterRepoRequest,
): Promise<RegisterOutcome> {
  const path = await realDirectory(req.path);
  await rejectWorktree(paths, path);
  let kind = await detectRepoKind(path);
  if (req.gitInit === true && kind === "folder") {
    await run("git", ["init"], { cwd: path });
    kind = "git";
  }
  const existing = ledger.repos.getByPath(path);
  if (existing !== null) {
    // Only the kind can have changed under a path we already know; the id and name stay.
    return { repo: ledger.repos.update(existing.id, { kind }), created: false };
  }
  const declared = (await readRepoConfig(path))?.id ?? null;
  const claimed = declared === null ? null : ledger.repos.get(declared);
  if (claimed !== null && req.newId !== true) {
    return { repo: await adoptOrRefuse(ledger, claimed, path, kind), created: false };
  }
  const id = declared !== null && req.newId !== true ? declared : newId();
  const addedAt = new Date().toISOString();
  return {
    repo: ledger.repos.insert({
      id,
      path,
      kind,
      name: basename(path),
      addedAt,
      status: "active",
    }),
    created: true,
  };
}

/** The registered clone is gone: this is the same repo, moved, so the row follows the path. */
async function adoptOrRefuse(
  ledger: Ledger,
  claimed: Repo,
  path: string,
  kind: RepoKind,
): Promise<Repo> {
  if (await exists(claimed.path)) {
    throw new DaemonError(`this repo id is already registered at ${claimed.path}`, {
      code: "repo-id-registered",
      hint: "Use `agn add --new-id` to register a second clone.",
    });
  }
  return ledger.repos.update(claimed.id, { path, kind, name: basename(path) });
}

/** realpath so a symlinked clone and its target are one row, not two. */
async function realDirectory(input: string): Promise<string> {
  let path: string;
  try {
    path = await realpath(resolve(input));
  } catch (cause) {
    throw new DaemonError(`${resolve(input)} does not exist`, {
      code: "path-not-found",
      hint: "Pass the path to a folder that exists.",
      cause,
    });
  }
  if (!(await stat(path)).isDirectory()) {
    throw new DaemonError(`${path} is not a directory`, {
      code: "path-not-directory",
      hint: "Pass the repo folder, not a file inside it.",
    });
  }
  return path;
}

/** agn's own worktrees are task scratch space; registering one would make a repo of a task. */
async function rejectWorktree(paths: AgnosticPaths, path: string): Promise<void> {
  // The given path is already real; the worktrees root has to be too, or /var and /private/var
  // read as different trees on macOS.
  const worktrees = await realpath(paths.worktrees).catch(() => paths.worktrees);
  const inside = relative(worktrees, path);
  if (!inside.startsWith("..") && !isAbsolute(inside)) {
    throw new DaemonError(`${path} is inside agn's own worktrees`, {
      code: "path-inside-worktrees",
      hint: "Register the repo this worktree came from instead.",
    });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
