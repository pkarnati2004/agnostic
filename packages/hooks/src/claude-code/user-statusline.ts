import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { AgnosticPaths } from "@agnostic/core";
import { z } from "zod";
import { writeConfigFile } from "../config-file.js";
import type { UserScope, UserStatusLine, UserStatusLineResult } from "../hook-installer.js";
import { quoted, statusLineScriptPath } from "../hook-script.js";
import { type HooksJson, readHooksJson, updateHooksJson } from "../hooks-json-file.js";
import { statusLineCommand, statusLineSlot } from "./statusline.js";

/** Claude Code reads this file for every session it starts, wherever it was started from. */
export function userSettingsFile(home: string, env: Record<string, string>): string {
  return join(env.CLAUDE_CONFIG_DIR ?? join(home, ".claude"), "settings.json");
}

/**
 * Where agn keeps the status line it took over, so removing agn's entry puts the user's back.
 * It is agn's own file rather than a key in the settings file, which Claude Code owns and may
 * strip or warn on, and which would keep the key after agn had gone.
 */
export function originalStatusLineFile(paths: AgnosticPaths): string {
  return join(paths.hooks, "claude-statusline-original.json");
}

const OriginalSchema = z.strictObject({
  file: z.string(),
  statusLine: z.looseObject({ command: z.string().optional() }).nullish(),
});

type StatusLineEntry = NonNullable<HooksJson["statusLine"]>;

/**
 * agn's command in the user's own settings file, wrapping whatever status line was in the slot so
 * that one keeps drawing. Every Claude Code session then reports its plan's rate limit, not only
 * the sessions agn started.
 */
export async function installUserStatusLine(scope: UserScope): Promise<UserStatusLineResult> {
  const file = userSettingsFile(scope.home, scope.env);
  const config = await readHooksJson(file);
  const entry = await nextEntry(scope, file, config);
  if (entry === null) {
    return { file, changed: false };
  }
  const changed = await updateHooksJson(file, (current) => ({ ...current, statusLine: entry }));
  return { file, changed };
}

/** Null when the slot is agn's and nothing records what was there before: leave it as it is. */
async function nextEntry(
  scope: UserScope,
  file: string,
  config: HooksJson,
): Promise<StatusLineEntry | null> {
  const theirs = config.statusLine ?? {};
  switch (statusLineSlot(config, marker(scope.paths))) {
    case "empty":
      await rm(originalStatusLineFile(scope.paths), { force: true });
      return { type: "command", command: statusLineCommand(scope.paths, null) };
    case "user":
      // Written first: the repo-scope install reads it to chain the same command.
      await writeOriginal(scope.paths, { file, statusLine: theirs });
      return { ...theirs, command: statusLineCommand(scope.paths, theirs.command ?? null) };
    case "ours": {
      const original = await readOriginal(scope.paths);
      if (original === null) {
        return null;
      }
      // Rewritten, so a moved script path lands and their own command stays the argument.
      return { ...theirs, command: statusLineCommand(scope.paths, command(original)) };
    }
  }
}

/** Puts the user's own entry back, key for key, and removes the slot they never filled. */
export async function uninstallUserStatusLine(scope: UserScope): Promise<UserStatusLineResult> {
  const file = userSettingsFile(scope.home, scope.env);
  const config = await readHooksJson(file);
  if (statusLineSlot(config, marker(scope.paths)) !== "ours") {
    return { file, changed: false };
  }
  const original = await readOriginal(scope.paths);
  const changed = await updateHooksJson(file, (current) => restored(current, original));
  await rm(originalStatusLineFile(scope.paths), { force: true });
  return { file, changed };
}

function restored(config: HooksJson, original: Original | null): HooksJson {
  const theirs = original?.statusLine;
  if (theirs === null || theirs === undefined) {
    const { statusLine: _ours, ...rest } = config;
    return rest;
  }
  return { ...config, statusLine: theirs };
}

async function userStatusLineInstalled(scope: UserScope): Promise<boolean> {
  const config = await readUserSettings(scope);
  return statusLineSlot(config, marker(scope.paths)) === "ours";
}

/**
 * The status line the user set up for themselves, which agn's script runs on the same payload so
 * it keeps drawing. Null while agn holds the slot with nothing recording what was there: the
 * user-scope entry still draws their line, and the next install chains it in both files.
 */
export async function readUserStatusLine(scope: UserScope): Promise<string | null> {
  const config = await readUserSettings(scope);
  switch (statusLineSlot(config, marker(scope.paths))) {
    case "empty":
      return null;
    case "user":
      return config.statusLine?.command ?? null;
    case "ours":
      return command(await readOriginal(scope.paths));
  }
}

/** A settings file agn cannot read says nothing about the user's status line; the install reports
 * it, and the repo-scope hooks that harness needs still go in. */
async function readUserSettings(scope: UserScope): Promise<HooksJson> {
  return await readHooksJson(userSettingsFile(scope.home, scope.env)).catch(() => ({}));
}

type Original = z.infer<typeof OriginalSchema>;

function command(original: Original | null): string | null {
  const found = original?.statusLine?.command;
  return found === undefined || found === "" ? null : found;
}

async function readOriginal(paths: AgnosticPaths): Promise<Original | null> {
  const text = await readFile(originalStatusLineFile(paths), "utf8").catch(() => null);
  if (text === null) {
    return null;
  }
  // agn wrote this file; one agn could not parse records nothing, and the next install replaces it.
  const parsed = OriginalSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : null;
}

async function writeOriginal(paths: AgnosticPaths, original: Original): Promise<void> {
  await writeConfigFile(originalStatusLineFile(paths), `${JSON.stringify(original, null, 2)}\n`);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function marker(paths: AgnosticPaths): string {
  return quoted(statusLineScriptPath(paths));
}

/** The one harness with a status-line slot, as the settings-json member's flag says. */
export const claudeUserStatusLine: UserStatusLine = {
  install: installUserStatusLine,
  uninstall: uninstallUserStatusLine,
  installed: userStatusLineInstalled,
};
