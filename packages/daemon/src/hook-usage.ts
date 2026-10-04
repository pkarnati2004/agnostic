import type { Task } from "@agnostic/core";
import type { HookUsage, ParsedHook } from "@agnostic/hooks";
import type { UsageInput } from "@agnostic/ledger";
import { harnessDefinition } from "@agnostic/registry";
import { costForTurn } from "@agnostic/usage";
import type { DaemonContext } from "./app.js";
import { billingForProfile } from "./usage-scan.js";

/**
 * The tokens a hook payload carried, for a harness that writes them nowhere agn can read. The
 * registry row says which event that is, so a harness joins this by naming its event and filling
 * `ParsedHook.usage`. The ledger's unique ref makes a repeat delivery insert nothing.
 */
export async function recordHookUsage(
  ctx: DaemonContext,
  task: Task,
  parsed: ParsedHook,
): Promise<void> {
  const harness = task.session?.harness;
  if (harness === undefined || parsed.usage === null) {
    return;
  }
  const source = harnessDefinition(harness).usageSource;
  if (source?.kind !== "hook" || source.event !== parsed.event) {
    return;
  }
  const billing = await billingForProfile(ctx.detection, task.profileId);
  const { catalog } = ctx.catalog.current();
  const buckets = split(parsed.usage);
  const row: UsageInput = {
    ts: new Date().toISOString(),
    harness,
    model: parsed.usage.model,
    tokens:
      buckets.tokensInput +
      buckets.tokensOutput +
      (buckets.tokensCacheRead ?? 0) +
      (buckets.tokensCacheWrite ?? 0),
    ...buckets,
    costUsd: costForTurn(
      { harness, model: parsed.usage.model, ...buckets, costUsd: null },
      billing,
      catalog,
    ),
    source: "hook",
    ref: parsed.usage.ref,
  };
  ctx.ledger.usage.record(task.id, [row]);
}

/**
 * The four buckets as the ledger stores them. A harness that counts its cache reads inside the
 * input figure has them taken out here, so one row never bills the same token twice.
 */
function split(usage: HookUsage) {
  const cacheRead = usage.tokensCacheRead;
  const inside = usage.inputIncludesCacheRead ? Math.min(cacheRead ?? 0, usage.tokensInput) : 0;
  return {
    tokensInput: usage.tokensInput - inside,
    tokensOutput: usage.tokensOutput,
    tokensCacheRead: cacheRead,
    tokensCacheWrite: usage.tokensCacheWrite,
  };
}
