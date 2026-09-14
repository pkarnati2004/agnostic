import type { OutcomeResponse } from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { resolveTaskId } from "../resolve-id.js";
import { refreshVerdict } from "../verdict-sweep.js";

/**
 * One task's outcome, with its verdict rechecked first so a branch merged a minute ago reads as
 * accepted without waiting for the sweep. A task that has not closed answers 200 with a null
 * outcome: "not yet" is an answer, not an error (ADR 022).
 */
export function outcomeRoutes(ctx: DaemonContext): Hono {
  return new Hono().get("/tasks/:id/outcome", async (c) => {
    const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, c.req.param("id")));
    // A git read that fails leaves the stored row as it was; it never fails the request.
    await refreshVerdict(ctx, task).catch((cause: unknown) => {
      ctx.log.error("outcome not recorded", { taskId: task.id, message: reason(cause) });
    });
    const body: OutcomeResponse = { task, outcome: ctx.ledger.outcomes.get(task.id) };
    return c.json(body);
  });
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
