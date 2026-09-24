// The three slot states, and the rule that a status line the user wrote is never overwritten,
// are ported from stablyai/orca `src/main/claude/hook-settings.ts` (MIT © Lovecast Inc.).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgnosticPaths } from "@agnostic/core";
import { z } from "zod";
import { quoted, statusLineScriptPath } from "../hook-script.js";
import type { HooksJson } from "../hooks-json-file.js";

/** Empty, agn's, or a status line the user wrote and agn leaves alone. */
export type StatusLineSlot = "empty" | "ours" | "user";

export function statusLineSlot(config: HooksJson, marker: string): StatusLineSlot {
  const command = config.statusLine?.command;
  if (command === undefined || command === "") {
    return "empty";
  }
  return command.includes(marker) ? "ours" : "user";
}

/** agn's script, with the user's own statusLine command as its one argument. */
export function statusLineCommand(paths: AgnosticPaths, userCommand: string | null): string {
  const script = `sh ${quoted(statusLineScriptPath(paths))}`;
  return userCommand === null || userCommand === "" ? script : `${script} ${quoted(userCommand)}`;
}

/** A slot the user owns stays theirs: agn's capture is off for that file, and `verify` says so. */
export function withManagedStatusLine(
  config: HooksJson,
  command: string,
  marker: string,
): HooksJson {
  if (statusLineSlot(config, marker) === "user") {
    return config;
  }
  return { ...config, statusLine: { type: "command", command } };
}

export function withoutManagedStatusLine(config: HooksJson, marker: string): HooksJson {
  if (statusLineSlot(config, marker) !== "ours") {
    return config;
  }
  const { statusLine: _ours, ...rest } = config;
  return rest;
}

const UserSettingsSchema = z.looseObject({
  statusLine: z.looseObject({ command: z.string().optional() }).nullish(),
});

/**
 * The status line the user set up for themselves, from the settings file Claude Code reads for
 * every session. agn's script runs it on the same payload, so their status line keeps drawing.
 */
export async function readUserStatusLine(
  home: string,
  env: Record<string, string>,
): Promise<string | null> {
  const file = join(env.CLAUDE_CONFIG_DIR ?? join(home, ".claude"), "settings.json");
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) {
    return null;
  }
  const parsed = UserSettingsSchema.safeParse(json(text));
  const command = parsed.success ? parsed.data.statusLine?.command : undefined;
  return command === undefined || command === "" ? null : command;
}

/** A settings file Claude Code itself would refuse says nothing about the user's status line. */
function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
