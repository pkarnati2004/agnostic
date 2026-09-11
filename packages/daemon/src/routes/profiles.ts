import type { DoctorResponse, ProfilesResponse } from "@agnostic/core";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";

/**
 * `GET /profiles` is cheap and answers from the last detection; `POST /doctor` is the one call
 * that shells out to every harness, which is why it is a POST.
 */
export function profileRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/profiles", async (c) => {
      const detection = await ctx.detection.current();
      const body: ProfilesResponse = {
        profiles: detection.profiles,
        detectedAt: detection.detectedAt,
      };
      return c.json(body);
    })
    .post("/doctor", async (c) => {
      const body: DoctorResponse = await ctx.detection.refresh();
      return c.json(body);
    });
}
