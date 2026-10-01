import type { HookStatus } from "@agnostic/core";
import { type HookEventParser, type HookPayload, parseHookEvent } from "../hook-event-parser.js";
import type { HookInstaller } from "../hook-installer.js";
import { type SettingsJsonMember, settingsJsonInstaller } from "./member.js";

/**
 * Ported from Orca's Cursor hook service and listener (`src/main/cursor/hook-service.ts`,
 * `hook-events.ts`, `src/shared/agent-hook-listener/providers/cursor-events.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

/**
 * Cursor's own events, in its camelCase spelling. The gating ones - `preToolUse`,
 * `beforeShellExecution`, `beforeMCPExecution` - are deliberately not installed: Cursor reads a
 * permission answer off the hook's stdout, and agn reports status rather than answering for the
 * user. The cost is that a Cursor permission prompt shows as running until the user answers it.
 */
const EVENTS = [
  { event: "beforeSubmitPrompt" },
  { event: "stop" },
  { event: "postToolUse" },
  { event: "afterAgentResponse" },
];

/** Cursor fails a hook closed when it writes nothing, so every event agn installs answers. */
const REPLIES = {
  beforeSubmitPrompt: '{"continue":true}',
  stop: "{}",
  postToolUse: "{}",
  afterAgentResponse: "{}",
};

const cursorAgentMember: SettingsJsonMember = {
  harness: "cursor-agent",
  events: EVENTS,
  layout: "cursor",
  timeout: 5,
  reply: REPLIES,
  verify: null,
};

export const cursorAgentInstaller: HookInstaller = settingsJsonInstaller(cursorAgentMember);

/** Cursor names its session `conversation_id` and its directory `workspace_roots`, no `cwd`. */
export const cursorAgentParser: HookEventParser = {
  harness: "cursor-agent",
  parse: (payload, eventHint) =>
    parseHookEvent(payload, statusOf, {
      eventHint,
      sessionKeys: ["conversation_id"],
      cwdKeys: ["workspace_roots"],
    }),
};

function statusOf(event: HookPayload): HookStatus | null {
  switch (event.hook_event_name) {
    case "beforeSubmitPrompt":
    case "postToolUse":
    case "afterAgentResponse":
      return "running";
    case "stop":
      return "waiting";
    default:
      return null;
  }
}
