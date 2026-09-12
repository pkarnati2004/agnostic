import {
  AdoptRequestSchema,
  SessionsQuerySchema,
  type SessionsResponse,
  type TaskResponse,
} from "@agnostic/core";
import { Hono } from "hono";
import { adoptTask, listSessions } from "../adopt-task.js";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";
import { resolveRepoId } from "../resolve-id.js";

/** Two calls, so the candidates `agn adopt` shows travel as data and never inside an error. */
export function adoptRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/repos/:id/sessions", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      const query = SessionsQuerySchema.safeParse(c.req.query());
      if (!query.success) {
        throw requestInvalid(query.error);
      }
      const body: SessionsResponse = { sessions: await listSessions(ctx, repo, query.data.path) };
      return c.json(body);
    })
    .post("/repos/:id/adopt", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      const parsed = AdoptRequestSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const body: TaskResponse = { task: await adoptTask(ctx, repo, parsed.data) };
      return c.json(body, 201);
    });
}
