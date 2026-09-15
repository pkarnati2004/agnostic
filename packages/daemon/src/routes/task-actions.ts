import { stat } from "node:fs/promises";
import {
  type AttachResponse,
  CleanTaskRequestSchema,
  type CleanTaskResponse,
  HandoffTaskRequestSchema,
  type HandoffTaskResponse,
  type Repo,
  type ResumeTaskResponse,
  type Task,
  type TaskResponse,
} from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { DaemonError, requestInvalid } from "../error.js";
import { handoffTask } from "../handoff-task.js";
import { resolveRepoId, resolveTaskId } from "../resolve-id.js";
import { resumeTask } from "../resume-task.js";
import { attachableHandle } from "../task-session.js";

/** What `agn attach`, `agn resume`, `agn handoff`, `agn stop` and `agn clean` do to a task. */
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
      const parsed = HandoffTaskRequestSchema.safeParse(await body(c.req.raw));
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
      const parsed = CleanTaskRequestSchema.safeParse(await body(c.req.raw));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      // The close work reads the worktree this is about to remove, so it finishes first.
      await ctx.lifecycle.settled(task.id);
      const repo = resolveRepoId(ctx.ledger, task.repoId);
      const response: CleanTaskResponse = await clean(
        ctx,
        repo,
        task,
        parsed.data.deleteBranch === true,
      );
      return c.json(response);
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
  deleteBranch: boolean,
): Promise<CleanTaskResponse> {
  if (task.status === "running" || task.status === "waiting") {
    throw new DaemonError(`task ${task.id} is still ${task.status}`, {
      code: "task-active",
      hint: `Run \`agn stop ${task.id}\` first.`,
    });
  }
  if (task.worktreePath === null || !(await isDirectory(task.worktreePath))) {
    return { task, removed: false };
  }
  await ctx.executor.clean({ task, repo, deleteBranch });
  return { task: ctx.ledger.tasks.clean(task.id, deleteBranch), removed: true };
}

/** A POST with no body at all is the common case for an action with only optional fields. */
async function body(request: Request): Promise<unknown> {
  const text = await request.text().catch(() => "");
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Not json at all: the schema below says so in the same words as every other bad request.
    return null;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
