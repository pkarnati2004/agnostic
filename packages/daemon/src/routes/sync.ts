import {
  InitRequestSchema,
  type InitResponse,
  SyncRequestSchema,
  type SyncResponse,
} from "@agnostic/core";
import { applyInitPlan, planInit, readInitInputs } from "@agnostic/sync";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";
import { resolveRepoId } from "../resolve-id.js";
import { syncRepo } from "../sync-repo.js";

export function syncRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .post("/repos/:id/init", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      // No body at all is the common case: `agn init` with no flags.
      const parsed = InitRequestSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const plan = planInit(await readInitInputs(repo.path, repo.id), {
        from: parsed.data.from ?? null,
        force: parsed.data.force === true,
      });
      await applyInitPlan(repo.path, plan);
      const body: InitResponse = { writes: plan.writes };
      return c.json(body);
    })
    .post("/repos/:id/sync", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      const parsed = SyncRequestSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const body: SyncResponse = await syncRepo(repo.path, parsed.data);
      return c.json(body);
    });
}
