import type { AgnosticPaths, HarnessId, HookInstallResult } from "@agnostic/core";

/**
 * What an installer needs: the repo it is installing for, the home directory whose per-user config
 * it may edit (a temp directory in tests), the hook command the harness is to run, agn's own
 * directories, and the environment the harness will be started with.
 */
export type HookInstallInput = {
  repoPath: string;
  home: string;
  command: string;
  /** An extension or plugin that posts to the daemon itself reads the port and token from here. */
  paths: AgnosticPaths;
  /** Reserved for the harnesses that relocate their config directory with an env var. */
  env: Record<string, string>;
};

export interface HookInstaller {
  harness: HarnessId;
  install(input: HookInstallInput): Promise<HookInstallResult>;
  uninstall(input: HookInstallInput): Promise<HookInstallResult>;
}
