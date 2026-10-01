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

/** Everything a user-scope write needs, which is the install input without a repo. */
export type UserScope = Pick<HookInstallInput, "home" | "env" | "paths">;

export type UserStatusLineResult = { file: string; changed: boolean };

/**
 * The user-scope half of a status-line slot, for a harness whose settings file has one. That slot
 * is where the harness reports its plan's rate limit, and at user scope it reports it for every
 * session on the machine rather than only the ones agn started.
 */
export type UserStatusLine = {
  install(scope: UserScope): Promise<UserStatusLineResult>;
  uninstall(scope: UserScope): Promise<UserStatusLineResult>;
  /** Whether the slot in the user's own settings file holds agn's command right now. */
  installed(scope: UserScope): Promise<boolean>;
};

export interface HookInstaller {
  harness: HarnessId;
  install(input: HookInstallInput): Promise<HookInstallResult>;
  uninstall(input: HookInstallInput): Promise<HookInstallResult>;
  /** Absent for every harness whose settings file has no status-line slot agn fills. */
  userStatusLine?: UserStatusLine;
}
