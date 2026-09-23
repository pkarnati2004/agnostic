import {
  type CompareResponse,
  PickCompareRequestSchema,
  type PickCompareResponse,
  StartCompareRequestSchema,
  type StartCompareResponse,
} from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { pickCompare } from "../compare-pick.js";
import { readCompare } from "../compare-read.js";
import { startCompare } from "../compare-start.js";
import { requestInvalid } from "../error.js";
import { requestBody } from "../request-body.js";
import { resolveRepoId } from "../resolve-id.js";

/** `agn compare`: start the siblings, read them side by side, keep one. */
export function compareRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .post("/repos/:id/compare", async (c) => {
      const repo = resolveRepoId(ctx.ledger, c.req.param("id"));
      const parsed = StartCompareRequestSchema.safeParse(await requestBody(c.req.raw));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const body: StartCompareResponse = await startCompare(ctx, repo, parsed.data);
      return c.json(body, 201);
    })
    .get("/compares/:id", async (c) => {
      const body: CompareResponse = await readCompare(ctx, c.req.param("id"));
      return c.json(body);
    })
    .post("/compares/:id/pick", async (c) => {
      const parsed = PickCompareRequestSchema.safeParse(await requestBody(c.req.raw));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      const body: PickCompareResponse = await pickCompare(
        ctx,
        c.req.param("id"),
        parsed.data.taskId,
      );
      return c.json(body);
    });
}
