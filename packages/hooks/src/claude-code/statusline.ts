// The three slot states, and the rule that a status line the user wrote is never overwritten,
// are ported from stablyai/orca `src/main/claude/hook-settings.ts` (MIT © Lovecast Inc.).
import type { AgnosticPaths } from "@agnostic/core";
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
