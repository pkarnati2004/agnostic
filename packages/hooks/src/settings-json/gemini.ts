import type { HookStatus } from "@agnostic/core";
import { type HookEventParser, type HookPayload, parseHookEvent } from "../hook-event-parser.js";
import type { HookInstaller } from "../hook-installer.js";
import { type SettingsJsonMember, settingsJsonInstaller } from "./member.js";

/**
 * Ported from Orca's Gemini hook service and listener (`src/main/gemini/hook-service.ts`,
 * `src/shared/agent-hook-listener/providers/gemini-events.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

/** Gemini's pre-tool event is `BeforeTool`, not the `PreToolUse` the rest of the family sends. */
const EVENTS = [
  { event: "BeforeAgent" },
  { event: "BeforeTool" },
  { event: "AfterTool" },
  { event: "AfterAgent" },
];

/** Gemini reads `timeout` in milliseconds, and stalls on a hook that writes nothing to stdout. */
const TIMEOUT_MILLISECONDS = 5_000;

const VERIFY =
  "Gemini has no permission hook: a permission prompt shows as running until you answer it";

const geminiMember: SettingsJsonMember = {
  harness: "gemini",
  events: EVENTS,
  layout: "claude",
  timeout: TIMEOUT_MILLISECONDS,
  reply: "{}",
  verify: VERIFY,
  statusLine: false,
};

export const geminiInstaller: HookInstaller = settingsJsonInstaller(geminiMember);

export const geminiParser: HookEventParser = {
  harness: "gemini",
  parse: (payload, eventHint) => parseHookEvent(payload, statusOf, { eventHint }),
};

/** Gemini approves tools in its own UI and reports no permission event, so nothing maps to it. */
function statusOf(event: HookPayload): HookStatus | null {
  switch (event.hook_event_name) {
    case "BeforeAgent":
    case "BeforeTool":
    case "AfterTool":
      return "running";
    case "AfterAgent":
      return "waiting";
    default:
      return null;
  }
}
