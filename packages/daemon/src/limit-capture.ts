import type { HarnessId, LimitCapture } from "@agnostic/core";
import { hookInstaller, type UserScope } from "@agnostic/hooks";
import { transcriptParser } from "@agnostic/usage";
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
  const statusLine = hookInstaller(harness)?.userStatusLine;
  if (statusLine === undefined) {
    return transcriptParser(harness)?.reportsLimits === true ? "all-sessions" : "none";
  }
  if (opts.config.claudeStatusline === "repo") {
    return "agn-tasks";
  }
  return (await statusLine.installed(opts)) ? "all-sessions" : "none";
}
