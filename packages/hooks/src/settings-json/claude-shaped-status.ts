import type { HookStatus } from "@agnostic/core";
import type { HookPayload } from "../hook-event-parser.js";

/**
 * The event-to-status table Claude Code defined and Droid, Kimi, Devin, OpenClaude and Command
 * Code send payloads for. Ported from Orca's hook listeners
 * (`src/shared/agent-hook-listener/providers/{claude,droid,kimi,devin,command-code}-events.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */
export type ClaudeShapedNames = {
  /** Tools whose pre-use event is a question to the user rather than work in progress. */
  questionTools: string[];
  /** The `notification_type` values that mean the agent stopped and is waiting for an answer. */
  waitingNotifications: string[];
  /** Droid says what it is waiting for in `message` prose instead of a notification type. */
  notificationMessageWaiting?: RegExp;
  /**
   * True when the member installs `PreToolUse` for every tool: then a pre-use event that is not a
   * question is work in progress. A member that installs it for its question tool alone reports
   * nothing for the rest, so an unrecognised tool name means the payload was not one of ours.
   */
  everyToolPreUse?: boolean;
};

export function claudeShapedStatus(
  names: ClaudeShapedNames,
): (event: HookPayload) => HookStatus | null {
  const questions = new Set(names.questionTools.map(comparable));
  const notifications = new Set(names.waitingNotifications);
  return (event) => {
    switch (event.hook_event_name) {
      case "UserPromptSubmit":
      case "PostToolUse":
      case "PostToolUseFailure":
      case "PostCompaction":
        return "running";
      case "PermissionRequest":
      case "Stop":
      case "StopFailure":
        return "waiting";
      case "PreToolUse":
        return preToolUse(event, questions, names.everyToolPreUse === true);
      case "Notification":
        return notification(event, notifications, names.notificationMessageWaiting);
      // SessionStart fires on an idle TUI open, SessionEnd after the session is gone, and neither
      // a subagent's stop nor a compaction about to start says anything about the user's turn.
      default:
        return null;
    }
  };
}

function preToolUse(
  event: HookPayload,
  questions: Set<string>,
  everyTool: boolean,
): HookStatus | null {
  if (questions.has(comparable(event.tool_name ?? ""))) {
    return "waiting";
  }
  return everyTool ? "running" : null;
}

function notification(
  event: HookPayload,
  waiting: Set<string>,
  message: RegExp | undefined,
): HookStatus | null {
  if (waiting.has(event.notification_type ?? "")) {
    return "waiting";
  }
  return message?.test(event.message ?? "") === true ? "waiting" : null;
}

/** Harnesses spell the same tool `AskUser`, `ask_user` and `Ask-User`; all three are that tool. */
function comparable(toolName: string): string {
  return toolName.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
}
