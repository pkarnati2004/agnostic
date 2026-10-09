import {
  demoteSectionHeadings,
  newId,
  type Prepared,
  type Profile,
  type Recommendation,
  type Repo,
  type RepoConfig,
  type RunTaskRequest,
  readRepoConfig,
  type Task,
  type TaskNote,
  taskLogPath,
  worktreePath,
  writeTaskNote,
} from "@agnostic/core";
import { RecommenderError, recommend } from "@agnostic/recommender";
import type { DaemonContext } from "./app.js";
import { assertWithinBudget } from "./budget-guard.js";
import { recordTestsBefore } from "./close-outcome.js";
import { DaemonError } from "./error.js";
import { assertFolderFree } from "./folder-guard.js";
import { ensureHooks } from "./hooks-install.js";
import { initialTaskNote } from "./initial-task-note.js";
import { freshLaunchCommand } from "./launch-command.js";
import { buildRecommendInput } from "./recommend-input.js";
import { assertRepoUsable } from "./repo-guard.js";
import { detectRepoKind } from "./repo-kind.js";
import { resolveProfile } from "./resolve-profile.js";
import { ensureSynced } from "./sync-repo.js";
import { syncTaskNote } from "./task-note-sync.js";
import { launchedSession } from "./task-session.js";
import { titleFromPrompt } from "./task-title.js";
import { runTestCommand } from "./test-command.js";

/** What `agn compare` adds to a run: the group its siblings share, stamped on the queued row. */
export type StartOptions = { compareId?: string };

type QueuedRow = {
  profileId: string;
  recommendation: Recommendation | null;
  /** Null for every run but a compare's; `task.created` carries it, so the page learns the group. */
  compareId: string | null;
};

/**
 * One run, from the queued row to the live session. The row and its note exist before the worktree
 * does, so a daemon that dies during a long `setup_command` leaves a row that explains itself; the
 * next daemon fails it at start, because nothing is left to launch it. Anything that fails after
 * the row exists leaves the task failed, never queued.
 */
export async function startTask(
  ctx: DaemonContext,
  registered: Repo,
  req: RunTaskRequest,
  opts: StartOptions = {},
): Promise<Task> {
  // Before the kind is re-detected: detecting the kind of a path that is not there is meaningless.
  await assertRepoUsable(registered);
  const repo = await withCurrentKind(ctx, registered);
  if (repo.kind === "folder") {
    // A task that died while nobody was watching must not hold the folder; the guard itself runs
    // with the insert, below.
    await ctx.lifecycle.reconcileAll();
  }
  const recommendation = await recommendFor(ctx, repo, req);
  // The recommendation is also the last fallback for a run with no --profile and no default.
  const profile = await resolveProfile(
    ctx,
    repo,
    req,
    recommendation?.recommended.profileId ?? null,
  );
  // Before the row exists: a refused run leaves nothing behind for the user to clean up.
  await assertWithinBudget(ctx, profile, req.ignoreBudget === true);
  const config = await readRepoConfig(repo.path);
  const task = insertQueued(ctx, repo, req, {
    profileId: profile.id,
    recommendation,
    compareId: opts.compareId ?? null,
  });
  return await launchQueued(ctx, repo, task, {
    profile,
    config,
    base: req.base ?? null,
    // A `## ` line would split the note into a section agn cannot read, in an approved spec or in
    // a prompt standing in for one, so both go through the demotion.
    note: initialTaskNote(
      task,
      demoteSectionHeadings(req.spec ?? task.prompt),
      req.acceptance === undefined ? null : demoteSectionHeadings(req.acceptance),
    ),
    skipTests: req.skipTests === true,
  });
}

/**
 * Every task records what agn would have picked, even when the user named a profile: the two
 * together are what the recommender learns from. A machine with nothing eligible can still run a profile
 * the user named, so a refusal here is logged and the run goes on.
 */
async function recommendFor(
  ctx: DaemonContext,
  repo: Repo,
  req: RunTaskRequest,
): Promise<Recommendation | null> {
  const input = await buildRecommendInput(ctx, repo, req.prompt, {
    ...(req.intent === undefined ? {} : { intent: req.intent }),
  });
  try {
    return recommend(input);
  } catch (cause) {
    if (cause instanceof RecommenderError) {
      ctx.log.warn("no profile could be recommended", { message: cause.message });
      return null;
    }
    throw cause;
  }
}

/** `git init` in a folder repo takes effect on the next run, so the kind is read again here. */
export async function withCurrentKind(ctx: DaemonContext, repo: Repo): Promise<Repo> {
  const kind = await detectRepoKind(repo.path);
  return kind === repo.kind ? repo : ctx.ledger.repos.update(repo.id, { kind });
}

/**
 * The folder guard and the row it protects are one SQLite transaction, which better-sqlite3 runs
 * synchronously: two runs arriving on the same folder at once cannot both see an empty list.
 */
