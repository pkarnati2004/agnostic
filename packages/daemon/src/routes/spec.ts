import { SpecRequestSchema, type SpecResponse } from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";
import { resolveRepoId } from "../resolve-id.js";
import { runSpecWriter } from "../spec-writer.js";

/**
 * A spec for a task that does not exist yet. Nothing is inserted, no event is appended and no
 * session is started: the answer is the user's to edit, and `POST /repos/:id/tasks` carries the
 * text they approved (ADR 028).
 */
export function specRoutes(ctx: DaemonContext): Hono {
  return new Hono().post("/repos/:id/spec", async (c) => {
    const parsed = SpecRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw requestInvalid(parsed.error);
    }
    const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
    const body: SpecResponse = await runSpecWriter(ctx, repo, parsed.data);
    return c.json(body);
  });
}
