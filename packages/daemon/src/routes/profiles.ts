import {
  DoctorRequestSchema,
  type DoctorResponse,
  type HarnessId,
  type ProfilesResponse,
  parseProfileId,
} from "@agnostic/core";
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
      const config = await readDaemonConfig(ctx.paths);
      // Written before detection runs, so the answer already reflects what the user just said.
      const plans = parsed.data.plans
        ? await writeDaemonConfigPlans(ctx.paths, parsed.data.plans)
        : config.plans;
      // The detection also carries the local servers, which are the daemon's business and not
      // part of the doctor response; the plans are the daemon's own state, not detection's.
      const { servers: _servers, ...detection } = await ctx.detection.refresh();
      const body: DoctorResponse = {
        ...detection,
        plans,
        planOptions: planOptions(ctx.catalog.current().catalog.plans),
        named: namedHarnesses(ctx, config.specWriter),
        tmuxConfigStale: await ctx.tmuxConfigStale(),
      };
      return c.json(body);
    });
}

/**
 * The harnesses the user has named for themselves: the spec writer in config.yaml, and the
 * profile of every task. Doctor keeps a row for each of them even when the binary is missing,
 * because a harness the user works with is not one to hide behind a count.
 */
function namedHarnesses(ctx: DaemonContext, specWriter: string | null): HarnessId[] {
  const profileIds = ctx.ledger.tasks.list().map((task) => task.profileId);
  const named = new Set<HarnessId>();
  for (const profileId of specWriter === null ? profileIds : [specWriter, ...profileIds]) {
    try {
      named.add(parseProfileId(profileId).harness);
    } catch {
      // An id agn cannot parse names no harness; the row it would have kept is not there anyway.
    }
  }
  return [...named];
}

function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A body that is not JSON at all is the same mistake as a body with the wrong fields.
    return null;
  }
}
