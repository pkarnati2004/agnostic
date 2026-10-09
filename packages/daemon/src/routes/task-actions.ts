import {
  type AttachResponse,
  CleanTaskRequestSchema,
  type CleanTaskResponse,
  type DeleteTaskResponse,
  HandoffTaskRequestSchema,
  type HandoffTaskResponse,
  isDirectory,
  isLive,
  type Repo,
  type ResumeTaskResponse,
  type Task,
  type TaskResponse,
} from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { deleteTask } from "../delete-task.js";
import { DaemonError, requestInvalid } from "../error.js";
import { handoffTask } from "../handoff-task.js";
import { requestBody } from "../request-body.js";
import { resolveRepoId, resolveTaskId } from "../resolve-id.js";
import { resumeTask } from "../resume-task.js";
import { attachableHandle } from "../task-session.js";
import { unsavedWork } from "../worktree-unsaved.js";

/** What `agn attach`, `agn resume`, `agn handoff`, `agn stop`, `agn clean` and `agn task delete` do. */
export function taskActionRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/tasks/:id/attach", async (c) => {
      const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      const handle = await attachableHandle(ctx.executor, task);
      const body: AttachResponse = { task, attach: ctx.executor.attach(handle) };
      return c.json(body);
    })
    .post("/tasks/:id/resume", async (c) => {
      const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      const body: ResumeTaskResponse = await resumeTask(ctx, task);
      return c.json(body);
    })
    .post("/tasks/:id/handoff", async (c) => {
      const parsed = HandoffTaskRequestSchema.safeParse(await requestBody(c.req.raw));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const parent = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      const response: HandoffTaskResponse = await handoffTask(ctx, parent, parsed.data);
      return c.json(response, 201);
    })
    .post("/tasks/:id/stop", async (c) => {
      const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      const body: TaskResponse = { task: await ctx.lifecycle.stop(task) };
      return c.json(body);
    })
    .post("/tasks/:id/clean", async (c) => {
      const parsed = CleanTaskRequestSchema.safeParse(await requestBody(c.req.raw));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      // The close work reads the worktree this is about to remove, so it finishes first.
      await ctx.lifecycle.settled(task.id);
      const repo = resolveRepoId(ctx.ledger, task.repoId);
      const response: CleanTaskResponse = await clean(ctx, repo, task, {
        deleteBranch: parsed.data.deleteBranch === true,
        force: parsed.data.force === true,
      });
      return c.json(response);
    })
    .delete("/tasks/:id", async (c) => {
      const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      const body: DeleteTaskResponse = await deleteTask(ctx, task);
      return c.json(body);
    });
}

/**
 * Removing the worktree is the executor's job; recording that agn removed it is the ledger's, so
 * the verdict can tell a cleaned worktree from one a person deleted by hand (ADR 014).
 */
async function clean(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  opts: { deleteBranch: boolean; force: boolean },
): Promise<CleanTaskResponse> {
  if (isLive(task.status)) {
    throw new DaemonError(`task ${task.id} is still ${task.status}`, {
      code: "task-active",
      hint: `Run \`agn stop ${task.id}\` first.`,
    });
  }
  if (task.worktreePath === null || !(await isDirectory(task.worktreePath))) {
    return { task, removed: false };
  }
  // The same check the verdict sweep makes: removing a worktree discards whatever no commit holds.
  const unsaved = opts.force ? null : await unsavedWork(task.worktreePath);
  if (unsaved !== null) {
    throw new DaemonError(`the worktree for task ${task.id} was not removed: ${unsaved}`, {
      code: "worktree-unsaved",
      hint: `Commit or stash in ${task.worktreePath}, or run \`agn clean ${task.id} --force\` to discard it.`,
    });
  }
  await ctx.executor.clean({ task, repo, deleteBranch: opts.deleteBranch });
  return { task: ctx.ledger.tasks.clean(task.id, opts.deleteBranch), removed: true };
}
