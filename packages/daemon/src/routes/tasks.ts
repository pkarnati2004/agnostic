import {
  isDirectory,
  RunTaskRequestSchema,
  type Task,
  TaskListQuerySchema,
  type TaskListResponse,
  type TaskListRow,
  type TaskResponse,
} from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";
import { resolveRepoId, resolveTaskId } from "../resolve-id.js";
import { startTask } from "../start-task.js";
import { taskActionRoutes } from "./task-actions.js";

export function taskRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/tasks", async (c) => {
      await ctx.lifecycle.reconcileAll();
      return c.json(await listed(ctx, c.req.query(), null));
    })
    .get("/repos/:id/tasks", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      await ctx.lifecycle.reconcileAll();
      return c.json(await listed(ctx, c.req.query(), repo.id));
    })
    .post("/repos/:id/tasks", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      const parsed = RunTaskRequestSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const body: TaskResponse = { task: await startTask(ctx, repo, parsed.data) };
      return c.json(body, 201);
    })
    .get("/tasks/:id", async (c) => {
      const task = resolveTaskId(ctx.ledger, c.req.param("id"));
      const body: TaskResponse = { task: await ctx.lifecycle.reconcile(task) };
      return c.json(body);
    })
    .route("/", taskActionRoutes(ctx));
}

/** Newest first, over one repo or all of them; the ledger's own order is what the list shows. */
async function listed(
  ctx: DaemonContext,
  query: Record<string, string>,
  repoId: string | null,
): Promise<TaskListResponse> {
  const parsed = TaskListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw requestInvalid(parsed.error);
  }
  const filter = {
    ...(repoId === null ? {} : { repoId }),
    ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
  };
  // One read transaction, cursor first: the rows are then never older than the cursor the page
  // resumes `/events` from, and an event that lands between the two is replayed (ADR 030).
  const snapshot = ctx.ledger.transaction(() => {
    const cursor = ctx.ledger.events.latestId();
    return { tasks: ctx.ledger.tasks.list(filter), cursor };
  });
  return { tasks: await Promise.all(snapshot.tasks.map(row)), cursor: snapshot.cursor };
}

/**
 * Whether the worktree the task ran in is on disk, checked outside the transaction so the stats do
 * not hold the database. A folder or adopted task never had one, so it is never present.
 */
async function row(task: Task): Promise<TaskListRow> {
  const worktreePresent = task.worktreePath !== null && (await isDirectory(task.worktreePath));
  return { ...task, worktreePresent };
}
