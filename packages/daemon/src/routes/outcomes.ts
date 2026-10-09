import type { OutcomeResponse } from "@agnostic/core";
import { errorMessage } from "@agnostic/core";
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
    // `agn stop` returns as soon as the task is stopped, so the row this reads may still be being
    // written: this is the one request that waits for the usage scan and the outcome behind it.
    await ctx.lifecycle.settled(task.id);
    // A git read that fails leaves the stored row as it was; it never fails the request.
    await refreshVerdict(ctx, task).catch((cause: unknown) => {
      ctx.log.error("outcome not recorded", { taskId: task.id, message: errorMessage(cause) });
    });
    const body: OutcomeResponse = { task, outcome: ctx.ledger.outcomes.get(task.id) };
    return c.json(body);
  });
}
