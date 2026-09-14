import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type HookInstallResult, run } from "@agnostic/core";
import { writeConfigFile } from "../config-file.js";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import {
  type ManagedEvent,
  updateHooksJson,
  withManagedHooks,
  withoutManagedHooks,
} from "../hooks-json-file.js";

/** Claude Code's own per-repo local settings: the file it already expects a user not to commit. */
const SETTINGS_PATTERN = ".claude/settings.local.json";

/**
 * The events that say a turn started, a tool ran, or the agent is waiting for the user. A matcher
 * on `PreToolUse` keeps agn to one hook process per question instead of one per tool call.
 */
const EVENTS: ManagedEvent[] = [
  { event: "SessionStart" },
  { event: "UserPromptSubmit" },
  { event: "PreToolUse", matcher: "AskUserQuestion" },
  { event: "PermissionRequest" },
  { event: "Notification" },
  { event: "PostToolUse" },
  { event: "Stop" },
];

export const claudeCodeInstaller: HookInstaller = {
  harness: "claude-code",

  async install(input: HookInstallInput): Promise<HookInstallResult> {
    const file = settingsFile(input.repoPath);
    const changed = await updateHooksJson(file, (config) =>
      withManagedHooks(config, EVENTS, input.command),
    );
    await excludeFromGit(input.repoPath);
    return { harness: "claude-code", file, changed, verify: null };
  },

  async uninstall(input: HookInstallInput): Promise<HookInstallResult> {
    const file = settingsFile(input.repoPath);
    // The `.git/info/exclude` line stays: the file it names is still there, still the user's.
    const changed = await updateHooksJson(file, (config) =>
      withoutManagedHooks(config, input.command),
    );
    return { harness: "claude-code", file, changed, verify: null };
  },
};

function settingsFile(repoPath: string): string {
  return join(repoPath, ".claude", "settings.local.json");
}

/**
 * agn's hook lands in a file the repo should not commit. `.gitignore` is the repo's own business,
 * so the path goes in `.git/info/exclude`, and only when git does not already ignore it.
 */
async function excludeFromGit(repoPath: string): Promise<void> {
  const gitDir = await gitCommonDir(repoPath);
  if (gitDir === null || (await gitIgnores(repoPath))) {
    return;
  }
  const file = join(gitDir, "info", "exclude");
  const text = await readFile(file, "utf8").catch(() => "");
  if (text.split("\n").some((line) => line.trim() === SETTINGS_PATTERN)) {
    return;
  }
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  // Rewritten whole and renamed into place: git reads this file whenever it walks the worktree.
  await writeConfigFile(file, `${text}${separator}${SETTINGS_PATTERN}\n`);
}

/** The common dir, so a repo checked out as a worktree writes its exclude file where git reads it. */
async function gitCommonDir(repoPath: string): Promise<string | null> {
  const result = await run("git", ["-C", repoPath, "rev-parse", "--git-common-dir"], {
    timeoutMs: 5_000,
  }).catch(() => null);
  return result === null ? null : resolve(repoPath, result.stdout.trim());
}

async function gitIgnores(repoPath: string): Promise<boolean> {
  return await run("git", ["-C", repoPath, "check-ignore", "-q", SETTINGS_PATTERN], {
    timeoutMs: 5_000,
  }).then(
    () => true,
    () => false,
  );
}
