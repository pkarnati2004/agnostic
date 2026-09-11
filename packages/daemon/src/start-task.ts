import {
  composeLaunchPrompt,
  type LaunchPromptInput,
  newId,
  type Profile,
  type Repo,
  type RepoConfig,
  type RunTaskRequest,
  readAgText,
  readRepoConfig,
  type Task,
  type TaskNote,
  taskLogPath,
  worktreePath,
  writeTaskNote,
} from "@agnostic/core";
import { launchSpec } from "@agnostic/registry";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { detectRepoKind } from "./repo-kind.js";
import { resolveProfile } from "./resolve-profile.js";
import { syncTaskNote } from "./task-note-sync.js";

const TITLE_MAX_CHARS = 80;
const OPEN: Task["status"][] = ["queued", "running", "waiting"];

/**
 * One run, from the queued row to the live session. The row and its note exist before the worktree
 * does, so a daemon that dies during a long `setup_command` leaves a task `agn resume` can pick up
 * (ADR 014). Anything that fails after the row exists leaves the task failed, never queued.
 */
export async function startTask(
  ctx: DaemonContext,
  registered: Repo,
  req: RunTaskRequest,
): Promise<Task> {
  const repo = await withCurrentKind(ctx, registered);
  if (repo.kind === "folder") {
    // A task that died while nobody was watching must not hold the folder; the guard itself runs
    // with the insert, below.
    await ctx.lifecycle.reconcileAll();
  }
  const profile = await resolveProfile(ctx, repo, req);
  const config = await readRepoConfig(repo.path);
  const task = insertQueued(ctx, repo, req, profile.id);
  try {
    return await launch(ctx, repo, task, { profile, config, base: req.base ?? null });
  } catch (cause) {
    await syncTaskNote(repo.path, ctx.ledger.tasks.setStatus(task.id, "failed"), ctx.log);
    throw cause;
  }
}

/** `git init` in a folder workspace takes effect on the next run, so the kind is read again here. */
async function withCurrentKind(ctx: DaemonContext, repo: Repo): Promise<Repo> {
  const kind = await detectRepoKind(repo.path);
  return kind === repo.kind ? repo : ctx.ledger.repos.update(repo.id, { kind });
}

/** ADR 001: a folder workspace has one working tree, so it runs one task at a time. */
function assertFolderFree(ctx: DaemonContext, repo: Repo): void {
  const busy = ctx.ledger.tasks.list({ repoId: repo.id, status: OPEN });
  if (busy.length === 0) {
    return;
  }
  throw new DaemonError(
    "folder workspaces run one task at a time; git init to run tasks in parallel.",
    {
      code: "folder-busy",
      hint: `Run \`agn stop ${busy[0]?.id}\` first, or \`git init\` in ${repo.path}.`,
    },
  );
}

/**
 * The folder guard and the row it protects are one SQLite transaction, which better-sqlite3 runs
 * synchronously: two runs arriving on the same folder at once cannot both see an empty list.
 */
function insertQueued(
  ctx: DaemonContext,
  repo: Repo,
  req: RunTaskRequest,
  profileId: string,
): Task {
  const id = newId();
  const now = new Date().toISOString();
  return ctx.ledger.transaction(() => {
    if (repo.kind === "folder") {
      assertFolderFree(ctx, repo);
    }
    return ctx.ledger.tasks.insert({
      id,
      repoId: repo.id,
      title: req.title ?? titleFrom(req.prompt),
      prompt: req.prompt,
      profileId,
      worktreePath: repo.kind === "git" ? worktreePath(ctx.paths, repo.id, id) : null,
      branch: null,
      status: "queued",
      origin: "agn",
      createdAt: now,
      updatedAt: now,
    });
  });
}

type LaunchOptions = { profile: Profile; config: RepoConfig | null; base: string | null };

async function launch(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  opts: LaunchOptions,
): Promise<Task> {
  const note = noteFor(task);
  await writeTaskNote(repo.path, note);
  const prepared = await ctx.executor.prepare({
    task,
    repo,
    base: await resolveBase(ctx, opts),
    branchPrefix: opts.config?.branchPrefix ?? null,
    setupCommand: opts.config?.setupCommand ?? null,
    logFile: taskLogPath(ctx.paths, task.id),
  });
  const prompt = composeLaunchPrompt(
    await promptInput(ctx, repo, { ...task, branch: prepared.branch }, note),
  );
  // A profile on the local route is launched against whichever server detection found serving it.
  const { servers } = await ctx.detection.current();
  const spec = launchSpec(opts.profile, { prompt, env: ctx.env, servers });
  const handle = await ctx.executor.launch({
    taskId: task.id,
    cwd: prepared.cwd,
    command: {
      command: spec.command,
      args: spec.args,
      env: { ...ctx.env, ...spec.env },
      promptAfterStart: spec.promptAfterStart,
    },
  });
  return ctx.ledger.tasks.start(task.id, {
    branch: prepared.branch,
    session: {
      harness: opts.profile.harness,
      // Chunk 9's hooks report the harness's own session id; a launch has nothing to record yet.
      sessionId: null,
      tmuxSession: handle.tmuxSession,
      tmuxSocket: handle.tmuxSocket,
      cwd: handle.cwd,
      lastSeenAt: new Date().toISOString(),
    },
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

async function promptInput(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  note: TaskNote,
): Promise<LaunchPromptInput> {
  const done = ctx.ledger.tasks.list({ repoId: repo.id, status: "done", limit: 5 });
  return {
    task,
    note,
    done: done.map((row) => ({ task: row, outcome: ctx.ledger.outcomes.get(row.id) })),
    inFlight: ctx.ledger.tasks
      .list({ repoId: repo.id, status: OPEN })
      .filter((row) => row.id !== task.id),
    decisions: await readAgText(repo.path, "decisions.md"),
    // Chunk 13 writes handoffs; a task started by `agn run` never has one.
    handoff: null,
  };
}

function noteFor(task: Task): TaskNote {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    profileId: task.profileId,
    createdAt: task.createdAt,
    parentTaskId: task.parentTaskId ?? null,
    spec: task.prompt,
    acceptance: null,
    notes: null,
    handoffs: [],
  };
}

/** The first line of the prompt, cut at a width a task list can print. */
function titleFrom(prompt: string): string {
  const first = prompt.split("\n")[0]?.trim() ?? "";
  const title = first.length > TITLE_MAX_CHARS ? first.slice(0, TITLE_MAX_CHARS).trimEnd() : first;
  return title === "" ? "untitled task" : title;
}
