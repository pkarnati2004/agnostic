import type { DesignOpenedResponse, DesignOpenResponse } from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { openDesignTool, resolveDesignOpen } from "../design-open.js";
import { resolveTaskId } from "../resolve-id.js";

/**
 * The two ways a design task's tool is opened, as ADR 023 has it for editors: the GET resolves
 * the open and the caller runs the command, because a terminal's tool belongs in the user's own
 * login session; the POST is for the page, which has no terminal to run it in.
 */
export function designRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/tasks/:id/design", async (c) => {
      const task = resolveTaskId(ctx.ledger, c.req.param("id"));
      const body: DesignOpenResponse = await resolveDesignOpen(ctx, task);
      return c.json(body);
    })
    .post("/tasks/:id/design/open", async (c) => {
      const task = resolveTaskId(ctx.ledger, c.req.param("id"));
      const body: DesignOpenedResponse = await openDesignTool(ctx, task);
      return c.json(body);
    });
}
