import type { HealthResponse } from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";

/** The only unauthenticated route, and the one `agn daemon status` uses to verify daemon.json. */
export function healthRoutes(ctx: DaemonContext): Hono {
  return new Hono().get("/health", (c) => {
    const body: HealthResponse = {
      pid: process.pid,
      port: ctx.port(),
      startedAt: ctx.startedAt,
      version: ctx.version,
      // Which state directory this daemon serves, so another one on the same port is not mistaken
      // for a stale copy of it and killed.
      home: ctx.paths.home,
    };
    return c.json(body);
  });
}
