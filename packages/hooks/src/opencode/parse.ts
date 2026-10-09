// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import type { HookStatus } from "@agnostic/core";
import { type HookEventParser, type HookPayload, parseHookEvent } from "../hook-event-parser.js";

export function opencodeFamilyParser(harness: "opencode" | "mimo-code"): HookEventParser {
  return {
    harness,
    // The plugin reports no directory: the task header, or the session id, names the task.
    parse: (payload) =>
      parseHookEvent(payload, statusOf, { sessionKeys: ["sessionID"], cwdKeys: [] }),
  };
}

/**
 * `SessionStart` carries the id and nothing about the status. Idle is waiting rather than done
 * because the session is still there for the user to answer in.
 */
function statusOf(event: HookPayload): HookStatus | null {
  switch (event.hook_event_name) {
    case "SessionBusy":
      return "running";
    case "SessionIdle":
    case "PermissionRequest":
    case "AskUserQuestion":
      return "waiting";
    default:
      return null;
  }
}
