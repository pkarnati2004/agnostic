import { join } from "node:path";
import type { HookInstallResult } from "@agnostic/core";
import { harnessDefinition } from "@agnostic/registry";
import { HooksError } from "../error.js";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import { AGN_MANAGED_MARKER, removeManagedFile, writeManagedFile } from "../managed-file.js";
import { PI_EXTENSION_FILE, piExtensionSource } from "./extension-source.js";

/** One file per user, in the directory the harness loads its extensions from at start. */
export function piFamilyInstaller(harness: "pi" | "omp"): HookInstaller {
  const verify = `restart ${harness} if it was running: extensions load at start`;
  return {
    harness,

    async install(input: HookInstallInput): Promise<HookInstallResult> {
      const file = extensionFile(harness, input.home);
      const source = piExtensionSource(input.paths, harness);
      const changed = await writeManagedFile(file, source, AGN_MANAGED_MARKER);
      if (changed) {
        // The extension lives outside the repo, so agn says where it put it.
        process.stderr.write(`agn wrote its ${harness} status extension to ${file}\n`);
      }
      return { harness, file, changed, verify };
    },

    async uninstall(input: HookInstallInput): Promise<HookInstallResult> {
      const file = extensionFile(harness, input.home);
      const changed = await removeManagedFile(file, AGN_MANAGED_MARKER);
      return { harness, file, changed, verify: null };
    },
  };
}

function extensionFile(harness: "pi" | "omp", home: string): string {
  const hooks = harnessDefinition(harness).hooks;
  if (hooks === null || hooks.container !== "pi-extension") {
    throw new HooksError(`${harness} does not load a Pi extension`, {
      code: "hook-unsupported",
      hint: "The registry row and this installer disagree about the harness family; report it as an agn bug.",
    });
  }
  return join(home, hooks.dir, PI_EXTENSION_FILE);
}
