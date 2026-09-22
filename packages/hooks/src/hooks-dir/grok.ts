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
 * Grok's event list and its notification rules are ported from Orca's Grok installer and listener
 * (`src/main/grok/grok-hook-config.ts`, `src/shared/agent-hook-listener/providers/grok-events.ts`,
 * `grok-tool-fields.ts`, `provider-event-names.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

/** Grok reads a tool event's matcher as a regular expression, and `.*` is every tool. */
const EVERY_TOOL = ".*";

/** Grok auto-allows this tool, so it fires `PreToolUse` while it is blocked on a human answer. */
const QUESTION_TOOL = "ask_user_question";

/** Grok fires this before every tool, even with permissions bypassed, so it is not a wait. */
const ROUTINE_NOTIFICATION = "tool permission requested";

/**
 * `needs your` is the wording Orca captured from Grok; the rest are the plainer synonyms. Bare
 * `feedback`, `clarify` and `question` are left out: Grok writes all three while it is working.
 */
const PERMISSION_WORDS = ["permission", "approval", "approve", "allow", "confirm", "needs your"];

/** The last four are Grok's own TUI footer, which it sends as a notification when it goes idle. */
const IDLE_WORDS = [
  "idle",
  "waiting for input",
  "type your message",
  "enter send",
  "shift-tab normal",
  "ask a side question",
];

export const grokMember: HooksDirMember = {
  harness: "grok",
  layout: "claude",
  timeout: 5,
  eventOnCommand: false,
  verify: null,
  events: [
    { event: "SessionStart" },
    { event: "UserPromptSubmit" },
    { event: "Stop" },
    { event: "StopFailure" },
    { event: "SessionEnd" },
    { event: "PreToolUse", matcher: EVERY_TOOL },
    { event: "PostToolUse", matcher: EVERY_TOOL },
    { event: "PostToolUseFailure", matcher: EVERY_TOOL },
    { event: "Notification" },
  ],
};

export const grokInstaller = hooksDirInstaller(grokMember);

export const grokParser: HookEventParser = {
  harness: "grok",
  parse: (payload) =>
    parseHookEvent(payload, statusOf, {
      eventKeys: ["hook_event_name", "hookEventName"],
      sessionKeys: ["sessionId", "session_id"],
      cwdKeys: ["cwd"],
    }),
};

/**
 * `SessionStart` and `SessionEnd` report the session and nothing about the turn. A stop of either
 * kind is waiting rather than done: the exit of the session is what ends a task.
 */
function statusOf(event: HookPayload): HookStatus | null {
  switch (snakeCase(event.hook_event_name ?? "")) {
    case "user_prompt_submit":
    case "post_tool_use":
    case "post_tool_use_failure":
      return "running";
    case "pre_tool_use":
      return isTool(toolName(event), QUESTION_TOOL) ? "waiting" : "running";
    case "stop":
    case "stop_failure":
      return "waiting";
    case "notification":
      return notificationStatus(event);
    default:
      return null;
  }
}

function notificationStatus(event: HookPayload): HookStatus | null {
  const message = payloadString(event, ["message"]) ?? "";
  const type = payloadString(event, ["notificationType", "notification_type", "type"]);
  const level = payloadString(event, ["level"]);
  if (isRoutinePermissionPrompt(type, message, level)) {
    return null;
  }
  const lower = message.toLowerCase();
  const words = [...PERMISSION_WORDS, ...IDLE_WORDS];
  return words.some((word) => lower.includes(word)) ? "waiting" : null;
}

function isRoutinePermissionPrompt(
  type: string | undefined,
  message: string,
  level: string | undefined,
): boolean {
  return (
    snakeCase(type ?? "") === "permission_prompt" &&
    message.trim().toLowerCase() === ROUTINE_NOTIFICATION &&
    (level === undefined || level.trim().toLowerCase() === "info")
  );
}

function toolName(event: HookPayload): string | undefined {
  return payloadString(event, ["toolName", "tool_name", "name"]);
}

/** Grok spells one event two ways across releases: `SessionStart` and `session_start` are one. */
function snakeCase(name: string): string {
  return name
    .trim()
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll(/[-\s]+/g, "_")
    .toLowerCase();
}
