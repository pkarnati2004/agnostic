import {
  type CatalogResponse,
  CatalogRowsQuerySchema,
  type CatalogRowsResponse,
  type CatalogSummary,
  type CatalogUpdateResponse,
} from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { catalogRowsFor } from "../catalog-rows.js";
import { requestInvalid } from "../error.js";

/**
 * What a user does with the catalog: read which one is loaded and when it was last checked, read the
 * rows behind a recommendation, and ask whether a newer catalog has been published. The update is a
 * POST because it reaches off the machine and replaces a file; it answers 200 for every outcome,
 * including "nothing newer". The summary reads state the daemon already holds: no detection, no
 * network.
 */
export function catalogRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/catalog", (c) => {
      const body: CatalogResponse = { catalog: summary(ctx) };
      return c.json(body);
    })
    .get("/catalog/rows", (c) => {
      const query = CatalogRowsQuerySchema.safeParse(c.req.query());
      if (!query.success) {
        throw requestInvalid(query.error);
      }
      const { rows, cited } = catalogRowsFor({
        catalog: ctx.catalog.current().catalog,
        profileId: query.data.profile,
        now: new Date(),
        recommendation: ctx.ledger.events.latest("recommendation.made"),
      });
      const body: CatalogRowsResponse = {
        catalog: summary(ctx),
        profileId: query.data.profile,
        rows,
        cited,
      };
      return c.json(body);
    })
    .post("/catalog/update", async (c) => {
      const update = await ctx.catalogChecker.update();
      const body: CatalogUpdateResponse = { update, catalog: summary(ctx) };
      return c.json(body);
    });
}

function summary(ctx: DaemonContext): CatalogSummary {
  const loaded = ctx.catalog.current();
  return {
    version: loaded.catalog.version,
    generatedAt: loaded.catalog.generatedAt,
    origin: loaded.origin,
    lastCheck: ctx.catalogChecker.lastCheck(),
    checkEnabled: ctx.catalogCheck,
  };
}
