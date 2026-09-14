import type { UsageWindow } from "@agnostic/core";

/**
 * The window the user means by "today" and "this week": midnight and Monday in the zone this
 * machine is in, not UTC. The vendors meter on rolling windows of their own, so these totals are
 * agn's calendar view and will not match a plan's own usage screen (ADR 021).
 */
export function usageWindow(kind: "day" | "week", now: Date): UsageWindow {
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  if (kind === "week") {
    // getDay counts from Sunday; the week here starts on Monday.
    since.setDate(since.getDate() - ((since.getDay() + 6) % 7));
  }
  return { kind, since: since.toISOString(), until: now.toISOString() };
}
