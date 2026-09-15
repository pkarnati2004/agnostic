import {
  RunTaskRequestSchema,
  TaskListQuerySchema,
  type TaskListResponse,
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
      return c.json(listed(ctx, c.req.query(), null));
    })
    .get("/repos/:id/tasks", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      await ctx.lifecycle.reconcileAll();
      return c.json(listed(ctx, c.req.query(), repo.id));
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
function listed(
  ctx: DaemonContext,
  query: Record<string, string>,
  repoId: string | null,
): TaskListResponse {
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
  return ctx.ledger.transaction(() => {
    const cursor = ctx.ledger.events.latestId();
    return { tasks: ctx.ledger.tasks.list(filter), cursor };
  });
}
