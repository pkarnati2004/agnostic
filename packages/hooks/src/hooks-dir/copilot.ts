import type { HookStatus } from "@agnostic/core";
import {
  type HookEventParser,
  type HookPayload,
  isTool,
  parseHookEvent,
  payloadString,
} from "../hook-event-parser.js";
import { type HooksDirMember, hooksDirInstaller } from "./install.js";

/**
 * Copilot's event list and its status table are ported from Orca's Copilot installer and listener
 * (`src/main/copilot/copilot-managed-hook-definitions.ts`,
 * `src/shared/agent-hook-listener/providers/copilot-events.ts`, `copilot-tool-fields.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

/** The one tool Copilot runs to ask the user a question; every other tool call is work. */
const QUESTION_TOOL = "ask_user";

/** The notifications that mean Copilot stopped and is waiting for an answer. */
const WAITING_NOTIFICATIONS = new Set(["permission_prompt", "elicitation_dialog"]);

export const copilotMember: HooksDirMember = {
  harness: "copilot",
  layout: "copilot",
  timeout: 5,
  eventOnCommand: true,
  verify:
    "if Copilot ignores the hook, check that ~/.copilot/hooks/agn.json has version 1 and that no hooks file sets disableAllHooks",
  events: [
    { event: "SessionStart" },
    { event: "SessionEnd" },
    { event: "UserPromptSubmit" },
    { event: "PreToolUse" },
    { event: "PostToolUse" },
    { event: "PostToolUseFailure" },
    { event: "Stop" },
    { event: "ErrorOccurred" },
    { event: "PermissionRequest" },
    { event: "Notification" },
  ],
};

export const copilotInstaller = hooksDirInstaller(copilotMember);

export const copilotParser: HookEventParser = {
  harness: "copilot",
  parse: (payload, eventHint) =>
    parseHookEvent(payload, statusOf, {
      ...(eventHint === undefined ? {} : { eventHint }),
      sessionKeys: ["session_id", "sessionId"],
      cwdKeys: ["cwd"],
    }),
};

/**
 * Copilot's `PermissionRequest` fires before it decides between allow, ask and deny, so it is not
 * by itself a blocked state; the tool it names is. An error it calls recoverable is still a turn.
 */
function statusOf(event: HookPayload): HookStatus | null {
  switch (event.hook_event_name) {
    case "UserPromptSubmit":
    case "PostToolUse":
    case "PostToolUseFailure":
      return "running";
    case "PreToolUse":
    case "PermissionRequest":
      return isTool(toolName(event), QUESTION_TOOL) ? "waiting" : "running";
    case "Notification":
      return WAITING_NOTIFICATIONS.has(notificationType(event) ?? "") ? "waiting" : null;
    case "Stop":
      return "waiting";
    case "ErrorOccurred":
      return event.recoverable === true ? "running" : "waiting";
    default:
      return null;
  }
}

function notificationType(event: HookPayload): string | undefined {
  return payloadString(event, ["notification_type", "notificationType"]);
}

/** Copilot names the tool on the payload for some events and inside `toolCalls` for others. */
function toolName(event: HookPayload): string | undefined {
  const named = payloadString(event, ["tool_name", "toolName", "name"]);
  if (named !== undefined) {
    return named;
  }
  const first = Array.isArray(event.toolCalls) ? event.toolCalls[0] : null;
  return typeof first === "object" && first !== null
    ? payloadString(first as Record<string, unknown>, ["name", "toolName", "tool_name"])
    : undefined;
}
