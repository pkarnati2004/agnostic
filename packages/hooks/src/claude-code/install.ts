import type { HookInstaller } from "../hook-installer.js";
import type { ManagedEvent } from "../hooks-json-file.js";
import { type SettingsJsonMember, settingsJsonInstaller } from "../settings-json/member.js";

/**
 * The events that say a turn started, a tool ran, or the agent is waiting for the user. A matcher
 * on `PreToolUse` keeps agn to one hook process per question instead of one per tool call.
 */
const EVENTS: ManagedEvent[] = [
  { event: "SessionStart" },
  { event: "UserPromptSubmit" },
  { event: "PreToolUse", matcher: "AskUserQuestion" },
  { event: "PermissionRequest" },
  { event: "Notification" },
  { event: "PostToolUse" },
  { event: "Stop" },
];

/**
 * Claude Code is the one member of this family agn installs per repo, in the file Claude Code
 * already expects a user not to commit. OpenClaude reads the same events out of its own directory,
 * so its row starts from this one.
 */
export const claudeCodeMember: SettingsJsonMember = {
  harness: "claude-code",
  events: EVENTS,
  layout: "claude",
  timeout: 5,
  reply: null,
  verify: null,
  statusLine: true,
};

export const claudeCodeInstaller: HookInstaller = settingsJsonInstaller(claudeCodeMember);
