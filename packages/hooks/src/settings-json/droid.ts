import type { HookInstallResult } from "@agnostic/core";
import { type HookEventParser, parseHookEvent } from "../hook-event-parser.js";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import { readHooksJson } from "../hooks-json-file.js";
import { claudeShapedStatus } from "./claude-shaped-status.js";
import { type SettingsJsonMember, settingsJsonInstaller } from "./member.js";

/**
 * Ported from Orca's Droid hook service and listener (`src/main/droid/hook-service.ts`,
 * `src/shared/agent-hook-listener/providers/droid-events.ts`, `droid-tool-fields.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

/** `SessionStart` is installed so a resumed session reports before the user types again. */
const EVENTS = [
  { event: "SessionStart" },
  { event: "UserPromptSubmit" },
  { event: "Stop" },
  { event: "PreToolUse", matcher: "*" },
  { event: "PostToolUse", matcher: "*" },
  { event: "PermissionRequest", matcher: "*" },
  { event: "Notification" },
];

/** Droid emits no `Stop` when the user interrupts, only prose saying it is waiting again. */
const WAITING_MESSAGE = /permission|approv|idle|waiting for (your )?input/i;

const VERIFY = "Factory settings has hooksDisabled: true; set it to false for agn to see status";

const droidMember: SettingsJsonMember = {
  harness: "droid",
  events: EVENTS,
  layout: "claude",
  timeout: 5,
  reply: null,
  verify: null,
  userStatusLine: null,
};

const settings = settingsJsonInstaller(droidMember);

export const droidInstaller: HookInstaller = {
  harness: "droid",
  install: async (input: HookInstallInput): Promise<HookInstallResult> => {
    const result = await settings.install(input);
    // Factory has one switch that turns every hook off, and agn cannot flip it for the user.
    const config = await readHooksJson(result.file);
    return { ...result, verify: config.hooksDisabled === true ? VERIFY : null };
  },
  uninstall: settings.uninstall,
};

const statusOf = claudeShapedStatus({
  questionTools: ["AskUser"],
  waitingNotifications: [],
  notificationMessageWaiting: WAITING_MESSAGE,
  everyToolPreUse: true,
});

export const droidParser: HookEventParser = {
  harness: "droid",
  parse: (payload, eventHint) => parseHookEvent(payload, statusOf, { eventHint }),
};
