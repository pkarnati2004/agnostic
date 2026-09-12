import type { HookStatus } from "@agnostic/core";
import { type HookEventParser, type HookPayload, parseHookEvent } from "../hook-event-parser.js";

/**
 * The event-to-status table is ported from Orca's Claude hook listener
 * (`src/shared/agent-hook-listener/providers/claude-events.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

/** The notifications that mean the agent stopped and is waiting for the user to answer. */
const WAITING_NOTIFICATIONS = new Set([
  "permission_prompt",
  "idle_prompt",
  "agent_needs_input",
  "elicitation_dialog",
  "elicitation_url_dialog",
]);

/** The one tool whose pre-use event is a question to the user rather than work in progress. */
const QUESTION_TOOL = "AskUserQuestion";

export const claudeCodeParser: HookEventParser = {
  harness: "claude-code",
  parse: (payload) => parseHookEvent(payload, statusOf),
};

/**
 * `SessionStart` reports the session id and nothing about the status; the turn is over on `Stop`,
 * which is waiting rather than done because the exit of the session is what ends a task.
 */
function statusOf(event: HookPayload): HookStatus | null {
  switch (event.hook_event_name) {
    case "UserPromptSubmit":
    case "PostToolUse":
      return "running";
    case "Stop":
    case "PermissionRequest":
      return "waiting";
    case "PreToolUse":
      return event.tool_name === QUESTION_TOOL ? "waiting" : null;
    case "Notification":
      return WAITING_NOTIFICATIONS.has(event.notification_type ?? "") ? "waiting" : null;
    default:
      return null;
  }
}
