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
    };
    return c.json(body);
  });
}
