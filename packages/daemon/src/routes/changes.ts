import { type ChangesResponse, DiffQuerySchema, type DiffResponse } from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";
import { resolveRepoId, resolveTaskId } from "../resolve-id.js";
import { taskChanges } from "../task-changes.js";
import { taskDiff } from "../task-diff.js";

/** What the right panel reads: the file list a task's branch changed, and one file's patch. */
export function changesRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/tasks/:id/changes", async (c) => {
      const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      const repo = resolveRepoId(ctx.ledger, task.repoId);
      const body: ChangesResponse = await taskChanges(ctx, repo, task);
      return c.json(body);
    })
    .get("/tasks/:id/diff", async (c) => {
      const query = DiffQuerySchema.safeParse(c.req.query());
      if (!query.success) {
        throw requestInvalid(query.error);
      }
      const task = resolveTaskId(ctx.ledger, c.req.param("id"));
      const repo = resolveRepoId(ctx.ledger, task.repoId);
      const body: DiffResponse = await taskDiff(ctx, repo, task, query.data.path);
      return c.json(body);
    });
}