function insertQueued(ctx: DaemonContext, repo: Repo, req: RunTaskRequest, of: QueuedRow): Task {
  const { profileId, recommendation } = of;
  const id = newId();
  const now = new Date().toISOString();
  return ctx.ledger.transaction(() => {
    assertFolderFree(ctx.ledger, repo);
    const task = ctx.ledger.tasks.insert({
      id,
      repoId: repo.id,
      title: req.title ?? titleFromPrompt(req.prompt),
      prompt: req.prompt,
      profileId,
      worktreePath: repo.kind === "git" ? worktreePath(ctx.paths, repo.id, id) : null,
      branch: null,
      status: "queued",
      origin: "agn",
      baseCommit: null,
      compareId: of.compareId,
      createdAt: now,
      updatedAt: now,
      ...(recommendation === null ? {} : { recommendation }),
    });
    if (recommendation !== null) {
      // `chosenProfileId` is what the task actually started on, which is the pick unless the
      // user overrode it; that difference is the whole value of the row.
      ctx.ledger.events.append({
        ts: now,
        taskId: id,
        repoId: repo.id,
        kind: "recommendation.made",
        payload: { recommendation, chosenProfileId: profileId },
      });
    }
    return task;
  });
}

type LaunchOptions = {
  profile: Profile;
  config: RepoConfig | null;
  base: string | null;
  note: TaskNote;
  /** `agn run --skip-tests`: no baseline is measured and `testsBefore` stays null (ADR 022). */
  skipTests?: boolean;
};

/**
 * A queued row becomes a live session: `agn run` and `agn handoff` differ only in the note they
 * write and where they branch from, and both leave a task that could not be launched failed.
 */
export async function launchQueued(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  opts: LaunchOptions,
): Promise<Task> {
  try {
    return await launch(ctx, repo, task, opts);
  } catch (cause) {
    await syncTaskNote(repo.path, ctx.ledger.tasks.setStatus(task.id, "failed"), ctx.log);
    throw cause;
  }
}

async function launch(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  opts: LaunchOptions,
): Promise<Task> {
  await writeTaskNote(repo.path, opts.note);
  const prepared = await ctx.executor.prepare({
    task,
    repo,
    base: await resolveBase(ctx, opts),
    // A first run has no branch to keep: the name comes from the title and the repo's prefix.
    branch: null,
    branchPrefix: opts.config?.branchPrefix ?? null,
    setupCommand: opts.config?.setupCommand ?? null,
    logFile: taskLogPath(ctx.paths, task.id),
  });
  recordTestsBefore(ctx, task, await testsBefore(ctx, repo, task, prepared, opts));
  // The worktree exists now: its own `.ag/instructions.md` is what the generated files there are
  // made from, and it is the directory the harness reads its hooks from.
  await ensureSynced(ctx, repo, prepared.cwd);
  await ensureHooks(ctx, opts.profile.harness, prepared.cwd);
  const command = await freshLaunchCommand(
    ctx,
    repo,
    { ...task, branch: prepared.branch },
    opts.profile,
  );
  const handle = await ctx.executor.launch({ taskId: task.id, cwd: prepared.cwd, command });
  return ctx.ledger.tasks.start(task.id, {
    branch: prepared.branch,
    baseCommit: prepared.baseCommit,
    // Chunk 9's hooks report the harness's own session id; a first launch has none to record.
    session: launchedSession(opts.profile.harness, handle, null),
  });
}

/**
 * The baseline the agent's work is judged against, run in the worktree before the harness starts
 * (ADR 022). Another task off the same commit has already answered this question, so the ledger's
 * answer is reused and the agent launches at once.
 */
async function testsBefore(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  prepared: Prepared,
  opts: LaunchOptions,
): Promise<boolean | null> {
  const command = opts.config?.testCommand ?? null;
  if (command === null || opts.skipTests === true) {
    return null;
  }
  const cached =
    prepared.baseCommit === null
      ? null
      : ctx.ledger.outcomes.testedAtCommit(repo.id, prepared.baseCommit);
  if (cached !== null) {
    return cached;
  }
  return await runTestCommand({
    command,
    cwd: prepared.cwd,
    logFile: taskLogPath(ctx.paths, task.id),
    log: ctx.log,
  });
}

/** `--base` wins over `base_branch`, and a task id means "continue from that task's branch". */
async function resolveBase(ctx: DaemonContext, opts: LaunchOptions): Promise<string | null> {
  const base = opts.base;
  if (base === null) {
    return opts.config?.baseBranch ?? null;
  }
  const task = ctx.ledger.tasks.get(base);
  if (task === null) {
    return base;
  }
  if (task.branch === null) {
    throw new DaemonError(`task ${task.id} has no branch to start from`, {
      code: "base-invalid",
      hint: "Only a task that ran in a worktree can be a base; pass a git ref instead.",
    });
  }
  return task.branch;
}
