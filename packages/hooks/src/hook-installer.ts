import type { HarnessId, HookInstallResult } from "@agnostic/core";

/**
 * What an installer needs: the repo it is installing for, the home directory whose per-user config
 * it may edit (a temp directory in tests), and the hook command the harness is to run.
 */
export type HookInstallInput = {
  repoPath: string;
  home: string;
  command: string;
};

export interface HookInstaller {
  harness: HarnessId;
  install(input: HookInstallInput): Promise<HookInstallResult>;
  uninstall(input: HookInstallInput): Promise<HookInstallResult>;
}
