import {
  RegisterRepoRequestSchema,
  type RegisterRepoResponse,
  type RepoListResponse,
} from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";
import { registerRepo } from "../register-repo.js";

export function repoRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/repos", (c) => {
      const body: RepoListResponse = { repos: ctx.ledger.repos.list() };
      return c.json(body);
    })
    .post("/repos", async (c) => {
      // A body that is not JSON at all is the same mistake as a body with the wrong fields.
      const parsed = RegisterRepoRequestSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const body: RegisterRepoResponse = await registerRepo(ctx.ledger, ctx.paths, parsed.data);
      return c.json(body, body.created ? 201 : 200);
    });
}
