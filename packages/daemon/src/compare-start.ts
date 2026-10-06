import {
  errorMessage,
  newId,
  type Profile,
  type Repo,
  type RunTaskRequest,
  type StartCompareRequest,
  type StartCompareResponse,
  type Task,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { assertRepoUsable } from "./repo-guard.js";
import { resolveProfile } from "./resolve-profile.js";
import { startTask, withCurrentKind } from "./start-task.js";
import { titleFromPrompt } from "./task-title.js";

/**
 * One prompt on two to four agents, a worktree and a branch each (ADR 036 Q7). Everything that
 * can refuse the compare runs before the first launch: a caller never learns about a group whose
 * agents are already running. The siblings start one after another, because `git worktree add`,
 * the setup command and the tests-before baseline are all sequential today.
 */
export async function startCompare(
  ctx: DaemonContext,
  registered: Repo,
  req: StartCompareRequest,
): Promise<StartCompareResponse> {
  await assertRepoUsable(registered);
  const repo = await withCurrentKind(ctx, registered);
  assertGit(repo);
  const profiles = await resolveDistinct(ctx, repo, req.profiles);
  const compareId = newId();
  const title = req.title ?? titleFromPrompt(req.prompt);
  const tasks: Task[] = [];
  for (const profile of profiles) {
    try {
      tasks.push(await startTask(ctx, repo, runRequest(req, title, profile.id), { compareId }));
    } catch (cause) {
      await stopStarted(ctx, tasks);
      throw cause;
    }
  }
  return { compareId, tasks };
}

/** Every sibling runs the same request but for the profile it is there to try. */
function runRequest(req: StartCompareRequest, title: string, profile: string): RunTaskRequest {
  return {
    prompt: req.prompt,
    title,
    profile,
    ...(req.intent === undefined ? {} : { intent: req.intent }),
    ...(req.spec === undefined ? {} : { spec: req.spec }),
    ...(req.acceptance === undefined ? {} : { acceptance: req.acceptance }),
  };
}

/** A folder repo has one working tree, so its agents would be editing each other's files. */
function assertGit(repo: Repo): void {
  if (repo.kind !== "folder") {
    return;
  }
  throw new DaemonError(
    `a compare runs one worktree per agent; ${repo.name} is a folder repo with one working tree`,
    {
      code: "repo-not-git",
      hint: `Run \`git init\` in ${repo.path}, or \`agn add ${repo.path} --git-init\`.`,
    },
  );
}

/**
 * The profiles the compare will run, in the order asked for. Two entries that resolve to one
 * profile would answer the same question twice, which is the one thing a compare cannot do.
 */
async function resolveDistinct(
  ctx: DaemonContext,
  repo: Repo,
  asked: string[],
): Promise<Profile[]> {
  const profiles: Profile[] = [];
  const seen = new Map<string, string>();
  for (const id of asked) {
    const profile = await resolveProfile(ctx, repo, { profile: id });
    const first = seen.get(profile.id);
    if (first !== undefined) {
      throw new DaemonError(`${first} and ${id} are the same profile ${profile.id}`, {
        code: "compare-profiles-duplicate",
        hint: "Name a different model or harness for each agent.",
      });
    }
    seen.set(profile.id, id);
    profiles.push(profile);
  }
  return profiles;
}

/** A launch that failed leaves its own row failed; the siblings already running are stopped. */
async function stopStarted(ctx: DaemonContext, tasks: Task[]): Promise<void> {
  for (const task of tasks) {
    await ctx.lifecycle.stop(ctx.ledger.tasks.get(task.id) ?? task).catch((cause: unknown) => {
      ctx.log.error("sibling not stopped", { taskId: task.id, message: errorMessage(cause) });
    });
  }
}
