import { claudeCodeMember } from "../claude-code/install.js";
import { CLAUDE_NAMES } from "../claude-code/parse.js";
import { type HookEventParser, parseHookEvent } from "../hook-event-parser.js";
import type { HookInstaller } from "../hook-installer.js";
import { claudeShapedStatus } from "./claude-shaped-status.js";
import { type SettingsJsonMember, settingsJsonInstaller } from "./member.js";

/**
 * OpenClaude is Claude Code's events and payloads read out of another directory, which the
 * registry row already names. Ported from Orca's `src/main/openclaude/hook-service.ts`, which
 * passes one config-dir parameter to the Claude installer.
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */
const openClaudeMember: SettingsJsonMember = {
  ...claudeCodeMember,
  harness: "openclaude",
  // OpenClaude runs on a provider key, so its status line reports no plan limit to capture.
  // OpenClaude skips the normal Stop hook after a model error and emits StopFailure instead.
  events: [...claudeCodeMember.events, { event: "StopFailure" }],
};

export const openClaudeInstaller: HookInstaller = settingsJsonInstaller(openClaudeMember);

const statusOf = claudeShapedStatus(CLAUDE_NAMES);

export const openClaudeParser: HookEventParser = {
  harness: "openclaude",
  parse: (payload, eventHint) => parseHookEvent(payload, statusOf, { eventHint }),
};
