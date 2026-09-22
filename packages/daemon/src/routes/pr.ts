import { CreatePrRequestSchema, type CreatePrResponse } from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { createPr } from "../create-pr.js";
import { requestInvalid } from "../error.js";
import { requestBody } from "../request-body.js";
import { resolveRepoId, resolveTaskId } from "../resolve-id.js";

/** The one route that writes to a remote: the branch is pushed, then its pull request is opened. */
export function prRoutes(ctx: DaemonContext): Hono {
  return new Hono().post("/tasks/:id/pr", async (c) => {
    const parsed = CreatePrRequestSchema.safeParse(await requestBody(c.req.raw));
    if (!parsed.success) {
      throw requestInvalid(parsed.error);
    }
    const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
    const repo = resolveRepoId(ctx.ledger, task.repoId);
    const body: CreatePrResponse = await createPr(ctx, repo, task, parsed.data);
    return c.json(body, 201);
  });
}
