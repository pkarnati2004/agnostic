// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import type { HookInstallResult } from "@agnostic/core";
import { configUnsupported, HooksError } from "../error.js";
import { type HookEventParser, parseHookEvent } from "../hook-event-parser.js";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import { hookScriptMarker } from "../hook-script.js";
import { withManagedHooks } from "../hooks-json-file.js";
import { claudeShapedStatus } from "./claude-shaped-status.js";
import {
  commandFor,
  type SettingsJsonMember,
  settingsFile,
  settingsJson,
  settingsJsonInstaller,
} from "./member.js";

/** No matchers: Devin reads a matcher as a regex, where Claude's literal `*` is invalid. */
const EVENTS = [
  { event: "SessionStart" },
  { event: "UserPromptSubmit" },
  { event: "Stop" },
  { event: "PostCompaction" },
  { event: "SessionEnd" },
  { event: "PreToolUse" },
  { event: "PostToolUse" },
  { event: "PermissionRequest" },
];

const VERIFY =
  "Devin imports ~/.claude hooks by default (read_config_from); a repo with agn's Claude Code hook reports twice, which agn ignores";

const devinMember: SettingsJsonMember = {
  harness: "devin",
  events: EVENTS,
  layout: "claude",
  timeout: 5,
  reply: null,
  verify: VERIFY,
  userStatusLine: null,
};

const settings = settingsJsonInstaller(devinMember);

/**
 * Devin documents its config as JSONC. agn reads JSON and adds no parser for one file, so a config
 * with comments in it is refused with the entries to paste rather than rewritten without them.
 */
export const devinInstaller: HookInstaller = {
  harness: "devin",
  install: (input) => refusingComments(input, () => settings.install(input)),
  uninstall: (input) => refusingComments(input, () => settings.uninstall(input)),
};

async function refusingComments(
  input: HookInstallInput,
  write: () => Promise<HookInstallResult>,
): Promise<HookInstallResult> {
  try {
    return await write();
  } catch (cause) {
    if (!(cause instanceof HooksError) || cause.code !== "hook-config-unreadable") {
      throw cause;
    }
    throw configUnsupported(settingsFile(settingsJson("devin"), input), entriesToPaste(input));
  }
}

/** What the user has to add by hand, in the shape their own config already holds. */
function entriesToPaste(input: HookInstallInput): string {
  const { hooks } = withManagedHooks({}, EVENTS, (event) => commandFor(devinMember, input, event), {
    layout: devinMember.layout,
    timeout: devinMember.timeout,
    marker: hookScriptMarker(input.paths),
  });
  return JSON.stringify({ hooks }, null, 2);
}

const statusOf = claudeShapedStatus({
  // Devin's own questions arrive as a permission request; its pre-tool events are work.
  questionTools: [],
  waitingNotifications: [],
  everyToolPreUse: true,
});

export const devinParser: HookEventParser = {
  harness: "devin",
  parse: (payload, eventHint) =>
    parseHookEvent(payload, statusOf, { eventHint, sessionKeys: ["session_id", "sessionId"] }),
};
