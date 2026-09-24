import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_DESIGN_FOLDER,
  demoteSectionHeadings,
  designProfileId,
  type Repo,
  type RepoConfig,
  type RunTaskRequest,
  readRepoConfig,
  type Task,
  type TaskNote,
  taskLogPath,
  writeTaskNote,
} from "@agnostic/core";
import { type DesignToolEntry, designToolEntry } from "@agnostic/registry";
import type { DaemonContext } from "./app.js";
import { readDaemonConfig } from "./daemon-config.js";
import { DaemonError } from "./error.js";
import { initialTaskNote } from "./initial-task-note.js";
import { assertRepoUsable } from "./repo-guard.js";
import { insertQueued, resolveBase, withCurrentKind } from "./start-task.js";
import { ensureSynced } from "./sync-repo.js";
import { syncTaskNote } from "./task-note-sync.js";

type DesignRun = { tool: DesignToolEntry; folder: string; config: RepoConfig | null };

/**
 * ADR 036 Q15: a design task is a task with no agent. It gets everything a run gets - a worktree,
 * a branch, a row, a note - and then waits, because the work happens in a design tool with a
 * human in it. Nothing is recommended and nothing is billed, so neither the recommender nor the
 * budget guard is asked. `agn stop` is what finishes it.
 */
export async function startDesignTask(
  ctx: DaemonContext,
  registered: Repo,
  req: RunTaskRequest,
): Promise<Task> {
  assertNoProfile(req);
  await assertRepoUsable(registered);
  const repo = await withCurrentKind(ctx, registered);
  if (repo.kind === "folder") {
    // As a run does: a task that died unnoticed must not hold the folder against this one.
    await ctx.lifecycle.reconcileAll();
  }
  const config = await readRepoConfig(repo.path);
  const run: DesignRun = {
    tool: designToolEntry((await readDaemonConfig(ctx.paths)).designTool),
    folder: config?.designFolder ?? DEFAULT_DESIGN_FOLDER,
    config,
  };
  const task = insertQueued(ctx, repo, req, {
    profileId: designProfileId(run.tool.id),
    recommendation: null,
    compareId: null,
  });
  try {
    return await prepare(ctx, repo, task, req, run);
  } catch (cause) {
    // launchQueued's rule: anything that fails after the row exists leaves the task failed.
    await syncTaskNote(repo.path, ctx.ledger.tasks.setStatus(task.id, "failed"), ctx.log);
    throw cause;
  }
}

/** The note, the worktree, the design folder and the generated files, then the waiting row. */
async function prepare(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  req: RunTaskRequest,
  run: DesignRun,
): Promise<Task> {
  await writeTaskNote(repo.path, designNote(task, req, run));
  const prepared = await ctx.executor.prepare({
    task,
    repo,
    base: await resolveBase(ctx, req.base ?? null, run.config),
    branch: null,
    branchPrefix: run.config?.branchPrefix ?? null,
    setupCommand: run.config?.setupCommand ?? null,
    logFile: taskLogPath(ctx.paths, task.id),
  });
  // Empty, with no .gitkeep: what the tool writes here is what the branch ends up carrying.
  await mkdir(join(prepared.cwd, run.folder), { recursive: true });
  await ensureSynced(ctx, repo, prepared.cwd);
  return ctx.ledger.tasks.startWaiting(task.id, {
    branch: prepared.branch,
    baseCommit: prepared.baseCommit,
  });
}

/** The same note a run writes, plus the one line that says where the design work goes. */
function designNote(task: Task, req: RunTaskRequest, run: DesignRun): TaskNote {
  const note = initialTaskNote(
    task,
    demoteSectionHeadings(req.spec ?? task.prompt),
    req.acceptance === undefined ? null : demoteSectionHeadings(req.acceptance),
  );
  return { ...note, notes: `Design task: ${run.tool.name}. Files go in ${run.folder}/.` };
}

/** A design task runs in a tool, so naming a profile or a model for it asks for two things. */
function assertNoProfile(req: RunTaskRequest): void {
  if (req.profile === undefined && req.model === undefined) {
    return;
  }
  throw new DaemonError("a design task runs in a design tool, not on a profile", {
    code: "design-no-profile",
    hint: "Drop --profile; set `design_tool` in ~/.agnostic/config.yaml to choose the tool.",
  });
}
