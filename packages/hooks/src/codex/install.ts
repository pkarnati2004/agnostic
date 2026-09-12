import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { HookInstallResult } from "@agnostic/core";
import { writeConfigFile } from "../config-file.js";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import {
  type HooksJson,
  type ManagedEvent,
  readHooksJson,
  updateHooksJson,
  withManagedHooks,
  withoutManagedHooks,
} from "../hooks-json-file.js";
import { type TrustTable, withTrustBlock } from "./config-block.js";
import { codexEventLabel, trustedHash, trustKey } from "./trust.js";

/** Codex has no per-repo hook file, so these are installed once per user (ADR 015). */
const EVENTS: ManagedEvent[] = [
  { event: "SessionStart" },
  { event: "UserPromptSubmit" },
  // Codex asks its questions through a tool call, so every pre-tool event has to be seen.
  { event: "PreToolUse" },
  { event: "PermissionRequest" },
  { event: "PostToolUse" },
  { event: "Stop" },
];

const DEFAULT_TIMEOUT_SECONDS = 600;

const VERIFY = "if Codex reports the agn hook as untrusted, run /hooks in Codex and approve it";

export const codexInstaller: HookInstaller = {
  harness: "codex",

  async install(input: HookInstallInput): Promise<HookInstallResult> {
    const file = hooksFile(input.home);
    const hooksChanged = await updateHooksJson(file, (config) =>
      withManagedHooks(config, EVENTS, input.command),
    );
    const tables = trustTables(await readHooksJson(file), await realpath(file), input.command);
    const trustChanged = await updateTrust(input.home, tables);
    const changed = hooksChanged || trustChanged;
    if (changed) {
      // Codex's hook config is per user, so agn says out loud what it wrote outside the repo.
      process.stderr.write(
        `agn wrote its Codex status hook to ${file} and ${configFile(input.home)}\n`,
      );
    }
    return { harness: "codex", file, changed, verify: VERIFY };
  },

  async uninstall(input: HookInstallInput): Promise<HookInstallResult> {
    const file = hooksFile(input.home);
    const removed = await updateHooksJson(file, (config) =>
      withoutManagedHooks(config, input.command),
    );
    const trustChanged = await updateTrust(input.home, []);
    return { harness: "codex", file, changed: removed || trustChanged, verify: null };
  },
};

function hooksFile(home: string): string {
  return join(home, ".codex", "hooks.json");
}

function configFile(home: string): string {
  return join(home, ".codex", "config.toml");
}

/**
 * One trust table per handler agn installed, keyed by where it ended up in the file: Codex hashes
 * the handler and looks it up by file, event, group and position.
 */
function trustTables(config: HooksJson, file: string, command: string): TrustTable[] {
  const tables: TrustTable[] = [];
  for (const [event, groups] of Object.entries(config.hooks ?? {})) {
    groups.forEach((group, groupIndex) => {
      group.hooks.forEach((entry, handlerIndex) => {
        if (entry.command !== command) {
          return;
        }
        const label = codexEventLabel(event);
        tables.push({
          key: trustKey(file, label, groupIndex, handlerIndex),
          hash: trustedHash({
            label,
            command,
            timeoutSec: entry.timeout ?? DEFAULT_TIMEOUT_SECONDS,
            ...(group.matcher === undefined ? {} : { matcher: group.matcher }),
          }),
        });
      });
    });
  }
  return tables;
}

async function updateTrust(home: string, tables: TrustTable[]): Promise<boolean> {
  const file = configFile(home);
  const text = await readFile(file, "utf8").catch(() => "");
  const updated = withTrustBlock(text, tables);
  if (updated === text) {
    return false;
  }
  await writeConfigFile(file, updated);
  return true;
}
