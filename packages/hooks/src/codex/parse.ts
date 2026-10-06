// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import type { HookStatus } from "@agnostic/core";
import { type HookEventParser, type HookPayload, parseHookEvent } from "../hook-event-parser.js";

/** Codex asks the user a question by calling a tool, so the question arrives as a pre-tool event. */
const QUESTION_TOOL = "request_user_input";

export const codexParser: HookEventParser = {
  harness: "codex",
  parse: (payload, eventHint) => parseHookEvent(payload, statusOf, { eventHint }),
};

function statusOf(event: HookPayload): HookStatus | null {
  switch (event.hook_event_name) {
    case "UserPromptSubmit":
    case "PostToolUse":
      return "running";
    case "Stop":
    case "PermissionRequest":
      return "waiting";
    case "PreToolUse":
      return event.tool_name === QUESTION_TOOL ? "waiting" : "running";
    default:
      return null;
  }
}
