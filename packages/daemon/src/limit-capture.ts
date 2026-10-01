import type { HarnessId, LimitCapture } from "@agnostic/core";
import { hookInstaller, type UserScope } from "@agnostic/hooks";
import { harnessDefinition } from "@agnostic/registry";
import type { HooksConfig } from "./daemon-config.js";

/**
 * Which of a harness's sessions feed its plan's limit figure. A harness reports its limits either
 * in the transcripts it writes anyway, which covers every session, or through a status line agn
 * installs, which covers every session at user scope and agn's tasks at repo scope. A harness that
 * reports neither has nothing to capture.
 */
export async function limitCapture(
  harness: HarnessId,
  installed: boolean,
  opts: UserScope & { config: HooksConfig },
): Promise<LimitCapture> {
  if (!installed) {
    return "none";
  }
  const source = harnessDefinition(harness).limitSource;
  if (source === "rollout") {
    return "all-sessions";
  }
  const statusLine = source === "statusline" ? hookInstaller(harness)?.userStatusLine : undefined;
  if (statusLine === undefined) {
    return "none";
  }
  if (opts.config.claudeStatusline === "repo") {
    return "agn-tasks";
  }
  return (await statusLine.installed(opts)) ? "all-sessions" : "none";
}
