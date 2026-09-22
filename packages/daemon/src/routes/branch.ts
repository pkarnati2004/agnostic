import {
  CreatePrRequestSchema,
  type CreatePrResponse,
  type UpdateTaskResponse,
} from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { createPr } from "../create-pr.js";
import { requestInvalid } from "../error.js";
import { requestBody } from "../request-body.js";
import { resolveRepoId, resolveTaskId } from "../resolve-id.js";
import { updateTask } from "../update-task.js";

/** What can be asked of a task's branch: a pull request, and a turn that brings it up to date. */
export function branchRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .post("/tasks/:id/pr", async (c) => {
      const parsed = CreatePrRequestSchema.safeParse(await requestBody(c.req.raw));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      const repo = resolveRepoId(ctx.ledger, task.repoId);
      const body: CreatePrResponse = await createPr(ctx, repo, task, parsed.data);
      return c.json(body, 201);
    })
    .post("/tasks/:id/update", async (c) => {
      // Reconciled first, as a resume is: a row the ledger has written off may still be running.
      const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
      const repo = resolveRepoId(ctx.ledger, task.repoId);
      const body: UpdateTaskResponse = await updateTask(ctx, repo, task);
      return c.json(body);
    });
}
