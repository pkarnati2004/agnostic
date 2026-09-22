import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AgnosticPaths, HookInstallResult } from "@agnostic/core";
import { harnessDefinition } from "@agnostic/registry";
import { writeConfigFile } from "../config-file.js";
import { configUnreadable, configUnwritable, HooksError } from "../error.js";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import { hookCommand, hookScriptMarker } from "../hook-script.js";
import {
  type HookLayout,
  type HooksJson,
  type ManagedEvent,
  withManagedHooks,
} from "../hooks-json-file.js";

/**
 * Grok and Copilot each merge every hook file in one directory, so agn owns one file there and
 * writes it whole. The events, the status tables and this file shape are ported from Orca's
 * installers (`src/main/grok/grok-hook-config.ts`, `hook-service.ts`;
 * `src/main/copilot/copilot-managed-hook-definitions.ts`, `hook-service.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

/** The one file in the directory that is agn's. Every other file there belongs to the user. */
export const HOOKS_DIR_FILE = "agn.json";

/** Copilot reads a hook's stdout and stalls on nothing, so every Copilot command answers `{}`. */
const COPILOT_REPLY = "{}";

export type HooksDirMember = {
  harness: "grok" | "copilot";
  events: ManagedEvent[];
  layout: HookLayout;
  /** In the unit the harness reads; both of these read seconds. */
  timeout: number;
  /** Copilot: the event name rides on the command, because the payload does not name it. */
  eventOnCommand: boolean;
  /** Written into `HookInstallResult.verify`: the one step the user has to check. */
  verify: string | null;
};

export function hooksDirInstaller(member: HooksDirMember): HookInstaller {
  return {
    harness: member.harness,

    async install(input: HookInstallInput): Promise<HookInstallResult> {
      const file = hooksFile(member, input.home);
      const text = `${JSON.stringify(hooksBody(member, input.paths), null, 2)}\n`;
      const changed = (await currentText(file)) !== text;
      if (changed) {
        await writeConfigFile(file, text);
        // This file sits outside the repo, so agn says out loud that it wrote it.
        process.stderr.write(
          `agn wrote its ${harnessDefinition(member.harness).name} status hook to ${file}\n`,
        );
      }
      return { harness: member.harness, file, changed, verify: member.verify };
    },

    async uninstall(input: HookInstallInput): Promise<HookInstallResult> {
      const file = hooksFile(member, input.home);
      // The file holds nothing of the user's, so it goes whole. The directory is the harness's.
      const existed = await stat(file).then(
        () => true,
        () => false,
      );
      if (existed) {
        // A directory the user cannot write to fails here; it reads like the install failure.
        await rm(file, { force: true }).catch((cause: unknown) => {
          throw configUnwritable(file, cause);
        });
      }
      return { harness: member.harness, file, changed: existed, verify: null };
    },
  };
}

/**
 * agn replaces this file rather than merging into it, but never before it has seen that what is
 * there is JSON: a file agn cannot read is one it has no business overwriting.
 */
async function currentText(file: string): Promise<string | null> {
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null || text.trim() === "") {
    return null;
  }
  try {
    JSON.parse(text);
  } catch (cause) {
    throw configUnreadable(file, cause);
  }
  return text;
}

function hooksFile(member: HooksDirMember, home: string): string {
  const mechanism = harnessDefinition(member.harness).hooks;
  if (mechanism === null || mechanism.container !== "hooks-dir") {
    throw new HooksError(`${member.harness} does not keep its hooks in a directory`, {
      code: "hook-unsupported",
      hint: "Run `agn doctor` to see which harnesses report status.",
    });
  }
  return join(home, mechanism.dir, HOOKS_DIR_FILE);
}

/**
 * The file is agn's, so its whole contents are agn's entries, written over an empty config: a hand
 * edit is replaced rather than merged. Copilot ignores a file that does not claim version 1, which
 * `withManagedHooks` writes for that layout; `disableAllHooks` is never written.
 */
function hooksBody(member: HooksDirMember, paths: AgnosticPaths): HooksJson {
  return withManagedHooks({}, member.events, (event) => commandFor(member, paths, event), {
    layout: member.layout,
    timeout: member.timeout,
    marker: hookScriptMarker(paths),
  });
}

/** The reply is agn's own constant, never a user string, so it goes into the command unescaped. */
function commandFor(member: HooksDirMember, paths: AgnosticPaths, event: string): string {
  const command = member.eventOnCommand
    ? hookCommand(paths, member.harness, event)
    : hookCommand(paths, member.harness);
  return member.layout === "copilot" ? `${command}; printf '%s\\n' '${COPILOT_REPLY}'` : command;
}
