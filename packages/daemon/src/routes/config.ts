import { ConfigPatchRequestSchema, type ConfigResponse } from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { readDaemonConfig } from "../daemon-config.js";
import { writeDaemonConfig } from "../daemon-config-write.js";
import { requestInvalid } from "../error.js";
import { requestBody } from "../request-body.js";

/**
 * The machine's settings as one document, read and edited by the workspace's Settings dialog.
 * PATCH takes the keys the user changed: a key left out keeps what is on file, so two tabs never
 * overwrite each other's unrelated settings. `port` and `plans` are not on the body - the port is
 * read once at start, and `POST /doctor` writes the plans because it re-detects after it does.
 */
export function configRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/config", async (c) => {
      const body: ConfigResponse = {
        config: await readDaemonConfig(ctx.paths),
        file: ctx.paths.config,
      };
      return c.json(body);
    })
    .patch("/config", async (c) => {
      const parsed = ConfigPatchRequestSchema.safeParse(await requestBody(c.req.raw));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      // An empty body asks for nothing; the file is still rewritten, which is how it stays a
      // document the user can read back rather than two code paths.
      const body: ConfigResponse = {
        config: await writeDaemonConfig(ctx.paths, parsed.data),
        file: ctx.paths.config,
      };
      return c.json(body);
    });
}
