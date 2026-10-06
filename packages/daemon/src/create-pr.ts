import {
  type CreatePrRequest,
  type CreatePrResponse,
  type Repo,
  readTaskNote,
  type Task,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { openPr, usableGh } from "./gh-pr.js";
import { originUrl } from "./git-read.js";
import { compareUrl, type GithubRepo, parseGithubRemote } from "./github-remote.js";
import { initialTaskNote } from "./initial-task-note.js";
import { composePrBody } from "./pr-body.js";
import { pushBranch } from "./push-branch.js";
import { resolveTaskBase } from "./task-base.js";
import { branchUpstream, countCommits } from "./task-changes.js";
import { type TaskDir, taskDir } from "./task-dir.js";

/**
 * Pushes the task's branch to origin once and opens its pull request, with `gh` when this machine
 * has one and with GitHub's compare page when it does not (ADR 036 Q5). Every refusal happens
 * before the push, so a call agn will not finish leaves nothing behind on the remote. Nothing is
 * recorded: a pull request is a fact of the remote, which `GET /tasks/:id/changes` re-reads.
 */
export async function createPr(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  req: CreatePrRequest,
): Promise<CreatePrResponse> {
  const at = await taskDir(ctx, repo, task);
  const branch = task.branch;
  if (branch === null) {
    throw noBranch(task);
  }
  const remote = origin(await originUrl(at.dir), repo);
  const base = await resolveTaskBase(ctx, repo, task, at);
  if (base.ref === branch) {
    throw branchIsBase(branch);
  }
  if (await isEmpty(at, base.commit, branch)) {
    throw branchEmpty(branch, at.dir);
  }

  const upstream = await branchUpstream(at.dir, branch);
  const { pushed } = await pushBranch(at.dir, branch, upstream !== null, ctx.env);
  const title = req.title ?? task.title;
  const note = (await readTaskNote(repo.path, task.id)) ?? initialTaskNote(task, task.prompt);
  const body = composePrBody(note);
  const gh = await usableGh(ctx, at.dir);
  const url =
    gh === null
      ? compareUrl(remote, base.ref, branch, title)
      : await openPr(gh, at.dir, ctx.env, {
          branch,
          base: base.ref,
          title,
          body,
          baseTaskId: base.baseTaskId,
        });
  return { task, url, body, via: gh === null ? "compare" : "gh", pushed, base: base.ref, branch };
}

/** GitHub cannot open a pull request with no commits, and pushing first would leave a branch behind. */
async function isEmpty(at: TaskDir, base: string | null, branch: string): Promise<boolean> {
  if (base === null) {
    return true;
  }
  const tip = at.where === "worktree" ? "HEAD" : `refs/heads/${branch}`;
  return (await countCommits(at.dir, `${base}..${tip}`)) === 0;
}

function origin(remote: string | null, repo: Repo): GithubRepo {
  const url = remote?.trim() ?? null;
  if (url === null) {
    throw new DaemonError(`${repo.name} has no origin remote`, {
      code: "remote-missing",
      hint: "Add one: `git remote add origin <url>`.",
    });
  }
  const parsed = parseGithubRemote(url);
  if (parsed === null) {
    throw new DaemonError(`origin is ${url}, which is not a GitHub remote`, {
      code: "remote-not-github",
      hint: "Create PR works with GitHub remotes; push and open the PR by hand.",
    });
  }
  return parsed;
}

function noBranch(task: Task): DaemonError {
  return new DaemonError(`task ${task.id} has no branch, so there is nothing to open a PR from`, {
    code: "repo-not-git",
    hint: "A task agn started has a branch of its own; this one works in the checkout itself.",
  });
}

function branchIsBase(branch: string): DaemonError {
  return new DaemonError(`${branch} is what this repo branches from, so a PR would target itself`, {
    code: "branch-is-base",
    hint: "Move the work onto a branch of its own, then try again.",
  });
}

function branchEmpty(branch: string, dir: string): DaemonError {
  return new DaemonError(`${branch} has no commits of its own`, {
    code: "branch-empty",
    hint: `Wait for the agent to commit, or commit in ${dir}.`,
  });
}
