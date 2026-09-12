import { DoctorRequestSchema, type DoctorResponse, type ProfilesResponse } from "@agnostic/core";
import { Hono } from "hono";
import { type DaemonContext, planOptions } from "../app.js";
import { readDaemonConfig, writeDaemonConfigPlans } from "../daemon-config.js";
import { requestInvalid } from "../error.js";

/**
 * `GET /profiles` is cheap and answers from the last detection; `POST /doctor` is the one call
 * that shells out to every harness, which is why it is a POST. Its body is optional: `agn doctor`
 * sends plans only when the user named one.
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
      // An empty body means "just look again"; anything else is read as a request.
      const raw = await c.req.text();
      const parsed = DoctorRequestSchema.safeParse(raw.trim() === "" ? {} : json(raw));
      if (!parsed.success) {
        throw requestInvalid(parsed.error);
      }
      // Written before detection runs, so the answer already reflects what the user just said.
      const plans = parsed.data.plans
        ? await writeDaemonConfigPlans(ctx.paths, parsed.data.plans)
        : (await readDaemonConfig(ctx.paths)).plans;
      // The detection also carries the local servers, which are the daemon's business and not
      // part of the doctor response; the plans are the daemon's own state, not detection's.
      const { servers: _servers, ...detection } = await ctx.detection.refresh();
      const body: DoctorResponse = {
        ...detection,
        plans,
        planOptions: planOptions(ctx.catalog.plans),
      };
      return c.json(body);
    });
}

function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A body that is not JSON at all is the same mistake as a body with the wrong fields.
    return null;
  }
}
