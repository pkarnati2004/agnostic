// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import type { HookStatus } from "@agnostic/core";
import { type HookEventParser, type HookPayload, parseHookEvent } from "../hook-event-parser.js";
import type { HookInstaller } from "../hook-installer.js";
import { type SettingsJsonMember, settingsJsonInstaller } from "./member.js";

/** Command Code reads a matcher as a regex, so every tool is `.*` rather than Claude's `*`. */
const EVENTS = [
  { event: "PreToolUse", matcher: ".*" },
  { event: "PostToolUse", matcher: ".*" },
  { event: "Stop" },
];

const commandCodeMember: SettingsJsonMember = {
  harness: "command-code",
  events: EVENTS,
  layout: "claude",
  timeout: 5,
  reply: null,
  verify: null,
  userStatusLine: null,
};

export const commandCodeInstaller: HookInstaller = settingsJsonInstaller(commandCodeMember);

/** Command Code reports no session id, so a task of its own is matched by its directory. */
export const commandCodeParser: HookEventParser = {
  harness: "command-code",
  parse: (payload, eventHint) => parseHookEvent(payload, statusOf, { eventHint, sessionKeys: [] }),
};

function statusOf(event: HookPayload): HookStatus | null {
  switch (event.hook_event_name) {
    case "PreToolUse":
    case "PostToolUse":
      return "running";
    case "Stop":
      return "waiting";
    default:
      return null;
  }
}
