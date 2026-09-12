import { RecommendRequestSchema, type RecommendResponse } from "@agnostic/core";
import { recommend } from "@agnostic/recommender";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { requestInvalid } from "../error.js";
import { buildRecommendInput } from "../recommend-input.js";
import { resolveRepoId } from "../resolve-id.js";

/**
 * The pick for a prompt, with nothing started. The event is recorded here too, so that a user who
 * asks and then changes their mind leaves the same trail as one who runs straight away.
 */
export function recommendRoutes(ctx: DaemonContext): Hono {
  return new Hono().post("/recommend", async (c) => {
    const parsed = RecommendRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      throw requestInvalid(parsed.error);
    }
    const { repoId, prompt, intent, subscriptionsOnly } = parsed.data;
    const repo = resolveRepoId(ctx.ledger, repoId);
    const input = await buildRecommendInput(ctx, repo, prompt, {
      ...(intent === undefined ? {} : { intent }),
      ...(subscriptionsOnly === undefined ? {} : { subscriptionsOnly }),
    });
    const recommendation = recommend(input);
    ctx.ledger.events.append({
      ts: new Date().toISOString(),
      repoId: repo.id,
      kind: "recommendation.made",
      payload: { recommendation, chosenProfileId: recommendation.recommended.profileId },
    });
    const body: RecommendResponse = { recommendation };
    return c.json(body);
  });
}
