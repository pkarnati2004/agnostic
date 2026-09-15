import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AgnosticPaths } from "@agnostic/core";
import type { Command } from "commander";
import type { CliContext } from "./context.js";
import { CliError } from "./error.js";

/** A repo, and the task the current directory belongs to when it is one of agn's worktrees. */
type Resolved = { repoId: string; taskId: string | null };

/**
 * ADR 012: `--repo` first, as a path when it looks like one and as an id or prefix otherwise; then
 * the worktree the shell is sitting in, which names its task as well; then the registered repo
 * whose path is the longest prefix of the current directory. Closed repos are resolved too, so
 * the daemon gets to say "repo <name> is closed" instead of the CLI saying it was never added.
 */
export async function resolveRepo(ctx: CliContext, flag: string | undefined): Promise<Resolved> {
  if (flag !== undefined) {
    const path = expand(ctx.cwd, flag);
    return looksLikePath(flag) || (await isDirectory(path))
      ? { repoId: await repoIdAt(ctx, path), taskId: null }
      : { repoId: flag, taskId: null };
  }
  const worktree = await worktreeTask(ctx.paths, await realpathOrSelf(ctx.cwd));
  if (worktree !== null) {
    return worktree;
  }
  return { repoId: await repoContaining(ctx, ctx.cwd), taskId: null };
}

/** The registered repo a path belongs to; nested checkouts mean the longest match wins. */
export async function repoContaining(ctx: CliContext, path: string): Promise<string> {
  const repoId = await enclosingRepoId(ctx, await realpathOrSelf(path));
  if (repoId === null) {
    throw new CliError(`${path} is not inside a registered repo`, {
      code: "repo-not-resolved",
      hint: "Run `agn add .` here, or pass --repo <id or path>.",
    });
  }
  return repoId;
}

/** `~/.agnostic/worktrees/<repo>/<task>` is agn's own layout, so the path names both ids. */
export async function worktreeTask(paths: AgnosticPaths, cwd: string): Promise<Resolved | null> {
  const worktrees = await realpathOrSelf(paths.worktrees);
  const inside = relative(worktrees, cwd);
  if (inside.startsWith("..") || isAbsolute(inside) || inside === "") {
    return null;
  }
  const [repoId, taskId] = inside.split(sep);
  return repoId === undefined || taskId === undefined ? null : { repoId, taskId };
}

/**
 * The task a task-scoped command works on: the argument, or the worktree the shell is in. Missing
 * both is the command line being incomplete, which exits 2 like any other usage error.
 */
export async function requireTaskId(
  ctx: CliContext,
  command: Command,
  argument: string | undefined,
): Promise<string> {
  const taskId =
    argument ?? (await worktreeTask(ctx.paths, await realpathOrSelf(ctx.cwd)))?.taskId ?? null;
  if (taskId !== null) {
    return taskId;
  }
  return command.error(
    `error: agn ${command.name()} needs a task id, or a task worktree to run in`,
    { exitCode: 2, code: "commander.missingArgument" },
  );
}

async function repoIdAt(ctx: CliContext, path: string): Promise<string> {
  const real = await realpathOrSelf(path);
  const { repos } = await (await ctx.client()).listRepos({ all: true });
  const match = repos.find((repo) => repo.path === real);
  if (match === undefined) {
    throw new CliError(`${real} is not a registered repo`, {
      code: "repo-not-registered",
      hint: `Run \`agn add ${path}\` first.`,
    });
  }
  return match.id;
}

/** Nested checkouts are legal, so the longest path that is a prefix of the cwd wins. */
async function enclosingRepoId(ctx: CliContext, cwd: string): Promise<string | null> {
  const { repos } = await (await ctx.client()).listRepos({ all: true });
  const enclosing = repos
    .filter((repo) => contains(repo.path, cwd))
    .sort((a, b) => b.path.length - a.path.length);
  return enclosing[0]?.id ?? null;
}

/** A prefix only counts on a path boundary, or /tmp/repo would swallow /tmp/repo-other. */
function contains(parent: string, child: string): boolean {
  const inside = relative(parent, child);
  return !inside.startsWith("..") && !isAbsolute(inside);
}

function looksLikePath(flag: string): boolean {
  return flag.includes(sep) || flag === "." || flag === ".." || flag.startsWith("~");
}

function expand(cwd: string, flag: string): string {
  return flag.startsWith("~")
    ? resolve(homedir(), flag.slice(1).replace(/^\//, ""))
    : resolve(cwd, flag);
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}

/** A path that does not exist yet is still worth comparing; it simply will not match a repo. */
async function realpathOrSelf(path: string): Promise<string> {
  return realpath(path).catch(() => path);
}
