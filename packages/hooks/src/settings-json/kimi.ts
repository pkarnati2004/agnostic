// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HookInstallResult } from "@agnostic/core";
import { harnessDefinition } from "@agnostic/registry";
import { writeConfigFile } from "../config-file.js";
import { HooksError } from "../error.js";
import { type HookEventParser, parseHookEvent } from "../hook-event-parser.js";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import { hookCommand } from "../hook-script.js";
import { withHooksBlock, withoutHooksBlock } from "../hooks-toml-file.js";
import { claudeShapedStatus } from "./claude-shaped-status.js";

/**
 * Kimi Code sends Claude-shaped payloads but keeps its hooks in TOML, so it shares this family's
 * events and status table and nothing else.
 */
const EVENTS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Stop",
  "StopFailure",
];

const TIMEOUT_SECONDS = 5;

const VERIFY = "Kimi sessions resume only from the directory they started in";

export const kimiInstaller: HookInstaller = {
  harness: "kimi",

  async install(input: HookInstallInput): Promise<HookInstallResult> {
    const file = configFile(input.home);
    const command = hookCommand(input.paths, "kimi");
    const changed = await updateConfig(file, (text) =>
      withHooksBlock(
        text,
        EVENTS.map((event) => ({ event, command, timeout: TIMEOUT_SECONDS })),
      ),
    );
    if (changed) {
      // Kimi's config is per user, so agn says out loud that it wrote outside the repo.
      process.stderr.write(`agn wrote its Kimi CLI status hook to ${file}\n`);
    }
    return { harness: "kimi", file, changed, verify: VERIFY };
  },

  async uninstall(input: HookInstallInput): Promise<HookInstallResult> {
    const file = configFile(input.home);
    const changed = await updateConfig(file, withoutHooksBlock);
    return { harness: "kimi", file, changed, verify: null };
  },
};

const statusOf = claudeShapedStatus({
  // Kimi auto-allows its question tool, which arrives as a pre-tool event while it blocks.
  questionTools: ["AskUserQuestion"],
  waitingNotifications: [],
  everyToolPreUse: true,
});

export const kimiParser: HookEventParser = {
  harness: "kimi",
  parse: (payload, eventHint) => parseHookEvent(payload, statusOf, { eventHint }),
};

function configFile(home: string): string {
  const mechanism = harnessDefinition("kimi").hooks;
  if (mechanism === null || mechanism.container !== "hooks-toml") {
    throw new HooksError("kimi keeps no hooks in a TOML config", {
      code: "hook-unsupported",
      hint: "Run `agn doctor` to see which harnesses report status.",
    });
  }
  return join(home, mechanism.file);
}

/** Writes only what a reinstall would change, so running an install per launch costs one read. */
async function updateConfig(file: string, next: (text: string) => string): Promise<boolean> {
  const text = await readFile(file, "utf8").catch(() => "");
  const updated = next(text);
  if (updated === text) {
    return false;
  }
  await writeConfigFile(file, updated);
  return true;
}
