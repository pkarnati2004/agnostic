// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import {
  hasLimitDetail,
  type LimitWindow,
  NO_LIMIT_DETAIL,
  type PlanLimitDetail,
} from "@agnostic/core";
import { z } from "zod";
import type { ObservedLimit } from "../transcript-parser.js";

/**
 * Claude Code pipes this to its `statusLine` command on every turn, for claude.ai-subscriber
 * sessions. `utilization` is the OAuth-shaped sibling of `used_percentage`, and `resets_at` is
 * epoch seconds today; both are accepted so a field rename degrades to no figure, never a wrong one.
 */
const WindowSchema = z.looseObject({
  used_percentage: z.number().optional(),
  utilization: z.number().optional(),
  resets_at: z.union([z.number(), z.string()]).optional(),
});

const PayloadSchema = z.looseObject({
  rate_limits: z
    .looseObject({
      five_hour: WindowSchema.nullish(),
      seven_day: WindowSchema.nullish(),
    })
    .nullish(),
  /** This session's spend and context, which Claude Code reports beside the account's windows. */
  cost: z.looseObject({ total_cost_usd: z.number().nullish() }).nullish(),
  context_window: z.looseObject({ used_percentage: z.number().nullish() }).nullish(),
});

/**
 * The limit a statusline payload carries, or null when it carries none: a session on an API key
 * gets no `rate_limits` at all, and a half-written file is not JSON.
 */
export function parseStatusLinePayload(text: string, observedAt: string): ObservedLimit | null {
  const parsed = PayloadSchema.safeParse(json(text));
  if (!parsed.success) {
    return null;
  }
  const limits = parsed.data.rate_limits;
  const fiveHour = toWindow(limits?.five_hour);
  const week = toWindow(limits?.seven_day);
  const detail: PlanLimitDetail = {
    ...NO_LIMIT_DETAIL,
    sessionCostUsd: finite(parsed.data.cost?.total_cost_usd ?? undefined),
    contextUsedPercent: finite(parsed.data.context_window?.used_percentage ?? undefined),
  };
  if (fiveHour === null && week === null && !hasLimitDetail(detail)) {
    return null;
  }
  return {
    harness: "claude-code",
    fiveHour,
    week,
    observedAt,
    source: "statusline",
    detail,
  };
}

function toWindow(raw: z.infer<typeof WindowSchema> | null | undefined): LimitWindow | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const usedPercent = finite(raw.used_percentage) ?? finite(raw.utilization);
  if (usedPercent === null) {
    return null;
  }
  return { usedPercent, resetsAt: resetsAt(raw.resets_at) };
}

function resetsAt(raw: number | string | undefined): string | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? new Date(raw * 1_000).toISOString() : null;
  }
  const parsed = raw === undefined ? Number.NaN : Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function finite(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
