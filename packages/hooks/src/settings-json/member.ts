import { join } from "node:path";
import type { HarnessId, HookInstallResult } from "@agnostic/core";
import { type HookMechanism, harnessDefinition } from "@agnostic/registry";
import { HooksError } from "../error.js";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import { hookCommand, hookScriptMarker } from "../hook-script.js";
import {
  type HookLayout,
  type ManagedEvent,
  type ManagedHooksOptions,
  updateHooksJson,
  withManagedHooks,
  withoutManagedHooks,
} from "../hooks-json-file.js";
import { excludeFromGit } from "./git-exclude.js";

/**
 * One harness that keeps its hooks in a JSON settings file. The registry says which file and
 * whether it is per repo or per user; everything a writer or a reader needs beyond the path is
 * here. Adding a member is this row, its status table, and two lines in `harness-hooks.ts`.
 */
export type SettingsJsonMember = {
  harness: HarnessId;
  events: ManagedEvent[];
  layout: HookLayout;
  /** In the unit the harness reads: 5 for seconds, 5000 for Gemini's milliseconds. */
  timeout: number;
  /**
   * JSON the harness must read on the hook's stdout, per event when it gates on it. Appended to
   * the command, because a harness that gates on stdout treats no answer as a refusal.
   */
  reply: string | Partial<Record<string, string>> | null;
  /** The one step of the install agn cannot do itself, or null when there is none. */
  verify: string | null;
};

export function settingsJsonInstaller(member: SettingsJsonMember): HookInstaller {
  return {
    harness: member.harness,

    async install(input: HookInstallInput): Promise<HookInstallResult> {
      const mechanism = settingsJson(member.harness);
      const file = settingsFile(mechanism, input);
      const changed = await updateHooksJson(file, (config) =>
        withManagedHooks(config, member.events, (event) => commandFor(member, input, event), {
          layout: member.layout,
          timeout: member.timeout,
          marker: hookScriptMarker(input.paths),
        } satisfies ManagedHooksOptions),
      );
      if (mechanism.scope === "repo") {
        await excludeFromGit(input.repoPath, mechanism.file);
      } else if (changed) {
        // A per-user config is outside the repo the user asked about, so agn says what it wrote.
        process.stderr.write(`agn wrote its ${name(member.harness)} status hook to ${file}\n`);
      }
      return { harness: member.harness, file, changed, verify: member.verify };
    },

    async uninstall(input: HookInstallInput): Promise<HookInstallResult> {
      // The `.git/info/exclude` line stays: the file it names is still there, still the user's.
      const file = settingsFile(settingsJson(member.harness), input);
      const changed = await updateHooksJson(file, (config) =>
        withoutManagedHooks(config, hookScriptMarker(input.paths)),
      );
      return { harness: member.harness, file, changed, verify: null };
    },
  };
}

/** The command for one event: the shared script, plus the answer a gating harness waits for. */
export function commandFor(
  member: SettingsJsonMember,
  input: HookInstallInput,
  event: string,
): string {
  const command = hookCommand(input.paths, member.harness);
  const reply = typeof member.reply === "string" ? member.reply : (member.reply?.[event] ?? null);
  // POSIX single quoting: the only byte that cannot appear inside is the quote itself.
  const quoted = reply === null ? null : `'${reply.replaceAll("'", String.raw`'\''`)}'`;
  return quoted === null ? command : `${command}; printf '%s\\n' ${quoted}`;
}

export function settingsFile(mechanism: SettingsJsonMechanism, input: HookInstallInput): string {
  return join(mechanism.scope === "repo" ? input.repoPath : input.home, mechanism.file);
}

type SettingsJsonMechanism = Extract<HookMechanism, { container: "settings-json" }>;

/** The registry owns the path; a harness whose row says anything else is not this family's. */
export function settingsJson(harness: HarnessId): SettingsJsonMechanism {
  const mechanism = harnessDefinition(harness).hooks;
  if (mechanism === null || mechanism.container !== "settings-json") {
    throw new HooksError(`${harness} keeps no hooks in a settings file`, {
      code: "hook-unsupported",
      hint: "Run `agn doctor` to see which harnesses report status.",
    });
  }
  return mechanism;
}

function name(harness: HarnessId): string {
  return harnessDefinition(harness).name;
}
