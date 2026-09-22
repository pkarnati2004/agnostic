import { type HookEventParser, parseHookEvent } from "../hook-event-parser.js";
import {
  type ClaudeShapedNames,
  claudeShapedStatus,
} from "../settings-json/claude-shaped-status.js";

/**
 * The names Claude Code's own payloads use, which OpenClaude repeats. The table around them is
 * ported from Orca's Claude hook listener
 * (`src/shared/agent-hook-listener/providers/claude-events.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */
export const CLAUDE_NAMES: ClaudeShapedNames = {
  questionTools: ["AskUserQuestion"],
  waitingNotifications: [
    "permission_prompt",
    "idle_prompt",
    "agent_needs_input",
    "elicitation_dialog",
    "elicitation_url_dialog",
  ],
};

const statusOf = claudeShapedStatus(CLAUDE_NAMES);

/**
 * `SessionStart` reports the session id and nothing about the status; the turn is over on `Stop`,
 * which is waiting rather than done because the exit of the session is what ends a task.
 */
export const claudeCodeParser: HookEventParser = {
  harness: "claude-code",
  parse: (payload, eventHint) => parseHookEvent(payload, statusOf, { eventHint }),
};
