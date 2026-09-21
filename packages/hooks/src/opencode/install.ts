import { join } from "node:path";
import type { HookInstallResult } from "@agnostic/core";
import { harnessDefinition } from "@agnostic/registry";
import { HooksError } from "../error.js";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import { AGN_MANAGED_MARKER, removeManagedFile, writeManagedFile } from "../managed-file.js";
import { OPENCODE_PLUGIN_FILE, opencodePluginSource } from "./plugin-source.js";

/** One file per user, in the plugin directory the harness loads at start. */
export function opencodeFamilyInstaller(harness: "opencode" | "mimo-code"): HookInstaller {
  const verify = `restart ${harness} if it was running: plugins load at start`;
  return {
    harness,

    async install(input: HookInstallInput): Promise<HookInstallResult> {
      const file = pluginFile(harness, input.home);
      const source = opencodePluginSource(input.paths, harness);
      const changed = await writeManagedFile(file, source, AGN_MANAGED_MARKER);
      if (changed) {
        // The plugin lives outside the repo, so agn says where it put it.
        process.stderr.write(`agn wrote its ${harness} status plugin to ${file}\n`);
      }
      return { harness, file, changed, verify };
    },

    async uninstall(input: HookInstallInput): Promise<HookInstallResult> {
      const file = pluginFile(harness, input.home);
      const changed = await removeManagedFile(file, AGN_MANAGED_MARKER);
      return { harness, file, changed, verify: null };
    },
  };
}

function pluginFile(harness: "opencode" | "mimo-code", home: string): string {
  const hooks = harnessDefinition(harness).hooks;
  if (hooks === null || hooks.container !== "opencode-plugin") {
    throw new HooksError(`${harness} does not load an OpenCode plugin`, {
      code: "hook-unsupported",
      hint: "The registry row and this installer disagree about the harness family; report it as an agn bug.",
    });
  }
  return join(home, hooks.dir, OPENCODE_PLUGIN_FILE);
}
